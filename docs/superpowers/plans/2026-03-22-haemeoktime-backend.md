# 해먹타임 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FastAPI + SQLite 백엔드 전체 구현 — 프로필/식단추천/레시피/장보기/급식 API + Gemini 연동

**Architecture:** FastAPI 앱에 5개 라우터(profile, meals, recipes, shopping, school_meals) 연결. DB 연결은 FastAPI `Depends(get_db)` 패턴으로 의존성 주입. Gemini 호출은 `services/gemini.py`에 집중. 모든 라우터 테스트는 `pytest + httpx TestClient` 사용, Gemini는 `unittest.mock.patch`로 mock 처리.

**Tech Stack:** Python 3.11+, FastAPI 0.115, uvicorn, SQLite (내장 sqlite3), google-generativeai, python-multipart, pytest, httpx

---

## 파일 구조

```
backend/
├── main.py                        # FastAPI 앱 + CORS + 라우터 등록
├── database.py                    # SQLite 연결, init_db(), get_db() Depends
├── models.py                      # Pydantic 요청/응답 모델 전체
├── requirements.txt
├── .env.example
├── routers/
│   ├── __init__.py
│   ├── profile.py                 # GET /api/profile, 조미료, 태그, 요리시간
│   ├── meals.py                   # 식단 추천, 재추천, 이력
│   ├── recipes.py                 # 레시피 생성, 즐겨찾기, 동시조리
│   ├── shopping.py                # 장보기 리스트
│   └── school_meals.py            # 급식 업로드 & 파싱
├── services/
│   ├── __init__.py
│   └── gemini.py                  # Gemini API 호출 전담
├── uploads/                       # 사진 파일 저장
│   └── .gitkeep
└── tests/
    ├── __init__.py
    ├── conftest.py                 # TestClient + DB 픽스처
    ├── test_database.py
    ├── test_profile.py
    ├── test_meals.py
    ├── test_recipes.py
    ├── test_shopping.py
    └── test_school_meals.py
```

---

## Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/uploads/.gitkeep`
- Create: `backend/routers/__init__.py`
- Create: `backend/services/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: 폴더 및 빈 파일 생성**

```bash
cd D:/Projects/haemeoktime
mkdir -p backend/routers backend/services backend/tests backend/uploads
touch backend/__init__.py backend/routers/__init__.py backend/services/__init__.py backend/tests/__init__.py backend/uploads/.gitkeep
```

- [ ] **Step 2: requirements.txt 작성**

`backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
python-multipart==0.0.9
python-dotenv==1.0.1
google-generativeai==0.8.3
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: .env.example 작성**

`backend/.env.example`:
```
GEMINI_API_KEY=your_key_here
DB_PATH=haemeoktime.db
```

- [ ] **Step 4: 의존성 설치**

```bash
cd D:/Projects/haemeoktime/backend && pip install -r requirements.txt
```

Expected: 패키지 설치 완료 메시지

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/
git commit -m "chore: scaffold backend project structure"
```

---

## Task 2: 데이터베이스 초기화

**Files:**
- Create: `backend/database.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: 테스트 작성**

`backend/tests/test_database.py`:
```python
import sqlite3
import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import init_db


def test_init_db_creates_all_tables(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}
    conn.close()

    expected = {
        "family_tags", "cooking_time_settings", "condiments",
        "meal_history", "favorite_recipes", "shopping_items",
        "frequent_items", "school_meals",
    }
    assert expected.issubset(tables)


def test_init_db_seeds_default_cooking_times(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT meal_type, max_minutes FROM cooking_time_settings").fetchall()
    conn.close()

    data = {r["meal_type"]: r["max_minutes"] for r in rows}
    assert data == {"breakfast": 15, "lunch": 30, "dinner": 40}


def test_init_db_is_idempotent(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    init_db(db_path)  # 두 번 호출해도 오류 없어야 함

    conn = sqlite3.connect(db_path)
    count = conn.execute("SELECT COUNT(*) FROM cooking_time_settings").fetchone()[0]
    conn.close()
    assert count == 3  # 중복 삽입 없이 3개만
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_database.py -v
```

Expected: `ModuleNotFoundError: No module named 'database'`

- [ ] **Step 3: database.py 구현**

`backend/database.py`:
```python
import sqlite3
import os

SCHEMA = """
CREATE TABLE IF NOT EXISTS family_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cooking_time_settings (
    meal_type TEXT PRIMARY KEY,
    max_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS condiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    meal_type TEXT NOT NULL,
    menu_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorite_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity TEXT,
    category TEXT,
    is_checked BOOLEAN DEFAULT FALSE,
    is_auto BOOLEAN DEFAULT FALSE,
    week_start DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS frequent_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS school_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    menu_items TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


def get_db_path() -> str:
    return os.getenv("DB_PATH", "haemeoktime.db")


def init_db(db_path: str | None = None) -> None:
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute("""
        INSERT OR IGNORE INTO cooking_time_settings (meal_type, max_minutes)
        VALUES ('breakfast', 15), ('lunch', 30), ('dinner', 40)
    """)
    conn.commit()
    conn.close()


def get_db():
    """FastAPI Depends 용 DB 연결 제공."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_database.py -v
```

Expected: 3 tests PASS

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/database.py backend/tests/test_database.py
git commit -m "feat: initialize SQLite schema with idempotent init_db"
```

---

## Task 3: Pydantic 모델

**Files:**
- Create: `backend/models.py`

모델은 모든 라우터가 공유하므로 한 파일에 모은다. 테스트는 라우터 통합 테스트에서 검증.

- [ ] **Step 1: models.py 작성**

`backend/models.py`:
```python
from pydantic import BaseModel
from typing import Optional


# ── Profile ──────────────────────────────────────────────

class CookingTimes(BaseModel):
    breakfast: int
    lunch: int
    dinner: int


class TagCreate(BaseModel):
    tag: str


class TagResponse(BaseModel):
    id: int
    tag: str


class CondimentCreate(BaseModel):
    name: str


class CondimentResponse(BaseModel):
    id: int
    name: str


class ProfileResponse(BaseModel):
    family_tags: list[TagResponse]
    condiments: list[CondimentResponse]
    cooking_times: CookingTimes


