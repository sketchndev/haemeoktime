# 해먹타임 POC 설계 문서

**날짜:** 2026-03-22
**상태:** 승인됨

---

## 서비스 개요

"오늘 뭐 해먹지?" 고민을 해소하는 가족 맞춤 식단 추천 웹앱.
Gemini API를 활용해 사용자 상황(가족 구성, 건강, 식이 조건)에 맞는 식단·레시피·장보기 리스트를 생성한다.

---

## 결정 사항

| 항목 | 결정 |
|------|------|
| 기능 범위 | 전체 (소셜 로그인 제외) |
| 인증 | 없음 (단일 사용자) |
| 배포 | 로컬 개발 전용 (Vite :5173 + FastAPI :8000) |
| Gemini 호출 | Non-streaming |
| 식단 이력 | 최근 2주치만 보관, 이력 조회 화면 없음 |
| 레시피 캐시 | 프론트엔드 localStorage (`recipe:{menuName}:{serving}`) |
| 아키텍처 | 분리된 서버 (접근법 B) |
| 식단 이력 자동 저장 | 백엔드 `POST /api/meals/recommend` 응답 직후 서버에서 자동 저장 |
| 장보기 자동 생성 | `POST /api/shopping/generate` 호출 시 `is_auto=TRUE` 항목 전체 교체 (수동 항목 유지) |
| 학교 급식 주 기준 | 월요일~일요일 (ISO week), `GET /api/school-meals`는 오늘 기준 해당 주 반환 |

---

## 아키텍처

Vite dev server(`:5173`)에서 `/api/*` 요청을 FastAPI(`:8000`)로 프록시.
Gemini API 호출은 백엔드 전담(API 키 노출 방지).
이미지 파일은 `backend/uploads/` 로컬 폴더에 저장.

```
haemeoktime/
├── backend/
│   ├── main.py                 # FastAPI 앱 진입점, CORS 설정
│   ├── database.py             # SQLite 연결, 테이블 초기화
│   ├── models.py               # Pydantic 요청/응답 모델
│   ├── routers/
│   │   ├── profile.py          # 조미료, 가족정보, 요리시간 설정
│   │   ├── meals.py            # 식단 추천, 재추천, 이력
│   │   ├── recipes.py          # 레시피 생성, 즐겨찾기, 동시조리
│   │   ├── shopping.py         # 장보기 리스트
│   │   └── school_meals.py     # 급식 업로드 & 파싱
│   ├── services/
│   │   └── gemini.py           # Gemini API 호출 로직 (프롬프트 조립 포함)
│   ├── uploads/                # 조미료/급식 사진 저장
│   ├── haemeoktime.db          # SQLite DB 파일
│   └── .env                    # GEMINI_API_KEY
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── MealPlan/       # 식단 추천 (홈)
    │   │   ├── Shopping/       # 장보기 리스트
    │   │   ├── Recipes/        # 레시피 검색 & 즐겨찾기
    │   │   └── Settings/       # 내 설정 (메모리)
    │   ├── components/         # 공통 컴포넌트
    │   ├── api/                # fetch 래퍼 + localStorage 캐시
    │   └── App.jsx             # 라우터 + 하단 탭 네비게이션
    └── vite.config.js          # /api → :8000 프록시
```

---

## DB 스키마 (SQLite)

```sql
-- 가족 상황 태그
family_tags (id INTEGER PK, tag TEXT, created_at DATETIME)

-- 끼니별 최대 요리 시간
cooking_time_settings (meal_type TEXT PK, max_minutes INTEGER)
-- meal_type: 'breakfast' | 'lunch' | 'dinner'

-- 보유 조미료
condiments (id INTEGER PK, name TEXT, created_at DATETIME)

-- 식단 이력 (최근 2주, 겹침 방지용)
-- 식단 추천 API 호출 시 14일 초과 항목 자동 삭제 후 새 항목 삽입
meal_history (id INTEGER PK, date DATE, meal_type TEXT, menu_name TEXT, created_at DATETIME)

-- 즐겨찾기 레시피 (menu_name만 저장, 본문은 프론트 localStorage 캐시)
favorite_recipes (id INTEGER PK, menu_name TEXT, created_at DATETIME)

-- 장보기 리스트
shopping_items (
  id INTEGER PK,
  name TEXT,
  quantity TEXT,
  category TEXT,
  is_checked BOOLEAN DEFAULT FALSE,
  is_auto BOOLEAN DEFAULT FALSE,   -- TRUE: 자동 생성, FALSE: 수동 추가
  week_start DATE,                 -- 해당 주 월요일 날짜 (ISO)
  created_at DATETIME
)

-- 자주 사는 물품
frequent_items (id INTEGER PK, name TEXT, sort_order INTEGER)

-- 급식 메뉴
school_meals (id INTEGER PK, date DATE UNIQUE, menu_items TEXT, created_at DATETIME)
-- menu_items: JSON 배열 ["잡채", "미역국", ...]
-- date: 해당 요일의 실제 날짜 (중복 시 upsert)
```

