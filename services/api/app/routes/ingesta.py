from urllib import response

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from hashlib import sha256

from app.database.mongo import ingesta_runs_collection, shops_collection
from app.services.barrios_service import infer_barrio_name, load_barrios_geojson
from app.services.normalizer import normalize_element
from app.services.overpass_service import fetch_overpass_shops

from app.services.google_places_service import fetch_google_reviews
from app.database.mongo import shops_collection, shop_reviews_collection

router = APIRouter()


@router.post("/ingesta")
async def ingesta_shops():
    started_at = datetime.now(timezone.utc)
    run_id = f"run-{started_at.strftime('%Y%m%d%H%M%S')}"

    data, query = fetch_overpass_shops()
    elements = data.get("elements", [])
    query_hash = sha256(query.encode("utf-8")).hexdigest()

    await ingesta_runs_collection.insert_one(
        {
            "_id": run_id,
            "source": "overpass",
            "status": "running",
            "started_at": started_at.isoformat(),
            "query": query,
            "query_hash": query_hash,
            "total_elements": len(elements),
        }
    )

    upserted = 0
    skipped = 0
    errors = 0
    ingested_at = datetime.now(timezone.utc).isoformat()

    # Mark existing records inactive; current ingestion reactivates matching rows.
    await shops_collection.update_many({}, {"$set": {"active": False}})

    normalized_docs = []

    for el in elements:
        tags = el.get("tags", {})
        if not any(key in tags for key in ["shop", "amenity", "office", "craft"]):
            skipped += 1
            continue

        normalized = normalize_element(el, ingested_at=ingested_at, run_id=run_id)
        if not normalized:
            skipped += 1
            continue

        normalized_docs.append(normalized)

    category_scores: dict[str, list[int]] = {}
    for doc in normalized_docs:
        category = doc.get("category", "Otros")
        category_scores.setdefault(category, []).append(int(doc.get("score", 0)))

    category_benchmark: dict[str, int] = {}
    for category, scores in category_scores.items():
        ordered = sorted(scores)
        if not ordered:
            category_benchmark[category] = 0
            continue
        p75_index = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * 0.75))))
        category_benchmark[category] = ordered[p75_index]

    for normalized in normalized_docs:
        category = normalized.get("category", "Otros")
        benchmark = category_benchmark.get(category, 100)
        score = int(normalized.get("score", 0))
        normalized["gap"] = max(0, benchmark - score)

        try:
            await shops_collection.update_one(
                {"_id": normalized["_id"]},
                {
                    "$set": {
                        **normalized,
                        "last_seen_at": ingested_at,
                    },
                    "$setOnInsert": {
                        "first_seen_at": ingested_at,
                    },
                },
                upsert=True,
            )
            upserted += 1
        except Exception:
            errors += 1

    finished_at = datetime.now(timezone.utc).isoformat()
    await ingesta_runs_collection.update_one(
        {"_id": run_id},
        {
            "$set": {
                "status": "completed",
                "finished_at": finished_at,
                "upserted": upserted,
                "skipped": skipped,
                "errors": errors,
                "ingested_at": ingested_at,
            }
        },
    )

    return {
        "status": "ok",
        "run_id": run_id,
        "ingested_at": ingested_at,
        "upsertados": upserted,
        "omitidos": skipped,
        "errores": errors,
        "total_recibidos": len(elements),
    }


