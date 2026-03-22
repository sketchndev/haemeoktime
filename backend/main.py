from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routers import profile, meals, recipes, shopping, school_meals

init_db()

app = FastAPI(title="해먹타임 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router, prefix="/api")
app.include_router(meals.router, prefix="/api")
app.include_router(recipes.router, prefix="/api")
app.include_router(shopping.router, prefix="/api")
app.include_router(school_meals.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
