# Favorite Recipe Data Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store full recipe data with favorites so they can be viewed without re-querying AI, and allow saving combined cooking results as favorites.

**Architecture:** Extend `favorite_recipes` table with `recipe_type` and `recipe_data` columns. Update backend models/endpoints to accept and return the new fields. Update frontend API layer and components to pass recipe data when favoriting and display saved data directly.

**Tech Stack:** Python/FastAPI, SQLite, Pydantic, React, localStorage cache

**Spec:** `docs/superpowers/specs/2026-03-25-favorite-recipe-data-storage-design.md`

---

### Task 1: Extend DB Schema and Backend Models

**Files:**
- Modify: `backend/database.py:30-34` (favorite_recipes table definition)
- Modify: `backend/models.py:135-141` (FavoriteCreate, FavoriteResponse)

- [ ] **Step 1: Write failing test for new favorite fields**

Add to `backend/tests/test_recipes.py`:

```python
def test_add_favorite_with_recipe_data(client):
    recipe_data = {
        "menu_name": "된장찌개", "servings": 2, "calories": 200,
        "ingredients": [{"name": "두부", "amount": "1/2모"}],
        "steps": ["물을 끓인다"], "health_notes": None,
    }
    res = client.post("/api/recipes/favorites", json={
        "menu_name": "된장찌개",
        "recipe_type": "individual",
        "recipe_data": recipe_data,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["recipe_type"] == "individual"
    assert body["recipe_data"]["calories"] == 200


def test_add_combined_favorite(client):
    combined_data = {
        "total_minutes": 60, "optimized_minutes": 40,
        "menus": ["된장찌개", "시금치나물"],
        "ingredients": [{"menu": "된장찌개", "items": [{"name": "두부", "amount": "1/2모"}]}],
        "steps": [{"label": "1단계", "menu_tag": "된장찌개", "description": "물 올리기"}],
    }
    res = client.post("/api/recipes/favorites", json={
        "menu_name": "된장찌개 + 시금치나물",
        "recipe_type": "combined",
        "recipe_data": combined_data,
    })
    assert res.status_code == 200
    assert res.json()["recipe_type"] == "combined"


def test_list_favorites_includes_recipe_data(client):
    recipe_data = {"calories": 300, "ingredients": [], "steps": []}
    client.post("/api/recipes/favorites", json={
        "menu_name": "비빔밥", "recipe_type": "individual", "recipe_data": recipe_data,
    })
    favs = client.get("/api/recipes/favorites").json()
    fav = next(f for f in favs if f["menu_name"] == "비빔밥")
    assert fav["recipe_data"]["calories"] == 300
    assert fav["recipe_type"] == "individual"


def test_add_favorite_without_recipe_data_backward_compat(client):
    res = client.post("/api/recipes/favorites", json={"menu_name": "김치찌개"})
    assert res.status_code == 200
    body = res.json()
    assert body["recipe_type"] == "individual"
    assert body["recipe_data"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_recipes.py -v -k "recipe_data or combined_favorite or backward_compat"`
Expected: FAIL (validation errors for unknown fields)

- [ ] **Step 3: Update DB schema**

In `backend/database.py`, change the `favorite_recipes` table definition (lines 30-34):

```python
CREATE TABLE IF NOT EXISTS favorite_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_name TEXT NOT NULL,
    recipe_type TEXT NOT NULL DEFAULT 'individual',
    recipe_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Also add migration for existing databases in `init_db()`, after `conn.executescript(SCHEMA)` (after line 74):

```python
    # Migration: add new columns to existing favorite_recipes table
    try:
        conn.execute("ALTER TABLE favorite_recipes ADD COLUMN recipe_type TEXT NOT NULL DEFAULT 'individual'")
    except Exception:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE favorite_recipes ADD COLUMN recipe_data TEXT")
    except Exception:
        pass  # Column already exists
```

- [ ] **Step 4: Update Pydantic models**

In `backend/models.py`, replace `FavoriteCreate` and `FavoriteResponse` (lines 135-141):

```python
class FavoriteCreate(BaseModel):
    menu_name: str
    recipe_type: str = "individual"
    recipe_data: Optional[dict] = None


