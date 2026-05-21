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
ai_analysis_collection = db["ai_analysis"]
precompute_jobs_collection = db["precompute_jobs"]
web_requests_collection = db["web_requests"]


async def ensure_indexes() -> None:

    # SHOPS
    await shops_collection.create_index([("location", GEOSPHERE)])
    await shops_collection.create_index("barrio.name")
    await shops_collection.create_index("last_seen_at")

    # para saber si ya fue revisado por el sync de Google
    await shops_collection.create_index("reviews_sync_attempted")
    await shops_collection.create_index("reviews_synced")

    # INGESTAS CORRIDAS
    await ingesta_runs_collection.create_index("started_at")

    # REVIEWS DE GOOGLE
    await shop_reviews_collection.create_index("shop_id", unique=True)
    await shop_reviews_collection.create_index("google_place_id")

    # ANALISIS IA CACHEADOS
    await ai_analysis_collection.create_index("shop_id", unique=True)
    await ai_analysis_collection.create_index("osm_id")
    await ai_analysis_collection.create_index("updated_at")

    # JOBS DE PRECOMPUTE IA
    await precompute_jobs_collection.create_index("job_id", unique=True)
    await precompute_jobs_collection.create_index("status")
    await precompute_jobs_collection.create_index("updated_at")

    # SOLICITUDES DE WEB EXTERNA (n8n)
    await web_requests_collection.create_index("request_id", unique=True)
    await web_requests_collection.create_index("shop_id")
    await web_requests_collection.create_index("status")
    await web_requests_collection.create_index("created_at")
