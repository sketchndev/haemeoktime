# 식단 구성 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 주간 식단 구성 규칙과 한끼 구성 규칙을 자유 텍스트로 설정하면 AI 추천 시 해당 규칙을 반영한다.

**Architecture:** SQLite key-value 테이블(`meal_plan_settings`)에 두 규칙을 저장하고, 추천 요청 시 `_get_context`에서 읽어 Gemini 프롬프트에 주입한다. 프론트엔드는 설정 페이지에 textarea 섹션을 추가하고 ProfileContext를 통해 상태를 관리한다.

**Tech Stack:** Python/FastAPI, SQLite, Pydantic v2, React, Vite

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `backend/database.py` | Modify | 테이블 생성 + 기본값 시드 |
| `backend/models.py` | Modify | `MealPlanSettings` 모델, `ProfileResponse` 확장 |
| `backend/routers/profile.py` | Modify | GET/PUT 엔드포인트 추가, `get_profile` 핸들러 확장 |
| `backend/tests/test_profile.py` | Modify | 새 엔드포인트 테스트 추가 |
| `backend/services/gemini.py` | Modify | `recommend_meals`, `re_recommend_meal_type` 시그니처 + 프롬프트 |
| `backend/routers/meals.py` | Modify | `_get_context` 6-tuple 확장, 3개 호출부 언패킹 수정 |
| `frontend/src/api/profile.js` | Modify | `getMealPlanSettings`, `updateMealPlanSettings` 추가 |
| `frontend/src/contexts/ProfileContext.jsx` | Modify | 초기 상태에 `meal_plan_settings` 추가 |
| `frontend/src/pages/Settings/SettingsPage.jsx` | Modify | 식단 구성 설정 섹션 추가 |

---

## Task 1: DB 스키마 + 시드

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: `database.py` SCHEMA 문자열에 테이블 추가**

`SCHEMA` 문자열 끝 `"""` 전에 추가:

```python
CREATE TABLE IF NOT EXISTS meal_plan_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

- [ ] **Step 2: `init_db` 함수에 시드 INSERT 추가**

기존 `cooking_time_settings` INSERT 바로 아래에:

```python
conn.execute("""
    INSERT OR IGNORE INTO meal_plan_settings (key, value)
    VALUES ('weekly_rule', ''), ('composition_rule', '')
""")
```

- [ ] **Step 3: DB 초기화 수동 확인**

```bash
cd backend && python -c "from database import init_db; init_db('test_tmp.db'); import sqlite3; c=sqlite3.connect('test_tmp.db'); print(c.execute('SELECT * FROM meal_plan_settings').fetchall()); c.close()"
```

Expected: `[('weekly_rule', ''), ('composition_rule', '')]`

```bash
rm backend/test_tmp.db
```

- [ ] **Step 4: Commit**

```bash
git add backend/database.py
git commit -m "feat: add meal_plan_settings table and seed defaults"
```

---

## Task 2: Pydantic 모델 추가

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: `Field` import 추가**

`models.py` 상단의 import에 `Field` 추가:

```python
from pydantic import BaseModel, Field
```

- [ ] **Step 2: `MealPlanSettings` 모델 추가**

`ProfileResponse` 클래스 바로 위에 추가:

```python
class MealPlanSettings(BaseModel):
    weekly_rule: str = Field("", max_length=500)
    composition_rule: str = Field("", max_length=500)
```

- [ ] **Step 3: `ProfileResponse`에 필드 추가**

```python
class ProfileResponse(BaseModel):
    family_tags: list[TagResponse]
    condiments: list[CondimentResponse]
    cooking_times: CookingTimes
    meal_plan_settings: MealPlanSettings  # 추가
```

- [ ] **Step 4: Commit**

```bash
git add backend/models.py
git commit -m "feat: add MealPlanSettings model and extend ProfileResponse"
```

---

## Task 3: 프로필 API 엔드포인트 + 테스트 (TDD)

**Files:**
- Modify: `backend/routers/profile.py`
- Modify: `backend/tests/test_profile.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_profile.py` 끝에 추가:

```python
def test_get_profile_includes_meal_plan_settings(client):
    res = client.get("/api/profile")
    assert res.status_code == 200
    body = res.json()
    assert "meal_plan_settings" in body
    assert body["meal_plan_settings"] == {"weekly_rule": "", "composition_rule": ""}


def test_get_meal_plan_settings_returns_defaults(client):
    res = client.get("/api/profile/meal-plan-settings")
    assert res.status_code == 200
    assert res.json() == {"weekly_rule": "", "composition_rule": ""}