class FavoriteResponse(BaseModel):
    id: int
    menu_name: str
    recipe_type: str = "individual"
    recipe_data: Optional[dict] = None
```

- [ ] **Step 5: Update router endpoints**

In `backend/routers/recipes.py`, update the imports (line 3) to include `json`:

```python
import json
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import RecipeRequest, RecipeResponse, ExtractMainIngredientsRequest, CombinedCookingRequest, FavoriteCreate, FavoriteResponse
from services.gemini import GeminiService, get_gemini
```

Update `list_favorites` (line 42-44):

```python
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
```

Update `add_favorite` (line 47-50):

```python
@router.post("/recipes/favorites", response_model=FavoriteResponse)
def add_favorite(body: FavoriteCreate, db=Depends(get_db)):
    recipe_data_str = json.dumps(body.recipe_data, ensure_ascii=False) if body.recipe_data else None
    cur = db.execute(
        "INSERT INTO favorite_recipes (menu_name, recipe_type, recipe_data) VALUES (?, ?, ?)",
        (body.menu_name, body.recipe_type, recipe_data_str),
    )
    return {"id": cur.lastrowid, "menu_name": body.menu_name, "recipe_type": body.recipe_type, "recipe_data": body.recipe_data}
```

- [ ] **Step 6: Run all recipe tests**

Run: `cd backend && python -m pytest tests/test_recipes.py -v`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add backend/database.py backend/models.py backend/routers/recipes.py backend/tests/test_recipes.py
git commit -m "feat: extend favorites with recipe_type and recipe_data storage"
```

---

### Task 2: Update Frontend API Layer

**Files:**
- Modify: `frontend/src/api/recipes.js:31-33` (addFavorite, getFavorites)

- [ ] **Step 1: Update addFavorite to accept recipe data**

In `frontend/src/api/recipes.js`, replace lines 31-33:

```javascript
export const getFavorites = () => client.get('/recipes/favorites')
export const addFavorite = (menuName, recipeType = 'individual', recipeData = null) =>
  client.post('/recipes/favorites', { menu_name: menuName, recipe_type: recipeType, recipe_data: recipeData })
export const deleteFavorite = (id) => client.delete(`/recipes/favorites/${id}`)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/recipes.js
git commit -m "feat: update addFavorite API to pass recipe type and data"
```

---

### Task 3: Update RecipeDetail to Save Recipe Data with Favorites

**Files:**
- Modify: `frontend/src/pages/Recipes/RecipeDetail.jsx:46-59` (toggleFavorite function)

- [ ] **Step 1: Update toggleFavorite to pass recipe data**

In `frontend/src/pages/Recipes/RecipeDetail.jsx`, replace the `toggleFavorite` function (lines 46-60):

```javascript
  const toggleFavorite = async () => {
    try {
      if (favorited && favoriteId) {
        await deleteFavorite(favoriteId)
        setFavorited(false); setFavoriteId(null)
        toast.success('즐겨찾기에서 삭제했어요')
      } else {
        const recipeData = recipe ? {
          menu_name: recipe.menu_name,
          servings: recipe.servings,
          calories: recipe.calories,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          health_notes: recipe.health_notes,
        } : null
        const result = await addFavorite(decodedName, 'individual', recipeData)
        setFavorited(true); setFavoriteId(result.id)
        toast.success('즐겨찾기에 추가했어요')
      }
    } catch (e) {
      toast.error(e.message)
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Recipes/RecipeDetail.jsx
git commit -m "feat: save recipe data when adding to favorites"
```

---

### Task 4: Add Favorite Button to CombinedCooking Result

**Files:**
- Modify: `frontend/src/pages/CombinedCooking/CombinedCooking.jsx:1-5` (imports), result phase section (lines 180-222)

- [ ] **Step 1: Add favorite imports and state**

In `frontend/src/pages/CombinedCooking/CombinedCooking.jsx`, update import line 4:

```javascript
import { extractMainIngredients, generateCombinedCooking, addFavorite, getFavorites, deleteFavorite } from '../../api/recipes'
```

Add favorite state after line 29 (`const [result, setResult] = useState(null)`):

```javascript
  const [favorited, setFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)
```

- [ ] **Step 2: Add favorite check on result load**

