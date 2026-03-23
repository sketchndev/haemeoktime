# Home Today Meal Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면 진입 시 오늘 meal_history가 있으면 식단 카드를 인라인 표시하고, 이번 주 식단으로 이동하는 버튼을 추가한다.

**Architecture:** 백엔드에 `GET /meals/today`와 `GET /meals/week` 엔드포인트를 추가해 meal_history를 기존 plan 구조로 변환한다. 프론트엔드 홈 화면은 마운트 시 today를 조회해 카드를 렌더링하며, 이번 주 버튼 클릭 시 week를 조회해 MealPlanContext에 저장 후 결과 페이지로 이동한다. MealPlanResult는 오늘 날짜 탭을 자동 선택한다.

**Tech Stack:** FastAPI, SQLite, Python datetime, React, axios client (`/api` baseURL)

---

## File Map

| 파일 | 변경 내용 |
|------|----------|
| `backend/routers/meals.py` | `get_today_str`, `get_week_range` 헬퍼 추가; `GET /meals/today`, `GET /meals/week` 엔드포인트 추가 |
| `backend/tests/test_meals.py` | 신규 엔드포인트 4개 테스트 추가 |
| `frontend/src/api/meals.js` | `getTodayMeals`, `getWeekMeals` 추가 |
| `frontend/src/pages/MealPlan/MealPlanHome.jsx` | 마운트 로직, 오늘 식단 카드, 이번 주 버튼 추가 |
| `frontend/src/pages/MealPlan/MealPlanResult.jsx` | `selectedDate` 초기값 — 오늘 날짜 우선 선택으로 변경 |

---

## Task 1: Backend — `GET /meals/today`

**Files:**
- Modify: `backend/routers/meals.py`
- Test: `backend/tests/test_meals.py`

### 배경 지식

`meals.py`의 현재 import:
```python
from datetime import date, timedelta
```
`date`와 `timedelta`는 이미 import되어 있다.

반환해야 하는 plan 구조:
```json
{
  "days": [
    {
      "date": "2026-03-23",
      "meals": [
        {
          "meal_type": "dinner",
          "is_school_meal": false,
          "menus": [{ "history_id": 1, "name": "된장찌개" }]
        }
      ]
    }
  ]
}
```

- [ ] **Step 1: 실패 테스트 작성 — 오늘 데이터 있을 때**

`backend/tests/test_meals.py` 끝에 추가:

```python
def test_get_today_meals_with_data(client):
    """오늘 meal_history가 있으면 plan 구조로 반환한다."""
    from database import get_db_path
    import sqlite3
    from datetime import date

    today = date.today().isoformat()
    conn = sqlite3.connect(get_db_path())
    conn.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, 'dinner', '된장찌개')",
        (today,)
    )
    conn.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, 'dinner', '시금치나물')",
        (today,)
    )
    conn.commit()
    conn.close()

    res = client.get("/api/meals/today")
    assert res.status_code == 200
    data = res.json()
    assert len(data["days"]) == 1
    assert data["days"][0]["date"] == today
    meals = data["days"][0]["meals"]
    assert len(meals) == 1
    assert meals[0]["meal_type"] == "dinner"
    assert meals[0]["is_school_meal"] is False
    menus = meals[0]["menus"]
    assert len(menus) == 2
    assert menus[0]["name"] == "된장찌개"
    assert "history_id" in menus[0]
```

- [ ] **Step 2: 실패 테스트 작성 — 오늘 데이터 없을 때**

같은 파일 끝에 추가:

```python
def test_get_today_meals_empty(client):
    """오늘 meal_history가 없으면 days 빈 배열을 반환한다."""
    res = client.get("/api/meals/today")
    assert res.status_code == 200
    assert res.json() == {"days": []}
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
cd backend && python -m pytest tests/test_meals.py::test_get_today_meals_with_data tests/test_meals.py::test_get_today_meals_empty -v
```

Expected: `FAILED` — `404 Not Found` (엔드포인트 없음)