def test_update_meal_plan_settings_persists(client):
    res = client.put("/api/profile/meal-plan-settings", json={
        "weekly_rule": "주말 점심만 양식",
        "composition_rule": "한식은 국+반찬 2개",
    })
    assert res.status_code == 200

    res = client.get("/api/profile/meal-plan-settings")
    assert res.json()["weekly_rule"] == "주말 점심만 양식"
    assert res.json()["composition_rule"] == "한식은 국+반찬 2개"


def test_update_meal_plan_settings_reflected_in_get_profile(client):
    client.put("/api/profile/meal-plan-settings", json={
        "weekly_rule": "평일 한식",
        "composition_rule": "",
    })
    profile = client.get("/api/profile").json()
    assert profile["meal_plan_settings"]["weekly_rule"] == "평일 한식"


def test_update_meal_plan_settings_too_long_returns_422(client):
    res = client.put("/api/profile/meal-plan-settings", json={
        "weekly_rule": "x" * 501,
        "composition_rule": "",
    })
    assert res.status_code == 422
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && python -m pytest tests/test_profile.py::test_get_profile_includes_meal_plan_settings tests/test_profile.py::test_get_meal_plan_settings_returns_defaults -v
```

Expected: FAIL (엔드포인트 미구현)

- [ ] **Step 3: `profile.py` import 업데이트**

`routers/profile.py` 상단 import에 `MealPlanSettings` 추가:

```python
from models import (
    TagCreate, TagResponse, CondimentCreate, CondimentResponse,
    CookingTimes, ProfileResponse, MealPlanSettings,
)
```

- [ ] **Step 4: `get_profile` 핸들러 업데이트**

기존 `get_profile` 함수를:

```python
@router.get("/profile", response_model=ProfileResponse)
def get_profile(db=Depends(get_db)):
    tags = [dict(r) for r in db.execute("SELECT id, tag FROM family_tags").fetchall()]
    condiments = [dict(r) for r in db.execute("SELECT id, name FROM condiments").fetchall()]
    times = {r["meal_type"]: r["max_minutes"]
             for r in db.execute("SELECT meal_type, max_minutes FROM cooking_time_settings").fetchall()}
    rows = db.execute("SELECT key, value FROM meal_plan_settings").fetchall()
    rules = {r["key"]: r["value"] for r in rows}
    return {
        "family_tags": tags,
        "condiments": condiments,
        "cooking_times": {"breakfast": times.get("breakfast", 15),
                          "lunch": times.get("lunch", 30),
                          "dinner": times.get("dinner", 40)},
        "meal_plan_settings": {
            "weekly_rule": rules.get("weekly_rule", ""),
            "composition_rule": rules.get("composition_rule", ""),
        },
    }
```

- [ ] **Step 5: GET/PUT 엔드포인트 추가**

`profile.py`에서 `update_cooking_times` 바로 아래에 추가:

```python
@router.get("/profile/meal-plan-settings", response_model=MealPlanSettings)
def get_meal_plan_settings(db=Depends(get_db)):
    rows = db.execute("SELECT key, value FROM meal_plan_settings").fetchall()
    rules = {r["key"]: r["value"] for r in rows}
    return MealPlanSettings(
        weekly_rule=rules.get("weekly_rule", ""),
        composition_rule=rules.get("composition_rule", ""),
    )


@router.put("/profile/meal-plan-settings")
def update_meal_plan_settings(body: MealPlanSettings, db=Depends(get_db)):
    db.execute(
        "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES (?, ?)",
        ("weekly_rule", body.weekly_rule),
    )
    db.execute(
        "INSERT OR REPLACE INTO meal_plan_settings (key, value) VALUES (?, ?)",
        ("composition_rule", body.composition_rule),
    )
    return {"ok": True}
```

- [ ] **Step 6: 모든 테스트 통과 확인**

```bash
cd backend && python -m pytest tests/test_profile.py -v
```

Expected: 전체 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/routers/profile.py backend/tests/test_profile.py
git commit -m "feat: add meal-plan-settings GET/PUT endpoints and extend get_profile"
```

---

## Task 4: Gemini 서비스 프롬프트 업데이트

**Files:**
- Modify: `backend/services/gemini.py`

- [ ] **Step 1: `recommend_meals` 시그니처에 파라미터 추가**

기존:
```python
def recommend_meals(
    self, dates: list, meal_types: list, family_tags: list,
    condiments: list, meal_history: list, school_meals: dict,
    cooking_times: dict, available_ingredients: str,
) -> dict:
```

변경:
```python
def recommend_meals(
    self, dates: list, meal_types: list, family_tags: list,
    condiments: list, meal_history: list, school_meals: dict,
    cooking_times: dict, available_ingredients: str,
    weekly_rule: str = "",
    composition_rule: str = "",
) -> dict:
```

- [ ] **Step 2: `recommend_meals` 프롬프트에 규칙 주입**

기존 프롬프트 `규칙:` 섹션 바로 위에 rule_lines를 조립하여 주입:

```python
rule_lines = ""
if weekly_rule:
    rule_lines += f"\n주간 구성 규칙: {weekly_rule}"
if composition_rule:
    rule_lines += f"\n한끼 구성 규칙: {composition_rule}"

prompt = f"""당신은 한국 가정 식단 전문가입니다. 아래 조건에 맞는 식단을 추천하고 유효한 JSON만 반환하세요.

날짜: {dates}
끼니: {meal_types}
가족 상황: {family_tags or '없음'}
보유 조미료: {condiments or '기본 조미료'}
최근 식단 이력(겹침 방지): {meal_history or '없음'}
급식 메뉴(해당 날짜 제외 처리): {school_meals or '없음'}
끼니별 최대 요리 시간: {cooking_times}
집에 있는 재료: {available_ingredients or '없음'}{rule_lines}

규칙:
- 흰쌀밥, 김치, 깍두기 등 상시 보유 반찬 제외
- 끼니별 최대 요리 시간 준수
- 이력과 겹치지 않게

응답 형식:
{{"days": [{{"date": "YYYY-MM-DD", "meals": [{{"meal_type": "breakfast|lunch|dinner", "menus": ["메뉴명"]}}]}}]}}"""
```

- [ ] **Step 3: `re_recommend_meal_type` 시그니처에 파라미터 추가**

기존:
```python
def re_recommend_meal_type(
    self, date: str, meal_type: str, family_tags: list,
    condiments: list, max_minutes: int, meal_history: list,
) -> dict:
```

변경:
```python
def re_recommend_meal_type(
    self, date: str, meal_type: str, family_tags: list,
    condiments: list, max_minutes: int, meal_history: list,
    composition_rule: str = "",
) -> dict:
```

- [ ] **Step 4: `re_recommend_meal_type` 프롬프트에 composition_rule 주입**

기존 프롬프트:
```python
prompt = f"""한국 가정 식단 전문가입니다. {date} {meal_type} 끼니 전체를 재추천하세요. JSON만 반환.

가족 상황: {family_tags}, 조미료: {condiments}, 최대 요리시간: {max_minutes}분
최근 이력(겹침 방지): {meal_history}
규칙: 흰쌀밥, 김치, 깍두기 제외

응답 형식: {{"menus": ["메뉴명1", "메뉴명2"]}}"""
```

변경:
```python
composition_line = f"\n한끼 구성 규칙: {composition_rule}" if composition_rule else ""
prompt = f"""한국 가정 식단 전문가입니다. {date} {meal_type} 끼니 전체를 재추천하세요. JSON만 반환.

가족 상황: {family_tags}, 조미료: {condiments}, 최대 요리시간: {max_minutes}분
최근 이력(겹침 방지): {meal_history}{composition_line}
규칙: 흰쌀밥, 김치, 깍두기 제외

응답 형식: {{"menus": ["메뉴명1", "메뉴명2"]}}"""
```

- [ ] **Step 5: 기존 테스트 통과 확인 (회귀 없음)**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/services/gemini.py
git commit -m "feat: inject meal composition rules into Gemini prompts"
```

---

## Task 5: meals.py _get_context 확장 + 호출부 수정

**Files:**
- Modify: `backend/routers/meals.py`

- [ ] **Step 1: `_get_context` 6-tuple로 확장**

기존 `_get_context` 함수 전체를 교체:

```python
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
```

- [ ] **Step 2: `recommend` 핸들러 언패킹 + Gemini 호출 업데이트**

`recommend` 함수 내:

```python
# 기존
tags, condiments, history, times = _get_context(db)
# 변경
tags, condiments, history, times, weekly_rule, composition_rule = _get_context(db)
```

Gemini 호출부:

```python
result = gemini.recommend_meals(
    dates=dates, meal_types=body.meal_types,
    family_tags=tags, condiments=condiments,
    meal_history=history, school_meals=school_meals,
    cooking_times=times, available_ingredients=body.available_ingredients,
    weekly_rule=weekly_rule,
    composition_rule=composition_rule,
)
```

- [ ] **Step 3: `rerecommend_single` 핸들러 언패킹 수정**

```python
# 기존
tags, condiments, _, times = _get_context(db)
# 변경
tags, condiments, _, times, _, _ = _get_context(db)
```

- [ ] **Step 4: `rerecommend_meal_type` 핸들러 언패킹 + Gemini 호출 업데이트**

```python
# 기존
tags, condiments, history, times = _get_context(db)
# 변경
tags, condiments, history, times, _, composition_rule = _get_context(db)
```

Gemini 호출부:

```python
result = gemini.re_recommend_meal_type(
    date=body.date, meal_type=body.meal_type, family_tags=tags,
    condiments=condiments, max_minutes=max_min, meal_history=history,
    composition_rule=composition_rule,
)
```

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/meals.py
git commit -m "feat: extend _get_context with composition rules and update call sites"
```

