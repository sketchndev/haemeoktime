import json
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import RecipeRequest, RecipeResponse, ExtractMainIngredientsRequest, CombinedCookingRequest, FavoriteCreate, FavoriteResponse
from services.gemini import GeminiService, get_gemini

router = APIRouter()


@router.post("/recipes/generate", response_model=RecipeResponse)
def generate_recipe(body: RecipeRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    try:
        result = gemini.generate_recipe(
            menu_name=body.menu_name, servings=body.servings,
            family_tags=tags, main_ingredient_weight=body.main_ingredient_weight,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


@router.post("/recipes/extract-main-ingredients")
def extract_main_ingredients(body: ExtractMainIngredientsRequest, gemini: GeminiService = Depends(get_gemini)):
    try:
        return gemini.extract_main_ingredients(menus=body.menus)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/recipes/combined-cooking")
def combined_cooking(body: CombinedCookingRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    try:
        return gemini.generate_combined_cooking(
            menus=body.menus, family_tags=tags,
            servings=body.servings, main_ingredient_weights=body.main_ingredient_weights,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/recipes/favorites", response_model=list[FavoriteResponse])
def list_favorites(db=Depends(get_db)):
    rows = db.execute("SELECT id, menu_name, recipe_type, recipe_data FROM favorite_recipes ORDER BY created_at DESC").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if d["recipe_data"]:
            d["recipe_data"] = json.loads(d["recipe_data"])
        result.append(d)
    return result


@router.post("/recipes/favorites", response_model=FavoriteResponse)
def add_favorite(body: FavoriteCreate, db=Depends(get_db)):
    recipe_data_str = json.dumps(body.recipe_data, ensure_ascii=False) if body.recipe_data else None
    cur = db.execute(
        "INSERT INTO favorite_recipes (menu_name, recipe_type, recipe_data) VALUES (?, ?, ?)",
        (body.menu_name, body.recipe_type, recipe_data_str),
    )
    return {"id": cur.lastrowid, "menu_name": body.menu_name, "recipe_type": body.recipe_type, "recipe_data": body.recipe_data}


@router.delete("/recipes/favorites/{fid}")
def delete_favorite(fid: int, db=Depends(get_db)):
    db.execute("DELETE FROM favorite_recipes WHERE id = ?", (fid,))
    return {"ok": True}
