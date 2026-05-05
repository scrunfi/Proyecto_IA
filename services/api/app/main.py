from fastapi import FastAPI
from dotenv import load_dotenv
from app.database.mongo import ensure_indexes
from app.routes.ingesta import router as ingesta_router

load_dotenv()

app = FastAPI()

app.include_router(ingesta_router)


@app.on_event("startup")
async def on_startup() -> None:
    await ensure_indexes()
