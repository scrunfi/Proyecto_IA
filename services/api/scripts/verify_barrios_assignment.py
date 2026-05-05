import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def main() -> None:
    load_dotenv()

    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB_NAME", "almeria_shop")

    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]
    shops = db["shops"]

    total_active = await shops.count_documents({"active": True})
    without_barrio = await shops.count_documents(
        {
            "active": True,
            "$or": [
                {"barrio.name": "Sin barrio"},
                {"barrio.name": {"$exists": False}},
                {"barrio.name": None},
            ],
        }
    )

    source_rows = await shops.aggregate(
        [
            {"$match": {"active": True}},
            {"$group": {"_id": "$barrio.source", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
    ).to_list(length=20)

    top_barrios = await shops.aggregate(
        [
            {"$match": {"active": True, "barrio.name": {"$ne": "Sin barrio"}}},
            {"$group": {"_id": "$barrio.name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
    ).to_list(length=10)

    def pct(value: int) -> float:
        if total_active == 0:
            return 0.0
        return round((value / total_active) * 100, 2)

    print("=== Estado de asignacion de barrios ===")
    print(f"Total activos: {total_active}")
    print(f"Sin barrio: {without_barrio} ({pct(without_barrio)}%)")
    print("\nPor fuente de asignacion:")
    for row in source_rows:
        key = row.get("_id") or "none"
        count = int(row.get("count", 0))
        print(f"- {key}: {count} ({pct(count)}%)")

    print("\nTop barrios detectados:")
    if not top_barrios:
        print("- No hay barrios asignados todavia")
    else:
        for row in top_barrios:
            print(f"- {row.get('_id')}: {row.get('count', 0)}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
