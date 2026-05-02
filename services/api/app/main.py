from fastapi import FastAPI
from routes.ingesta import router as ingesta_router

app = FastAPI()

app.include_router(ingesta_router)