- [ ] **Step 4: `meals.py`에 헬퍼 함수와 엔드포인트 추가**

`meals.py`의 `_get_school_meals_dict` 함수 앞에 헬퍼 추가:

```python
def _build_plan_from_rows(rows) -> dict:
    """meal_history rows → plan 구조 변환 헬퍼.
    rows는 (date, id, meal_type, menu_name)을 포함해야 한다.
    """
    from collections import OrderedDict
    # date → meal_type → list of (id, name)
    days_dict: dict[str, dict[str, list]] = OrderedDict()
    for r in rows:
        d = r["date"]
        mt = r["meal_type"]
        if d not in days_dict:
            days_dict[d] = {}
        if mt not in days_dict[d]:
            days_dict[d][mt] = []
        days_dict[d][mt].append({"history_id": r["id"], "name": r["menu_name"]})

    days_out = []
    for d, meals_dict in days_dict.items():
        meals_out = [
            {"meal_type": mt, "is_school_meal": False, "menus": menus}
            for mt, menus in meals_dict.items()
        ]
        days_out.append({"date": d, "meals": meals_out})
    return {"days": days_out}
```

그 다음, `router.delete` 엔드포인트 앞에 추가:

```python
@router.get("/meals/today")
def get_today_meals(db=Depends(get_db)):
    today = date.today().isoformat()
    rows = db.execute(
        "SELECT id, meal_type, menu_name, ? as date FROM meal_history "
        "WHERE date = ? ORDER BY id",
        (today, today)
    ).fetchall()
    return _build_plan_from_rows(rows)
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
cd backend && python -m pytest tests/test_meals.py::test_get_today_meals_with_data tests/test_meals.py::test_get_today_meals_empty -v
```

Expected: `PASSED` 2개

- [ ] **Step 6: 전체 테스트 실행 — 기존 테스트 유지 확인**

```bash
cd backend && python -m pytest tests/test_meals.py -v
```

Expected: 전부 PASSED (기존 6개 + 신규 2개 = 8개)

- [ ] **Step 7: 커밋**

```bash
cd backend && git add routers/meals.py tests/test_meals.py
git commit -m "feat: add GET /meals/today endpoint"
```

---

## Task 2: Backend — `GET /meals/week`

**Files:**
- Modify: `backend/routers/meals.py`
- Test: `backend/tests/test_meals.py`

### 배경 지식

주간 범위: Python `date.weekday()` 기준, 월요일=0, 일요일=6.
`_build_plan_from_rows` 헬퍼는 Task 1에서 이미 추가됨 — 재사용한다.

- [ ] **Step 1: 실패 테스트 작성 — 이번 주 데이터 있을 때**

`backend/tests/test_meals.py` 끝에 추가:

```python
def test_get_week_meals_with_data(client):
    """이번 주 meal_history가 있으면 날짜순 plan 구조로 반환한다."""
    from database import get_db_path
    import sqlite3
    from datetime import date, timedelta

    today = date.today()
    monday = today - timedelta(days=today.weekday())
    day1 = monday.isoformat()
    day2 = (monday + timedelta(days=1)).isoformat()

    conn = sqlite3.connect(get_db_path())
    conn.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, 'dinner', '불고기')",
        (day1,)
    )
    conn.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, 'lunch', '비빔밥')",
        (day2,)
    )
    conn.commit()
    conn.close()

    res = client.get("/api/meals/week")
    assert res.status_code == 200
    data = res.json()
    dates = [d["date"] for d in data["days"]]
    assert day1 in dates
    assert day2 in dates
    assert dates == sorted(dates)  # 날짜순 정렬
```

- [ ] **Step 2: 실패 테스트 작성 — 이번 주 데이터 없을 때**

같은 파일 끝에 추가:

```python
def test_get_week_meals_empty(client):
    """이번 주 meal_history가 없으면 days 빈 배열을 반환한다."""
    res = client.get("/api/meals/week")
    assert res.status_code == 200
    assert res.json() == {"days": []}
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
cd backend && python -m pytest tests/test_meals.py::test_get_week_meals_with_data tests/test_meals.py::test_get_week_meals_empty -v
```

