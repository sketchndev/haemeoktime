# 홈 화면 오늘 식단 표시 기능 디자인

**날짜**: 2026-03-23
**상태**: 승인됨

## 개요

식단 홈 화면(`/`) 진입 시 오늘 meal_history가 있으면 해당 식단을 인라인으로 표시하고, 이번 주 식단 전체를 볼 수 있는 동선을 추가한다.

- 지나간 끼니는 표시하지 않음 (시각 기반 필터)
- 각 끼니 카드에서 "레시피 보기"로 요리 화면 진입 가능
- 오늘 식단이 없으면 기존 추천 폼 그대로 표시

---

## UI 구조

### 오늘 식단이 있을 때

```
해먹타임 🍽

┌──────────────────────────────┐
│ ☀️ 점심 (아침은 10시 이후 숨김) │
│  • 비빔밥                     │
│  [🍳 레시피 보기]              │
├──────────────────────────────┤
│ 🌙 저녁                       │
│  • 삼겹살  • 된장국            │
│  [🍳 레시피 보기]              │
└──────────────────────────────┘

[📅 이번 주 식단 보기]

────── 새로 추천받기 ──────
기간/끼니 선택 폼 ...
[✨ 식단 추천받기]
```

### 오늘 식단이 없을 때

기존 화면 그대로 (폼만 표시, 카드·이번 주 버튼 없음).

---

## 지나간 끼니 필터 기준

프론트엔드에서 현재 시각(로컬 시간)으로 판단:

| 끼니 | 숨김 기준 |
|------|----------|
| 아침 | 10:00 이후 |
| 점심 | 15:00 이후 |
| 저녁 | 항상 표시 |

```js
// MealPlanHome.jsx 내부 인라인 함수
function isPastMeal(mealType) {
  // mealType: 'breakfast' | 'lunch' | 'dinner' → boolean
  const hour = new Date().getHours() // 로컬 시각
  if (mealType === 'breakfast') return hour >= 10
  if (mealType === 'lunch') return hour >= 15
  return false // dinner: 항상 표시
}
```

meal_history에 데이터가 있더라도 `isPastMeal`이 `true`를 반환하는 끼니는 카드에서 제외.
필터 후 표시할 끼니가 없으면 카드 섹션 전체를 숨김.

---

## "레시피 보기" 버튼 동작

끼니의 메뉴 수에 따라 다르게 동작한다:

- **메뉴 2개 이상**: `navigate('/meals/result/{date}/{mealType}/cooking', { state: { menus: menuNames } })` — 함께 요리하기 화면
- **메뉴 1개**: `navigate('/recipes/{menuName}')` — 레시피 상세 화면

```js
const menuNames = meal.menus.map(m => m.name)
if (menuNames.length >= 2) {
  navigate(
    `/meals/result/${todayDate}/${meal.meal_type}/cooking`,
    { state: { menus: menuNames } }
  )
} else {
  navigate(`/recipes/${encodeURIComponent(menuNames[0])}`)
}
```

메뉴가 0개인 끼니는 카드 자체를 렌더링하지 않음.

---

## 백엔드 API

### 신규 엔드포인트 (routers/meals.py 추가)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/meals/today` | 오늘(서버 로컬 날짜) meal_history → plan 구조 반환 |
| GET | `/meals/week` | 이번 주 월~일 meal_history → plan 구조 반환 |

### 반환 형식

기존 `recommend_meals` 응답과 동일한 plan 구조:

```json
{
  "days": [
    {
      "date": "2026-03-23",
      "meals": [
        {
          "meal_type": "breakfast",
          "is_school_meal": false,
          "menus": [
            { "history_id": 1, "name": "된장찌개" }
          ]
        }
      ]
    }
  ]
}
```

- 데이터 없으면 `{ "days": [] }` 반환 (404 아님)
- `is_school_meal`은 항상 `false` (school_meals 조인 없음, 히스토리 기반)
- `meals` 배열은 실제 meal_history에 있는 meal_type만 포함
- 날짜별로 `meals`가 비어 있는 날은 `days`에서 제외

### 날짜 범위 계산 (Python)

SQLite `date('now', 'weekday N')` 문법의 로컬타임 처리가 불안정할 수 있으므로,
Python `datetime`으로 날짜 범위를 계산해 파라미터로 전달한다.

```python
from datetime import date, timedelta

def get_today_str() -> str:
    return date.today().isoformat()

def get_week_range() -> tuple[str, str]:
    today = date.today()
    monday = today - timedelta(days=today.weekday())  # weekday()=0이 월요일
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()
```

### DB 쿼리

```python
# /meals/today
today = get_today_str()
rows = db.execute(
    "SELECT id, meal_type, menu_name FROM meal_history WHERE date = ? ORDER BY id",
    (today,)
).fetchall()

# /meals/week
monday, sunday = get_week_range()
rows = db.execute(
    "SELECT date, id, meal_type, menu_name FROM meal_history "
    "WHERE date >= ? AND date <= ? ORDER BY date, id",
    (monday, sunday)
).fetchall()
```

---

## 변경 파일 목록

**백엔드:**
- `backend/routers/meals.py` — `GET /meals/today`, `GET /meals/week` 엔드포인트 추가
- `backend/tests/test_meals.py` — 신규 엔드포인트 테스트 추가

