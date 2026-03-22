# 식단 구성 설정 기능 디자인

**날짜**: 2026-03-23
**상태**: 승인됨

## 개요

사용자가 주간 식단 구성 규칙과 한끼 식단 구성 규칙을 자유 텍스트로 설정하면, AI 식단 추천 시 해당 규칙을 반영하는 기능.

예시:
- 주간 식단 구성: "주말 점심만 양식, 그 외 한식"
- 한끼 식단 구성: "한식은 국+반찬 2개, 양식은 에피타이저+메인요리"

---

## DB 스키마

기존 `cooking_time_settings`와 동일한 패턴으로 key-value 테이블 추가.

```sql
CREATE TABLE IF NOT EXISTS meal_plan_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

저장 키:
- `weekly_rule` — 주간 식단 구성 규칙 (자유 텍스트)
- `composition_rule` — 한끼 식단 구성 규칙 (자유 텍스트)

초기값: 빈 문자열. `database.py`의 `init_db`에서 INSERT OR IGNORE로 시드:

```sql
INSERT OR IGNORE INTO meal_plan_settings (key, value)
VALUES ('weekly_rule', ''), ('composition_rule', '');
```

---

## 백엔드 API

### 엔드포인트 (profile 라우터에 추가)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/profile/meal-plan-settings` | 현재 설정 반환 |
| PUT | `/profile/meal-plan-settings` | 설정 저장 |

### 모델 (models.py)

입력 길이 제한 500자 (Gemini 프롬프트 비대화 방지):

```python
from pydantic import Field

class MealPlanSettings(BaseModel):
    weekly_rule: str = Field("", max_length=500)
    composition_rule: str = Field("", max_length=500)
```

### ProfileResponse 변경

`meal_plan_settings: MealPlanSettings` 필드 추가.

### get_profile 핸들러 변경 (profile.py)

`GET /profile` 핸들러에서 `meal_plan_settings` 테이블을 추가로 조회:

```python
rows = db.execute("SELECT key, value FROM meal_plan_settings").fetchall()
rules = {r["key"]: r["value"] for r in rows}
meal_plan_settings = MealPlanSettings(
    weekly_rule=rules.get("weekly_rule", ""),
    composition_rule=rules.get("composition_rule", ""),
)
```

빈 DB(init_db 시드 전) 대응: `rules.get(..., "")` 폴백 사용.

---

## Gemini 프롬프트 변경

### meals.py _get_context 확장

현재 4-tuple 반환(`tags, condiments, history, times`)에 `weekly_rule`, `composition_rule` 추가하여 6-tuple로 변경:

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

호출부 3곳의 언패킹 변경:

```python
# recommend (모든 값 사용)
tags, condiments, history, times, weekly_rule, composition_rule = _get_context(db)

# rerecommend_single (weekly_rule, composition_rule 사용 안 함)
tags, condiments, _, times, _, _ = _get_context(db)

# rerecommend_meal_type (composition_rule만 사용)
tags, condiments, history, times, _, composition_rule = _get_context(db)
```

### recommend_meals (최초 추천)

`GeminiService.recommend_meals`에 파라미터 2개 추가:

```python
def recommend_meals(
    self, dates, meal_types, family_tags, condiments,
    meal_history, school_meals, cooking_times, available_ingredients,
    weekly_rule: str = "",        # 추가
    composition_rule: str = "",   # 추가
) -> dict:
```

프롬프트에 두 규칙 주입. 빈 문자열이면 해당 줄 생략:

```python
rule_lines = ""
if weekly_rule:
    rule_lines += f"\n주간 구성 규칙: {weekly_rule}"
if composition_rule:
    rule_lines += f"\n한끼 구성 규칙: {composition_rule}"
```

`meals.py` `recommend` 핸들러 호출부:

```python
result = gemini.recommend_meals(
    ...,  # 기존 인자 유지
    weekly_rule=weekly_rule,
    composition_rule=composition_rule,
)
```

### re_recommend_meal_type (끼니 전체 재추천)

`GeminiService.re_recommend_meal_type`에 `composition_rule` 파라미터 추가:

```python
def re_recommend_meal_type(
    self, date, meal_type, family_tags, condiments, max_minutes, meal_history,
    composition_rule: str = "",   # 추가
) -> dict:
```

프롬프트에 `composition_rule`만 주입 (빈 문자열이면 생략).

`weekly_rule`은 주입하지 않음 — 단일 끼니 재추천에서 주간 맥락이 없으면 Gemini가 규칙을 오적용할 수 있기 때문.

`meals.py` `rerecommend_meal_type` 핸들러 호출부:

```python
result = gemini.re_recommend_meal_type(
    ...,  # 기존 인자 유지
    composition_rule=composition_rule,
)
```

### re_recommend_single (메뉴 1개 교체)

시그니처 변경 없음. 규칙 주입 안 함. `existing_menus`(같은 끼니의 다른 메뉴)가 이미 전달되므로 맥락 충분.

---

## 프론트엔드

### SettingsPage 변경

기존 설정 섹션들 아래에 새 섹션 추가:

```
📋 식단 구성 설정

주간 식단 구성
[textarea maxLength=500, placeholder: "예) 주말 점심만 양식, 그 외 한식"]

한끼 식단 구성
[textarea maxLength=500, placeholder: "예) 한식은 국+반찬 2개, 양식은 에피타이저+메인요리"]

[저장]
```

### ProfileContext 변경

초기 상태(hardcoded default)에 `meal_plan_settings` 추가:

```js
const [profile, setProfile] = useState({
  family_tags: [],
  condiments: [],
  cooking_times: { breakfast: 15, lunch: 30, dinner: 40 },
  meal_plan_settings: { weekly_rule: '', composition_rule: '' }, // 추가
})
```

로딩 완료 후 GET `/profile` 응답으로 덮어씀. 로딩 중 텍스트영역 접근 시 빈 문자열로 안전하게 렌더링됨.

### API 클라이언트 (profile.js)

`getMealPlanSettings`, `updateMealPlanSettings` 함수 추가.

---

## 데이터 흐름

```
설정 저장:
SettingsPage → PUT /profile/meal-plan-settings → DB

추천 시:
MealPlanHome → POST /meals/recommend
→ meals.py: _get_context()에서 meal_plan_settings 조회
→ gemini.recommend_meals(weekly_rule, composition_rule, ...)
→ 프롬프트에 규칙 포함하여 Gemini 호출
```

---

## 테스트

`backend/tests/test_profile.py`에 다음 케이스 추가 (기존 테스트 패턴 준수):

- `GET /profile` 응답에 `meal_plan_settings: { weekly_rule: '', composition_rule: '' }` 포함됨
- `GET /profile/meal-plan-settings` → 초기 기본값 반환
- `PUT /profile/meal-plan-settings` → 저장 후 `GET`으로 반영 확인
- `PUT` 시 500자 초과 입력 → 422 응답

---

## 엣지 케이스

- 규칙이 빈 문자열인 경우: 프롬프트에서 해당 항목 생략, 기존 동작 유지
- 규칙이 모호하거나 충돌하는 경우: AI가 최선 해석 (사용자 책임)
- 재추천(단일 메뉴)에는 규칙 미적용 — `existing_menus`로 맥락 제공
- 500자 초과 입력: Pydantic validation error (422) + UI textarea maxLength로 사전 차단
- DB에 행 없음 (init_db 미실행): `.get(..., "")` 폴백으로 안전 처리