Expected: `FAILED` — 404 Not Found

- [ ] **Step 4: `meals.py`에 엔드포인트 추가**

`get_today_meals` 함수 바로 아래에 추가:

```python
@router.get("/meals/week")
def get_week_meals(db=Depends(get_db)):
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    rows = db.execute(
        "SELECT id, date, meal_type, menu_name FROM meal_history "
        "WHERE date >= ? AND date <= ? ORDER BY date, id",
        (monday.isoformat(), sunday.isoformat())
    ).fetchall()
    return _build_plan_from_rows(rows)
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
cd backend && python -m pytest tests/test_meals.py::test_get_week_meals_with_data tests/test_meals.py::test_get_week_meals_empty -v
```

Expected: `PASSED` 2개

- [ ] **Step 6: 전체 테스트 실행**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: 전부 PASSED

- [ ] **Step 7: 커밋**

```bash
cd backend && git add routers/meals.py tests/test_meals.py
git commit -m "feat: add GET /meals/week endpoint"
```

---

## Task 3: Frontend — meals.js API 함수 추가

**Files:**
- Modify: `frontend/src/api/meals.js`

### 배경 지식

현재 `meals.js` 전체:
```js
import client from './client'

export const recommendMeals = (body) => client.post('/meals/recommend', body)
export const reRecommendSingle = (body) => client.post('/meals/recommend/single', body)
export const reRecommendMealType = (body) => client.post('/meals/recommend/meal-type', body)
export const deleteHistoryItem = (id) => client.delete(`/meals/history/${id}`)
```

`client`의 `baseURL`은 `/api`. `client.js`의 response 인터셉터가 `res.data`를 자동 언래핑하므로 호출부에서 `result`는 이미 `{ days: [...] }` 객체다.

- [ ] **Step 1: 두 함수 추가**

`frontend/src/api/meals.js` 끝에 두 줄 추가:

```js
export const getTodayMeals = () => client.get('/meals/today')
export const getWeekMeals  = () => client.get('/meals/week')
```

- [ ] **Step 2: 개발 서버 기동 확인 (빌드 에러 없는지)**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/api/meals.js
git commit -m "feat: add getTodayMeals and getWeekMeals API functions"
```

---

## Task 4: Frontend — MealPlanHome.jsx 오늘 식단 카드

**Files:**
- Modify: `frontend/src/pages/MealPlan/MealPlanHome.jsx`

### 배경 지식

현재 `MealPlanHome.jsx`에서 사용하는 import:
```js
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { recommendMeals } from '../../api/meals'
import { useMealPlan } from '../../contexts/MealPlanContext'
import LoadingSpinner from '../../components/LoadingSpinner'
```

추가할 import: `useEffect`, `getTodayMeals`, `getWeekMeals`

끼니 레이블:
```js
const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }
```
(MealPlanResult.jsx와 동일 — 인라인으로 정의)

지나간 끼니 필터:
```js
function isPastMeal(mealType) {
  const hour = new Date().getHours()
  if (mealType === 'breakfast') return hour >= 10
  if (mealType === 'lunch') return hour >= 15
  return false
}
```

레시피 버튼 로직:
- 메뉴가 0개인 끼니: 카드 렌더 안 함
- 메뉴 1개: `/recipes/${encodeURIComponent(menuNames[0])}` 로 이동
- 메뉴 2개 이상: `/meals/result/${date}/${meal.meal_type}/cooking` + `{ state: { menus: menuNames } }` 로 이동

- [ ] **Step 1: import 수정**

현재:
```js
import { useState } from 'react'
```
변경:
```js
import { useState, useEffect } from 'react'
```

현재:
```js
import { recommendMeals } from '../../api/meals'
```
변경:
```js
import { recommendMeals, getTodayMeals, getWeekMeals } from '../../api/meals'
```

- [ ] **Step 2: 컴포넌트 함수 상단에 state + useEffect 추가**

`MealPlanHome` 함수 안에서 기존 `const [loading, setLoading] = useState(false)` 바로 아래에 추가:

```js
const [todayPlan, setTodayPlan] = useState(null)
const [todayLoading, setTodayLoading] = useState(true)  // true로 시작 — fetch 완료 전 카드 섹션 깜빡임 방지
const [weekLoading, setWeekLoading] = useState(false)

