from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import GEOSPHERE
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "almeria_shop")

client = AsyncIOMotorClient(MONGO_URI)

db = client[MONGO_DB_NAME]

shops_collection = db["shops"]
shop_reviews_collection = db["shop_reviews"]
ingesta_runs_collection = db["ingesta_runs"]


async def ensure_indexes() -> None:

    # SHOPS
    await shops_collection.create_index([("location", GEOSPHERE)])
    await shops_collection.create_index("barrio.name")
    await shops_collection.create_index("last_seen_at")

    # para saber si ya fue procesado por google
    await shops_collection.create_index("google_reviews_processed")

    # INGESTAS CORRIDAS
    await ingesta_runs_collection.create_index("started_at")

    # REVIEWS DE GOOGLE
    await shop_reviews_collection.create_index("shop_id", unique=True)
    await shop_reviews_collection.create_index("google_place_id")