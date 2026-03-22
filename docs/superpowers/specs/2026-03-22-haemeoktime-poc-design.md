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
| 레시피 캐시 | 프론트엔드 localStorage |
| 아키텍처 | 분리된 서버 (접근법 B) |

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
-- 식단 추천 API 호출 시 14일 초과 항목 자동 삭제
meal_history (id INTEGER PK, date DATE, meal_type TEXT, menu_name TEXT, created_at DATETIME)

-- 즐겨찾기 레시피 (menu_name만 저장, 본문은 프론트 캐시)
favorite_recipes (id INTEGER PK, menu_name TEXT, created_at DATETIME)

-- 장보기 리스트
shopping_items (
  id INTEGER PK,
  name TEXT,
  quantity TEXT,
  category TEXT,
  is_checked BOOLEAN,
  is_auto BOOLEAN,      -- 자동 생성 vs 수동 추가
  week_start DATE,
  created_at DATETIME
)

-- 자주 사는 물품
frequent_items (id INTEGER PK, name TEXT, sort_order INTEGER)

-- 급식 메뉴
school_meals (id INTEGER PK, date DATE, menu_items TEXT, created_at DATETIME)
-- menu_items: JSON 배열 ["잡채", "미역국", ...]
```

**설계 포인트:**
- 레시피 본문은 DB 저장 안 함 — 프론트 localStorage에 `recipe:{menuName}:{serving}` 키로 캐시
- `meal_history` 14일 초과 항목은 추천 API 호출 시 자동 삭제
- `shopping_items`는 `week_start` 기준 이번 주 것만 조회

---

## API 라우트

```
# 프로필/설정
GET    /api/profile                      # 전체 설정 조회
PUT    /api/profile/cooking-times        # 끼니별 최대 요리 시간 저장
GET    /api/profile/family-tags          # 가족 상황 태그 목록
POST   /api/profile/family-tags          # 태그 추가
DELETE /api/profile/family-tags/{id}     # 태그 삭제
GET    /api/profile/condiments           # 조미료 목록
POST   /api/profile/condiments           # 조미료 추가 (텍스트)
DELETE /api/profile/condiments/{id}      # 조미료 삭제
POST   /api/profile/condiments/photo     # 사진 → Gemini 추출 → 목록 반환

# 급식
GET    /api/school-meals                 # 이번 주 급식 조회
POST   /api/school-meals/photo           # 급식표 사진 → Gemini 파싱 → 저장

# 식단 추천
POST   /api/meals/recommend              # 식단 추천 (주간/일별)
POST   /api/meals/recommend/single       # 단일 메뉴 재추천
POST   /api/meals/recommend/meal-type    # 끼니 전체 재추천
POST   /api/meals/history                # 식단 이력 저장
DELETE /api/meals/history/{id}           # 메뉴 삭제

# 레시피
POST   /api/recipes/generate             # 레시피 생성 (Gemini)
POST   /api/recipes/combined-cooking     # 동시 조리 최적화 생성
GET    /api/recipes/favorites            # 즐겨찾기 목록
POST   /api/recipes/favorites            # 즐겨찾기 추가
DELETE /api/recipes/favorites/{id}       # 즐겨찾기 삭제

# 장보기
GET    /api/shopping                     # 이번 주 장보기 리스트
POST   /api/shopping/generate            # 식단 기반 자동 생성 (Gemini)
POST   /api/shopping/items               # 수동 항목 추가
PATCH  /api/shopping/items/{id}          # 체크/언체크
DELETE /api/shopping/items/{id}          # 항목 삭제
GET    /api/shopping/frequent            # 자주 사는 물품 목록
POST   /api/shopping/frequent            # 자주 사는 물품 추가
DELETE /api/shopping/frequent/{id}       # 삭제
```

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

- `ProfileContext` — 조미료, 가족태그, 요리시간 (앱 시작 시 1회 로드, 전역 공유)
- `MealPlanContext` — 현재 추천 결과 (페이지 이동 후 돌아와도 유지)

### API 레이어 (`src/api/`)

- `client.js` — fetch 기본 래퍼 (`/api` 베이스, 에러 처리)
- `recipeCache.js` — localStorage 캐시 (`recipe:{menuName}:{serving}`)
- 도메인별: `profile.js`, `meals.js`, `recipes.js`, `shopping.js`, `schoolMeals.js`

### 스타일

Tailwind CSS, 모바일 375px 기준, 하단 탭 4개 고정 (`position: fixed; bottom: 0`)

---

## Gemini 활용 영역

| 기능 | 입력 | 출력 |
|------|------|------|
| 식단 추천 | 가족태그, 조미료, 이력, 급식, 요리시간, 집 재료 | 요일×끼니 메뉴 목록 (JSON) |
| 단일/끼니 재추천 | 위 + 기존 식단 컨텍스트 | 대체 메뉴 (JSON) |
| 레시피 생성 | 메뉴명, 인분, 주재료 중량, 가족태그 | 재료+조리순서 (JSON) |
| 동시 조리 최적화 | 끼니 내 전체 메뉴 + 가족태그 | 통합 조리 순서 (JSON) |
| 장보기 자동 생성 | 이번 주 식단, 보유 조미료 | 재료 목록+수량+카테고리 (JSON) |
| 조미료 사진 파싱 | 이미지 (multipart) | 조미료 이름 배열 |
| 급식표 사진 파싱 | 이미지 (multipart) | 요일별 메뉴 JSON |

모든 Gemini 응답은 JSON 형식으로 요청 (응답 파싱 안정성 확보).

---

## POC 제외 항목

- 소셜 로그인 (Google / Kakao)
- 카카오톡 공유
- 레시피 이미지 생성
- 나이스 급식 API 연동
- Docker / 배포 설정