After the `handleStart` function (after line 62), add:

```javascript
  const combinedName = menus.join(' + ')

  // Check if this combined recipe is already favorited
  useEffect(() => {
    if (menus.length === 0) return
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.menu_name === combinedName && f.recipe_type === 'combined')
      if (fav) { setFavorited(true); setFavoriteId(fav.id) }
    }).catch(() => {})
  }, [])

  const toggleFavorite = async () => {
    try {
      if (favorited && favoriteId) {
        await deleteFavorite(favoriteId)
        setFavorited(false); setFavoriteId(null)
        toast.success('즐겨찾기에서 삭제했어요')
      } else {
        const recipeData = result ? {
          total_minutes: result.total_minutes,
          optimized_minutes: result.optimized_minutes,
          ingredients: result.ingredients,
          steps: result.steps,
          menus: [...menus],
        } : null
        const res = await addFavorite(combinedName, 'combined', recipeData)
        setFavorited(true); setFavoriteId(res.id)
        toast.success('즐겨찾기에 추가했어요')
      }
    } catch (e) {
      toast.error(e.message)
    }
  }
```

- [ ] **Step 3: Add favorite button to header in result phase**

In the result phase section (line 180), add a favorite button to the header area. Replace the header section (lines 81-84) to include a conditional favorite button:

```javascript
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-lg font-bold flex-1">⚡ 함께 요리하기</h1>
        {phase === 'result' && (
          <button onClick={toggleFavorite} className="text-2xl">{favorited ? '♥' : '♡'}</button>
        )}
      </div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CombinedCooking/CombinedCooking.jsx
git commit -m "feat: add favorite button to combined cooking result"
```

---

### Task 5: Update RecipesPage to Handle Combined Favorites

**Files:**
- Modify: `frontend/src/pages/Recipes/RecipesPage.jsx:52-63` (favorites list rendering)

- [ ] **Step 1: Update favorites list to show recipe type and navigate correctly**

In `frontend/src/pages/Recipes/RecipesPage.jsx`, replace the favorites list rendering (lines 51-63):

```javascript
        <div className="space-y-2">
          {favorites.map((f) => (
            <div key={f.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between">
              <button
                onClick={() => {
                  if (f.recipe_type === 'combined' && f.recipe_data) {
                    navigate(`/recipes/combined-favorite/${f.id}`, { state: { favorite: f } })
                  } else {
                    navigate(`/recipes/${encodeURIComponent(f.menu_name)}`, {
                      state: f.recipe_data ? { recipeData: f.recipe_data } : undefined,
                    })
                  }
                }}
                className="text-sm font-medium flex-1 text-left"
              >
                {f.recipe_type === 'combined' && <span className="text-xs text-green-600 mr-1">⚡</span>}
                {f.menu_name}
              </button>
              <button onClick={() => handleDelete(f.id)} className="text-gray-400 text-xl">♥</button>
            </div>
          ))}
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Recipes/RecipesPage.jsx
git commit -m "feat: handle combined favorites in recipes page navigation"
```

---

### Task 6: Update RecipeDetail to Use Saved Recipe Data

**Files:**
- Modify: `frontend/src/pages/Recipes/RecipeDetail.jsx:1-34` (add location state handling)

- [ ] **Step 1: Add location import and saved data handling**

In `frontend/src/pages/Recipes/RecipeDetail.jsx`, update import line 2:

```javascript
import { useNavigate, useParams, useLocation } from 'react-router-dom'
```

Add location state handling. Replace lines 8-34 with:

```javascript
  const navigate = useNavigate()
  const { menuName } = useParams()
  const { state } = useLocation()
  const decodedName = decodeURIComponent(menuName)
  const [servings, setServings] = useState(2)
  const [weight, setWeight] = useState('')
  const [recipe, setRecipe] = useState(null)
  const [loading, setLoading] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)

  const load = async (s, w) => {
    setLoading(true)
    try {
      const data = await generateRecipe(decodedName, s, w || null)
      setRecipe(data)
    } catch (e) {
      toast.error(e.message)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    // If navigated from favorites with saved recipe data, use it directly
    if (state?.recipeData) {
      setRecipe(state.recipeData)
      setServings(state.recipeData.servings || 2)
    } else {
      load(servings, null)
    }
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.menu_name === decodedName)
      if (fav) { setFavorited(true); setFavoriteId(fav.id) }
    })
  }, [])
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Recipes/RecipeDetail.jsx
git commit -m "feat: use saved recipe data from favorites instead of re-querying AI"
```