# ── Meals ────────────────────────────────────────────────

class RecommendRequest(BaseModel):
    period: str                          # "today" | "week" | "custom"
    dates: list[str] = []               # period="custom" 일 때 날짜 목록
    meal_types: list[str]               # ["breakfast", "lunch", "dinner"]
    available_ingredients: str = ""
    use_school_meals: bool = False


class MenuItem(BaseModel):
    history_id: int
    name: str


class MealSlot(BaseModel):
    meal_type: str
    is_school_meal: bool = False
    menus: list[MenuItem]


class DayPlan(BaseModel):
    date: str
    meals: list[MealSlot]


class RecommendResponse(BaseModel):
    days: list[DayPlan]


class SingleReRecommendRequest(BaseModel):
    date: str
    meal_type: str
    history_id: int                      # 교체할 meal_history 행 PK
    menu_name: str
    max_minutes_override: Optional[int] = None
    existing_menus: list[str] = []


class MealTypeReRecommendRequest(BaseModel):
    date: str
    meal_type: str
    max_minutes_override: Optional[int] = None
    existing_history_ids: list[int] = []


# ── Recipes ──────────────────────────────────────────────

class RecipeRequest(BaseModel):
    menu_name: str
    servings: int
    main_ingredient_weight: Optional[int] = None


class Ingredient(BaseModel):
    name: str
    amount: str


class RecipeResponse(BaseModel):
    menu_name: str
    servings: int
    calories: int
    ingredients: list[Ingredient]
    steps: list[str]
    health_notes: Optional[str] = None


class CombinedCookingRequest(BaseModel):
    date: str
    meal_type: str
    menus: list[str]


class CookingStep(BaseModel):
    label: str
    menu_tag: str
    description: str


class CombinedCookingResponse(BaseModel):
    total_minutes: int
    optimized_minutes: int
    steps: list[CookingStep]


class FavoriteCreate(BaseModel):
    menu_name: str


class FavoriteResponse(BaseModel):
    id: int
    menu_name: str


# ── Shopping ─────────────────────────────────────────────

class ShoppingItemCreate(BaseModel):
    name: str
    quantity: Optional[str] = None
    category: Optional[str] = None


class ShoppingItemResponse(BaseModel):
    id: int
    name: str
    quantity: Optional[str]
    category: Optional[str]
    is_checked: bool
    is_auto: bool


class ShoppingResponse(BaseModel):
    week_start: str
    items: list[ShoppingItemResponse]


class ShoppingGenerateRequest(BaseModel):
    menus: list[str]


class ShoppingCheckRequest(BaseModel):
    is_checked: bool


class FrequentItemCreate(BaseModel):
    name: str


class FrequentItemResponse(BaseModel):
    id: int
    name: str


# ── School Meals ──────────────────────────────────────────

class SchoolMealDay(BaseModel):
    date: str
    menu_items: list[str]
```

- [ ] **Step 2: 문법 오류 없음 확인**

```bash
cd D:/Projects/haemeoktime/backend && python -c "import models; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/models.py
git commit -m "feat: add pydantic request/response models"
```

---

## Task 4: Gemini 서비스

**Files:**
- Create: `backend/services/gemini.py`
- Create: `backend/tests/test_gemini.py`

- [ ] **Step 1: 테스트 작성**

`backend/tests/test_gemini.py`:
```python
import json
import pytest
from unittest.mock import patch, MagicMock
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.gemini import GeminiService


@pytest.fixture
def svc():
    return GeminiService(api_key="test-key")


def mock_gemini_response(data: dict):
    m = MagicMock()
    m.text = json.dumps(data, ensure_ascii=False)
    return m


