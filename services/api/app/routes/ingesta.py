from fastapi import APIRouter
from database.mongo import shops_collection
from services.overpass_service import fetch_overpass_shops

router = APIRouter()

@router.post("/ingesta")
async def ingesta_shops():
    data = fetch_overpass_shops()
    elements = data.get("elements", [])

    inserted = 0

    for el in elements:
        if "tags" not in el or "shop" not in el["tags"]:
            continue

        el["_id"] = f"{el['type']}_{el['id']}"

        try:
            await shops_collection.insert_one(el)
            inserted += 1
        except Exception:
            pass

    return {
        "status": "ok",
        "insertados": inserted,
        "total_recibidos": len(elements)
    }
