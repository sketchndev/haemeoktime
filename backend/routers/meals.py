import json
import logging
import re
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from database import get_db, open_db
from models import (
    RecommendRequest, RecommendResponse,
    SingleReRecommendRequest, MealTypeReRecommendRequest,
    SwapDatesRequest, UpdateHistoryRequest,
    FrequentItemCreate, FrequentItemResponse,
)
from services.gemini import GeminiService, get_gemini


def _parse_menu_count(composition_rule: str) -> int:
    """composition_rule에서 숫자+개 패턴을 추출해 합산. 예: '국 1개 반찬 2개' → 3"""
    nums = re.findall(r'(\d+)\s*개', composition_rule)
    return sum(int(n) for n in nums) if nums else 0

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


def _build_plan_from_rows(rows) -> dict:
    """meal_history rows → plan 구조 변환 헬퍼.
    rows는 date, id, meal_type, menu_name 컬럼을 포함해야 한다.
    """
    days_dict: dict = {}
    for r in rows:
        d = r["date"]
        mt = r["meal_type"]
        if d not in days_dict:
            days_dict[d] = {}
        if mt not in days_dict[d]:
            days_dict[d][mt] = []
        days_dict[d][mt].append({
            "history_id": r["id"], "name": r["menu_name"],
            "main_ingredient": r["main_ingredient"], "main_ingredient_unit": r["main_ingredient_unit"],
        })

    days_out = []
    for d, meals_dict in days_dict.items():
        meals_out = [
            {"meal_type": mt, "is_school_meal": False, "menus": menus}
            for mt, menus in meals_dict.items()
        ]
        days_out.append({"date": d, "meals": meals_out})
    days_out.sort(key=lambda x: x["date"])
    return {"days": days_out}


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
        sun = today - timedelta(days=(today.weekday() + 1) % 7)
        return [(sun + timedelta(days=i)).isoformat() for i in range(7)]
    if req.period == "weekdays":
        today = date.today()
        weekday = today.weekday()  # 0=Mon ... 6=Sun
        if weekday <= 4:  # 평일: 오늘부터 금요일까지
            return [(today + timedelta(days=i)).isoformat() for i in range(5 - weekday)]
        else:  # 토/일: 다음주 월~금
            next_monday = today + timedelta(days=(7 - weekday))
            return [(next_monday + timedelta(days=i)).isoformat() for i in range(5)]
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

    return _process_gemini_result(result, body, dates, composition_rule, school_meals, db)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _process_gemini_result(result: dict, body: RecommendRequest, dates, composition_rule, school_meals, db):
    """Gemini 응답 → DB 저장 + plan 구조 반환 (recommend 와 stream 공용)"""
    gemini_days = result.get("days", [])
    max_menus = _parse_menu_count(composition_rule) if composition_rule else 0

    for target_date in dates:
        for mt in body.meal_types:
            db.execute(
                "DELETE FROM meal_history WHERE date = ? AND meal_type = ?",
                (target_date, mt),
            )

    # 새 식단 추천 시 장보기 리스트 초기화
    today = date.today()
    week_start = (today - timedelta(days=(today.weekday() + 1) % 7)).isoformat()
    db.execute("DELETE FROM shopping_items WHERE week_start = ?", (week_start,))

    days_out = []
    for idx, target_date in enumerate(dates):
        gemini_day = None
        if idx < len(gemini_days):
            gemini_day = gemini_days[idx]
        if not gemini_day:
            gemini_day = next((d for d in gemini_days if d.get("date") == target_date), None)
        if not gemini_day:
            continue

        meals_out = []
        for meal in gemini_day.get("meals", []):
            menus = meal.get("menus", [])
            if max_menus > 0:
                menus = menus[:max_menus]
            menus_out = []
            for menu_item in menus:
                if isinstance(menu_item, dict):
                    menu_name = menu_item.get("name", "")
                    main_ing = menu_item.get("main_ingredient")
                    main_ing_unit = menu_item.get("main_ingredient_unit")
                else:
                    menu_name = menu_item
                    main_ing = None
                    main_ing_unit = None
                cur = db.execute(
                    "INSERT INTO meal_history (date, meal_type, menu_name, main_ingredient, main_ingredient_unit) VALUES (?, ?, ?, ?, ?)",
                    (target_date, meal["meal_type"], menu_name, main_ing, main_ing_unit),
                )
                menus_out.append({
                    "history_id": cur.lastrowid, "name": menu_name,
                    "main_ingredient": main_ing, "main_ingredient_unit": main_ing_unit,
                })
            meals_out.append({
                "meal_type": meal["meal_type"],
                "is_school_meal": False,
                "menus": menus_out,
            })
        if target_date in school_meals and "lunch" in body.meal_types:
            meals_out.append({
                "meal_type": "lunch",
                "is_school_meal": True,
                "menus": [{"history_id": -1, "name": m} for m in school_meals[target_date]],
            })
        days_out.append({"date": target_date, "meals": meals_out})

    db.execute(
        "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('available_ingredients', ?)",
        (body.available_ingredients or "",)
    )
    db.execute(
        "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('plan_approved', 'false')"
    )
    return {"days": days_out}


