from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://admin:QOjmJOG3gUCK2wdvkmDVPZ8r@localhost:27017/almeria_shop?authSource=admin"
)

client = AsyncIOMotorClient(MONGO_URI)
db = client["almeria_shop"]
shops_collection = db["shops"]