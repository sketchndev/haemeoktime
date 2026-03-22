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

초기값: 빈 문자열 (규칙 없음 = 기존 동작 유지).

`database.py`의 `init_db`에서 기본값 INSERT OR IGNORE 처리.

---

## 백엔드 API

### 엔드포인트 (profile 라우터에 추가)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/profile/meal-plan-settings` | 현재 설정 반환 |
| PUT | `/profile/meal-plan-settings` | 설정 저장 |

### 모델 (models.py)

```python
class MealPlanSettings(BaseModel):
    weekly_rule: str = ""
    composition_rule: str = ""
```

### ProfileResponse 변경

`meal_plan_settings: MealPlanSettings` 필드 추가.

---

## Gemini 프롬프트 변경

### recommend_meals (최초 추천)
두 규칙 모두 주입. 빈 문자열이면 해당 줄 생략.

```
주간 구성 규칙: {weekly_rule}
한끼 구성 규칙: {composition_rule}
```

### re_recommend_meal_type (끼니 전체 재추천)
두 규칙 모두 주입 (동일).

### re_recommend_single (메뉴 1개 교체)
규칙 주입 안 함. 기존대로 `existing_menus` 전달.

---

## 프론트엔드

### SettingsPage 변경

기존 설정 섹션들 아래에 새 섹션 추가:

```
📋 식단 구성 설정

주간 식단 구성
[textarea placeholder: "예) 주말 점심만 양식, 그 외 한식"]

한끼 식단 구성
[textarea placeholder: "예) 한식은 국+반찬 2개, 양식은 에피타이저+메인요리"]

[저장]
```

### ProfileContext 변경

`profile` 상태에 `meal_plan_settings` 포함. GET `/profile` 응답에서 자동으로 로드됨.

### API 클라이언트 (profile.js)

`getMealPlanSettings`, `updateMealPlanSettings` 함수 추가.

---

## 데이터 흐름

```
설정 저장:
SettingsPage → PUT /profile/meal-plan-settings → DB

추천 시:
MealPlanHome → POST /meals/recommend
→ meals.py: DB에서 meal_plan_settings 조회
→ gemini.recommend_meals(weekly_rule, composition_rule, ...)
→ 프롬프트에 규칙 포함하여 Gemini 호출
```

---

## 엣지 케이스

- 규칙이 빈 문자열인 경우: 프롬프트에서 해당 항목 생략, 기존 동작 유지
- 규칙이 모호하거나 충돌하는 경우: AI가 최선 해석 (사용자 책임)
- 재추천(단일 메뉴)에는 규칙 미적용 — `existing_menus`로 맥락 제공
