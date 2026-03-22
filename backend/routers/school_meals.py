import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from database import get_db
from models import SchoolMealDay
from services.gemini import GeminiService, get_gemini

router = APIRouter()


def _current_week_range():
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


@router.get("/school-meals", response_model=list[SchoolMealDay])
def get_school_meals(db=Depends(get_db)):
    monday, sunday = _current_week_range()
    rows = db.execute(
        "SELECT date, menu_items FROM school_meals WHERE date BETWEEN ? AND ? ORDER BY date",
        (monday, sunday),
    ).fetchall()
    return [{"date": r["date"], "menu_items": json.loads(r["menu_items"])} for r in rows]


@router.post("/school-meals/photo", response_model=list[SchoolMealDay])
def upload_school_meal_photo(
    file: UploadFile = File(...),
    gemini: GeminiService = Depends(get_gemini),
    db=Depends(get_db),
):
    try:
        data = file.file.read()
        result = gemini.parse_school_meal_photo(data, file.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    saved = []
    for day in result.get("days", []):
        db.execute(
            """INSERT INTO school_meals (date, menu_items)
               VALUES (?, ?)
               ON CONFLICT(date) DO UPDATE SET menu_items=excluded.menu_items""",
            (day["date"], json.dumps(day["menu_items"], ensure_ascii=False)),
        )
        saved.append({"date": day["date"], "menu_items": day["menu_items"]})
    return saved