def test_recommend_meals_returns_days(svc):
    fake = {"days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}]}]}
    with patch.object(svc.model, "generate_content", return_value=mock_gemini_response(fake)):
        result = svc.recommend_meals(
            dates=["2026-03-23"], meal_types=["dinner"],
            family_tags=[], condiments=[], meal_history=[],
            school_meals={}, cooking_times={"breakfast": 15, "lunch": 30, "dinner": 40},
            available_ingredients="",
        )
    assert result["days"][0]["date"] == "2026-03-23"


def test_generate_recipe_includes_calories(svc):
    fake = {
        "menu_name": "된장찌개", "servings": 2, "calories": 180,
        "ingredients": [{"name": "두부", "amount": "1/2모"}],
        "steps": ["물을 끓인다"], "health_notes": None,
    }
    with patch.object(svc.model, "generate_content", return_value=mock_gemini_response(fake)):
        result = svc.generate_recipe(menu_name="된장찌개", servings=2, family_tags=[], main_ingredient_weight=None)
    assert result["calories"] == 180
    assert result["ingredients"][0]["name"] == "두부"


def test_gemini_failure_raises_with_prefix(svc):
    with patch.object(svc.model, "generate_content", side_effect=Exception("network error")):
        with pytest.raises(Exception, match="Gemini"):
            svc.recommend_meals([], [], [], [], [], {}, {}, "")


def test_invalid_json_response_raises(svc):
    m = MagicMock()
    m.text = "not json"
    with patch.object(svc.model, "generate_content", return_value=m):
        with pytest.raises(Exception, match="파싱"):
            svc.recommend_meals([], [], [], [], [], {}, {}, "")
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_gemini.py -v
```

Expected: 4 tests FAIL (ModuleNotFoundError)

- [ ] **Step 3: gemini.py 구현**

`backend/services/gemini.py`:
```python
import json
import os
from typing import Optional

import google.generativeai as genai


class GeminiService:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config={"response_mime_type": "application/json"},
        )

    def _call(self, prompt: str | list) -> dict:
        try:
            response = self.model.generate_content(prompt)
            return json.loads(response.text)
        except json.JSONDecodeError as e:
            raise Exception(f"Gemini 응답 파싱 실패: {e}")
        except Exception as e:
            raise Exception(f"Gemini 호출 실패: {e}")

    def recommend_meals(
        self, dates: list, meal_types: list, family_tags: list,
        condiments: list, meal_history: list, school_meals: dict,
        cooking_times: dict, available_ingredients: str,
    ) -> dict:
        prompt = f"""당신은 한국 가정 식단 전문가입니다. 아래 조건에 맞는 식단을 추천하고 유효한 JSON만 반환하세요.

날짜: {dates}
끼니: {meal_types}
가족 상황: {family_tags or '없음'}
보유 조미료: {condiments or '기본 조미료'}
최근 식단 이력(겹침 방지): {meal_history or '없음'}
급식 메뉴(해당 날짜 제외 처리): {school_meals or '없음'}
끼니별 최대 요리 시간: {cooking_times}
집에 있는 재료: {available_ingredients or '없음'}

규칙:
- 흰쌀밥, 김치, 깍두기 등 상시 보유 반찬 제외
- 끼니별 최대 요리 시간 준수
- 이력과 겹치지 않게

응답 형식:
{{"days": [{{"date": "YYYY-MM-DD", "meals": [{{"meal_type": "breakfast|lunch|dinner", "menus": ["메뉴명"]}}]}}]}}"""
        return self._call(prompt)

    def re_recommend_single(
        self, date: str, meal_type: str, exclude_menu: str,
        existing_menus: list, family_tags: list, condiments: list, max_minutes: int,
    ) -> dict:
        prompt = f"""한국 가정 식단 전문가입니다. '{exclude_menu}'만 교체하는 메뉴 1개를 추천하세요. JSON만 반환.

날짜: {date}, 끼니: {meal_type}
같은 끼니 유지 메뉴: {existing_menus}
가족 상황: {family_tags}, 조미료: {condiments}, 최대 요리시간: {max_minutes}분

응답 형식: {{"menu_name": "새메뉴명"}}"""
        return self._call(prompt)

    def re_recommend_meal_type(
        self, date: str, meal_type: str, family_tags: list,
        condiments: list, max_minutes: int, meal_history: list,
    ) -> dict:
        prompt = f"""한국 가정 식단 전문가입니다. {date} {meal_type} 끼니 전체를 재추천하세요. JSON만 반환.

가족 상황: {family_tags}, 조미료: {condiments}, 최대 요리시간: {max_minutes}분
최근 이력(겹침 방지): {meal_history}
규칙: 흰쌀밥, 김치, 깍두기 제외

응답 형식: {{"menus": ["메뉴명1", "메뉴명2"]}}"""
        return self._call(prompt)

    def generate_recipe(
        self, menu_name: str, servings: int, family_tags: list,
        main_ingredient_weight: Optional[int],
    ) -> dict:
        weight_str = f"주재료 {main_ingredient_weight}g 기준으로 " if main_ingredient_weight else ""
        prompt = f"""한국 가정 식단 전문가입니다. '{menu_name}' 레시피를 {weight_str}{servings}인분으로 작성하세요. JSON만 반환.

가족 상황: {family_tags}
규칙: 큰술/작은술 사용(T/t 사용 금지), 칼로리는 추정값, 건강 상황 반영

응답 형식:
{{"menu_name": "string", "servings": 숫자, "calories": 숫자,
  "ingredients": [{{"name": "string", "amount": "string"}}],
  "steps": ["string"], "health_notes": "string 또는 null"}}"""
        return self._call(prompt)

    def generate_combined_cooking(self, menus: list, family_tags: list) -> dict:
        prompt = f"""한국 가정 식단 전문가입니다. 다음 메뉴를 동시에 조리하는 최적화 순서를 만드세요. JSON만 반환.

메뉴: {menus}
가족 상황: {family_tags}
대기 시간(불리기, 끓이기 등)을 활용해 병렬 조리 최적화.

응답 형식:
{{"total_minutes": 숫자, "optimized_minutes": 숫자,
  "steps": [{{"label": "단계명", "menu_tag": "메뉴명", "description": "설명"}}]}}"""
        return self._call(prompt)

    def generate_shopping_list(self, menus: list, condiments: list) -> dict:
        prompt = f"""한국 가정 식단 전문가입니다. 장보기 목록을 만드세요. JSON만 반환.

메뉴: {menus}
이미 보유한 조미료(제외): {condiments}
카테고리: 채소/과일, 육류/해산물, 유제품/계란, 가공식품, 기타

응답 형식: {{"items": [{{"name": "string", "quantity": "string", "category": "string"}}]}}"""
        return self._call(prompt)

    def parse_condiment_photo(self, image_bytes: bytes, mime_type: str) -> dict:
        prompt = '이 사진의 조미료/양념 이름을 모두 추출하세요. JSON만 반환. 형식: {"extracted": ["이름1", "이름2"]}'
        img_part = {"mime_type": mime_type, "data": image_bytes}
        return self._call([prompt, img_part])

    def parse_school_meal_photo(self, image_bytes: bytes, mime_type: str) -> dict:
        prompt = '급식표 사진에서 날짜별 메뉴를 추출하세요. JSON만 반환. 형식: {"days": [{"date": "YYYY-MM-DD", "menu_items": ["메뉴1"]}]}'
        img_part = {"mime_type": mime_type, "data": image_bytes}
        return self._call([prompt, img_part])