@router.get("/ingesta/runs")
async def list_ingesta_runs(
    limit: int = Query(default=20, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
):
    cursor = (
        ingesta_runs_collection.find(
            {},
            {
                "query": 0,
            },
        )
        .sort("started_at", -1)
        .skip(skip)
        .limit(limit)
    )
    runs = await cursor.to_list(length=limit)
    total = await ingesta_runs_collection.count_documents({})

    return {
        "total": total,
        "limit": limit,
        "skip": skip,
        "runs": runs,
    }

@router.get("/reviews-test")
async def reviews_test():

    reviews = []

    cursor = shop_reviews_collection.find()

    async for doc in cursor:

        reviews.append({
            "shop_id": doc.get("shop_id"),
            "rating": doc.get("rating"),
            "user_ratings_total": doc.get("user_ratings_total"),
            "reviews": doc.get("reviews", [])
        })

    return {
        "total": len(reviews),
        "data": reviews
    }

@router.get("/shops")
async def list_shops(
    barrio: str | None = None,
    category: str | None = None,
    min_score: int = Query(default=0, ge=0, le=100),
    limit: int = Query(default=50, ge=1, le=5000),
    skip: int = Query(default=0, ge=0),
    active_only: bool = Query(default=True),
    south: float | None = None,
    west: float | None = None,
    north: float | None = None,
    east: float | None = None,
):
    filters = {"score": {"$gte": min_score}}

    if active_only:
        filters["active"] = True

    if barrio:
        filters["barrio.name"] = barrio
    if category:
        filters["category"] = category
    if None not in (south, west, north, east):
        filters["location"] = {
            "$geoWithin": {
                "$box": [[west, south], [east, north]],
            }
        }

    projection = {
        "osm.tags": 0,
    }

    cursor = (
        shops_collection.find(filters, projection)
        .sort("score", 1)
        .skip(skip)
        .limit(limit)
    )
    shops = await cursor.to_list(length=limit)
    total = await shops_collection.count_documents(filters)

    return {
        "total": total,
        "limit": limit,
        "skip": skip,
        "filters": {
            "barrio": barrio,
            "category": category,
            "min_score": min_score,
            "active_only": active_only,
        },
        "shops": shops,
    }

@router.post("/google-reviews-sync/{limit}")
async def google_reviews_sync(limit: int = 100):
   
    processed = 0
    skipped = 0
    errors = 0

    # sacar shops
    cursor = shops_collection.find({
        "$or": [
            {"reviews_synced": {"$exists": False}},
            {"reviews_synced": False}
        ]
    }).limit(limit)

    async for shop in cursor:
        print(f"Procesando shop_id={shop['_id']} - {shop.get('name')}")
        
        # verificar si YA existe review
        existing = await shop_reviews_collection.find_one({
            "shop_id": shop["_id"]
        })

        print("Existing review:", existing)

        if existing != None:
            skipped += 1
            continue

        try:
            location = shop.get("location", {})
            coords = location.get("coordinates", [])

            lon, lat = coords

            if len(coords) != 2:
                skipped += 1
                continue

            google_data = await fetch_google_reviews(
                shop.get("name", ""),
                lat,
                lon
            )

            if not google_data:
                skipped += 1
                continue

            await shop_reviews_collection.insert_one({
                "shop_id": shop["_id"],
                "google_place_id": google_data["place_id"],
                "rating": google_data["rating"],
                "user_ratings_total": google_data["user_ratings_total"],
                "reviews": google_data["reviews"]
            })

            # Marcamos el shop como review activo para que no sepa que ya fue procesado por google y no vuelva a intentar
            await shops_collection.update_one(
                {"_id": shop["_id"]},
                {"$set": {"reviews_synced": True}}
            )

            print("Google review importada para shop_id=", shop["_id"])

            processed += 1

        except Exception as e:
            print("ERROR:", e)
            errors += 1

    return {
        "processed": processed,
        "skipped": skipped,
        "errors": errors
    }


@router.get("/test-google")
async def test_google():

    data = await fetch_google_reviews(
        "Moeve",
        36.845861,
        -2.450111
    )

    return data

@router.get("/shops/id/{shop_id}")
async def get_shop_by_id(shop_id: str):
    shop = await shops_collection.find_one({"_id": shop_id, "active": True}, {"osm.tags": 0})
    if not shop:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    return shop


@router.get("/shops/id/{shop_id}/detail")
async def get_shop_detail(shop_id: str):
    shop = await shops_collection.find_one({"_id": shop_id, "active": True}, {"osm.tags": 0})
    if not shop:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    score = int(shop.get("score", 0))
    category = shop.get("category")
    barrio_name = ((shop.get("barrio") or {}).get("name"))

    category_scores_cursor = shops_collection.find(
        {"active": True, "category": category}, {"score": 1, "_id": 0}
    )
    category_scores_docs = await category_scores_cursor.to_list(length=10000)
    category_scores = sorted(int(item.get("score", 0)) for item in category_scores_docs)

    if category_scores:
        p75_index = max(0, min(len(category_scores) - 1, int(round((len(category_scores) - 1) * 0.75))))
        top_quartile = category_scores[p75_index]
    else:
        top_quartile = max(0, score)

    neighborhood_avg = score
    if barrio_name:
        neighborhood_pipeline = [
            {"$match": {"active": True, "barrio.name": barrio_name}},
            {"$group": {"_id": None, "avgScore": {"$avg": "$score"}}},
        ]
        neighborhood_avg_rows = await shops_collection.aggregate(neighborhood_pipeline).to_list(length=1)
        if neighborhood_avg_rows:
            neighborhood_avg = int(round(float(neighborhood_avg_rows[0].get("avgScore", score))))

    total_in_category = len(category_scores)
    below_or_equal = sum(1 for item_score in category_scores if item_score <= score)
    percentile = int(round((below_or_equal / total_in_category) * 100)) if total_in_category > 0 else 0

    recommendations: list[str] = []
    if score < 40:
        recommendations.append("Completa ficha digital basica: web, telefono y horario.")
    if score < 60:
        recommendations.append("Mejora consistencia en perfiles y activa publicaciones semanales.")
    if neighborhood_avg > score:
        recommendations.append("Prioriza acciones para cerrar la brecha frente a tu barrio.")
    if top_quartile > score:
        recommendations.append("Replica practicas del top sector: horarios detallados y contacto completo.")
    if not recommendations:
        recommendations.append("Mantiene posicion competitiva; optimiza conversion y fidelizacion local.")

    benchmark = {
        "percentile": max(0, min(100, percentile)),
        "neighborhoodAvg": max(0, min(100, neighborhood_avg)),
        "topQuartile": max(0, min(100, top_quartile)),
    }

    return {
        "business": shop,
        "benchmark": benchmark,
        "recommendations": recommendations,
    }


@router.get("/shops/quality")
async def shops_quality_report():
    total = await shops_collection.count_documents({"active": True})

    if total == 0:
        return {
            "total_active": 0,
            "barrio_assignment": {
                "tag": {"count": 0, "pct": 0.0},
                "geojson": {"count": 0, "pct": 0.0},
                "none": {"count": 0, "pct": 0.0},
            },
            "without_barrio": 0,
            "top_barrios": [],
        }

    pipeline = [
        {"$match": {"active": True}},
        {
            "$group": {
                "_id": "$barrio.source",
                "count": {"$sum": 1},
            }
        },
    ]
    source_rows = await shops_collection.aggregate(pipeline).to_list(length=10)

    by_source = {"tag": 0, "geojson": 0, "none": 0}
    for row in source_rows:
        key = row.get("_id") or "none"
        if key not in by_source:
            by_source[key] = 0
        by_source[key] += row.get("count", 0)

    top_barrios_rows = await shops_collection.aggregate(
        [
            {"$match": {"active": True, "barrio.name": {"$ne": "Sin barrio"}}},
            {"$group": {"_id": "$barrio.name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
    ).to_list(length=10)

    without_barrio = await shops_collection.count_documents(
        {"active": True, "barrio.name": "Sin barrio"}
    )

    def pct(value: int) -> float:
        return round((value / total) * 100, 2)

    return {
        "total_active": total,
        "barrio_assignment": {
            "tag": {"count": by_source.get("tag", 0), "pct": pct(by_source.get("tag", 0))},
            "geojson": {
                "count": by_source.get("geojson", 0),
                "pct": pct(by_source.get("geojson", 0)),
            },
            "none": {"count": by_source.get("none", 0), "pct": pct(by_source.get("none", 0))},
        },
        "without_barrio": without_barrio,
        "without_barrio_pct": pct(without_barrio),
        "top_barrios": [
            {"name": row.get("_id"), "count": row.get("count", 0)}
            for row in top_barrios_rows
        ],
    }


@router.get("/shops/quality/issues")
async def shops_quality_issues(
    limit: int = Query(default=50, ge=1, le=500),
):
    missing_barrio_filter = {
        "active": True,
        "$or": [
            {"barrio.name": "Sin barrio"},
            {"barrio.name": {"$exists": False}},
            {"barrio.name": None},
        ],
    }

    missing_name_filter = {
        "active": True,
        "$or": [
            {"name": {"$exists": False}},
            {"name": None},
            {"name": ""},
        ],
    }

    missing_location_filter = {
        "active": True,
        "$or": [
            {"location": {"$exists": False}},
            {"location.coordinates": {"$exists": False}},
        ],
    }

    missing_barrio_count = await shops_collection.count_documents(missing_barrio_filter)
    missing_name_count = await shops_collection.count_documents(missing_name_filter)
    missing_location_count = await shops_collection.count_documents(missing_location_filter)

    sample_projection = {
        "_id": 1,
        "name": 1,
        "category": 1,
        "subcategory": 1,
        "barrio": 1,
        "location": 1,
        "score": 1,
        "osm.id": 1,
        "osm.type": 1,
        "run_id": 1,
        "ingested_at": 1,
    }

    missing_barrio_samples = await shops_collection.find(
        missing_barrio_filter, sample_projection
    ).limit(limit).to_list(length=limit)

    missing_location_samples = await shops_collection.find(
        missing_location_filter, sample_projection
    ).limit(limit).to_list(length=limit)

    duplicate_name_location = await shops_collection.aggregate(
        [
            {"$match": {"active": True}},
            {
                "$group": {
                    "_id": {
                        "name": "$name",
                        "coordinates": "$location.coordinates",
                    },
                    "count": {"$sum": 1},
                    "ids": {"$push": "$_id"},
                }
            },
            {"$match": {"count": {"$gt": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
    ).to_list(length=20)

    return {
        "counts": {
            "missing_barrio": missing_barrio_count,
            "missing_name": missing_name_count,
            "missing_location": missing_location_count,
        },
        "samples": {
            "missing_barrio": missing_barrio_samples,
            "missing_location": missing_location_samples,
        },
        "possible_duplicates": [
            {
                "name": row.get("_id", {}).get("name"),
                "coordinates": row.get("_id", {}).get("coordinates"),
                "count": row.get("count", 0),
                "ids": row.get("ids", []),
            }
            for row in duplicate_name_location
        ],
    }


@router.post("/shops/repair-barrios")
async def repair_barrios(
    only_missing: bool = True,
    limit: int = Query(default=2000, ge=1, le=20000),
):
    filters = {"active": True, "location.coordinates": {"$exists": True}}
    if only_missing:
        filters["$or"] = [
            {"barrio.name": "Sin barrio"},
            {"barrio.name": {"$exists": False}},
            {"barrio.name": None},
        ]

    projection = {
        "_id": 1,
        "location.coordinates": 1,
        "osm.tags": 1,
        "barrio": 1,
    }

    docs = await shops_collection.find(filters, projection).limit(limit).to_list(length=limit)

    scanned = 0
    updated = 0
    unchanged = 0
    errors = 0

    for doc in docs:
        scanned += 1
        try:
            coords = ((doc.get("location") or {}).get("coordinates") or [None, None])
            lon = coords[0] if len(coords) > 0 else None
            lat = coords[1] if len(coords) > 1 else None
            tags = ((doc.get("osm") or {}).get("tags") or {})

            new_name, new_source = infer_barrio_name(lat=lat, lon=lon, tags=tags)
            current = doc.get("barrio") or {}
            current_name = current.get("name")
            current_source = current.get("source")

            if current_name == new_name and current_source == new_source:
                unchanged += 1
                continue

            await shops_collection.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "barrio": {"name": new_name, "source": new_source},
                    }
                },
            )
            updated += 1
        except Exception:
            errors += 1

    return {
        "status": "ok",
        "only_missing": only_missing,
        "scanned": scanned,
        "updated": updated,
        "unchanged": unchanged,
        "errors": errors,
        "limit": limit,
    }


@router.get("/barrios/status")
async def barrios_status():
    features = load_barrios_geojson()
    names: list[str] = []
    for feature in features:
        props = feature.get("properties") or {}
        name = props.get("name") or props.get("barrio")
        if isinstance(name, str) and name.strip():
            names.append(name.strip())

    unique_names = sorted(set(names))
    return {
        "features_count": len(features),
        "named_features_count": len(unique_names),
        "sample_names": unique_names[:20],
        "empty": len(features) == 0,
    }


@router.get("/barrios/point")
async def barrio_by_point(lat: float, lon: float):
    name, source = infer_barrio_name(lat=lat, lon=lon, tags={})
    return {
        "lat": lat,
        "lon": lon,
        "barrio": {
            "name": name,
            "source": source,
        },
    }
