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


def _score_breakdown_from_tags(tags: dict) -> list[dict]:
    has_website = any(tags.get(key) for key in ["website", "contact:website", "brand:website"])
    has_phone = any(tags.get(key) for key in ["phone", "contact:phone", "brand:phone"])
    has_email = any(tags.get(key) for key in ["email", "contact:email", "brand:email"])
    has_social = any(
        tags.get(key)
        for key in [
            "contact:facebook",
            "facebook",
            "contact:instagram",
            "instagram",
            "contact:linkedin",
            "linkedin",
            "contact:twitter",
            "twitter",
            "contact:tiktok",
            "tiktok",
        ]
    )
    has_opening_hours = bool(tags.get("opening_hours"))
    has_delivery = tags.get("delivery") == "yes" or tags.get("takeaway") == "yes"
    has_payment = any(
        tags.get(key) == "yes"
        for key in [
            "payment:cards",
            "cards",
            "payment:credit_cards",
            "credit_cards",
            "payment:debit_cards",
            "debit_cards",
            "payment:contactless",
            "contactless",
        ]
    )
    has_accessibility = tags.get("wheelchair") in {"yes", "limited"}
    has_brand = bool(tags.get("brand") or tags.get("operator"))
    has_address = bool(tags.get("addr:street") and (tags.get("addr:housenumber") or tags.get("addr:postcode")))

    raw_items = [
        {
            "label": "Presencia digital",
            "points": (20 if has_website else 0)
            + (12 if has_phone else 0)
            + (8 if has_email else 0)
            + (8 if has_social else 0),
            "max_points": 48,
            "detail": "Web, telefono, email y redes sociales del negocio.",
        },
        {
            "label": "Operacion y servicio",
            "points": (10 if has_opening_hours else 0)
            + (8 if has_delivery else 0)
            + (6 if has_payment else 0)
            + (3 if has_accessibility else 0),
            "max_points": 27,
            "detail": "Horario, opciones de entrega, metodos de pago y accesibilidad.",
        },
        {
            "label": "Identidad y confianza",
            "points": (8 if has_brand else 0) + (8 if has_address else 0),
            "max_points": 16,
            "detail": "Marca u operador y direccion estructurada de la ficha.",
        },
        {
            "label": "Completitud de ficha",
            "points": 10 + min(19, len(tags)),
            "max_points": 29,
            "detail": "Base del modelo y riqueza de metadatos disponibles en OSM.",
        },
    ]

    raw_total = sum(item["points"] for item in raw_items)
    capped_total = max(0, min(100, raw_total))
    if raw_total <= 0:
        return [
            {
                **item,
                "points": 0,
            }
            for item in raw_items
        ]

    scaled_points: list[int] = []
    for item in raw_items:
        scaled_points.append(int(round((item["points"] / raw_total) * capped_total)))

    delta = capped_total - sum(scaled_points)
    if delta != 0:
        scaled_points[0] = max(0, min(raw_items[0]["max_points"], scaled_points[0] + delta))

    breakdown = []
    for index, item in enumerate(raw_items):
        breakdown.append(
            {
                "label": item["label"],
                "points": scaled_points[index],
                "max_points": item["max_points"],
                "detail": item["detail"],
            }
        )

    return breakdown


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
    duplicates = 0
    invalid_coords = 0
    google_failures = 0
    errors = 0

    cursor = shops_collection.aggregate([
        {
            "$match": {
                "$or": [
                    {"reviews_sync_attempted": {"$exists": False}},
                    {"reviews_sync_attempted": False}
                ]
            }
        },
        {
            "$sample": {
                "size": limit
            }
        }
    ])

    async for shop in cursor:

        print(f"Procesando shop_id={shop['_id']} - {shop.get('name')}")

        try:

            # COORDENADAS DE NEGOCIO
            location = shop.get("location", {})
            coords = location.get("coordinates", [])

            if len(coords) != 2:
                invalid_coords += 1
                skipped += 1
                await shops_collection.update_one(
                    {"_id": shop["_id"]},
                    {"$set": {"reviews_sync_attempted": True}}
                )
                continue

            lon, lat = coords

            # CONFIG DE REINTENTOS Y MAXIMO DE INTENTOS
            MAX_REVIEWS = 5
            MAX_ATTEMPTS = 3

            all_reviews = []
            attempts = 0
            used_place_ids = set()
            google_data = None

            while len(all_reviews) < MAX_REVIEWS and attempts < MAX_ATTEMPTS:

                attempts += 1

                google_data = await fetch_google_reviews(
                    shop.get("name", ""),
                    lat,
                    lon
                )

                if not google_data:
                    google_failures += 1
                    continue

                place_id = google_data["place_id"]

                # evitar repetir mismo lugar si ya aparecio en intentos anteriores
                if place_id in used_place_ids:
                    continue

                used_place_ids.add(place_id)

                # FILTRO REVIEWS
                filtered_reviews = [
                    r for r in google_data.get("reviews", [])
                    if r.get("text")
                    and r["text"].strip()
                    and r.get("rating", 0) < 3
                ]

                all_reviews.extend(filtered_reviews)

                all_reviews = all_reviews[:MAX_REVIEWS]

            # si no hay reviews útiles
            if len(all_reviews) == 0:
                skipped += 1
                await shops_collection.update_one(
                    {"_id": shop["_id"]},
                    {"$set": {"reviews_sync_attempted": True}}
                )
                continue

            # EXISTE EN MONGO
            existing = await shop_reviews_collection.find_one({
                "shop_id": shop["_id"]
            })

            if existing:

                duplicates += 1

                old_reviews = existing.get("reviews", [])

                # MERGE REVIEWS
                combined = old_reviews + all_reviews

                seen = set()
                merged_reviews = []

                for r in combined:
                    text = r.get("text", "").strip()

                    if not text:
                        continue

                    if text in seen:
                        continue

                    seen.add(text)
                    merged_reviews.append(r)

                await shop_reviews_collection.update_one(
                    {"shop_id": shop["_id"]},
                    {
                        "$set": {
                            "reviews": merged_reviews,
                            "google_place_id": google_data["place_id"] if google_data else None,
                            "rating": google_data["rating"] if google_data else None,
                            "user_ratings_total": google_data["user_ratings_total"] if google_data else None
                        }
                    }
                )

                print("Actualizado shop_id=", shop["_id"])

            else:

                await shop_reviews_collection.insert_one({
                    "shop_id": shop["_id"],
                    "google_place_id": google_data["place_id"],
                    "rating": google_data["rating"],
                    "user_ratings_total": google_data["user_ratings_total"],
                    "reviews": all_reviews
                })

                print("Insertado en shop_id=", shop["_id"])

            # MARCAR COMO PROCESADO CORRECTAMENTE
            await shops_collection.update_one(
                {"_id": shop["_id"]},
                {"$set": {"reviews_synced": True, "reviews_sync_attempted": True}}
            )

            processed += 1

        except Exception as e:
            print("ERROR:", e)
            errors += 1
            await shops_collection.update_one(
                {"_id": shop["_id"]},
                {"$set": {"reviews_sync_attempted": True}}
            )

    return {
        "processed": processed,
        "skipped": skipped,
        "duplicates": duplicates,
        "invalid_coords": invalid_coords,
        "google_failures": google_failures,
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

    shop_reviews_doc = await shop_reviews_collection.find_one(
        {"shop_id": shop_id},
        {"_id": 0, "reviews": 1, "user_ratings_total": 1},
    )
    comments = []
    reviews_total = int(shop.get("reviews", 0) or 0)
    if shop_reviews_doc:
        reviews_list = shop_reviews_doc.get("reviews")
        if isinstance(reviews_list, list):
            reviews_total = len(reviews_list)

        comments = [
            {
                "text": review.get("text", ""),
                "rating": review.get("rating"),
                "author": review.get("author_name"),
                "relative_time": review.get("relative_time_description"),
            }
            for review in shop_reviews_doc.get("reviews", [])
            if isinstance(review, dict) and review.get("text")
        ]

    shop["reviews"] = reviews_total

    full_shop_doc = await shops_collection.find_one({"_id": shop_id, "active": True}, {"osm.tags": 1})
    tags = ((full_shop_doc or {}).get("osm") or {}).get("tags") or {}

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

    score_breakdown = _score_breakdown_from_tags(tags)

    return {
        "business": shop,
        "benchmark": benchmark,
        "recommendations": recommendations,
        "comments": comments,
        "score_breakdown": score_breakdown,
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
    use_explicit_tags: bool = True,
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

            new_name, new_source = infer_barrio_name(
                lat=lat,
                lon=lon,
                tags=tags,
                use_explicit_tags=use_explicit_tags,
            )
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
        "use_explicit_tags": use_explicit_tags,
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


@router.get("/barrios/target-counts")
async def barrios_target_counts():
    target_names = [
        "Almeria",
        "Viator",
        "Huercal de Almeria",
        "Aguadulce",
        "La Canada y El Alquian",
    ]

    rows = await shops_collection.aggregate(
        [
            {"$match": {"active": True, "barrio.name": {"$in": target_names}}},
            {"$group": {"_id": "$barrio.name", "count": {"$sum": 1}}},
        ]
    ).to_list(length=20)

    counts_map = {row.get("_id"): int(row.get("count", 0)) for row in rows}
    counts = [{"name": name, "count": counts_map.get(name, 0)} for name in target_names]

    return {
        "total_active": await shops_collection.count_documents({"active": True}),
        "counts": counts,
    }


@router.get("/barrios/sin-barrio-samples")
async def barrios_sin_barrio_samples(limit: int = Query(default=100, ge=1, le=1000)):
    filters = {
        "active": True,
        "$or": [
            {"barrio.name": "Sin barrio"},
            {"barrio.name": {"$exists": False}},
            {"barrio.name": None},
        ],
    }

    projection = {
        "_id": 1,
        "name": 1,
        "category": 1,
        "barrio": 1,
        "location.coordinates": 1,
    }

    rows = await shops_collection.find(filters, projection).limit(limit).to_list(length=limit)
    total = await shops_collection.count_documents(filters)

    samples = []
    for row in rows:
        coords = ((row.get("location") or {}).get("coordinates") or [None, None])
        lon = coords[0] if len(coords) > 0 else None
        lat = coords[1] if len(coords) > 1 else None
        samples.append(
            {
                "id": row.get("_id"),
                "name": row.get("name"),
                "category": row.get("category"),
                "barrio": (row.get("barrio") or {}).get("name"),
                "lat": lat,
                "lon": lon,
            }
        )

    return {
        "total": total,
        "limit": limit,
        "samples": samples,
    }
