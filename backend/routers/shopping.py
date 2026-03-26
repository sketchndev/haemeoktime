import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import (
    ShoppingItemCreate, ShoppingItemResponse, ShoppingResponse,
    ShoppingGenerateRequest, ShoppingCheckRequest,
    FrequentItemCreate, FrequentItemResponse,
)
from services.gemini import GeminiService, get_gemini

router = APIRouter()


def _current_week_start() -> str:
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


@router.get("/shopping", response_model=ShoppingResponse)
def get_shopping(db=Depends(get_db)):
    week_start = _current_week_start()
    rows = db.execute(
        "SELECT id, name, quantity, category, is_checked, is_auto FROM shopping_items WHERE week_start = ? ORDER BY id",
        (week_start,),
    ).fetchall()
    return {"week_start": week_start, "items": [dict(r) for r in rows]}


@router.post("/shopping/generate")
def generate_shopping(
    body: ShoppingGenerateRequest,
    db=Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
):
    week_start = _current_week_start()
    condiments = [r["name"] for r in db.execute("SELECT name FROM condiments").fetchall()]

    try:
        result = gemini.generate_shopping_list(menus=body.menus, condiments=condiments)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    # 기존 자동 항목 삭제
    db.execute("DELETE FROM shopping_items WHERE week_start = ? AND is_auto = TRUE", (week_start,))

    # 메뉴별 재료 정보 저장
    for mi in result.get("menu_ingredients", []):
        db.execute(
            "INSERT OR REPLACE INTO menu_ingredients (menu_name, ingredients) VALUES (?, ?)",
            (mi["menu"], json.dumps(mi["ingredients"], ensure_ascii=False)),
        )

    items_out = []
    for item in result.get("items", []):
        cur = db.execute(
            "INSERT INTO shopping_items (name, quantity, category, is_auto, week_start) VALUES (?, ?, ?, TRUE, ?)",
            (item["name"], item.get("quantity"), item.get("category"), week_start),
        )
        items_out.append({
            "id": cur.lastrowid, "name": item["name"],
            "quantity": item.get("quantity"), "category": item.get("category"),
            "is_checked": False, "is_auto": True,
        })
    return {"items": items_out}


@router.post("/shopping/items", response_model=ShoppingItemResponse)
def add_item(body: ShoppingItemCreate, db=Depends(get_db)):
    week_start = _current_week_start()
    cur = db.execute(
        "INSERT INTO shopping_items (name, quantity, category, is_auto, week_start) VALUES (?, ?, ?, FALSE, ?)",
        (body.name, body.quantity, body.category, week_start),
    )
    return {"id": cur.lastrowid, "name": body.name, "quantity": body.quantity,
            "category": body.category, "is_checked": False, "is_auto": False}


@router.patch("/shopping/items/{item_id}")
def check_item(item_id: int, body: ShoppingCheckRequest, db=Depends(get_db)):
    db.execute("UPDATE shopping_items SET is_checked = ? WHERE id = ?", (body.is_checked, item_id))
    return {"ok": True}


@router.delete("/shopping/items/{item_id}")
def delete_item(item_id: int, db=Depends(get_db)):
    db.execute("DELETE FROM shopping_items WHERE id = ?", (item_id,))
    return {"ok": True}


@router.get("/shopping/frequent", response_model=list[FrequentItemResponse])
def list_frequent(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, name FROM frequent_items ORDER BY sort_order, id").fetchall()]


@router.post("/shopping/frequent", response_model=FrequentItemResponse)
def add_frequent(body: FrequentItemCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO frequent_items (name) VALUES (?)", (body.name,))
    return {"id": cur.lastrowid, "name": body.name}


@router.delete("/shopping/frequent/{fid}")
def delete_frequent(fid: int, db=Depends(get_db)):
    db.execute("DELETE FROM frequent_items WHERE id = ?", (fid,))
    return {"ok": True}
