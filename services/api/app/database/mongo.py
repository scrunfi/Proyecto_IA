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
ingesta_runs_collection = db["ingesta_runs"]


async def ensure_indexes() -> None:
    # MongoDB already creates a unique _id index by default.
    await shops_collection.create_index([("location", GEOSPHERE)])
    await shops_collection.create_index("barrio.name")
    await shops_collection.create_index("last_seen_at")
    await ingesta_runs_collection.create_index("started_at")