useEffect(() => {
  getTodayMeals()
    .then((data) => setTodayPlan(data))
    .catch(() => {}) // 오류 무시 — 폼만 표시
    .finally(() => setTodayLoading(false))
}, [])
```

- [ ] **Step 3: `isPastMeal`, `MEAL_LABELS` 헬퍼 추가**

컴포넌트 함수 바깥(파일 상단, `PERIODS` 상수 근처)에 추가:

```js
const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }

function isPastMeal(mealType) {
  const hour = new Date().getHours()
  if (mealType === 'breakfast') return hour >= 10
  if (mealType === 'lunch') return hour >= 15
  return false
}
```

- [ ] **Step 4: `handleViewWeek` 핸들러 추가**

컴포넌트 함수 안에서 `handleRecommend` 함수 아래에 추가:

```js
const handleViewWeek = async () => {
  setWeekLoading(true)
  try {
    const result = await getWeekMeals()
    setPlan(result)
    navigate('/meals/result')
  } catch (e) {
    toast.error(e.message)
  } finally {
    setWeekLoading(false)
  }
}
```

- [ ] **Step 5: 오늘 식단 카드 JSX 추가**

현재 JSX의 `return (...)` 안, `<div className="p-4 space-y-5">` 바로 안쪽(헤더 `<div>` 뒤)에 아래 섹션 삽입:

```jsx
{/* 오늘 식단 카드 */}
{!todayLoading && todayPlan?.days?.length > 0 && (() => {
  const todayDate = todayPlan.days[0].date
  const visibleMeals = todayPlan.days[0].meals.filter(
    (m) => m.menus.length > 0 && !isPastMeal(m.meal_type)
  )
  if (visibleMeals.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 mb-2">오늘 식단</h2>
      <div className="space-y-2">
        {visibleMeals.map((meal) => {
          const menuNames = meal.menus.map((m) => m.name)
          const handleRecipe = () => {
            if (menuNames.length >= 2) {
              navigate(
                `/meals/result/${todayDate}/${meal.meal_type}/cooking`,
                { state: { menus: menuNames } }
              )
            } else {
              navigate(`/recipes/${encodeURIComponent(menuNames[0])}`)
            }
          }
          return (
            <div key={meal.meal_type} className="bg-white rounded-xl shadow-sm p-3">
              <p className="font-semibold text-sm mb-1">{MEAL_LABELS[meal.meal_type]}</p>
              <p className="text-sm text-gray-700 mb-2">
                {menuNames.join('  •  ')}
              </p>
              <button
                onClick={handleRecipe}
                className="text-xs text-amber-600 border border-amber-300 px-3 py-1 rounded-full"
              >
                🍳 레시피 보기
              </button>
            </div>
          )
        })}
      </div>
      <button
        onClick={handleViewWeek}
        disabled={weekLoading}
        className="mt-3 w-full text-sm text-green-700 border border-green-300 py-2 rounded-xl"
      >
        {weekLoading ? '...' : '📅 이번 주 식단 보기'}
      </button>
    </section>
  )
})()}
```

> **주의:** 위 IIFE 패턴 대신 별도 변수 `todaySection`을 컴포넌트 함수 안에서 계산해 JSX에 `{todaySection}`으로 삽입하는 것이 더 읽기 쉬우면 그렇게 해도 됨. 렌더 결과는 동일.

- [ ] **Step 6: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/pages/MealPlan/MealPlanHome.jsx
git commit -m "feat: show today meals on home page with recipe navigation"
```

---

## Task 5: Frontend — MealPlanResult.jsx selectedDate 초기값