---

### Task 7: Add Combined Favorite Detail Page

**Files:**
- Create: `frontend/src/pages/Recipes/CombinedFavoriteDetail.jsx`
- Modify: `frontend/src/App.jsx` (add route)

- [ ] **Step 1: Check App.jsx for route structure**

Read `frontend/src/App.jsx` to see how routes are organized.

- [ ] **Step 2: Create CombinedFavoriteDetail page**

Create `frontend/src/pages/Recipes/CombinedFavoriteDetail.jsx`:

```jsx
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getFavorites, deleteFavorite } from '../../api/recipes'

export default function CombinedFavoriteDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { state } = useLocation()
  const [favorite, setFavorite] = useState(state?.favorite || null)
  const [favorited, setFavorited] = useState(true)

  useEffect(() => {
    if (favorite) return
    // If no state passed, fetch from favorites list
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.id === parseInt(id))
      if (fav) setFavorite(fav)
      else toast.error('즐겨찾기를 찾을 수 없어요')
    }).catch((e) => toast.error(e.message))
  }, [id])

  const handleToggleFavorite = async () => {
    try {
      await deleteFavorite(parseInt(id))
      setFavorited(false)
      toast.success('즐겨찾기에서 삭제했어요')
      navigate(-1)
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (!favorite) return <div className="p-4 text-center text-gray-400">불러오는 중...</div>

  const data = favorite.recipe_data
  if (!data) return <div className="p-4 text-center text-gray-400">레시피 데이터가 없어요</div>

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-lg font-bold flex-1">⚡ {favorite.menu_name}</h1>
        {favorited && <button onClick={handleToggleFavorite} className="text-2xl">♥</button>}
      </div>

      <div className="bg-amber-50 rounded-xl p-3 mb-4 text-sm">
        <span className="text-gray-500">개별 합산</span>
        <span className="line-through ml-2 text-gray-400">{data.total_minutes}분</span>
        <span className="mx-2">→</span>
        <span className="font-bold text-amber-600">{data.optimized_minutes}분</span>
      </div>

      {data.ingredients?.length > 0 && (
        <div className="space-y-3 mb-4">
          {data.ingredients.map((group, i) => (
            <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
              <p className="text-sm font-semibold mb-2">{group.menu}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {group.items.map((item, j) => (
                  <span key={j} className="text-sm text-gray-600">
                    {item.name} <span className="text-green-600 font-medium">{item.amount}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-bold mb-2">조리 순서</h2>
      <div className="space-y-3">
        {data.steps.map((step, i) => (
          <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
              {step.menu_tag}
            </span>
            <p className="text-sm font-medium mt-1">{i + 1}. {step.label}</p>
            <div className="text-sm text-gray-600 mt-1 space-y-0.5">
              {(step.actions || [step.description]).map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add route in App.jsx**

Add the import and route for CombinedFavoriteDetail. The route path should be `/recipes/combined-favorite/:id`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Recipes/CombinedFavoriteDetail.jsx frontend/src/App.jsx
git commit -m "feat: add combined favorite detail page with saved recipe display"
```

---

### Task 8: Run Full Backend Tests

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: ALL PASS

- [ ] **Step 2: Fix any failures if needed**

---

### Task 9: Manual Smoke Test

- [ ] **Step 1: Verify individual recipe favorite saves data**
- Start app, navigate to a recipe, add to favorites
- Check favorites list shows the recipe
- Click the favorite — should display saved recipe without AI loading

- [ ] **Step 2: Verify combined cooking favorite**
- Navigate to combined cooking, generate a result
- Click the heart button to favorite
- Go to favorites list — should show with ⚡ icon
- Click it — should display saved combined cooking data

- [ ] **Step 3: Verify backward compatibility**
- Existing favorites (no recipe_data) should still work
- Clicking them should trigger AI generation as before
