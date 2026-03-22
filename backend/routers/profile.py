from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from database import get_db
from models import (
    TagCreate, TagResponse, CondimentCreate, CondimentResponse,
    CookingTimes, ProfileResponse,
)
from services.gemini import GeminiService, get_gemini

router = APIRouter()


@router.get("/profile", response_model=ProfileResponse)
def get_profile(db=Depends(get_db)):
    tags = [dict(r) for r in db.execute("SELECT id, tag FROM family_tags").fetchall()]
    condiments = [dict(r) for r in db.execute("SELECT id, name FROM condiments").fetchall()]
    times = {r["meal_type"]: r["max_minutes"]
             for r in db.execute("SELECT meal_type, max_minutes FROM cooking_time_settings").fetchall()}
    return {
        "family_tags": tags,
        "condiments": condiments,
        "cooking_times": {"breakfast": times.get("breakfast", 15),
                          "lunch": times.get("lunch", 30),
                          "dinner": times.get("dinner", 40)},
    }


@router.put("/profile/cooking-times")
def update_cooking_times(body: CookingTimes, db=Depends(get_db)):
    for meal_type, minutes in body.model_dump().items():
        db.execute(
            "INSERT OR REPLACE INTO cooking_time_settings (meal_type, max_minutes) VALUES (?, ?)",
            (meal_type, minutes),
        )
    return {"ok": True}


@router.get("/profile/family-tags", response_model=list[TagResponse])
def list_tags(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, tag FROM family_tags ORDER BY id").fetchall()]


@router.post("/profile/family-tags", response_model=TagResponse)
def add_tag(body: TagCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO family_tags (tag) VALUES (?)", (body.tag,))
    return {"id": cur.lastrowid, "tag": body.tag}


@router.delete("/profile/family-tags/{tag_id}")
def delete_tag(tag_id: int, db=Depends(get_db)):
    db.execute("DELETE FROM family_tags WHERE id = ?", (tag_id,))
    return {"ok": True}


@router.get("/profile/condiments", response_model=list[CondimentResponse])
def list_condiments(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, name FROM condiments ORDER BY id").fetchall()]


@router.post("/profile/condiments", response_model=CondimentResponse)
def add_condiment(body: CondimentCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO condiments (name) VALUES (?)", (body.name,))
    return {"id": cur.lastrowid, "name": body.name}


@router.delete("/profile/condiments/{cid}")
def delete_condiment(cid: int, db=Depends(get_db)):
    db.execute("DELETE FROM condiments WHERE id = ?", (cid,))
    return {"ok": True}


@router.post("/profile/condiments/photo")
async def parse_condiment_photo(
    file: UploadFile = File(...),
    gemini: GeminiService = Depends(get_gemini),
):
    try:
        data = await file.read()
        result = gemini.parse_condiment_photo(data, file.content_type or "image/jpeg")
        return result
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
