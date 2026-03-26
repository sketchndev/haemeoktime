# 식단 승인 및 주재료 DB 저장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 식단 추천 후 승인 단계를 추가하고, 주재료를 DB에 영구 저장하여 Gemini 재질의 없이 활용 가능하게 한다.

**Architecture:** 백엔드에서 `meal_history`에 주재료 컬럼을 추가하고, `meal_plan_settings`에 `plan_approved` 키로 승인 상태를 관리한다. 프론트엔드에서는 `MealPlanContext`에 `approved` 상태를 추가하고, 승인 전/후 버튼을 조건부로 표시한다.

**Tech Stack:** FastAPI, SQLite, React Context, Axios

---

### Task 1: meal_history 테이블에 주재료 컬럼 추가 (마이그레이션)

**Files:**
- Modify: `backend/database.py:22-28` (SCHEMA 내 meal_history 정의)
- Modify: `backend/database.py:79-101` (init_db 마이그레이션)

- [ ] **Step 1: SCHEMA에 meal_history 컬럼 추가**

`backend/database.py`의 `SCHEMA` 문자열에서 `meal_history` 테이블 정의를 수정한다:

```python
CREATE TABLE IF NOT EXISTS meal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    meal_type TEXT NOT NULL,
    menu_name TEXT NOT NULL,
    main_ingredient TEXT,
    main_ingredient_unit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: init_db에 마이그레이션 추가**

`backend/database.py`의 `init_db()` 함수에서 기존 마이그레이션 블록 뒤에 추가:

```python
try:
    conn.execute("ALTER TABLE meal_history ADD COLUMN main_ingredient TEXT")
except sqlite3.OperationalError:
    pass
try:
    conn.execute("ALTER TABLE meal_history ADD COLUMN main_ingredient_unit TEXT")
except sqlite3.OperationalError:
    pass
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && python -m pytest tests/test_database.py -v`
Expected: PASS (기존 테스트 통과 확인)

- [ ] **Step 4: 커밋**

```bash
git add backend/database.py
git commit -m "meal_history에 주재료 컬럼 추가"
```

---

### Task 2: 식단 추천 시 주재료를 meal_history에 저장

**Files:**
- Modify: `backend/routers/meals.py:163-166` (_process_gemini_result INSERT문)
- Modify: `backend/routers/meals.py:258-262` (rerecommend_single INSERT문)
- Modify: `backend/routers/meals.py:302-305` (rerecommend_meal_type INSERT문)
- Test: `backend/tests/test_meals.py`

- [ ] **Step 1: 테스트 작성 — 추천 시 주재료 저장 확인**

`backend/tests/test_meals.py` 끝에 추가:

```python
def test_recommend_saves_main_ingredient(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": [
                {"name": "된장찌개", "main_ingredient": "두부", "main_ingredient_unit": "모"},
            ]}],
        }]
    }
    res = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    assert res.status_code == 200
    menu = res.json()["days"][0]["meals"][0]["menus"][0]
    assert menu["main_ingredient"] == "두부"
    assert menu["main_ingredient_unit"] == "모"

    # DB에도 저장되었는지 확인
    import sqlite3
    from database import get_db_path
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT main_ingredient, main_ingredient_unit FROM meal_history WHERE menu_name = '된장찌개'").fetchone()
    conn.close()
    assert row["main_ingredient"] == "두부"
    assert row["main_ingredient_unit"] == "모"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_meals.py::test_recommend_saves_main_ingredient -v`
Expected: FAIL (INSERT문에 주재료 컬럼이 없으므로 DB 값이 NULL)

- [ ] **Step 3: _process_gemini_result의 INSERT문 수정**

`backend/routers/meals.py`의 `_process_gemini_result` 함수 내 INSERT문(163-166행)을 수정:

```python
cur = db.execute(
    "INSERT INTO meal_history (date, meal_type, menu_name, main_ingredient, main_ingredient_unit) VALUES (?, ?, ?, ?, ?)",
    (target_date, meal["meal_type"], menu_name, main_ing, main_ing_unit),
)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_meals.py::test_recommend_saves_main_ingredient -v`
Expected: PASS

- [ ] **Step 5: rerecommend_single INSERT문 수정**

`backend/routers/meals.py`의 `rerecommend_single` 함수 내 INSERT문(259-261행)을 수정:

```python
cur = db.execute(
    "INSERT INTO meal_history (date, meal_type, menu_name, main_ingredient, main_ingredient_unit) VALUES (?, ?, ?, ?, ?)",
    (body.date, body.meal_type, result["menu_name"], result.get("main_ingredient"), result.get("main_ingredient_unit")),
)
```

- [ ] **Step 6: rerecommend_meal_type INSERT문 수정**

`backend/routers/meals.py`의 `rerecommend_meal_type` 함수 내 INSERT문(302-305행)을 수정:

```python
cur = db.execute(
    "INSERT INTO meal_history (date, meal_type, menu_name, main_ingredient, main_ingredient_unit) VALUES (?, ?, ?, ?, ?)",
    (body.date, body.meal_type, menu_name, main_ing, main_ing_unit),
)
```

- [ ] **Step 7: 전체 meals 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_meals.py -v`
Expected: PASS (모든 테스트 통과)