**설계 포인트:**
- 레시피 본문은 DB 저장 안 함 — 프론트 localStorage `recipe:{menuName}:{serving}` 키로 캐시. 인분 변경 시 새 키로 API 재호출 (칼로리 포함 전체 재생성).
- `meal_history` 14일 초과 항목은 추천 API 호출 시 자동 삭제 후 신규 저장.
- `shopping_items` 자동 생성 시 기존 `is_auto=TRUE` 항목 전체 삭제 후 재삽입. `is_auto=FALSE` 수동 항목은 유지.
- `school_meals.date`는 UNIQUE — 같은 날짜 재업로드 시 upsert 처리.

---

## API 라우트 및 계약

### 프로필/설정

```
GET  /api/profile
  응답: {
    family_tags: [{id, tag}],
    condiments: [{id, name}],
    cooking_times: {breakfast: 15, lunch: 30, dinner: 40}
  }

PUT  /api/profile/cooking-times
  요청: {breakfast: int, lunch: int, dinner: int}

GET  /api/profile/family-tags → [{id, tag, created_at}]
POST /api/profile/family-tags
  요청: {tag: string} → 응답: {id, tag}
DELETE /api/profile/family-tags/{id}

GET  /api/profile/condiments → [{id, name}]
POST /api/profile/condiments
  요청: {name: string} → 응답: {id, name}
DELETE /api/profile/condiments/{id}

POST /api/profile/condiments/photo  (multipart/form-data: file)
  응답: {extracted: [string]}   # Gemini가 추출한 조미료 이름 목록 (저장은 프론트가 별도 호출)
```

### 급식

```
GET  /api/school-meals
  응답: [{date: "YYYY-MM-DD", menu_items: [string]}]  # 오늘 기준 해당 주(월~일) 전체

POST /api/school-meals/photo  (multipart/form-data: file)
  응답: [{date: "YYYY-MM-DD", menu_items: [string]}]  # 파싱 후 저장된 결과
```

### 식단 추천

```
POST /api/meals/recommend
  요청: {
    period: "today" | "week" | "custom",
    dates: ["YYYY-MM-DD"],          # period="custom" 시
    meal_types: ["breakfast", "lunch", "dinner"],
    available_ingredients: string,  # "냉장고에 두부, 애호박 있어요" (자유 텍스트)
    use_school_meals: boolean
  }
  응답: {
    days: [{
      date: "YYYY-MM-DD",
      meals: [{
        meal_type: string,
        is_school_meal: boolean,
        menus: [{history_id: int, name: string}]  # history_id로 삭제 가능
      }]
    }]
  }
  사이드이펙트: 14일 초과 meal_history 자동 삭제 → 추천 결과 meal_history 자동 저장

POST /api/meals/recommend/single
  요청: {
    date: "YYYY-MM-DD",
    meal_type: string,
    history_id: int,                # 교체할 meal_history 행 PK (삭제 대상)
    menu_name: string,              # 교체할 메뉴명 (컨텍스트용)
    max_minutes_override: int | null,  # null이면 설정값 사용
    existing_menus: [string]        # 같은 끼니 나머지 메뉴 (컨텍스트용)
  }
  응답: {history_id: int, name: string}
  사이드이펙트: 기존 history_id 항목 삭제 → 새 항목 저장

POST /api/meals/recommend/meal-type
  요청: {
    date: "YYYY-MM-DD",
    meal_type: string,
    max_minutes_override: int | null,
    existing_history_ids: [int]     # 교체할 끼니의 기존 history_id 목록
  }
  응답: {menus: [{history_id: int, name: string}]}
  사이드이펙트: 기존 history_id 항목들 삭제 → 새 항목들 저장

DELETE /api/meals/history/{id}      # 메뉴 삭제 (meal_history 행 삭제)
```

### 레시피