@router.post("/meals/recommend/stream")
def recommend_stream(body: RecommendRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    _purge_old_history(db)
    dates = _resolve_dates(body)
    tags, condiments, history, times, weekly_rule, composition_rule = _get_context(db)
    school_meals = _get_school_meals_dict(db, dates) if body.use_school_meals else {}

    def event_generator():
        yield _sse({"progress": 5, "stage": "설정 불러오는 중..."})

        prompt = gemini.build_recommend_prompt(
            dates=dates, meal_types=body.meal_types,
            family_tags=tags, condiments=condiments,
            meal_history=history, school_meals=school_meals,
            cooking_times=times, available_ingredients=body.available_ingredients,
            weekly_rule=weekly_rule, composition_rule=composition_rule,
        )

        yield _sse({"progress": 10, "stage": "AI에게 요청 중..."})

        try:
            gen = gemini._call_stream(prompt)
            result = None
            try:
                while True:
                    chunk_idx, _ = next(gen)
                    p = min(15 + chunk_idx * 3, 85)
                    yield _sse({"progress": p, "stage": "AI가 식단을 구성 중..."})
            except StopIteration as e:
                result = e.value

            yield _sse({"progress": 90, "stage": "식단 저장 중..."})
            stream_db = open_db()
            try:
                plan = _process_gemini_result(result, body, dates, composition_rule, school_meals, stream_db)
                stream_db.commit()
            except Exception:
                stream_db.rollback()
                raise
            finally:
                stream_db.close()

            yield _sse({"progress": 100, "stage": "완료!", "result": plan})
        except Exception as e:
            logging.error("recommend_stream error: %s", e, exc_info=True)
            yield _sse({"error": str(e)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
        "INSERT INTO meal_history (date, meal_type, menu_name, main_ingredient, main_ingredient_unit) VALUES (?, ?, ?, ?, ?)",
        (body.date, body.meal_type, result["menu_name"], result.get("main_ingredient"), result.get("main_ingredient_unit")),
    )
    db.execute(
        "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('plan_approved', 'false')"
    )
    return {
        "history_id": cur.lastrowid, "name": result["menu_name"],
        "main_ingredient": result.get("main_ingredient"),
        "main_ingredient_unit": result.get("main_ingredient_unit"),
    }


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
    for menu_item in result.get("menus", []):
        if isinstance(menu_item, dict):
            menu_name = menu_item.get("name", "")
            main_ing = menu_item.get("main_ingredient")
            main_ing_unit = menu_item.get("main_ingredient_unit")
        else:
            menu_name = menu_item
            main_ing = None
            main_ing_unit = None
        cur = db.execute(
            "INSERT INTO meal_history (date, meal_type, menu_name, main_ingredient, main_ingredient_unit) VALUES (?, ?, ?, ?, ?)",
            (body.date, body.meal_type, menu_name, main_ing, main_ing_unit),
        )
        menus_out.append({
            "history_id": cur.lastrowid, "name": menu_name,
            "main_ingredient": main_ing, "main_ingredient_unit": main_ing_unit,
        })

    db.execute(
        "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('plan_approved', 'false')"
    )
    return {"menus": menus_out}


@router.get("/meals/today")
def get_today_meals(db=Depends(get_db)):
    today = date.today().isoformat()
    rows = db.execute(
        "SELECT id, date, meal_type, menu_name, main_ingredient, main_ingredient_unit FROM meal_history "
        "WHERE date = ? ORDER BY id",
        (today,)
    ).fetchall()
    return _build_plan_from_rows(rows)


@router.get("/meals/week")
def get_week_meals(db=Depends(get_db)):
    today = date.today()
    sun = today - timedelta(days=(today.weekday() + 1) % 7)
    next_sat = sun + timedelta(days=13)
    rows = db.execute(
        "SELECT id, date, meal_type, menu_name, main_ingredient, main_ingredient_unit FROM meal_history "
        "WHERE date >= ? AND date <= ? ORDER BY date, id",
        (sun.isoformat(), next_sat.isoformat())
    ).fetchall()
    plan = _build_plan_from_rows(rows)
    ai_row = db.execute(
        "SELECT value FROM meal_plan_settings WHERE key = 'available_ingredients'"
    ).fetchone()
    plan["available_ingredients"] = ai_row["value"] if ai_row else ""
    return plan


@router.patch("/meals/history/{history_id}")
def update_history(history_id: int, body: UpdateHistoryRequest, db=Depends(get_db)):
    row = db.execute("SELECT id FROM meal_history WHERE id = ?", (history_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="해당 메뉴를 찾을 수 없습니다")
    db.execute(
        "UPDATE meal_history SET menu_name = ?, main_ingredient = NULL, main_ingredient_unit = NULL WHERE id = ?",
        (body.menu_name, history_id),
    )
    return {"history_id": history_id, "name": body.menu_name, "main_ingredient": None, "main_ingredient_unit": None}


@router.delete("/meals/history/{history_id}")
def delete_history(history_id: int, db=Depends(get_db)):
    db.execute("DELETE FROM meal_history WHERE id = ?", (history_id,))
    return {"ok": True}


@router.delete("/meals/history/date/{date}")
def delete_history_by_date(date: str, db=Depends(get_db)):
    db.execute("DELETE FROM meal_history WHERE date = ?", (date,))
    return {"ok": True}


@router.put("/meals/swap-dates")
def swap_dates(body: SwapDatesRequest, db=Depends(get_db)):
    if body.date1 == body.date2:
        raise HTTPException(status_code=400, detail="같은 날짜끼리는 교환할 수 없습니다")
    # 임시 날짜로 우회하여 unique 충돌 방지
    temp_date = "__swap_temp__"
    db.execute("UPDATE meal_history SET date = ? WHERE date = ?", (temp_date, body.date1))
    db.execute("UPDATE meal_history SET date = ? WHERE date = ?", (body.date1, body.date2))
    db.execute("UPDATE meal_history SET date = ? WHERE date = ?", (body.date2, temp_date))
    return {"ok": True}


@router.put("/meals/approve")
def approve_plan(db=Depends(get_db)):
    db.execute(
        "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('plan_approved', 'true')"
    )
    return {"ok": True}


@router.get("/meals/approval-status")
def get_approval_status(db=Depends(get_db)):
    row = db.execute(
        "SELECT value FROM meal_plan_settings WHERE key = 'plan_approved'"
    ).fetchone()
    approved = row["value"] == "true" if row else False
    return {"approved": approved}


@router.get("/meals/frequent-ingredients", response_model=list[FrequentItemResponse])
def list_frequent_ingredients(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, name FROM frequent_ingredients ORDER BY sort_order, id").fetchall()]


@router.post("/meals/frequent-ingredients", response_model=FrequentItemResponse)
def add_frequent_ingredient(body: FrequentItemCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO frequent_ingredients (name) VALUES (?)", (body.name,))
    return {"id": cur.lastrowid, "name": body.name}


@router.delete("/meals/frequent-ingredients/{fid}")
def delete_frequent_ingredient(fid: int, db=Depends(get_db)):
    db.execute("DELETE FROM frequent_ingredients WHERE id = ?", (fid,))
    return {"ok": True}