- [ ] **Step 8: 커밋**

```bash
git add backend/routers/meals.py backend/tests/test_meals.py
git commit -m "식단 추천 시 주재료를 meal_history에 저장"
```

---

### Task 3: 식단 조회 시 주재료 포함 반환

**Files:**
- Modify: `backend/routers/meals.py:42-64` (_build_plan_from_rows)
- Modify: `backend/routers/meals.py:316-322` (get_today_meals SELECT문)
- Modify: `backend/routers/meals.py:326-340` (get_week_meals SELECT문)
- Test: `backend/tests/test_meals.py`

- [ ] **Step 1: 테스트 작성 — 조회 시 주재료 반환 확인**

`backend/tests/test_meals.py` 끝에 추가:

```python
def test_get_today_meals_includes_main_ingredient(client):
    from database import get_db_path
    import sqlite3
    from datetime import date

    today = date.today().isoformat()
    conn = sqlite3.connect(get_db_path())
    conn.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name, main_ingredient, main_ingredient_unit) VALUES (?, 'dinner', '된장찌개', '두부', '모')",
        (today,)
    )
    conn.commit()
    conn.close()

    res = client.get("/api/meals/today")
    assert res.status_code == 200
    menu = res.json()["days"][0]["meals"][0]["menus"][0]
    assert menu["main_ingredient"] == "두부"
    assert menu["main_ingredient_unit"] == "모"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_meals.py::test_get_today_meals_includes_main_ingredient -v`
Expected: FAIL (SELECT문에 주재료 컬럼 미포함, _build_plan_from_rows가 주재료 미포함)

- [ ] **Step 3: SELECT문과 _build_plan_from_rows 수정**

`backend/routers/meals.py`의 `get_today_meals` SELECT문 수정:

```python
rows = db.execute(
    "SELECT id, date, meal_type, menu_name, main_ingredient, main_ingredient_unit FROM meal_history "
    "WHERE date = ? ORDER BY id",
    (today,)
).fetchall()
```

`get_week_meals` SELECT문도 동일하게 수정:

```python
rows = db.execute(
    "SELECT id, date, meal_type, menu_name, main_ingredient, main_ingredient_unit FROM meal_history "
    "WHERE date >= ? AND date <= ? ORDER BY date, id",
    (monday.isoformat(), sunday.isoformat())
).fetchall()
```

`_build_plan_from_rows` 함수에서 주재료 포함:

```python
days_dict[d][mt].append({
    "history_id": r["id"], "name": r["menu_name"],
    "main_ingredient": r["main_ingredient"], "main_ingredient_unit": r["main_ingredient_unit"],
})
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_meals.py -v`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/routers/meals.py backend/tests/test_meals.py
git commit -m "식단 조회 시 주재료 정보 포함 반환"
```

---

### Task 4: 식단 승인 API 엔드포인트

**Files:**
- Modify: `backend/routers/meals.py` (approve 엔드포인트 추가, _process_gemini_result에 plan_approved 초기화)
- Test: `backend/tests/test_meals.py`

- [ ] **Step 1: 테스트 작성 — 승인 API**

`backend/tests/test_meals.py` 끝에 추가:

```python
def test_approve_plan(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}],
        }]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })

    # 승인 전 상태 확인
    status = client.get("/api/meals/approval-status")
    assert status.status_code == 200
    assert status.json()["approved"] is False

    # 승인
    res = client.put("/api/meals/approve")
    assert res.status_code == 200

    # 승인 후 상태 확인
    status = client.get("/api/meals/approval-status")
    assert status.json()["approved"] is True


