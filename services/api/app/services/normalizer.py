from app.services.barrios_service import infer_barrio_name


def classify_category(tags: dict) -> tuple[str, str]:
    if tags.get("shop"):
        return "Comercio", tags.get("shop")
    if tags.get("amenity"):
        return "Servicios", tags.get("amenity")
    if tags.get("office"):
        return "Oficina", tags.get("office")
    if tags.get("craft"):
        return "Taller", tags.get("craft")
    if tags.get("tourism"):
        return "Turismo", tags.get("tourism")
    return "Otros", "other"


def is_relevant_business(tags: dict) -> bool:
    if tags.get("shop"):
        return True

    amenity = tags.get("amenity")
    if amenity in {
        "restaurant",
        "cafe",
        "bar",
        "fast_food",
        "pharmacy",
        "bank",
        "clinic",
        "dentist",
        "hospital",
        "fuel",
        "car_rental",
        "car_wash",
        "veterinary",
        "hairdresser",
        "beauty",
    }:
        return True

    office = tags.get("office")
    if office in {"company", "insurance", "estate_agent", "travel_agent", "lawyer", "accountant"}:
        return True

    if tags.get("craft"):
        return True

    return False


def compute_score(tags: dict) -> int:
    score = 10

    for key in ["website", "contact:website"]:
        if tags.get(key):
            score += 20
            break

    for key in ["phone", "contact:phone"]:
        if tags.get(key):
            score += 12
            break

    for key in ["email", "contact:email"]:
        if tags.get(key):
            score += 8
            break

    if tags.get("opening_hours"):
        score += 10

    if tags.get("brand") or tags.get("operator"):
        score += 8

    if tags.get("addr:street") and (tags.get("addr:housenumber") or tags.get("addr:postcode")):
        score += 8

    if tags.get("delivery") == "yes" or tags.get("takeaway") == "yes":
        score += 8

    social_keys = [
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
    if any(tags.get(key) for key in social_keys):
        score += 8

    payment_keys = [
        "payment:cards",
        "cards",
        "payment:credit_cards",
        "credit_cards",
        "payment:debit_cards",
        "debit_cards",
        "payment:contactless",
        "contactless",
    ]
    if any(tags.get(key) == "yes" for key in payment_keys):
        score += 6

    if tags.get("wheelchair") in {"yes", "limited"}:
        score += 3

    tag_count_bonus = min(19, len(tags))
    score += tag_count_bonus

    return max(0, min(100, score))


def normalize_element(el: dict, ingested_at: str, run_id: str) -> dict | None:
    tags = el.get("tags", {})
    if not is_relevant_business(tags):
        return None

    name = tags.get("name")
    if not name:
        return None

    lat = el.get("lat")
    lon = el.get("lon")
    if lat is None or lon is None:
        center = el.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")

    if lat is None or lon is None:
        return None

    category, subcategory = classify_category(tags)
    score = compute_score(tags)
    barrio_name, barrio_source = infer_barrio_name(lat, lon, tags)

    return {
        "_id": f"osm:{el['type']}:{el['id']}",
        "osm": {
            "id": el["id"],
            "type": el["type"],
            "tags": tags,
        },
        "name": name,
        "category": category,
        "subcategory": subcategory,
        "location": {
            "type": "Point",
            "coordinates": [lon, lat],
        },
        "barrio": {
            "name": barrio_name,
            "source": barrio_source,
        },
        "score": score,
        "gap": 0,
        "ingested_at": ingested_at,
        "run_id": run_id,
        "active": True,
    }
