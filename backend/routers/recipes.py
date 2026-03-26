import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from database import get_db
from models import RecipeRequest, RecipeResponse, ExtractMainIngredientsRequest, CombinedCookingRequest, FavoriteCreate, FavoriteResponse
from services.gemini import GeminiService, get_gemini


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

router = APIRouter()


def _get_saved_ingredients(db, menu_name: str) -> list | None:
    row = db.execute("SELECT ingredients FROM menu_ingredients WHERE menu_name = ?", (menu_name,)).fetchone()
    return json.loads(row["ingredients"]) if row else None


@router.post("/recipes/generate", response_model=RecipeResponse)
def generate_recipe(body: RecipeRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    saved_ingredients = _get_saved_ingredients(db, body.menu_name)
    try:
        result = gemini.generate_recipe(
            menu_name=body.menu_name, servings=body.servings,
            family_tags=tags, main_ingredient_weight=body.main_ingredient_weight,
            user_context=body.user_context,
            saved_ingredients=saved_ingredients,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


@router.post("/recipes/generate/stream")
def generate_recipe_stream(body: RecipeRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    saved_ingredients = _get_saved_ingredients(db, body.menu_name)

    def event_generator():
        yield _sse({"progress": 5, "stage": "설정 불러오는 중..."})

        prompt = gemini.build_recipe_prompt(
            menu_name=body.menu_name, servings=body.servings,
            family_tags=tags, main_ingredient_weight=body.main_ingredient_weight,
            user_context=body.user_context,
            saved_ingredients=saved_ingredients,
        )

        yield _sse({"progress": 10, "stage": "AI에게 요청 중..."})

        try:
            gen = gemini._call_stream(prompt)
            result = None
            try:
                while True:
                    chunk_idx, _ = next(gen)
                    p = min(15 + chunk_idx * 5, 90)
                    yield _sse({"progress": p, "stage": "레시피 생성 중..."})
            except StopIteration as e:
                result = e.value

            yield _sse({"progress": 100, "stage": "완료!", "result": result})
        except Exception as e:
            yield _sse({"error": str(e)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
            user_context=body.user_context,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/recipes/combined-cooking/stream")
def combined_cooking_stream(body: CombinedCookingRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]

    def event_generator():
        yield _sse({"progress": 5, "stage": "설정 불러오는 중..."})

        prompt, config = gemini.build_combined_cooking_prompt(
            menus=body.menus, family_tags=tags,
            servings=body.servings, main_ingredient_weights=body.main_ingredient_weights,
            user_context=body.user_context,
        )

        yield _sse({"progress": 10, "stage": "AI에게 요청 중..."})

        try:
            gen = gemini._call_stream(prompt, config=config)
            result = None
            try:
                while True:
                    chunk_idx, _ = next(gen)
                    p = min(15 + chunk_idx * 3, 90)
                    yield _sse({"progress": p, "stage": "AI가 최적 순서를 계산 중..."})
            except StopIteration as e:
                result = e.value

            yield _sse({"progress": 100, "stage": "완료!", "result": result})
        except Exception as e:
            yield _sse({"error": str(e)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