def test_recommend_resets_approval(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}],
        }]
    }
    # 추천 → 승인
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    client.put("/api/meals/approve")

    # 재추천 → 승인 리셋
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    status = client.get("/api/meals/approval-status")
    assert status.json()["approved"] is False


def test_rerecommend_single_resets_approval(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}],
        }]
    }
    rec = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    hid = rec.json()["days"][0]["meals"][0]["menus"][0]["history_id"]
    client.put("/api/meals/approve")

    mock_gemini.re_recommend_single.return_value = {"menu_name": "비빔밥"}
    client.post("/api/meals/recommend/single", json={
        "date": "2026-03-23", "meal_type": "dinner",
        "history_id": hid, "menu_name": "된장찌개",
        "max_minutes_override": None, "existing_menus": [],
    })
    status = client.get("/api/meals/approval-status")
    assert status.json()["approved"] is False
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_meals.py::test_approve_plan -v`
Expected: FAIL (엔드포인트 없음)

- [ ] **Step 3: 승인 API 구현**

`backend/routers/meals.py`에 추가:

```python
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
```

- [ ] **Step 4: _process_gemini_result에 승인 초기화 추가**

`backend/routers/meals.py`의 `_process_gemini_result` 함수 내, `available_ingredients` INSERT 근처(184-187행)에 추가:

```python
db.execute(
    "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('plan_approved', 'false')"
)
```

- [ ] **Step 5: rerecommend_single에 승인 리셋 추가**

`backend/routers/meals.py`의 `rerecommend_single` 함수 return 전에 추가:

```python
db.execute(
    "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('plan_approved', 'false')"
)
```

- [ ] **Step 6: rerecommend_meal_type에 승인 리셋 추가**

`backend/routers/meals.py`의 `rerecommend_meal_type` 함수 return 전에 추가:

```python
db.execute(
    "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES ('plan_approved', 'false')"
)
```

- [ ] **Step 7: 전체 meals 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_meals.py -v`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add backend/routers/meals.py backend/tests/test_meals.py
git commit -m "식단 승인 API 엔드포인트 추가"
```

---

### Task 5: 장보기 리스트 생성 시 승인 확인

**Files:**
- Modify: `backend/routers/shopping.py:30-65` (generate_shopping에 승인 확인 추가)
- Test: `backend/tests/test_shopping.py`

- [ ] **Step 1: 테스트 작성 — 미승인 시 403 반환**

`backend/tests/test_shopping.py` 끝에 추가:

```python
def test_generate_shopping_requires_approval(client, mock_gemini):
    """승인하지 않은 상태에서 장보기 리스트 생성 시 403 반환."""
    mock_gemini.recommend_meals.return_value = {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}],
        }]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })

    res = client.post("/api/shopping/generate", json={"menus": ["된장찌개"]})
    assert res.status_code == 403
    assert "승인" in res.json()["detail"]


def test_generate_shopping_after_approval(client, mock_gemini):
    """승인 후에는 장보기 리스트 정상 생성."""
    mock_gemini.recommend_meals.return_value = {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}],
        }]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    client.put("/api/meals/approve")

    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "두부", "quantity": "1모", "category": "기타"}]
    }
    res = client.post("/api/shopping/generate", json={"menus": ["된장찌개"]})
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_shopping.py::test_generate_shopping_requires_approval -v`
Expected: FAIL (승인 확인 로직 없음, 200 반환)

- [ ] **Step 3: generate_shopping에 승인 확인 추가**

`backend/routers/shopping.py`의 `generate_shopping` 함수 시작 부분에 추가:

```python
row = db.execute(
    "SELECT value FROM meal_plan_settings WHERE key = 'plan_approved'"
).fetchone()
if not row or row["value"] != "true":
    raise HTTPException(status_code=403, detail="식단을 먼저 승인해주세요")
```

- [ ] **Step 4: 전체 shopping 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_shopping.py -v`
Expected: PASS

주의: 기존 `test_generate_replaces_auto_items`와 `test_generate_preserves_manual_items` 테스트가 승인 없이 generate를 호출하므로 실패할 수 있다. 이 테스트들에 승인 호출을 추가해야 한다.

