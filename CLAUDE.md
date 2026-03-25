# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
python -m uvicorn main:app --reload          # Dev server on :8000
pytest                                        # Run all tests
pytest tests/test_routers.py::test_name       # Run single test
```

### Frontend
```bash
cd frontend
npm run dev       # Dev server on :5173 (proxies /api → localhost:8000)
npm run build     # Production build
npm run lint      # ESLint
```

### Environment
Backend requires `.env` in `backend/` with `GEMINI_API_KEY`.

## Architecture

Full-stack 식단 추천 앱: React frontend + FastAPI backend + SQLite + Google Gemini API.

### Backend (`backend/`)

- **main.py** — FastAPI app, CORS config, lifespan DB init, mounts routers under `/api`
- **database.py** — SQLite with WAL mode, `get_db()` for FastAPI DI, `open_db()` for streaming contexts, auto-migration on startup
- **models.py** — Pydantic request/response models (camelCase fields)
- **services/gemini.py** — `GeminiService` wraps google-genai SDK; handles meal recommendations, recipe generation, combined cooking, ingredient extraction, shopping lists, photo parsing. Supports streaming via `_call_stream()` generator
- **routers/** — `profile`, `meals`, `recipes`, `shopping`, `school_meals`

Key pattern: Long-running AI operations use SSE (Server-Sent Events) streaming endpoints alongside sync fallbacks. DB columns use snake_case; Pydantic models use camelCase.

### Frontend (`frontend/src/`)

- **App.jsx** — React Router v7 routes
- **contexts/** — `ProfileContext` (settings, tags, condiments, cooking times), `MealPlanContext` (current meal plan state)
- **api/** — Axios-based modules per domain + `fetchSSE()` helper in `client.js` + `recipeCache.js` for localStorage caching
- **pages/** — Feature folders: `MealPlan/`, `CombinedCooking/`, `Recipes/`, `Shopping/`, `Settings/`
- **components/** — Shared UI: `BottomNav`, `LoadingSpinner`, `TagChip`

Key pattern: Streaming AI responses use `fetchSSE()` with progress callbacks. Recipe/ingredient data is cached in localStorage. No state library — pure React Context.

### Data Flow
1. Frontend calls `/api/*` → Vite proxy → FastAPI
2. AI operations: Frontend opens SSE stream → FastAPI streams Gemini responses → Frontend updates UI progressively
3. Favorites store full `recipe_data` JSON with `recipe_type` ('individual' | 'combined')

## Testing

Backend tests use pytest with `asyncio_mode=auto` (see `pytest.ini`). Fixtures in `conftest.py` provide test DB and mock Gemini service. No frontend tests currently.