**프론트엔드:**
- `frontend/src/api/meals.js` — `getTodayMeals`, `getWeekMeals` 추가
- `frontend/src/pages/MealPlan/MealPlanHome.jsx` — 마운트 로직, 오늘 식단 카드, 이번 주 버튼
- `frontend/src/pages/MealPlan/MealPlanResult.jsx` — `selectedDate` 초기값 변경

---

## 프론트엔드 변경

### meals.js

기존 파일의 `client` 패턴을 그대로 따름 (`import client from './client'`):

```js
export const getTodayMeals = () => client.get('/meals/today')
export const getWeekMeals  = () => client.get('/meals/week')
```

axios `client`의 `baseURL`이 `/api`이므로 경로는 `/meals/today`, `/meals/week`.
`client.js`에 response 인터셉터가 있어 `res.data`가 자동 언래핑됨 — 호출부에서 `result`는 이미 `{ days: [...] }` 객체이다 (`.data` 접근 불필요).

### MealPlanHome.jsx

1. state 추가:
   - `todayPlan` (`null` 초기값)
   - `todayLoading` (`false` 초기값)
   - `weekLoading` (`false` 초기값)
2. `useEffect`로 마운트 시 `getTodayMeals()` 호출:
   - 로딩 중: 카드 슬롯만 `null` 렌더 (폼은 항상 표시; 기존 `loading` 스피너와 별개)
   - 오류 시: 조용히 무시 (`todayPlan = null` 유지, toast 없음)
3. 카드 렌더 조건: `!todayLoading && todayPlan?.days?.length > 0`
4. 끼니 필터:
   ```js
   const visibleMeals = todayPlan.days[0].meals.filter(
     m => !isPastMeal(m.meal_type)
   )
   ```
   `visibleMeals.length === 0`이면 카드 섹션 전체 숨김.
5. 각 끼니 카드: 끼니 레이블 + 메뉴 이름 목록(읽기 전용) + 레시피 보기 버튼
6. `[📅 이번 주 식단 보기]` 버튼: `todayPlan?.days?.length > 0`일 때만 표시:
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
   로딩 중: 버튼 비활성화 + "..." 텍스트.

> 기존 `loading` state(추천 중 스피너)는 변경하지 않음. 추천 중에는 `<LoadingSpinner>`가 전체를 대체하므로 오늘 카드와 동시에 표시되는 경우 없음.

### MealPlanResult.jsx

**교체 대상**: `useState(plan?.days?.[0]?.date || '')` 패턴을 찾아 아래로 대체.

```js
// 기존:
// const [selectedDate, setSelectedDate] = useState(plan?.days?.[0]?.date || '')

// 변경 후:
// toISOString()은 UTC 반환 → 한국 시간 자정 이전 호출 시 어제 날짜를 반환할 수 있음
// toLocaleDateString('en-CA')는 로컬 시간 기준 YYYY-MM-DD 반환
const todayStr = new Date().toLocaleDateString('en-CA')
const initialDate =
  plan?.days?.find(d => d.date === todayStr)?.date ||
  plan?.days?.[0]?.date ||
  ''
const [selectedDate, setSelectedDate] = useState(initialDate)
```

---

## 데이터 흐름

```
홈 진입 → GET /meals/today
  ├── days.length > 0 → 오늘 식단 카드 표시
  │     ├── isPastMeal 필터 후 visibleMeals
  │     ├── [레시피 보기]
  │     │     ├── 메뉴 2개 이상 → navigate('/meals/result/{date}/{mealType}/cooking')
  │     │     └── 메뉴 1개    → navigate('/recipes/{menuName}')
  │     └── [이번 주 식단 보기]
  │           → await getWeekMeals() → setPlan(result) → navigate('/meals/result')
  └── days.length === 0 → 추천 폼만 표시
```

---

## 테스트

`backend/tests/test_meals.py`에 추가 (기존 패턴 준수):

- 새 두 엔드포인트는 Gemini를 호출하지 않으므로 `mock_gemini` fixture 불필요
- `client` fixture와 DB seed 데이터만 사용

케이스:
- `GET /meals/today` — 오늘 히스토리 있을 때 plan 구조 반환 (`days` 길이 1, meal_type 그루핑 확인)
- `GET /meals/today` — 오늘 히스토리 없을 때 `{ "days": [] }` 반환
- `GET /meals/week` — 이번 주 데이터 있을 때 plan 구조 반환 (날짜순 정렬)
- `GET /meals/week` — 이번 주 데이터 없을 때 `{ "days": [] }` 반환

---

## 엣지 케이스

- 모든 끼니가 `isPastMeal` 기준을 넘긴 경우: 카드 섹션 숨김, 폼만 표시
- 이번 주 버튼은 오늘 데이터가 있을 때만 표시. 오늘 데이터가 있으면 주간 데이터도 최소 오늘치가 있으므로 `{ "days": [] }` 반환은 사실상 발생하지 않음. 히스토리가 삭제되는 등 예외적인 상황에서 반환될 경우: result 페이지가 "추천된 식단이 없어요" 표시 (기존 동작 유지)
- `getTodayMeals()` 실패 시: 조용히 무시, 폼만 표시 (홈 진입 차단 방지)
- 주간 범위: 월요일(`weekday() == 0`) ~ 일요일(`weekday() == 6`), Python `date.weekday()` 기준
- result 페이지 타이틀(`"N일 식단"` vs `"오늘 식단"`)은 기존 로직 그대로 (변경 없음)