---

## Task 6: 프론트엔드 API 클라이언트

**Files:**
- Modify: `frontend/src/api/profile.js`

- [ ] **Step 1: 두 함수 추가**

`frontend/src/api/profile.js` 끝에 추가:

```js
export const getMealPlanSettings = () => client.get('/profile/meal-plan-settings')
export const updateMealPlanSettings = (settings) => client.put('/profile/meal-plan-settings', settings)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/profile.js
git commit -m "feat: add getMealPlanSettings and updateMealPlanSettings API functions"
```

---

## Task 7: ProfileContext 초기 상태 업데이트

**Files:**
- Modify: `frontend/src/contexts/ProfileContext.jsx`

- [ ] **Step 1: 초기 상태에 `meal_plan_settings` 추가**

```js
const [profile, setProfile] = useState({
  family_tags: [],
  condiments: [],
  cooking_times: { breakfast: 15, lunch: 30, dinner: 40 },
  meal_plan_settings: { weekly_rule: '', composition_rule: '' },
})
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/contexts/ProfileContext.jsx
git commit -m "feat: add meal_plan_settings to ProfileContext initial state"
```

---

## Task 8: SettingsPage UI

> **전제 조건:** Task 7이 먼저 완료되어야 합니다. `ProfileContext` 초기 상태에 `meal_plan_settings`가 없으면 이 태스크의 JSX에서 `TypeError: Cannot read properties of undefined`가 발생합니다.

**Files:**
- Modify: `frontend/src/pages/Settings/SettingsPage.jsx`

- [ ] **Step 1: import에 `updateMealPlanSettings` 추가**

기존 import:
```js
import {
  addFamilyTag, deleteFamilyTag, addCondiment, deleteCondiment,
  updateCookingTimes, parseCondimentPhoto,
} from '../../api/profile'
```

변경:
```js
import {
  addFamilyTag, deleteFamilyTag, addCondiment, deleteCondiment,
  updateCookingTimes, parseCondimentPhoto, updateMealPlanSettings,
} from '../../api/profile'
```

- [ ] **Step 2: 로컬 상태 추가**

기존 상태 선언들 아래에 추가:

```js
const [mealPlanSettings, setMealPlanSettings] = useState(profile.meal_plan_settings)
```

- [ ] **Step 3: `useEffect`에 `meal_plan_settings` 동기화 추가**

기존 `useEffect`:
```js
useEffect(() => {
  if (!loading) setTimes(profile.cooking_times)
}, [loading, profile.cooking_times])
```

변경:
```js
useEffect(() => {
  if (!loading) {
    setTimes(profile.cooking_times)
    setMealPlanSettings(profile.meal_plan_settings)
  }
}, [loading, profile.cooking_times, profile.meal_plan_settings])
```

- [ ] **Step 4: 저장 핸들러 추가**

`handleSaveTimes` 함수 아래에 추가:

```js
const handleSaveMealPlanSettings = async () => {
  try {
    await updateMealPlanSettings(mealPlanSettings)
    toast.success('저장됐어요')
    await refresh()
  } catch (e) { toast.error(e.message) }
}
```

- [ ] **Step 5: 급식 메뉴 섹션 앞에 새 섹션 추가**

`return` 안의 `<section>` (급식 메뉴) 바로 위에:

```jsx
<section>
  <h2 className="font-semibold mb-2">📋 식단 구성 설정</h2>
  <div className="space-y-3">
    <div>
      <label className="text-sm text-gray-600 block mb-1">주간 식단 구성</label>
      <textarea
        className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
        rows={2}
        maxLength={500}
        placeholder="예) 주말 점심만 양식, 그 외 한식"
        value={mealPlanSettings.weekly_rule}
        onChange={(e) => setMealPlanSettings((s) => ({ ...s, weekly_rule: e.target.value }))}
      />
    </div>
    <div>
      <label className="text-sm text-gray-600 block mb-1">한끼 식단 구성</label>
      <textarea
        className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
        rows={2}
        maxLength={500}
        placeholder="예) 한식은 국+반찬 2개, 양식은 에피타이저+메인요리"
        value={mealPlanSettings.composition_rule}
        onChange={(e) => setMealPlanSettings((s) => ({ ...s, composition_rule: e.target.value }))}
      />
    </div>
  </div>
  <button onClick={handleSaveMealPlanSettings} className="mt-2 w-full bg-green-500 text-white py-2 rounded-lg text-sm">
    저장
  </button>
</section>
```

- [ ] **Step 6: 전체 백엔드 테스트 최종 확인**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: 전체 PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Settings/SettingsPage.jsx
git commit -m "feat: add meal composition settings UI section to SettingsPage"
```