기존 테스트 수정 — `test_generate_replaces_auto_items`:

```python
def test_generate_replaces_auto_items(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}]}]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    client.put("/api/meals/approve")

    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "애호박", "quantity": "1개", "category": "채소/과일"}]
    }
    client.post("/api/shopping/generate", json={"menus": ["된장찌개"]})

    client.put("/api/meals/approve")  # 재승인 (generate 후 다시 테스트)
    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "소고기", "quantity": "300g", "category": "육류/해산물"}]
    }
    client.post("/api/shopping/generate", json={"menus": ["소고기무국"]})

    items = client.get("/api/shopping").json()["items"]
    auto_items = [i for i in items if i["is_auto"]]
    assert len(auto_items) == 1
    assert auto_items[0]["name"] == "소고기"
```

기존 테스트 수정 — `test_generate_preserves_manual_items`:

```python
def test_generate_preserves_manual_items(client, mock_gemini):
    client.post("/api/shopping/items", json={"name": "수동항목"})

    mock_gemini.recommend_meals.return_value = {
        "days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["메뉴"]}]}]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    client.put("/api/meals/approve")

    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "자동항목", "quantity": "1개", "category": "기타"}]
    }
    client.post("/api/shopping/generate", json={"menus": ["메뉴"]})

    items = client.get("/api/shopping").json()["items"]
    names = [i["name"] for i in items]
    assert "수동항목" in names
    assert "자동항목" in names
```

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add backend/routers/shopping.py backend/tests/test_shopping.py
git commit -m "장보기 리스트 생성 시 식단 승인 확인"
```

---

### Task 6: 프론트엔드 — meals API에 승인 함수 추가

**Files:**
- Modify: `frontend/src/api/meals.js`

- [ ] **Step 1: approvePlan, getApprovalStatus 함수 추가**

`frontend/src/api/meals.js` 끝에 추가:

```javascript
export const approvePlan = () => client.put('/meals/approve')
export const getApprovalStatus = () => client.get('/meals/approval-status')
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/api/meals.js
git commit -m "프론트 meals API에 승인 함수 추가"
```

---

### Task 7: 프론트엔드 — MealPlanContext에 approved 상태 추가

**Files:**
- Modify: `frontend/src/contexts/MealPlanContext.jsx`

- [ ] **Step 1: approved 상태와 리셋 로직 추가**

`frontend/src/contexts/MealPlanContext.jsx`를 수정:

```jsx
import { createContext, useContext, useState } from 'react'

const MealPlanContext = createContext(null)

export function MealPlanProvider({ children }) {
  const [plan, setPlan] = useState(null)
  const [ingredients, setIngredients] = useState('')
  const [approved, setApproved] = useState(false)

  const updateMenu = (date, mealType, historyId, newMenu) => {
    setApproved(false)
    setPlan((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((day) =>
          day.date !== date ? day : {
            ...day,
            meals: day.meals.map((meal) =>
              meal.meal_type !== mealType ? meal : {
                ...meal,
                menus: meal.menus.map((m) =>
                  m.history_id === historyId ? newMenu : m
                ),
              }
            ),
          }
        ),
      }
    })
  }

  const replaceMeal = (date, mealType, newMenus) => {
    setApproved(false)
    setPlan((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((day) =>
          day.date !== date ? day : {
            ...day,
            meals: day.meals.map((meal) =>
              meal.meal_type !== mealType ? meal : { ...meal, menus: newMenus }
            ),
          }
        ),
      }
    })
  }

  const removeMenu = (date, mealType, historyId) => {
    setApproved(false)
    setPlan((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((day) =>
          day.date !== date ? day : {
            ...day,
            meals: day.meals.map((meal) =>
              meal.meal_type !== mealType ? meal : {
                ...meal,
                menus: meal.menus.filter((m) => m.history_id !== historyId),
              }
            ),
          }
        ),
      }
    })
  }

  return (
    <MealPlanContext.Provider value={{
      plan, setPlan, ingredients, setIngredients,
      approved, setApproved,
      updateMenu, replaceMeal, removeMenu,
    }}>
      {children}
    </MealPlanContext.Provider>
  )
}