**Files:**
- Modify: `frontend/src/pages/MealPlan/MealPlanResult.jsx`

### 배경 지식

현재 line 14:
```js
const [selectedDate, setSelectedDate] = useState(plan?.days?.[0]?.date || '')
```

문제: `toISOString()`은 UTC 기준이라 한국 시간 자정 전(UTC 기준 전날)에는 어제 날짜를 반환함.
해결: `toLocaleDateString('en-CA')`는 로컬 시간 기준 `YYYY-MM-DD` 반환.

변경 목표: plan에 오늘 날짜 day가 있으면 오늘 탭 선택, 없으면 첫째 날 선택 (기존과 동일).

- [ ] **Step 1: `selectedDate` 초기값 변경**

현재 코드:
```js
const [selectedDate, setSelectedDate] = useState(plan?.days?.[0]?.date || '')
```

교체:
```js
const todayStr = new Date().toLocaleDateString('en-CA')
const initialDate =
  plan?.days?.find((d) => d.date === todayStr)?.date ||
  plan?.days?.[0]?.date ||
  ''
const [selectedDate, setSelectedDate] = useState(initialDate)
```

> 세 줄을 기존 한 줄 위치에 삽입한다. (`todayStr`, `initialDate` 선언이 `useState` 호출보다 앞에 있어야 함.)

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/pages/MealPlan/MealPlanResult.jsx
git commit -m "feat: auto-select today tab in meal plan result"
```

---

## Task 6: 통합 브라우저 테스트

**Files:** 없음 (읽기 전용 검증)

### 전제 조건

- 백엔드: `cd backend && uvicorn main:app --reload --port 8001`
- 프론트엔드: `cd frontend && npm run dev`

- [ ] **Step 1: 오늘 meal_history 시드**

아래 curl로 오늘 날짜로 추천 데이터를 생성한다 (실제 Gemini 호출):

```bash
curl -s -X POST http://localhost:8001/api/meals/recommend \
  -H "Content-Type: application/json" \
  -d '{"period":"today","dates":[],"meal_types":["lunch","dinner"],"available_ingredients":"","use_school_meals":false}' \
  | python -m json.tool
```

Expected: `{ "days": [{ "date": "...", "meals": [...] }] }` 반환

- [ ] **Step 2: 홈 화면 진입 — 오늘 식단 카드 확인**

브라우저(또는 Chrome DevTools MCP)로 `http://localhost:5173/` 접속.

확인 항목:
- 오늘 식단 카드 섹션이 표시됨
- 지나간 끼니(현재 시각 기준)는 카드에 없음
- 남은 끼니 카드에 메뉴 이름과 "🍳 레시피 보기" 버튼이 표시됨
- "📅 이번 주 식단 보기" 버튼이 카드 아래 표시됨

- [ ] **Step 3: 레시피 보기 동작 확인**

메뉴가 2개 이상인 끼니 카드의 "레시피 보기" 클릭 → `/meals/result/.../cooking` 페이지로 이동하는지 확인.
메뉴가 1개인 끼니 카드의 "레시피 보기" 클릭 → `/recipes/...` 페이지로 이동하는지 확인.

- [ ] **Step 4: 이번 주 식단 보기 동작 확인**

"📅 이번 주 식단 보기" 클릭 → `/meals/result` 페이지로 이동.
오늘 날짜 탭이 자동 선택되어 있는지 확인.

- [ ] **Step 5: 오늘 식단 없을 때 확인**

`/api/meals/today` 엔드포인트가 `{ "days": [] }`를 반환하는 상황(다른 날짜로 시드된 DB 등)에서 홈 화면에 카드가 없고 기존 폼만 표시되는지 확인.

> 빠른 확인: 개발 DB를 삭제하고 서버 재시작하면 meal_history가 비워짐.
> `rm backend/haemeoktime.db && cd backend && python -c "from database import init_db; init_db()"`

- [ ] **Step 6: 버그 수정 후 최종 커밋 (있을 경우)**

```bash
git add -p
git commit -m "fix: <버그 내용>"
```
