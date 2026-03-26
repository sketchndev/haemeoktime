# 식단 승인 단계 및 주재료 DB 저장 설계

## 목표

1. 식단 추천 후 전체 식단을 승인해야 장보기 리스트를 생성할 수 있도록 승인 단계 추가
2. 식단 추천 시 주재료 정보를 `meal_history` 테이블에 저장하여, 이후 레시피 생성 등에서 Gemini 재질의 없이 주재료 활용 가능

## 1. 승인 단계

### 백엔드

- `meal_plan_settings` 테이블에 `plan_approved` 키 사용 (값: `"true"` / `"false"`)
- 새 식단 추천 시 (`_process_gemini_result`) `plan_approved`를 `"false"`로 설정
- `PUT /api/meals/approve` 엔드포인트 추가 — `plan_approved`를 `"true"`로 변경
- `POST /api/shopping/generate`에서 `plan_approved` 확인 → `"false"`이면 HTTP 403 반환 (메시지: "식단을 먼저 승인해주세요")

### 프론트엔드

- `MealPlanContext`에 `approved` (boolean) 상태 추가, `setApproved` setter 제공
- `MealPlanResult` 하단 버튼 영역:
  - 미승인: "이 식단으로 확정" 버튼 → `PUT /api/meals/approve` 호출 → `approved = true`
  - 승인 완료: "장보기 리스트 만들기" 버튼 표시 (기존 동작 유지)
- 메뉴 교체 (재추천 single/meal-type) 시 `approved`를 `false`로 리셋
- 새 식단 추천 시 `approved`를 `false`로 초기화

## 2. 주재료 DB 저장

### 백엔드 DB 마이그레이션

`meal_history` 테이블에 컬럼 추가:
- `main_ingredient TEXT` — 주재료명 (예: "소고기", "두부")
- `main_ingredient_unit TEXT` — 단위 (예: "g", "개", "모")

### 백엔드 로직

- `_process_gemini_result`: INSERT 시 `main_ingredient`, `main_ingredient_unit` 포함
- `GET /meals/today`, `GET /meals/week` 응답에 주재료 정보 포함
- 레시피 생성 시 `meal_history`에서 주재료 조회 가능

### 프론트엔드

- API 응답에서 주재료 정보 그대로 활용 (구조 변경 없음, 이미 Gemini 응답에 포함)
- 레시피/합쳐서요리에서 주재료 필요 시 DB 데이터 우선 사용

## 영향 범위

### 백엔드 수정 파일
- `database.py` — 마이그레이션 추가 (meal_history 컬럼)
- `routers/meals.py` — approve 엔드포인트, _process_gemini_result에 주재료 저장, 조회 응답에 주재료 포함
- `routers/shopping.py` — 승인 확인 로직 추가
- `models.py` — 필요 시 응답 모델 업데이트

### 프론트엔드 수정 파일
- `contexts/MealPlanContext.jsx` — approved 상태 추가
- `pages/MealPlan/MealPlanResult.jsx` — 승인 버튼, 조건부 장보기 버튼
- `api/meals.js` — approvePlan() API 함수 추가