export const useMealPlan = () => useContext(MealPlanContext)
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/contexts/MealPlanContext.jsx
git commit -m "MealPlanContext에 approved 상태 추가"
```

---

### Task 8: 프론트엔드 — MealPlanResult에 승인 UI 추가

**Files:**
- Modify: `frontend/src/pages/MealPlan/MealPlanResult.jsx`

- [ ] **Step 1: import 수정 및 approved 상태 연동**

`frontend/src/pages/MealPlan/MealPlanResult.jsx`에서 import와 context destructuring 수정:

import 추가:
```javascript
import { approvePlan, getApprovalStatus, reRecommendSingle, reRecommendMealType, deleteHistoryItem, getWeekMeals } from '../../api/meals'
```

context에서 `approved`, `setApproved` 추가:
```javascript
const { plan, setPlan, ingredients, approved, setApproved, updateMenu, replaceMeal, removeMenu } = useMealPlan()
```

- [ ] **Step 2: useEffect에서 승인 상태 로드**

기존 plan 로딩 useEffect (20-29행) 수정 — plan 없을 때 week meals와 함께 승인 상태도 로드:

```javascript
useEffect(() => {
  if (!plan) {
    setFetchLoading(true)
    Promise.all([getWeekMeals(), getApprovalStatus()])
      .then(([data, statusData]) => {
        if (data?.days?.length > 0) setPlan(data)
        if (statusData?.approved) setApproved(true)
      })
      .catch(() => {})
      .finally(() => setFetchLoading(false))
  }
}, [])
```

- [ ] **Step 3: 승인 핸들러 추가**

`handleGenerateShopping` 함수 위에 추가:

```javascript
const [approveLoading, setApproveLoading] = useState(false)

const handleApprove = async () => {
  setApproveLoading(true)
  try {
    await approvePlan()
    setApproved(true)
    toast.success('식단을 확정했어요!')
  } catch (e) {
    toast.error(e.message)
  } finally {
    setApproveLoading(false)
  }
}
```

- [ ] **Step 4: 하단 버튼 영역을 승인 상태에 따라 조건부 렌더링**

기존 장보기 버튼(237-247행)을 다음으로 교체:

```jsx
{!approved ? (
  <button
    onClick={handleApprove}
    disabled={approveLoading || Object.values(loading).some(Boolean)}
    className="mt-4 w-full bg-blue-500 text-white py-3 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
  >
    {approveLoading ? (
      <><Spinner /> 확정하는 중...</>
    ) : (
      '✅ 이 식단으로 확정'
    )}
  </button>
) : (
  <button
    onClick={handleGenerateShopping}
    disabled={shoppingLoading || Object.values(loading).some(Boolean)}
    className="mt-4 w-full bg-green-500 text-white py-3 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
  >
    {shoppingLoading ? (
      <><Spinner /> 장보기 리스트 만드는 중...</>
    ) : (
      '🛒 장보기 리스트 만들기'
    )}
  </button>
)}
```

- [ ] **Step 5: 수동 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/pages/MealPlan/MealPlanResult.jsx
git commit -m "MealPlanResult에 식단 승인 UI 추가"
```

---

### Task 9: 프론트엔드 — 새 추천 시 approved 초기화

**Files:**
- Modify: `frontend/src/pages/MealPlan/MealPlanHome.jsx`

- [ ] **Step 1: MealPlanHome에서 새 추천 시 approved 리셋**

`frontend/src/pages/MealPlan/MealPlanHome.jsx`를 읽고, `useMealPlan()` destructuring에 `setApproved`를 추가한다. 그리고 `setPlan(result)` 호출 근처에서 `setApproved(false)`도 호출하도록 수정한다.

구체적으로: `recommendMealsStream` 성공 콜백에서 `setPlan(data)` 직후에 `setApproved(false)` 추가.

- [ ] **Step 2: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/pages/MealPlan/MealPlanHome.jsx
git commit -m "새 식단 추천 시 approved 상태 초기화"
```

---

### Task 10: 통합 테스트 및 최종 확인

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 전체 PASS

- [ ] **Step 2: 프론트엔드 빌드**

Run: `cd frontend && npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 프론트엔드 린트**

Run: `cd frontend && npm run lint`
Expected: 에러 없음

- [ ] **Step 4: 최종 커밋 (필요 시)**

남은 변경사항이 있으면 커밋.