def get_gemini() -> GeminiService:
    """FastAPI Depends 용."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    return GeminiService(api_key=api_key)
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_gemini.py -v
```

Expected: 4 tests PASS

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/services/gemini.py backend/tests/test_gemini.py
git commit -m "feat: add Gemini service with all prompt methods"
```

---

## Task 5: FastAPI main.py + 테스트 인프라

**Files:**
- Create: `backend/main.py`
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: conftest.py 작성**

`backend/tests/conftest.py`:
```python
import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def set_test_db(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setenv("DB_PATH", db_file)
    from database import init_db
    init_db(db_file)
    return db_file


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


@pytest.fixture
def mock_gemini(client):
    """Gemini 의존성을 mock으로 교체하는 픽스처."""
    from main import app
    from services.gemini import get_gemini

    mock = MagicMock()
    app.dependency_overrides[get_gemini] = lambda: mock
    yield mock
    app.dependency_overrides.pop(get_gemini, None)
```

- [ ] **Step 2: main.py 작성**

`backend/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routers import profile, meals, recipes, shopping, school_meals

init_db()

app = FastAPI(title="해먹타임 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router, prefix="/api")
app.include_router(meals.router, prefix="/api")
app.include_router(recipes.router, prefix="/api")
app.include_router(shopping.router, prefix="/api")
app.include_router(school_meals.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 3: 빈 라우터 파일 생성 (임시, 각 Task에서 구현)**

```bash
cd D:/Projects/haemeoktime/backend
for f in profile meals recipes shopping school_meals; do
  echo "from fastapi import APIRouter; router = APIRouter()" > routers/$f.py
done
```

- [ ] **Step 4: 헬스체크 동작 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest -k "not test_database and not test_gemini" -v
```

Expected: 0 tests collected (라우터 테스트 아직 없음), health endpoint는 main.py 구문 오류 없으면 OK

```bash
# 직접 확인
python -c "from main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/main.py backend/tests/conftest.py backend/routers/
git commit -m "feat: add FastAPI app skeleton with CORS and health check"
```

---

## Task 6: Profile 라우터

**Files:**
- Modify: `backend/routers/profile.py`
- Create: `backend/tests/test_profile.py`

- [ ] **Step 1: 테스트 작성**

`backend/tests/test_profile.py`:
```python
import pytest
from unittest.mock import MagicMock


def test_get_profile_returns_defaults(client):
    res = client.get("/api/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["cooking_times"] == {"breakfast": 15, "lunch": 30, "dinner": 40}
    assert body["family_tags"] == []
    assert body["condiments"] == []


def test_add_and_list_family_tag(client):
    res = client.post("/api/profile/family-tags", json={"tag": "허리디스크"})
    assert res.status_code == 200
    assert res.json()["tag"] == "허리디스크"

    res = client.get("/api/profile/family-tags")
    assert any(t["tag"] == "허리디스크" for t in res.json())


def test_delete_family_tag(client):
    tag_id = client.post("/api/profile/family-tags", json={"tag": "8살아이"}).json()["id"]
    res = client.delete(f"/api/profile/family-tags/{tag_id}")
    assert res.status_code == 200

    tags = client.get("/api/profile/family-tags").json()
    assert not any(t["id"] == tag_id for t in tags)


def test_add_and_delete_condiment(client):
    res = client.post("/api/profile/condiments", json={"name": "간장"})
    assert res.status_code == 200
    cid = res.json()["id"]

    client.delete(f"/api/profile/condiments/{cid}")
    condiments = client.get("/api/profile/condiments").json()
    assert not any(c["id"] == cid for c in condiments)


def test_update_cooking_times(client):
    res = client.put("/api/profile/cooking-times", json={"breakfast": 10, "lunch": 20, "dinner": 50})
    assert res.status_code == 200

    profile = client.get("/api/profile").json()
    assert profile["cooking_times"]["dinner"] == 50


def test_condiment_photo_calls_gemini(client, mock_gemini):
    mock_gemini.parse_condiment_photo.return_value = {"extracted": ["간장", "된장"]}
    res = client.post(
        "/api/profile/condiments/photo",
        files={"file": ("test.jpg", b"fake-image-data", "image/jpeg")},
    )
    assert res.status_code == 200
    assert "간장" in res.json()["extracted"]


def test_condiment_photo_gemini_failure_returns_503(client, mock_gemini):
    mock_gemini.parse_condiment_photo.side_effect = Exception("Gemini 호출 실패")
    res = client.post(
        "/api/profile/condiments/photo",
        files={"file": ("test.jpg", b"fake", "image/jpeg")},
    )
    assert res.status_code == 503
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_profile.py -v
```

Expected: 7 tests FAIL

- [ ] **Step 3: profile.py 구현**

`backend/routers/profile.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from database import get_db
from models import (
    TagCreate, TagResponse, CondimentCreate, CondimentResponse,
    CookingTimes, ProfileResponse,
)
from services.gemini import GeminiService, get_gemini

router = APIRouter()


@router.get("/profile", response_model=ProfileResponse)
def get_profile(db=Depends(get_db)):
    tags = [dict(r) for r in db.execute("SELECT id, tag FROM family_tags").fetchall()]
    condiments = [dict(r) for r in db.execute("SELECT id, name FROM condiments").fetchall()]
    times = {r["meal_type"]: r["max_minutes"]
             for r in db.execute("SELECT meal_type, max_minutes FROM cooking_time_settings").fetchall()}
    return {
        "family_tags": tags,
        "condiments": condiments,
        "cooking_times": {"breakfast": times.get("breakfast", 15),
                          "lunch": times.get("lunch", 30),
                          "dinner": times.get("dinner", 40)},
    }


@router.put("/profile/cooking-times")
def update_cooking_times(body: CookingTimes, db=Depends(get_db)):
    for meal_type, minutes in body.model_dump().items():
        db.execute(
            "INSERT OR REPLACE INTO cooking_time_settings (meal_type, max_minutes) VALUES (?, ?)",
            (meal_type, minutes),
        )
    return {"ok": True}


@router.get("/profile/family-tags", response_model=list[TagResponse])
def list_tags(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, tag FROM family_tags ORDER BY id").fetchall()]


@router.post("/profile/family-tags", response_model=TagResponse)
def add_tag(body: TagCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO family_tags (tag) VALUES (?)", (body.tag,))
    return {"id": cur.lastrowid, "tag": body.tag}


@router.delete("/profile/family-tags/{tag_id}")
def delete_tag(tag_id: int, db=Depends(get_db)):
    db.execute("DELETE FROM family_tags WHERE id = ?", (tag_id,))
    return {"ok": True}


@router.get("/profile/condiments", response_model=list[CondimentResponse])
def list_condiments(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, name FROM condiments ORDER BY id").fetchall()]


@router.post("/profile/condiments", response_model=CondimentResponse)
def add_condiment(body: CondimentCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO condiments (name) VALUES (?)", (body.name,))
    return {"id": cur.lastrowid, "name": body.name}


@router.delete("/profile/condiments/{cid}")
def delete_condiment(cid: int, db=Depends(get_db)):
    db.execute("DELETE FROM condiments WHERE id = ?", (cid,))
    return {"ok": True}


@router.post("/profile/condiments/photo")
async def parse_condiment_photo(
    file: UploadFile = File(...),
    gemini: GeminiService = Depends(get_gemini),
):
    try:
        data = await file.read()
        result = gemini.parse_condiment_photo(data, file.content_type or "image/jpeg")
        return result
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_profile.py -v
```

Expected: 7 tests PASS

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/routers/profile.py backend/tests/test_profile.py
git commit -m "feat: profile router - tags, condiments, cooking times, photo parse"
```

---

## Task 7: School Meals 라우터

**Files:**
- Modify: `backend/routers/school_meals.py`
- Create: `backend/tests/test_school_meals.py`

- [ ] **Step 1: 테스트 작성**

`backend/tests/test_school_meals.py`:
```python
def test_get_school_meals_empty(client):
    res = client.get("/api/school-meals")
    assert res.status_code == 200
    assert res.json() == []


def test_photo_upload_saves_and_returns_meals(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [
            {"date": "2026-03-23", "menu_items": ["잡채", "미역국"]},
            {"date": "2026-03-24", "menu_items": ["불고기", "된장찌개"]},
        ]
    }
    res = client.post(
        "/api/school-meals/photo",
        files={"file": ("meal.jpg", b"fake", "image/jpeg")},
    )
    assert res.status_code == 200
    days = res.json()
    assert len(days) == 2
    assert days[0]["date"] == "2026-03-23"
    assert "잡채" in days[0]["menu_items"]


def test_get_school_meals_returns_current_week(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [{"date": "2026-03-23", "menu_items": ["비빔밥"]}]
    }
    client.post("/api/school-meals/photo", files={"file": ("m.jpg", b"x", "image/jpeg")})

    res = client.get("/api/school-meals")
    assert any(d["date"] == "2026-03-23" for d in res.json())


def test_duplicate_date_upserts(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [{"date": "2026-03-23", "menu_items": ["첫번째"]}]
    }
    client.post("/api/school-meals/photo", files={"file": ("a.jpg", b"x", "image/jpeg")})

    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [{"date": "2026-03-23", "menu_items": ["두번째"]}]
    }
    client.post("/api/school-meals/photo", files={"file": ("b.jpg", b"x", "image/jpeg")})

    res = client.get("/api/school-meals")
    meals_on_date = [d for d in res.json() if d["date"] == "2026-03-23"]
    assert len(meals_on_date) == 1
    assert "두번째" in meals_on_date[0]["menu_items"]


def test_photo_gemini_failure_returns_503(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.side_effect = Exception("Gemini 호출 실패")
    res = client.post("/api/school-meals/photo", files={"file": ("x.jpg", b"y", "image/jpeg")})
    assert res.status_code == 503
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_school_meals.py -v
```

Expected: 5 tests FAIL

- [ ] **Step 3: school_meals.py 구현**

`backend/routers/school_meals.py`:
```python
import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from database import get_db
from models import SchoolMealDay
from services.gemini import GeminiService, get_gemini

router = APIRouter()


def _current_week_range():
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


@router.get("/school-meals", response_model=list[SchoolMealDay])
def get_school_meals(db=Depends(get_db)):
    monday, sunday = _current_week_range()
    rows = db.execute(
        "SELECT date, menu_items FROM school_meals WHERE date BETWEEN ? AND ? ORDER BY date",
        (monday, sunday),
    ).fetchall()
    return [{"date": r["date"], "menu_items": json.loads(r["menu_items"])} for r in rows]


@router.post("/school-meals/photo", response_model=list[SchoolMealDay])
async def upload_school_meal_photo(
    file: UploadFile = File(...),
    gemini: GeminiService = Depends(get_gemini),
    db=Depends(get_db),
):
    try:
        data = await file.read()
        result = gemini.parse_school_meal_photo(data, file.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    saved = []
    for day in result.get("days", []):
        db.execute(
            """INSERT INTO school_meals (date, menu_items)
               VALUES (?, ?)
               ON CONFLICT(date) DO UPDATE SET menu_items=excluded.menu_items""",
            (day["date"], json.dumps(day["menu_items"], ensure_ascii=False)),
        )
        saved.append({"date": day["date"], "menu_items": day["menu_items"]})
    return saved
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_school_meals.py -v
```

Expected: 5 tests PASS

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/routers/school_meals.py backend/tests/test_school_meals.py
git commit -m "feat: school meals router - photo upload and weekly query"
```

---

## Task 8: Meals 라우터

**Files:**
- Modify: `backend/routers/meals.py`
- Create: `backend/tests/test_meals.py`

- [ ] **Step 1: 테스트 작성**

`backend/tests/test_meals.py`:
```python
import pytest


@pytest.fixture
def recommend_response():
    return {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": ["된장찌개", "시금치나물"]}],
        }]
    }


def test_recommend_saves_history_and_returns_ids(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    res = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    assert res.status_code == 200
    days = res.json()["days"]
    menus = days[0]["meals"][0]["menus"]
    assert len(menus) == 2
    assert all("history_id" in m for m in menus)
    assert menus[0]["name"] == "된장찌개"


def test_recommend_auto_deletes_old_history(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    # 첫 번째 추천
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    # 14일 초과 이력은 다음 추천 시 삭제됨 (DB에 직접 오래된 데이터 삽입 후 검증)
    from database import get_db_path
    import sqlite3
    conn = sqlite3.connect(get_db_path())
    conn.execute("INSERT INTO meal_history (date, meal_type, menu_name, created_at) VALUES ('2026-01-01', 'dinner', '옛날메뉴', datetime('now', '-15 days'))")
    conn.commit()
    conn.close()

    mock_gemini.recommend_meals.return_value = recommend_response
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-24"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })

    conn2 = sqlite3.connect(get_db_path())
    old = conn2.execute("SELECT * FROM meal_history WHERE menu_name='옛날메뉴'").fetchall()
    conn2.close()
    assert len(old) == 0


def test_delete_history_item(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    res = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    history_id = res.json()["days"][0]["meals"][0]["menus"][0]["history_id"]

    del_res = client.delete(f"/api/meals/history/{history_id}")
    assert del_res.status_code == 200


def test_single_rerecommend(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    rec = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    hid = rec.json()["days"][0]["meals"][0]["menus"][0]["history_id"]

    mock_gemini.re_recommend_single.return_value = {"menu_name": "비빔밥"}
    res = client.post("/api/meals/recommend/single", json={
        "date": "2026-03-23", "meal_type": "dinner",
        "history_id": hid, "menu_name": "된장찌개",
        "max_minutes_override": None, "existing_menus": ["시금치나물"],
    })
    assert res.status_code == 200
    assert res.json()["name"] == "비빔밥"


def test_mealtype_rerecommend(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    rec = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    hids = [m["history_id"] for m in rec.json()["days"][0]["meals"][0]["menus"]]

    mock_gemini.re_recommend_meal_type.return_value = {"menus": ["불고기", "미역국"]}
    res = client.post("/api/meals/recommend/meal-type", json={
        "date": "2026-03-23", "meal_type": "dinner",
        "max_minutes_override": 60, "existing_history_ids": hids,
    })
    assert res.status_code == 200
    assert len(res.json()["menus"]) == 2


def test_recommend_gemini_failure_returns_503(client, mock_gemini):
    mock_gemini.recommend_meals.side_effect = Exception("Gemini 호출 실패")
    res = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    assert res.status_code == 503
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_meals.py -v
```

Expected: 6 tests FAIL

- [ ] **Step 3: meals.py 구현**

`backend/routers/meals.py`:
```python
import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import (
    RecommendRequest, RecommendResponse, MenuItem, MealSlot, DayPlan,
    SingleReRecommendRequest, MealTypeReRecommendRequest,
)
from services.gemini import GeminiService, get_gemini

router = APIRouter()


def _purge_old_history(db):
    # date 컬럼 기준으로 14일 초과 항목 삭제 (식단 날짜 기준, 기록 시점 아님)
    db.execute("DELETE FROM meal_history WHERE date < date('now', '-14 days')")


def _get_context(db):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    condiments = [r["name"] for r in db.execute("SELECT name FROM condiments").fetchall()]
    history = [r["menu_name"] for r in db.execute(
        "SELECT menu_name FROM meal_history WHERE date >= date('now', '-14 days')"
    ).fetchall()]
    times = {r["meal_type"]: r["max_minutes"]
             for r in db.execute("SELECT meal_type, max_minutes FROM cooking_time_settings").fetchall()}
    return tags, condiments, history, times


def _get_school_meals_dict(db, dates: list[str]) -> dict:
    if not dates:
        return {}
    placeholders = ",".join("?" * len(dates))
    rows = db.execute(
        f"SELECT date, menu_items FROM school_meals WHERE date IN ({placeholders})", dates
    ).fetchall()
    return {r["date"]: json.loads(r["menu_items"]) for r in rows}


def _resolve_dates(req: RecommendRequest) -> list[str]:
    if req.period == "today":
        return [date.today().isoformat()]
    if req.period == "week":
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        return [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    return req.dates


@router.post("/meals/recommend", response_model=RecommendResponse)
def recommend(body: RecommendRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    _purge_old_history(db)
    dates = _resolve_dates(body)
    tags, condiments, history, times = _get_context(db)
    school_meals = _get_school_meals_dict(db, dates) if body.use_school_meals else {}

    try:
        result = gemini.recommend_meals(
            dates=dates, meal_types=body.meal_types,
            family_tags=tags, condiments=condiments,
            meal_history=history, school_meals=school_meals,
            cooking_times=times, available_ingredients=body.available_ingredients,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    days_out = []
    for day in result.get("days", []):
        meals_out = []
        for meal in day.get("meals", []):
            menus_out = []
            for menu_name in meal.get("menus", []):
                cur = db.execute(
                    "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, ?, ?)",
                    (day["date"], meal["meal_type"], menu_name),
                )
                menus_out.append({"history_id": cur.lastrowid, "name": menu_name})
            meals_out.append({
                "meal_type": meal["meal_type"],
                "is_school_meal": False,
                "menus": menus_out,
            })
        # 급식 슬롯 추가: use_school_meals=True이고 해당 날짜 급식이 있으면 표시
        if day["date"] in school_meals and "lunch" in body.meal_types:
            meals_out.append({
                "meal_type": "lunch",
                "is_school_meal": True,
                "menus": [{"history_id": -1, "name": m} for m in school_meals[day["date"]]],
            })
        days_out.append({"date": day["date"], "meals": meals_out})

    return {"days": days_out}


@router.post("/meals/recommend/single")
def rerecommend_single(
    body: SingleReRecommendRequest,
    db=Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
):
    tags, condiments, _, times = _get_context(db)
    max_min = body.max_minutes_override if body.max_minutes_override is not None else times.get(body.meal_type, 40)

    try:
        result = gemini.re_recommend_single(
            date=body.date, meal_type=body.meal_type, exclude_menu=body.menu_name,
            existing_menus=body.existing_menus, family_tags=tags,
            condiments=condiments, max_minutes=max_min,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    db.execute("DELETE FROM meal_history WHERE id = ?", (body.history_id,))
    cur = db.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, ?, ?)",
        (body.date, body.meal_type, result["menu_name"]),
    )
    return {"history_id": cur.lastrowid, "name": result["menu_name"]}


@router.post("/meals/recommend/meal-type")
def rerecommend_meal_type(
    body: MealTypeReRecommendRequest,
    db=Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
):
    tags, condiments, history, times = _get_context(db)
    max_min = body.max_minutes_override if body.max_minutes_override is not None else times.get(body.meal_type, 40)

    try:
        result = gemini.re_recommend_meal_type(
            date=body.date, meal_type=body.meal_type, family_tags=tags,
            condiments=condiments, max_minutes=max_min, meal_history=history,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    if body.existing_history_ids:
        placeholders = ",".join("?" * len(body.existing_history_ids))
        db.execute(f"DELETE FROM meal_history WHERE id IN ({placeholders})", body.existing_history_ids)

    menus_out = []
    for menu_name in result.get("menus", []):
        cur = db.execute(
            "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, ?, ?)",
            (body.date, body.meal_type, menu_name),
        )
        menus_out.append({"history_id": cur.lastrowid, "name": menu_name})

    return {"menus": menus_out}


@router.delete("/meals/history/{history_id}")
def delete_history(history_id: int, db=Depends(get_db)):
    db.execute("DELETE FROM meal_history WHERE id = ?", (history_id,))
    return {"ok": True}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_meals.py -v
```

Expected: 6 tests PASS

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/routers/meals.py backend/tests/test_meals.py
git commit -m "feat: meals router - recommend, re-recommend, history management"
```

---

## Task 9: Recipes 라우터

**Files:**
- Modify: `backend/routers/recipes.py`
- Create: `backend/tests/test_recipes.py`

- [ ] **Step 1: 테스트 작성**

`backend/tests/test_recipes.py`:
```python
def _fake_recipe(menu="된장찌개", servings=2):
    return {
        "menu_name": menu, "servings": servings, "calories": 200,
        "ingredients": [{"name": "두부", "amount": "1/2모"}],
        "steps": ["물을 끓인다"], "health_notes": None,
    }


def test_generate_recipe(client, mock_gemini):
    mock_gemini.generate_recipe.return_value = _fake_recipe()
    res = client.post("/api/recipes/generate", json={
        "menu_name": "된장찌개", "servings": 2, "main_ingredient_weight": None,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["calories"] == 200
    assert body["ingredients"][0]["name"] == "두부"


def test_generate_recipe_gemini_failure_returns_503(client, mock_gemini):
    mock_gemini.generate_recipe.side_effect = Exception("Gemini 호출 실패")
    res = client.post("/api/recipes/generate", json={"menu_name": "X", "servings": 1})
    assert res.status_code == 503


def test_combined_cooking(client, mock_gemini):
    mock_gemini.generate_combined_cooking.return_value = {
        "total_minutes": 60, "optimized_minutes": 40,
        "steps": [{"label": "1단계", "menu_tag": "된장찌개", "description": "물 올리기"}],
    }
    res = client.post("/api/recipes/combined-cooking", json={
        "date": "2026-03-23", "meal_type": "dinner", "menus": ["된장찌개", "시금치나물"],
    })
    assert res.status_code == 200
    assert res.json()["optimized_minutes"] == 40


def test_add_and_list_favorite(client):
    res = client.post("/api/recipes/favorites", json={"menu_name": "된장찌개"})
    assert res.status_code == 200
    fid = res.json()["id"]

    favs = client.get("/api/recipes/favorites").json()
    assert any(f["id"] == fid for f in favs)


def test_delete_favorite(client):
    fid = client.post("/api/recipes/favorites", json={"menu_name": "비빔밥"}).json()["id"]
    client.delete(f"/api/recipes/favorites/{fid}")

    favs = client.get("/api/recipes/favorites").json()
    assert not any(f["id"] == fid for f in favs)
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_recipes.py -v
```

Expected: 5 tests FAIL

- [ ] **Step 3: recipes.py 구현**

`backend/routers/recipes.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import RecipeRequest, RecipeResponse, CombinedCookingRequest, FavoriteCreate, FavoriteResponse
from services.gemini import GeminiService, get_gemini

router = APIRouter()


@router.post("/recipes/generate", response_model=RecipeResponse)
def generate_recipe(body: RecipeRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    try:
        result = gemini.generate_recipe(
            menu_name=body.menu_name, servings=body.servings,
            family_tags=tags, main_ingredient_weight=body.main_ingredient_weight,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


@router.post("/recipes/combined-cooking")
def combined_cooking(body: CombinedCookingRequest, db=Depends(get_db), gemini: GeminiService = Depends(get_gemini)):
    tags = [r["tag"] for r in db.execute("SELECT tag FROM family_tags").fetchall()]
    try:
        return gemini.generate_combined_cooking(menus=body.menus, family_tags=tags)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/recipes/favorites", response_model=list[FavoriteResponse])
def list_favorites(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, menu_name FROM favorite_recipes ORDER BY created_at DESC").fetchall()]


@router.post("/recipes/favorites", response_model=FavoriteResponse)
def add_favorite(body: FavoriteCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO favorite_recipes (menu_name) VALUES (?)", (body.menu_name,))
    return {"id": cur.lastrowid, "menu_name": body.menu_name}


@router.delete("/recipes/favorites/{fid}")
def delete_favorite(fid: int, db=Depends(get_db)):
    db.execute("DELETE FROM favorite_recipes WHERE id = ?", (fid,))
    return {"ok": True}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_recipes.py -v
```

Expected: 5 tests PASS

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/routers/recipes.py backend/tests/test_recipes.py
git commit -m "feat: recipes router - generate, combined cooking, favorites"
```

---

## Task 10: Shopping 라우터

**Files:**
- Modify: `backend/routers/shopping.py`
- Create: `backend/tests/test_shopping.py`

- [ ] **Step 1: 테스트 작성**

`backend/tests/test_shopping.py`:
```python
def test_get_shopping_empty(client):
    res = client.get("/api/shopping")
    assert res.status_code == 200
    assert res.json()["items"] == []


def test_add_manual_item(client):
    res = client.post("/api/shopping/items", json={"name": "우유", "quantity": "1개", "category": "유제품/계란"})
    assert res.status_code == 200
    item = res.json()
    assert item["name"] == "우유"
    assert item["is_auto"] is False


def test_check_item(client):
    item_id = client.post("/api/shopping/items", json={"name": "계란"}).json()["id"]
    res = client.patch(f"/api/shopping/items/{item_id}", json={"is_checked": True})
    assert res.status_code == 200

    items = client.get("/api/shopping").json()["items"]
    item = next(i for i in items if i["id"] == item_id)
    assert item["is_checked"] is True


def test_delete_item(client):
    item_id = client.post("/api/shopping/items", json={"name": "두부"}).json()["id"]
    client.delete(f"/api/shopping/items/{item_id}")

    items = client.get("/api/shopping").json()["items"]
    assert not any(i["id"] == item_id for i in items)


def test_generate_replaces_auto_items(client, mock_gemini):
    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "애호박", "quantity": "1개", "category": "채소/과일"}]
    }
    # 첫 번째 자동 생성
    client.post("/api/shopping/generate", json={"menus": ["된장찌개"]})

    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "소고기", "quantity": "300g", "category": "육류/해산물"}]
    }
    # 두 번째 자동 생성 — 기존 is_auto 항목 교체
    client.post("/api/shopping/generate", json={"menus": ["소고기무국"]})

    items = client.get("/api/shopping").json()["items"]
    auto_items = [i for i in items if i["is_auto"]]
    assert len(auto_items) == 1
    assert auto_items[0]["name"] == "소고기"


def test_generate_preserves_manual_items(client, mock_gemini):
    client.post("/api/shopping/items", json={"name": "수동항목"})
    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "자동항목", "quantity": "1개", "category": "기타"}]
    }
    client.post("/api/shopping/generate", json={"menus": ["메뉴"]})

    items = client.get("/api/shopping").json()["items"]
    names = [i["name"] for i in items]
    assert "수동항목" in names
    assert "자동항목" in names


def test_frequent_items_crud(client):
    res = client.post("/api/shopping/frequent", json={"name": "계란"})
    assert res.status_code == 200
    fid = res.json()["id"]

    frequents = client.get("/api/shopping/frequent").json()
    assert any(f["id"] == fid for f in frequents)

    client.delete(f"/api/shopping/frequent/{fid}")
    frequents = client.get("/api/shopping/frequent").json()
    assert not any(f["id"] == fid for f in frequents)
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_shopping.py -v
```

Expected: 7 tests FAIL

- [ ] **Step 3: shopping.py 구현**

`backend/routers/shopping.py`:
```python
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import (
    ShoppingItemCreate, ShoppingItemResponse, ShoppingResponse,
    ShoppingGenerateRequest, ShoppingCheckRequest,
    FrequentItemCreate, FrequentItemResponse,
)
from services.gemini import GeminiService, get_gemini

router = APIRouter()


def _current_week_start() -> str:
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


@router.get("/shopping", response_model=ShoppingResponse)
def get_shopping(db=Depends(get_db)):
    week_start = _current_week_start()
    rows = db.execute(
        "SELECT id, name, quantity, category, is_checked, is_auto FROM shopping_items WHERE week_start = ? ORDER BY id",
        (week_start,),
    ).fetchall()
    return {"week_start": week_start, "items": [dict(r) for r in rows]}


@router.post("/shopping/generate")
def generate_shopping(
    body: ShoppingGenerateRequest,
    db=Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
):
    week_start = _current_week_start()
    condiments = [r["name"] for r in db.execute("SELECT name FROM condiments").fetchall()]

    try:
        result = gemini.generate_shopping_list(menus=body.menus, condiments=condiments)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    # 기존 자동 항목 삭제
    db.execute("DELETE FROM shopping_items WHERE week_start = ? AND is_auto = TRUE", (week_start,))

    items_out = []
    for item in result.get("items", []):
        cur = db.execute(
            "INSERT INTO shopping_items (name, quantity, category, is_auto, week_start) VALUES (?, ?, ?, TRUE, ?)",
            (item["name"], item.get("quantity"), item.get("category"), week_start),
        )
        items_out.append({
            "id": cur.lastrowid, "name": item["name"],
            "quantity": item.get("quantity"), "category": item.get("category"),
            "is_checked": False, "is_auto": True,
        })
    return {"items": items_out}


@router.post("/shopping/items", response_model=ShoppingItemResponse)
def add_item(body: ShoppingItemCreate, db=Depends(get_db)):
    week_start = _current_week_start()
    cur = db.execute(
        "INSERT INTO shopping_items (name, quantity, category, is_auto, week_start) VALUES (?, ?, ?, FALSE, ?)",
        (body.name, body.quantity, body.category, week_start),
    )
    return {"id": cur.lastrowid, "name": body.name, "quantity": body.quantity,
            "category": body.category, "is_checked": False, "is_auto": False}


@router.patch("/shopping/items/{item_id}")
def check_item(item_id: int, body: ShoppingCheckRequest, db=Depends(get_db)):
    db.execute("UPDATE shopping_items SET is_checked = ? WHERE id = ?", (body.is_checked, item_id))
    return {"ok": True}


@router.delete("/shopping/items/{item_id}")
def delete_item(item_id: int, db=Depends(get_db)):
    db.execute("DELETE FROM shopping_items WHERE id = ?", (item_id,))
    return {"ok": True}


@router.get("/shopping/frequent", response_model=list[FrequentItemResponse])
def list_frequent(db=Depends(get_db)):
    return [dict(r) for r in db.execute("SELECT id, name FROM frequent_items ORDER BY sort_order, id").fetchall()]


@router.post("/shopping/frequent", response_model=FrequentItemResponse)
def add_frequent(body: FrequentItemCreate, db=Depends(get_db)):
    cur = db.execute("INSERT INTO frequent_items (name) VALUES (?)", (body.name,))
    return {"id": cur.lastrowid, "name": body.name}


@router.delete("/shopping/frequent/{fid}")
def delete_frequent(fid: int, db=Depends(get_db)):
    db.execute("DELETE FROM frequent_items WHERE id = ?", (fid,))
    return {"ok": True}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest tests/test_shopping.py -v
```

Expected: 7 tests PASS

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
cd D:/Projects/haemeoktime/backend && pytest -v
```

Expected: 모든 테스트 PASS (30+개)

- [ ] **Step 6: commit**

```bash
cd D:/Projects/haemeoktime
git add backend/routers/shopping.py backend/tests/test_shopping.py
git commit -m "feat: shopping router - list, generate, manual add, check, frequent items"
```

---

## Task 11: 실행 확인

- [ ] **Step 1: .env 파일 생성**

```bash
cd D:/Projects/haemeoktime/backend
cp .env.example .env
# .env 파일에 GEMINI_API_KEY 값 입력
```

- [ ] **Step 2: 서버 기동**

```bash
cd D:/Projects/haemeoktime/backend && uvicorn main:app --reload --port 8000
```

Expected: `Uvicorn running on http://127.0.0.1:8000`

- [ ] **Step 3: 헬스체크**

```bash
curl http://localhost:8000/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: API 문서 확인**

브라우저에서 `http://localhost:8000/docs` 접속. 모든 엔드포인트 확인.

- [ ] **Step 5: 최종 commit**

```bash
cd D:/Projects/haemeoktime
git add backend/.env.example
git commit -m "chore: backend implementation complete"
```
