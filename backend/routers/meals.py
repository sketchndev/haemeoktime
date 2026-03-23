import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import (
    RecommendRequest, RecommendResponse,
    SingleReRecommendRequest, MealTypeReRecommendRequest,
)
from services.gemini import GeminiService, get_gemini

router = APIRouter()


def _purge_old_history(db):
    # date 컬럼 기준으로 14일 초과 항목 삭제 (식단 날짜 기준, 기록 시점 아님)
    db.execute("DELETE FROM meal_history WHERE date < date('now', '-14 days')")


def _get_context(db):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    condiments = [r["name"] for r in db.execute("SELECT name FROM condiments").fetchall()]
    history = [r["menu_name"] for r in db.execute(
        "SELECT menu_name FROM meal_history WHERE date >= date('now', '-14 days')"
    ).fetchall()]
    times = {r["meal_type"]: r["max_minutes"]
             for r in db.execute("SELECT meal_type, max_minutes FROM cooking_time_settings").fetchall()}
    rows = db.execute("SELECT key, value FROM meal_plan_settings").fetchall()
    rules = {r["key"]: r["value"] for r in rows}
    weekly_rule = rules.get("weekly_rule", "")
    composition_rule = rules.get("composition_rule", "")
    return tags, condiments, history, times, weekly_rule, composition_rule


def _get_school_meals_dict(db, dates: list[str]) -> dict:
    if not dates:
        return {}
    placeholders = ",".join("?" * len(dates))
    rows = db.execute(
        f"SELECT date, menu_items FROM school_meals WHERE date IN ({placeholders})", dates
    ).fetchall()
    return {r["date"]: json.loads(r["menu_items"]) for r in rows}


def _resolve_dates(req: RecommendRequest) -> list[str]:
    if req.period == "today":
        return [date.today().isoformat()]
    if req.period == "week":
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        return [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    return req.dates


@router.post("/meals/recommend", response_model=RecommendResponse)
def recommend(body: RecommendRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    _purge_old_history(db)
    dates = _resolve_dates(body)
    tags, condiments, history, times, weekly_rule, composition_rule = _get_context(db)
    school_meals = _get_school_meals_dict(db, dates) if body.use_school_meals else {}

    try:
        result = gemini.recommend_meals(
            dates=dates, meal_types=body.meal_types,
            family_tags=tags, condiments=condiments,
            meal_history=history, school_meals=school_meals,
            cooking_times=times, available_ingredients=body.available_ingredients,
            weekly_rule=weekly_rule,
            composition_rule=composition_rule,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    days_out = []
    for day in result.get("days", []):
        meals_out = []
        for meal in day.get("meals", []):
            menus_out = []
            for menu_name in meal.get("menus", []):
                cur = db.execute(
                    "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, ?, ?)",
                    (day["date"], meal["meal_type"], menu_name),
                )
                menus_out.append({"history_id": cur.lastrowid, "name": menu_name})
            meals_out.append({
                "meal_type": meal["meal_type"],
                "is_school_meal": False,
                "menus": menus_out,
            })
        # 급식 슬롯 추가: use_school_meals=True이고 해당 날짜 급식이 있으면 표시
        if day["date"] in school_meals and "lunch" in body.meal_types:
            meals_out.append({
                "meal_type": "lunch",
                "is_school_meal": True,
                "menus": [{"history_id": -1, "name": m} for m in school_meals[day["date"]]],
            })
        days_out.append({"date": day["date"], "meals": meals_out})

    return {"days": days_out}


@router.post("/meals/recommend/single")
def rerecommend_single(
    body: SingleReRecommendRequest,
    db=Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
):
    tags, condiments, _, times, _, _ = _get_context(db)
    max_min = body.max_minutes_override if body.max_minutes_override is not None else times.get(body.meal_type, 40)

    try:
        result = gemini.re_recommend_single(
            date=body.date, meal_type=body.meal_type, exclude_menu=body.menu_name,
            existing_menus=body.existing_menus, family_tags=tags,
            condiments=condiments, max_minutes=max_min,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    db.execute("DELETE FROM meal_history WHERE id = ?", (body.history_id,))
    cur = db.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, ?, ?)",
        (body.date, body.meal_type, result["menu_name"]),
    )
    return {"history_id": cur.lastrowid, "name": result["menu_name"]}


@router.post("/meals/recommend/meal-type")
def rerecommend_meal_type(
    body: MealTypeReRecommendRequest,
    db=Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
):
    tags, condiments, history, times, _, composition_rule = _get_context(db)
    max_min = body.max_minutes_override if body.max_minutes_override is not None else times.get(body.meal_type, 40)

    try:
        result = gemini.re_recommend_meal_type(
            date=body.date, meal_type=body.meal_type, family_tags=tags,
            condiments=condiments, max_minutes=max_min, meal_history=history,
            composition_rule=composition_rule,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    if body.existing_history_ids:
        placeholders = ",".join("?" * len(body.existing_history_ids))
        db.execute(f"DELETE FROM meal_history WHERE id IN ({placeholders})", body.existing_history_ids)

    menus_out = []
    for menu_name in result.get("menus", []):
        cur = db.execute(
            "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, ?, ?)",
            (body.date, body.meal_type, menu_name),
        )
        menus_out.append({"history_id": cur.lastrowid, "name": menu_name})

    return {"menus": menus_out}


@router.delete("/meals/history/{history_id}")
def delete_history(history_id: int, db=Depends(get_db)):
    db.execute("DELETE FROM meal_history WHERE id = ?", (history_id,))
    return {"ok": True}