```
POST /api/recipes/generate
  요청: {
    menu_name: string,
    servings: int,
    main_ingredient_weight: int | null,  # 그램, 선택값
  }
  응답: {
    menu_name: string,
    servings: int,
    calories: int,
    ingredients: [{name: string, amount: string}],
    steps: [string],
    health_notes: string | null   # 가족 건강상황 반영 메모
  }
  주의: 응답을 프론트가 localStorage에 캐시

POST /api/recipes/combined-cooking
  요청: {
    date: "YYYY-MM-DD",
    meal_type: string,
    menus: [string]   # 동시 조리할 메뉴 목록
  }
  응답: {
    total_minutes: int,
    optimized_minutes: int,
    steps: [{label: string, menu_tag: string, description: string}]
  }

GET  /api/recipes/favorites → [{id, menu_name, created_at}]
POST /api/recipes/favorites
  요청: {menu_name: string} → 응답: {id, menu_name}
DELETE /api/recipes/favorites/{id}
```

### 장보기

```
GET  /api/shopping
  응답: {
    week_start: "YYYY-MM-DD",
    items: [{id, name, quantity, category, is_checked, is_auto}]
  }
  # week_start는 항상 오늘 기준 해당 ISO 주의 월요일 날짜
  # 이전 주 항목은 응답에 포함되지 않음 (week_start로 필터)

POST /api/shopping/generate
  요청: {menus: [string]}   # 이번 주 전체 메뉴 이름 목록
  응답: {items: [{id, name, quantity, category, is_auto: true}]}
  사이드이펙트: 기존 is_auto=TRUE 항목 전체 삭제 → 새 항목 삽입

POST /api/shopping/items
  요청: {name: string, quantity: string | null, category: string | null}
  응답: {id, name, quantity, category, is_checked: false, is_auto: false}

PATCH /api/shopping/items/{id}
  요청: {is_checked: boolean}

DELETE /api/shopping/items/{id}

GET  /api/shopping/frequent → [{id, name, sort_order}]
POST /api/shopping/frequent
  요청: {name: string} → 응답: {id, name}
DELETE /api/shopping/frequent/{id}
```

---

## Gemini 활용 영역

| 기능 | 주요 입력 | 출력 형식 | Gemini 실패 시 |
|------|----------|----------|--------------|
| 식단 추천 | 가족태그, 조미료, 이력, 급식, 요리시간, available_ingredients | JSON (days 배열) | HTTP 503, 프론트 토스트 + 재시도 버튼 |
| 단일/끼니 재추천 | 위 + 기존 식단 컨텍스트, max_minutes_override | JSON | HTTP 503, 토스트 |
| 레시피 생성 | 메뉴명, 인분, 주재료 중량, 가족태그 | JSON (ingredients + steps + calories) | HTTP 503, 토스트 |
| 동시 조리 최적화 | 끼니 내 전체 메뉴, 가족태그 | JSON (steps 배열) | HTTP 503, 토스트 |
| 장보기 자동 생성 | 이번 주 식단 메뉴 목록, 보유 조미료 | JSON (items 배열) | HTTP 503, 토스트 |
| 조미료 사진 파싱 | 이미지 (multipart) | JSON 문자열 배열 | HTTP 503, 토스트 |
| 급식표 사진 파싱 | 이미지 (multipart) | JSON (date별 메뉴) | HTTP 503, 토스트 |

모든 Gemini 응답은 JSON 모드로 요청. 파싱 실패 시 HTTP 503 반환.

---

## 프론트엔드 아키텍처

### 라우팅 (React Router v6)

```
/                                        → 식단 추천 홈 (옵션 설정)
/meals/result                            → 추천 결과 (요일 탭 + 끼니 카드)
/meals/result/:date/:mealType/cooking    → 동시 조리 최적화
/shopping                                → 장보기 리스트
/recipes                                 → 레시피 검색 & 즐겨찾기
/recipes/:menuName                       → 레시피 상세
/settings                                → 내 설정
/settings/school-meals                   → 급식 관리
```

### 상태 관리 (React Context)

- `ProfileContext` — 조미료, 가족태그, 요리시간 (앱 시작 시 `GET /api/profile` 1회 로드)
- `MealPlanContext` — 현재 추천 결과 전체 (페이지 이동 후 돌아와도 유지, history_id 포함)

### API 레이어 (`src/api/`)

- `client.js` — fetch 기본 래퍼 (`/api` 베이스, HTTP 4xx/5xx 에러 throw)
- `recipeCache.js` — localStorage 읽기/쓰기 (`recipe:{menuName}:{serving}`)
- 도메인별: `profile.js`, `meals.js`, `recipes.js`, `shopping.js`, `schoolMeals.js`

### 스타일

Tailwind CSS, 모바일 375px 기준, 하단 탭 4개 고정 (`position: fixed; bottom: 0`)

---

## POC 제외 항목

- 소셜 로그인 (Google / Kakao)
- 카카오톡 공유
- 레시피 이미지 생성
- 나이스 급식 API 연동
- Docker / 배포 설정
