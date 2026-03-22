# 해먹타임 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **선행 조건:** 백엔드 서버가 `:8000`에서 실행 중이어야 합니다 (`2026-03-22-haemeoktime-backend.md` 완료 후 시작).

**Goal:** Vite + React 프론트엔드 전체 구현 — 식단추천/레시피/장보기/설정 4개 탭 모바일 웹앱

**Architecture:** React Router v6으로 SPA 구성. 하단 탭 4개 고정. ProfileContext(전역 설정)와 MealPlanContext(추천 결과) 2개 Context로 상태 관리. `src/api/` 레이어가 백엔드 호출 전담. 레시피는 localStorage로 캐시.

**Tech Stack:** Vite 5, React 18, React Router v6, Tailwind CSS 3, Axios (스펙은 fetch 래퍼를 명시하지만 Axios 인터셉터가 동일 기능을 더 간결하게 제공하므로 채택), react-hot-toast (토스트 알림)

---

## 파일 구조

```
frontend/
├── index.html
├── vite.config.js                  # /api → :8000 프록시
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── src/
    ├── main.jsx
    ├── App.jsx                     # BrowserRouter + 하단 탭 레이아웃
    ├── api/
    │   ├── client.js               # axios 인스턴스, 에러 처리
    │   ├── recipeCache.js          # localStorage 레시피 캐시
    │   ├── profile.js
    │   ├── meals.js
    │   ├── recipes.js
    │   ├── shopping.js
    │   └── schoolMeals.js
    ├── contexts/
    │   ├── ProfileContext.jsx       # 조미료, 태그, 요리시간
    │   └── MealPlanContext.jsx      # 추천 결과 (history_id 포함)
    ├── components/
    │   ├── BottomNav.jsx            # 하단 탭 네비게이션
    │   ├── LoadingSpinner.jsx
    │   ├── ErrorToast.jsx           # react-hot-toast 래퍼
    │   └── TagChip.jsx              # 가족 상황 태그 칩
    └── pages/
        ├── MealPlan/
        │   ├── MealPlanHome.jsx     # 식단 추천 옵션 설정 홈
        │   └── MealPlanResult.jsx   # 추천 결과 (요일 탭 + 끼니 카드)
        ├── CombinedCooking/
        │   └── CombinedCooking.jsx  # 동시 조리 최적화
        ├── Shopping/
        │   └── ShoppingPage.jsx     # 장보기 리스트
        ├── Recipes/
        │   ├── RecipesPage.jsx      # 즐겨찾기 + 검색
        │   └── RecipeDetail.jsx     # 레시피 상세
        └── Settings/
            ├── SettingsPage.jsx     # 내 설정 메인
            └── SchoolMealsPage.jsx  # 급식 관리
```

---

## Task 1: 프로젝트 초기화

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`

- [ ] **Step 1: Vite + React 프로젝트 생성**

```bash
cd D:/Projects/haemeoktime
npm create vite@latest frontend -- --template react
cd frontend && npm install
```

- [ ] **Step 2: Tailwind CSS 설치**

```bash
cd D:/Projects/haemeoktime/frontend
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: React Router + axios + react-hot-toast 설치**

```bash
cd D:/Projects/haemeoktime/frontend
npm install react-router-dom axios react-hot-toast
```

- [ ] **Step 4: tailwind.config.js 설정**

`frontend/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 5: CSS에 Tailwind 지시어 추가**

`frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: vite.config.js — /api 프록시 설정**

`frontend/vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 7: 기동 확인**

```bash
cd D:/Projects/haemeoktime/frontend && npm run dev
```

Expected: `http://localhost:5173` 에서 Vite 기본 화면 표시

- [ ] **Step 8: commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/
git commit -m "chore: scaffold frontend with Vite, React, Tailwind, React Router"
```

---

## Task 2: API 클라이언트 레이어

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/recipeCache.js`
- Create: `frontend/src/api/profile.js`
- Create: `frontend/src/api/meals.js`
- Create: `frontend/src/api/recipes.js`
- Create: `frontend/src/api/shopping.js`
- Create: `frontend/src/api/schoolMeals.js`

- [ ] **Step 1: axios 클라이언트 작성**

`frontend/src/api/client.js`:
```js
import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.detail || err.message || '오류가 발생했습니다'
    return Promise.reject(new Error(message))
  }
)

export default client
```

- [ ] **Step 2: 레시피 localStorage 캐시 작성**

`frontend/src/api/recipeCache.js`:
```js
const KEY = (menuName, servings) => `recipe:${menuName}:${servings}`  // 스펙 키 형식: recipe:{menuName}:{serving}

export const getRecipe = (menuName, servings) => {
  try {
    const raw = localStorage.getItem(KEY(menuName, servings))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const setRecipe = (menuName, servings, data) => {
  try {
    localStorage.setItem(KEY(menuName, servings), JSON.stringify(data))
  } catch {
    // localStorage 가득 찼을 때 무시
  }
}
```

- [ ] **Step 3: 도메인별 API 함수 작성**

`frontend/src/api/profile.js`:
```js
import client from './client'

export const getProfile = () => client.get('/profile')
export const updateCookingTimes = (times) => client.put('/profile/cooking-times', times)
export const addFamilyTag = (tag) => client.post('/profile/family-tags', { tag })
export const deleteFamilyTag = (id) => client.delete(`/profile/family-tags/${id}`)
export const addCondiment = (name) => client.post('/profile/condiments', { name })
export const deleteCondiment = (id) => client.delete(`/profile/condiments/${id}`)
export const parseCondimentPhoto = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/profile/condiments/photo', form)
}
```

`frontend/src/api/meals.js`:
```js
import client from './client'

export const recommendMeals = (body) => client.post('/meals/recommend', body)
export const reRecommendSingle = (body) => client.post('/meals/recommend/single', body)
export const reRecommendMealType = (body) => client.post('/meals/recommend/meal-type', body)
export const deleteHistoryItem = (id) => client.delete(`/meals/history/${id}`)
```

`frontend/src/api/recipes.js`:
```js
import client from './client'
import { getRecipe, setRecipe } from './recipeCache'

export const generateRecipe = async (menuName, servings, mainIngredientWeight = null) => {
  const cached = getRecipe(menuName, servings)
  if (cached) return cached
  const data = await client.post('/recipes/generate', {
    menu_name: menuName, servings, main_ingredient_weight: mainIngredientWeight,
  })
  setRecipe(menuName, servings, data)
  return data
}

export const generateCombinedCooking = (date, mealType, menus) =>
  client.post('/recipes/combined-cooking', { date, meal_type: mealType, menus })

export const getFavorites = () => client.get('/recipes/favorites')
export const addFavorite = (menuName) => client.post('/recipes/favorites', { menu_name: menuName })
export const deleteFavorite = (id) => client.delete(`/recipes/favorites/${id}`)
```

`frontend/src/api/shopping.js`:
```js
import client from './client'

export const getShopping = () => client.get('/shopping')
export const generateShopping = (menus) => client.post('/shopping/generate', { menus })
export const addShoppingItem = (name, quantity, category) =>
  client.post('/shopping/items', { name, quantity, category })
export const checkShoppingItem = (id, isChecked) =>
  client.patch(`/shopping/items/${id}`, { is_checked: isChecked })
export const deleteShoppingItem = (id) => client.delete(`/shopping/items/${id}`)
export const getFrequent = () => client.get('/shopping/frequent')
export const addFrequent = (name) => client.post('/shopping/frequent', { name })
export const deleteFrequent = (id) => client.delete(`/shopping/frequent/${id}`)
```

`frontend/src/api/schoolMeals.js`:
```js
import client from './client'

export const getSchoolMeals = () => client.get('/school-meals')
export const uploadSchoolMealPhoto = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/school-meals/photo', form)
}
```

- [ ] **Step 4: 문법 확인**

```bash
cd D:/Projects/haemeoktime/frontend && npm run build 2>&1 | head -20
```

Expected: 빌드 성공 (또는 미사용 import 경고만)

- [ ] **Step 5: commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/src/api/
git commit -m "feat: API client layer with axios, recipe localStorage cache"
```

---

## Task 3: 앱 레이아웃 + 라우터 + Context 스켈레톤

**Files:**
- Create: `frontend/src/contexts/ProfileContext.jsx`
- Create: `frontend/src/contexts/MealPlanContext.jsx`
- Create: `frontend/src/components/BottomNav.jsx`
- Create: `frontend/src/components/LoadingSpinner.jsx`
- Create: `frontend/src/components/TagChip.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: ProfileContext 작성**

`frontend/src/contexts/ProfileContext.jsx`:
```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { getProfile } from '../api/profile'

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState({
    family_tags: [],
    condiments: [],
    cooking_times: { breakfast: 15, lunch: 30, dinner: 40 },
  })
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const data = await getProfile()
      setProfile(data)
    } catch (e) {
      console.error('프로필 로드 실패', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext)
```

- [ ] **Step 2: MealPlanContext 작성**

`frontend/src/contexts/MealPlanContext.jsx`:
```jsx
import { createContext, useContext, useState } from 'react'

const MealPlanContext = createContext(null)

export function MealPlanProvider({ children }) {
  const [plan, setPlan] = useState(null)   // RecommendResponse | null

  const updateMenu = (date, mealType, historyId, newMenu) => {
    setPlan((prev) => {
      if (!prev) return prev
      return {
        days: prev.days.map((day) =>
          day.date !== date ? day : {
            ...day,
            meals: day.meals.map((meal) =>
              meal.meal_type !== mealType ? meal : {
                ...meal,
                menus: meal.menus.map((m) =>
                  m.history_id === historyId ? newMenu : m
                ),
              }
            ),
          }
        ),
      }
    })
  }

  const replaceMeal = (date, mealType, newMenus) => {
    setPlan((prev) => {
      if (!prev) return prev
      return {
        days: prev.days.map((day) =>
          day.date !== date ? day : {
            ...day,
            meals: day.meals.map((meal) =>
              meal.meal_type !== mealType ? meal : { ...meal, menus: newMenus }
            ),
          }
        ),
      }
    })
  }

  const removeMenu = (date, mealType, historyId) => {
    setPlan((prev) => {
      if (!prev) return prev
      return {
        days: prev.days.map((day) =>
          day.date !== date ? day : {
            ...day,
            meals: day.meals.map((meal) =>
              meal.meal_type !== mealType ? meal : {
                ...meal,
                menus: meal.menus.filter((m) => m.history_id !== historyId),
              }
            ),
          }
        ),
      }
    })
  }

  return (
    <MealPlanContext.Provider value={{ plan, setPlan, updateMenu, replaceMeal, removeMenu }}>
      {children}
    </MealPlanContext.Provider>
  )
}

export const useMealPlan = () => useContext(MealPlanContext)
```

- [ ] **Step 3: BottomNav 작성**

`frontend/src/components/BottomNav.jsx`:
```jsx
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: '식단', icon: '🍽' },
  { to: '/shopping', label: '장보기', icon: '🛒' },
  { to: '/recipes', label: '레시피', icon: '📖' },
  { to: '/settings', label: '설정', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex max-w-[430px] mx-auto">
      {tabs.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs ${
              isActive ? 'text-green-600 font-semibold' : 'text-gray-500'
            }`
          }
        >
          <span className="text-xl">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: 공통 컴포넌트 작성**

`frontend/src/components/LoadingSpinner.jsx`:
```jsx
export default function LoadingSpinner({ text = '로딩 중...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin mb-2" />
      <span className="text-sm">{text}</span>
    </div>
  )
}
```

`frontend/src/components/TagChip.jsx`:
```jsx
export default function TagChip({ label, onDelete }) {
  return (
    <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-sm px-2 py-1 rounded-full">
      {label}
      {onDelete && (
        <button onClick={onDelete} className="text-green-600 hover:text-red-500 ml-1">✕</button>
      )}
    </span>
  )
}
```

- [ ] **Step 5: App.jsx 작성 (페이지 스텁 포함)**

`frontend/src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ProfileProvider } from './contexts/ProfileContext'
import { MealPlanProvider } from './contexts/MealPlanContext'
import BottomNav from './components/BottomNav'

// 페이지 임포트 (각 Task에서 구현)
import MealPlanHome from './pages/MealPlan/MealPlanHome'
import MealPlanResult from './pages/MealPlan/MealPlanResult'
import CombinedCooking from './pages/CombinedCooking/CombinedCooking'
import ShoppingPage from './pages/Shopping/ShoppingPage'
import RecipesPage from './pages/Recipes/RecipesPage'
import RecipeDetail from './pages/Recipes/RecipeDetail'
import SettingsPage from './pages/Settings/SettingsPage'
import SchoolMealsPage from './pages/Settings/SchoolMealsPage'

export default function App() {
  return (
    <ProfileProvider>
      <MealPlanProvider>
        <BrowserRouter>
          <Toaster position="top-center" />
          <div className="max-w-[430px] mx-auto min-h-screen bg-gray-50 pb-16">
            <Routes>
              <Route path="/" element={<MealPlanHome />} />
              <Route path="/meals/result" element={<MealPlanResult />} />
              <Route path="/meals/result/:date/:mealType/cooking" element={<CombinedCooking />} />
              <Route path="/shopping" element={<ShoppingPage />} />
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/recipes/:menuName" element={<RecipeDetail />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/school-meals" element={<SchoolMealsPage />} />
            </Routes>
          </div>
          <BottomNav />
        </BrowserRouter>
      </MealPlanProvider>
    </ProfileProvider>
  )
}
```

- [ ] **Step 6: 각 페이지 스텁 파일 생성**

```bash
cd D:/Projects/haemeoktime/frontend
mkdir -p src/pages/MealPlan src/pages/CombinedCooking src/pages/Shopping src/pages/Recipes src/pages/Settings

for file in \
  "src/pages/MealPlan/MealPlanHome" \
  "src/pages/MealPlan/MealPlanResult" \
  "src/pages/CombinedCooking/CombinedCooking" \
  "src/pages/Shopping/ShoppingPage" \
  "src/pages/Recipes/RecipesPage" \
  "src/pages/Recipes/RecipeDetail" \
  "src/pages/Settings/SettingsPage" \
  "src/pages/Settings/SchoolMealsPage"; do
  name=$(basename $file)
  echo "export default function ${name}() { return <div className=\"p-4\">${name}</div> }" > frontend/${file}.jsx
done
```

- [ ] **Step 7: main.jsx 수정**

`frontend/src/main.jsx`:
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 8: 개발 서버에서 레이아웃 확인**

```bash
cd D:/Projects/haemeoktime/frontend && npm run dev
```

`http://localhost:5173` 접속 → 하단 탭 4개 보이고 각 탭 클릭 시 페이지 이동 확인

- [ ] **Step 9: commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/src/
git commit -m "feat: app layout, router, ProfileContext, MealPlanContext, BottomNav"
```

---

## Task 4: 설정 페이지 (Settings)

**Files:**
- Modify: `frontend/src/pages/Settings/SettingsPage.jsx`
- Modify: `frontend/src/pages/Settings/SchoolMealsPage.jsx`

- [ ] **Step 1: SettingsPage 구현**

`frontend/src/pages/Settings/SettingsPage.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useProfile } from '../../contexts/ProfileContext'
import {
  addFamilyTag, deleteFamilyTag, addCondiment, deleteCondiment,
  updateCookingTimes, parseCondimentPhoto,
} from '../../api/profile'
import TagChip from '../../components/TagChip'

const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }

export default function SettingsPage() {
  const { profile, loading, refresh } = useProfile()
  const navigate = useNavigate()
  const [newTag, setNewTag] = useState('')
  const [newCondiment, setNewCondiment] = useState('')
  const [times, setTimes] = useState(profile.cooking_times)

  // 프로필 로드 완료 후 times 동기화 (초기 렌더 시 기본값으로 오버라이트 방지)
  useEffect(() => {
    if (!loading) setTimes(profile.cooking_times)
  }, [loading])
  const [photoLoading, setPhotoLoading] = useState(false)

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    try {
      await addFamilyTag(newTag.trim())
      setNewTag('')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleDeleteTag = async (id) => {
    try { await deleteFamilyTag(id); await refresh() }
    catch (e) { toast.error(e.message) }
  }

  const handleAddCondiment = async () => {
    if (!newCondiment.trim()) return
    try {
      await addCondiment(newCondiment.trim())
      setNewCondiment('')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleDeleteCondiment = async (id) => {
    try { await deleteCondiment(id); await refresh() }
    catch (e) { toast.error(e.message) }
  }

  const handleSaveTimes = async () => {
    try {
      await updateCookingTimes(times)
      toast.success('저장됐어요')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleCondimentPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoLoading(true)
    try {
      const result = await parseCondimentPhoto(file)
      for (const name of result.extracted) {
        await addCondiment(name)
      }
      await refresh()
      toast.success(`${result.extracted.length}개 조미료를 추가했어요`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPhotoLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">내 설정</h1>

      {/* 가족 상황 */}
      <section>
        <h2 className="font-semibold mb-2">👨‍👩‍👧 가족 상황</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {profile.family_tags.map((t) => (
            <TagChip key={t.id} label={t.tag} onDelete={() => handleDeleteTag(t.id)} />
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="예) 허리디스크, 8살 아이"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
          />
          <button onClick={handleAddTag} className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm">
            추가
          </button>
        </div>
      </section>

      {/* 끼니별 최대 요리 시간 */}
      <section>
        <h2 className="font-semibold mb-2">⏱️ 끼니별 최대 요리 시간</h2>
        <div className="space-y-2">
          {Object.entries(MEAL_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm">
              <span className="text-sm">{label}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimes((t) => ({ ...t, [key]: Math.max(5, t[key] - 5) }))}
                  className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                >-</button>
                <span className="w-16 text-center font-medium">{times[key]}분</span>
                <button
                  onClick={() => setTimes((t) => ({ ...t, [key]: t[key] + 5 }))}
                  className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                >+</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={handleSaveTimes} className="mt-2 w-full bg-green-500 text-white py-2 rounded-lg text-sm">
          저장
        </button>
      </section>

      {/* 보유 조미료 */}
      <section>
        <h2 className="font-semibold mb-2">🧂 보유 조미료</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {profile.condiments.map((c) => (
            <TagChip key={c.id} label={c.name} onDelete={() => handleDeleteCondiment(c.id)} />
          ))}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="조미료 이름"
            value={newCondiment}
            onChange={(e) => setNewCondiment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCondiment()}
          />
          <button onClick={handleAddCondiment} className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm">
            추가
          </button>
        </div>
        <label className={`flex items-center gap-2 text-sm text-green-600 cursor-pointer ${photoLoading ? 'opacity-50' : ''}`}>
          <span>📷 사진으로 한 번에 추가</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleCondimentPhoto} disabled={photoLoading} />
        </label>
        {photoLoading && <p className="text-xs text-gray-400 mt-1">AI가 조미료를 분석 중...</p>}
      </section>

      {/* 급식 메뉴 */}
      <section>
        <h2 className="font-semibold mb-2">🏫 급식 메뉴</h2>
        <button
          onClick={() => navigate('/settings/school-meals')}
          className="w-full bg-white border rounded-lg p-3 text-sm text-left shadow-sm"
        >
          급식표 관리 →
        </button>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: SchoolMealsPage 구현**

`frontend/src/pages/Settings/SchoolMealsPage.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getSchoolMeals, uploadSchoolMealPhoto } from '../../api/schoolMeals'
import LoadingSpinner from '../../components/LoadingSpinner'

const DAY_NAMES = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 0: '일' }

export default function SchoolMealsPage() {
  const navigate = useNavigate()
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    try {
      setMeals(await getSchoolMeals())
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadSchoolMealPhoto(file)
      await load()
      toast.success('급식표를 저장했어요')
    } catch (e) {
      toast.error(e.message)
    } finally { setUploading(false) }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-xl font-bold">급식 메뉴 관리</h1>
      </div>

      <label className={`flex items-center justify-center gap-2 bg-green-500 text-white py-3 rounded-xl mb-4 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
        <span>📷 급식표 사진 업로드</span>
        <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} disabled={uploading} />
      </label>
      {uploading && <p className="text-sm text-center text-gray-400 mb-4">AI가 급식표를 분석 중...</p>}

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {meals.length === 0 ? (
            <p className="text-center text-gray-400 py-8">이번 주 급식이 없어요</p>
          ) : meals.map((m) => {
            const d = new Date(m.date + 'T00:00:00')  // 로컬 타임존 기준 파싱 (UTC midnight 방지)
            return (
              <div key={m.date} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="font-semibold text-sm mb-1">
                  {m.date} ({DAY_NAMES[d.getDay()]})
                </div>
                <div className="text-sm text-gray-600">{m.menu_items.join(' / ')}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 화면 확인**

```bash
# 백엔드 실행 중인 상태에서
# 브라우저 http://localhost:5173/settings
# - 가족 상황 태그 추가/삭제 동작
# - 조미료 추가/삭제 동작
# - 요리 시간 저장 동작
# - 급식표 관리 → 이동 동작
```

- [ ] **Step 4: commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/src/pages/Settings/
git commit -m "feat: settings page - family tags, condiments, cooking times, school meals"
```

---

## Task 5: 식단 추천 홈 페이지

**Files:**
- Modify: `frontend/src/pages/MealPlan/MealPlanHome.jsx`

- [ ] **Step 1: MealPlanHome 구현**

`frontend/src/pages/MealPlan/MealPlanHome.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { recommendMeals } from '../../api/meals'
import { useMealPlan } from '../../contexts/MealPlanContext'
import LoadingSpinner from '../../components/LoadingSpinner'

const PERIODS = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
]
const MEAL_TYPES = [
  { key: 'breakfast', label: '아침' },
  { key: 'lunch', label: '점심' },
  { key: 'dinner', label: '저녁' },
]

export default function MealPlanHome() {
  const navigate = useNavigate()
  const { setPlan } = useMealPlan()
  const [period, setPeriod] = useState('today')
  const [mealTypes, setMealTypes] = useState(['breakfast', 'lunch', 'dinner'])
  const [useSchoolMeals, setUseSchoolMeals] = useState(false)
  const [ingredients, setIngredients] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleMealType = (key) => {
    setMealTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const handleRecommend = async () => {
    if (mealTypes.length === 0) {
      toast.error('끼니를 하나 이상 선택해주세요')
      return
    }
    setLoading(true)
    try {
      const result = await recommendMeals({
        period, dates: [], meal_types: mealTypes,
        available_ingredients: ingredients,
        use_school_meals: useSchoolMeals,
      })
      setPlan(result)
      navigate('/meals/result')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner text="AI가 식단을 추천 중..." />

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">해먹타임 🍽</h1>
      </div>

      {/* 기간 선택 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">기간</h2>
        <div className="flex gap-2">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                period === key ? 'bg-green-500 text-white' : 'bg-white border text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 끼니 선택 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">끼니</h2>
        <div className="flex gap-2">
          {MEAL_TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleMealType(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                mealTypes.includes(key) ? 'bg-green-500 text-white' : 'bg-white border text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 급식 연동 */}
      <section className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
        <span className="text-sm">🏫 급식 연동</span>
        <button
          onClick={() => setUseSchoolMeals((v) => !v)}
          className={`w-12 h-6 rounded-full transition-colors ${useSchoolMeals ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${useSchoolMeals ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </section>

      {/* 집 재료 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">집에 있는 재료</h2>
        <textarea
          className="w-full border rounded-xl px-3 py-2 text-sm resize-none"
          rows={3}
          placeholder="예) 냉장고에 두부, 애호박 있어요"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
        />
      </section>

      {/* 추천 버튼 */}
      <button
        onClick={handleRecommend}
        className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg"
      >
        ✨ 식단 추천받기
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 화면 확인**

```
http://localhost:5173/ 접속
- 기간/끼니 선택 버튼 토글 동작
- 급식 연동 토글 동작
- "식단 추천받기" 클릭 시 로딩 후 /meals/result 이동 (백엔드 연결 필요)
```

- [ ] **Step 3: commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/src/pages/MealPlan/MealPlanHome.jsx
git commit -m "feat: meal plan home - period, meal type, school meals, recommend"
```

---

## Task 6: 식단 추천 결과 페이지

**Files:**
- Modify: `frontend/src/pages/MealPlan/MealPlanResult.jsx`

- [ ] **Step 1: MealPlanResult 구현**

`frontend/src/pages/MealPlan/MealPlanResult.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useMealPlan } from '../../contexts/MealPlanContext'
import { reRecommendSingle, reRecommendMealType, deleteHistoryItem } from '../../api/meals'
import { generateShopping } from '../../api/shopping'

const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export default function MealPlanResult() {
  const navigate = useNavigate()
  const { plan, updateMenu, replaceMeal, removeMenu } = useMealPlan()
  const [selectedDate, setSelectedDate] = useState(plan?.days?.[0]?.date || '')
  const [loading, setLoading] = useState({})

  if (!plan) {
    return (
      <div className="p-4 text-center text-gray-400 py-20">
        <p className="mb-4">추천된 식단이 없어요</p>
        <button onClick={() => navigate('/')} className="bg-green-500 text-white px-6 py-2 rounded-full">
          식단 추천받기
        </button>
      </div>
    )
  }

  const setLoad = (key, val) => setLoading((prev) => ({ ...prev, [key]: val }))

  const handleDeleteMenu = async (date, mealType, historyId) => {
    try {
      await deleteHistoryItem(historyId)
      removeMenu(date, mealType, historyId)
    } catch (e) { toast.error(e.message) }
  }

  const handleReRecommendSingle = async (date, mealType, historyId, menuName, existingMenus) => {
    const key = `single-${historyId}`
    setLoad(key, true)
    try {
      const result = await reRecommendSingle({
        date, meal_type: mealType, history_id: historyId, menu_name: menuName,
        max_minutes_override: null, existing_menus: existingMenus,
      })
      updateMenu(date, mealType, historyId, result)
      toast.success(`${menuName} → ${result.name}`)
    } catch (e) {
      toast.error(e.message)
    } finally { setLoad(key, false) }
  }

  const handleReRecommendMealType = async (date, mealType, existingHistoryIds) => {
    const key = `meal-${date}-${mealType}`
    setLoad(key, true)
    try {
      const result = await reRecommendMealType({
        date, meal_type: mealType, max_minutes_override: null,
        existing_history_ids: existingHistoryIds,
      })
      replaceMeal(date, mealType, result.menus)
      toast.success('끼니를 새로 추천했어요')
    } catch (e) {
      toast.error(e.message)
    } finally { setLoad(key, false) }
  }

  const handleGenerateShopping = async () => {
    const allMenus = plan.days.flatMap((d) =>
      d.meals.flatMap((m) => m.menus.map((menu) => menu.name))
    )
    try {
      await generateShopping(allMenus)
      navigate('/shopping')
      toast.success('장보기 리스트를 만들었어요')
    } catch (e) { toast.error(e.message) }
  }

  const currentDay = plan.days.find((d) => d.date === selectedDate) || plan.days[0]

  return (
    <div className="p-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate('/')} className="text-xl">←</button>
        <h1 className="text-lg font-bold flex-1">이번 주 식단</h1>
      </div>

      {/* 요일 탭 */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {plan.days.map((day) => {
          const d = new Date(day.date + 'T00:00:00')  // 로컬 타임존 기준 파싱
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium ${
                day.date === selectedDate ? 'bg-green-500 text-white' : 'bg-white border'
              }`}
            >
              {DAY_NAMES[d.getDay()]}
              <div className="text-xs">{d.getMonth() + 1}/{d.getDate()}</div>
            </button>
          )
        })}
      </div>

      {/* 끼니 카드 */}
      <div className="space-y-3">
        {currentDay?.meals.map((meal) => {
          const mealKey = `meal-${currentDay.date}-${meal.meal_type}`
          const menuNames = meal.menus.filter(m => m.history_id > 0).map(m => m.name)
          return (
            <div key={meal.meal_type} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{MEAL_LABELS[meal.meal_type]}</span>
                {!meal.is_school_meal && (
                  <button
                    onClick={() => handleReRecommendMealType(
                      currentDay.date, meal.meal_type,
                      meal.menus.filter(m => m.history_id > 0).map(m => m.history_id)
                    )}
                    disabled={loading[mealKey]}
                    className="text-xs text-green-600 border border-green-300 px-2 py-1 rounded-full"
                  >
                    {loading[mealKey] ? '...' : '끼니↺'}
                  </button>
                )}
              </div>

              {meal.is_school_meal && (
                <p className="text-xs text-gray-400 mb-1">🏫 급식</p>
              )}

              <div className="space-y-2">
                {meal.menus.map((menu) => (
                  <div key={menu.history_id} className="flex items-center justify-between">
                    <button
                      onClick={() => navigate(`/recipes/${encodeURIComponent(menu.name)}`)}
                      className="text-sm text-left flex-1"
                    >
                      • {menu.name}
                    </button>
                    {!meal.is_school_meal && menu.history_id > 0 && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleReRecommendSingle(
                            currentDay.date, meal.meal_type, menu.history_id, menu.name,
                            meal.menus.filter(m => m.history_id !== menu.history_id).map(m => m.name)
                          )}
                          disabled={loading[`single-${menu.history_id}`]}
                          className="text-xs text-blue-500 px-1"
                        >
                          {loading[`single-${menu.history_id}`] ? '...' : '↺'}
                        </button>
                        <button
                          onClick={() => navigate(`/recipes/${encodeURIComponent(menu.name)}`)}
                          className="text-xs text-gray-500 px-1"
                        >
                          레시피
                        </button>
                        <button
                          onClick={() => handleDeleteMenu(currentDay.date, meal.meal_type, menu.history_id)}
                          className="text-xs text-red-400 px-1"
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 동시 조리 버튼 (메뉴 2개 이상) */}
              {!meal.is_school_meal && menuNames.length >= 2 && (
                <button
                  onClick={() => navigate(
                    `/meals/result/${currentDay.date}/${meal.meal_type}/cooking`,
                    { state: { menus: menuNames } }
                  )}
                  className="mt-2 w-full text-xs text-amber-600 border border-amber-300 py-1 rounded-lg"
                >
                  ⚡ 함께 요리하기
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 장보기 버튼 */}
      <button
        onClick={handleGenerateShopping}
        className="mt-4 w-full bg-green-500 text-white py-3 rounded-xl font-semibold"
      >
        🛒 장보기 리스트 만들기
      </button>
    </div>
  )
}
```

- [ ] **Step 2: commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/src/pages/MealPlan/MealPlanResult.jsx
git commit -m "feat: meal plan result - day tabs, meal cards, re-recommend, delete, shopping"
```

---

## Task 7: 동시 조리 페이지 + 레시피 상세

**Files:**
- Modify: `frontend/src/pages/CombinedCooking/CombinedCooking.jsx`
- Modify: `frontend/src/pages/Recipes/RecipeDetail.jsx`

- [ ] **Step 1: CombinedCooking 구현**

`frontend/src/pages/CombinedCooking/CombinedCooking.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { generateCombinedCooking } from '../../api/recipes'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function CombinedCooking() {
  const navigate = useNavigate()
  const { date, mealType } = useParams()
  const { state } = useLocation()
  const menus = state?.menus || []
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    generateCombinedCooking(date, mealType, menus)
      .then(setResult)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-lg font-bold">⚡ 함께 요리하기</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">{menus.join(' + ')}</p>

      {loading ? <LoadingSpinner text="AI가 최적 순서를 계산 중..." /> : result && (
        <>
          <div className="bg-amber-50 rounded-xl p-3 mb-4 text-sm">
            <span className="text-gray-500">개별 합산</span>
            <span className="line-through ml-2 text-gray-400">{result.total_minutes}분</span>
            <span className="mx-2">→</span>
            <span className="font-bold text-amber-600">{result.optimized_minutes}분</span>
          </div>
          <div className="space-y-3">
            {result.steps.map((step, i) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                    {step.menu_tag}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{i + 1}. {step.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: RecipeDetail 구현**

`frontend/src/pages/Recipes/RecipeDetail.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { generateRecipe, addFavorite, deleteFavorite, getFavorites } from '../../api/recipes'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function RecipeDetail() {
  const navigate = useNavigate()
  const { menuName } = useParams()
  const decodedName = decodeURIComponent(menuName)
  const [servings, setServings] = useState(2)
  const [weight, setWeight] = useState('')
  const [recipe, setRecipe] = useState(null)
  const [loading, setLoading] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)

  const load = async (s, w) => {
    setLoading(true)
    try {
      const data = await generateRecipe(decodedName, s, w || null)
      setRecipe(data)
    } catch (e) {
      toast.error(e.message)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load(servings, null)
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.menu_name === decodedName)
      if (fav) { setFavorited(true); setFavoriteId(fav.id) }
    })
  }, [])

  const handleServingsChange = (delta) => {
    const next = Math.max(1, servings + delta)
    setServings(next)
    load(next, weight ? parseInt(weight) : null)
  }

  const handleWeightSubmit = () => {
    load(servings, weight ? parseInt(weight) : null)
  }

  const toggleFavorite = async () => {
    if (favorited && favoriteId) {
      await deleteFavorite(favoriteId)
      setFavorited(false); setFavoriteId(null)
      toast.success('즐겨찾기에서 삭제했어요')
    } else {
      const result = await addFavorite(decodedName)
      setFavorited(true); setFavoriteId(result.id)
      toast.success('즐겨찾기에 추가했어요')
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-xl font-bold flex-1">{decodedName}</h1>
        <button onClick={toggleFavorite} className="text-2xl">{favorited ? '♥' : '♡'}</button>
      </div>

      {/* 인분 + 중량 설정 */}
      <div className="bg-white rounded-xl p-3 shadow-sm mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">인분</span>
          <div className="flex items-center gap-3">
            <button onClick={() => handleServingsChange(-1)} className="w-8 h-8 rounded-full bg-gray-100 font-bold">-</button>
            <span className="font-semibold">{servings}인분</span>
            <button onClick={() => handleServingsChange(1)} className="w-8 h-8 rounded-full bg-gray-100 font-bold">+</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm flex-1">주재료 중량 (선택)</span>
          <input
            type="number"
            className="w-20 border rounded-lg px-2 py-1 text-sm text-right"
            placeholder="g"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={handleWeightSubmit}
          />
          <span className="text-sm">g</span>
        </div>
        {recipe && (
          <p className="text-sm text-gray-500">칼로리: 약 {recipe.calories} kcal</p>
        )}
      </div>

      {loading ? <LoadingSpinner text="레시피 불러오는 중..." /> : recipe && (
        <>
          {/* 재료 */}
          <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
            <h2 className="font-semibold mb-2">재료</h2>
            <div className="space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{ing.name}</span>
                  <span className="text-gray-500">{ing.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 조리 순서 */}
          <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
            <h2 className="font-semibold mb-2">조리 순서</h2>
            <ol className="space-y-2">
              {recipe.steps.map((step, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-green-500 font-bold flex-shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* 건강 메모 */}
          {recipe.health_notes && (
            <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800">
              ⚠️ {recipe.health_notes}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/src/pages/CombinedCooking/ frontend/src/pages/Recipes/RecipeDetail.jsx
git commit -m "feat: combined cooking optimizer and recipe detail with cache"
```

---

## Task 8: 레시피 목록 + 장보기 페이지

**Files:**
- Modify: `frontend/src/pages/Recipes/RecipesPage.jsx`
- Modify: `frontend/src/pages/Shopping/ShoppingPage.jsx`

- [ ] **Step 1: RecipesPage 구현**

`frontend/src/pages/Recipes/RecipesPage.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getFavorites, deleteFavorite } from '../../api/recipes'

export default function RecipesPage() {
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getFavorites().then(setFavorites).catch((e) => toast.error(e.message))
  }, [])

  const handleDelete = async (id) => {
    await deleteFavorite(id)
    setFavorites((prev) => prev.filter((f) => f.id !== id))
    toast.success('즐겨찾기에서 삭제했어요')
  }

  const handleSearch = () => {
    if (!search.trim()) return
    navigate(`/recipes/${encodeURIComponent(search.trim())}`)
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">레시피 📖</h1>

      {/* 검색 */}
      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 border rounded-xl px-3 py-2 text-sm"
          placeholder="메뉴 이름으로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm">
          검색
        </button>
      </div>

      {/* 즐겨찾기 */}
      <h2 className="font-semibold mb-2">즐겨찾기 ♥</h2>
      {favorites.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">즐겨찾기한 레시피가 없어요</p>
      ) : (
        <div className="space-y-2">
          {favorites.map((f) => (
            <div key={f.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between">
              <button
                onClick={() => navigate(`/recipes/${encodeURIComponent(f.menu_name)}`)}
                className="text-sm font-medium flex-1 text-left"
              >
                {f.menu_name}
              </button>
              <button onClick={() => handleDelete(f.id)} className="text-gray-400 text-xl">♥</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ShoppingPage 구현**

`frontend/src/pages/Shopping/ShoppingPage.jsx`:
```jsx
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getShopping, addShoppingItem, checkShoppingItem, deleteShoppingItem,
  getFrequent, addFrequent, deleteFrequent,
} from '../../api/shopping'
import LoadingSpinner from '../../components/LoadingSpinner'

const CATEGORIES = ['채소/과일', '육류/해산물', '유제품/계란', '가공식품', '기타']

export default function ShoppingPage() {
  const [shopping, setShopping] = useState({ week_start: '', items: [] })
  const [frequent, setFrequent] = useState([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [newFrequent, setNewFrequent] = useState('')
  const [showFrequent, setShowFrequent] = useState(false)

  const load = async () => {
    try {
      const [s, f] = await Promise.all([getShopping(), getFrequent()])
      setShopping(s)
      setFrequent(f)
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCheck = async (id, checked) => {
    await checkShoppingItem(id, !checked)
    setShopping((prev) => ({
      ...prev,
      items: prev.items.map((i) => i.id === id ? { ...i, is_checked: !checked } : i),
    }))
  }

  const handleDelete = async (id) => {
    await deleteShoppingItem(id)
    setShopping((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }))
  }

  const handleAddItem = async () => {
    if (!newItem.trim()) return
    try {
      const item = await addShoppingItem(newItem.trim(), null, null)
      setShopping((prev) => ({ ...prev, items: [...prev.items, item] }))
      setNewItem('')
    } catch (e) { toast.error(e.message) }
  }

  const handleCopy = () => {
    const unchecked = shopping.items.filter((i) => !i.is_checked).map((i) => `- ${i.name} ${i.quantity || ''}`).join('\n')
    navigator.clipboard.writeText(unchecked)
    toast.success('복사했어요')
  }

  const handleAddFrequent = async () => {
    if (!newFrequent.trim()) return
    try {
      const item = await addFrequent(newFrequent.trim())
      setFrequent((prev) => [...prev, item])
      setNewFrequent('')
    } catch (e) { toast.error(e.message) }
  }

  const handleFrequentToList = async (name) => {
    try {
      const item = await addShoppingItem(name, null, null)
      setShopping((prev) => ({ ...prev, items: [...prev.items, item] }))
      toast.success(`${name} 추가됐어요`)
    } catch (e) { toast.error(e.message) }
  }

  // 카테고리별 그룹핑
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = shopping.items.filter((i) => i.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})
  const uncategorized = shopping.items.filter((i) => !i.category || !CATEGORIES.includes(i.category))
  if (uncategorized.length) grouped['기타'] = [...(grouped['기타'] || []), ...uncategorized.filter(i => !grouped['기타']?.includes(i))]

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">장보기 🛒</h1>
        <button onClick={handleCopy} className="text-sm text-green-600 border border-green-300 px-3 py-1 rounded-full">
          복사
        </button>
      </div>

      {shopping.week_start && (
        <p className="text-xs text-gray-400 mb-3">{shopping.week_start} 주 기준</p>
      )}

      {/* 아이템 목록 */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-4">
          <h2 className="text-xs font-semibold text-gray-500 mb-1">{cat}</h2>
          <div className="space-y-1">
            {items.map((item) => (
              <div key={item.id} className={`flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm ${item.is_checked ? 'opacity-50' : ''}`}>
                <button onClick={() => handleCheck(item.id, item.is_checked)}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 ${item.is_checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
                />
                <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-gray-400' : ''}`}>
                  {item.name} <span className="text-gray-400">{item.quantity}</span>
                </span>
                <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {shopping.items.length === 0 && (
        <p className="text-center text-gray-400 py-8 text-sm">
          식단 추천 후 장보기 리스트를 만들어보세요
        </p>
      )}

      {/* 수동 추가 */}
      <div className="flex gap-2 mt-4">
        <input
          className="flex-1 border rounded-xl px-3 py-2 text-sm"
          placeholder="+ 항목 직접 추가"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
        />
        <button onClick={handleAddItem} className="bg-green-500 text-white px-4 rounded-xl text-sm">추가</button>
      </div>

      {/* 자주 사는 물품 */}
      <div className="mt-4">
        <button
          onClick={() => setShowFrequent((v) => !v)}
          className="text-sm text-gray-600 font-semibold"
        >
          자주 사는 물품 {showFrequent ? '▲' : '▼'}
        </button>
        {showFrequent && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {frequent.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFrequentToList(f.name)}
                  className="bg-gray-100 text-sm px-3 py-1 rounded-full"
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-2 py-1 text-sm"
                placeholder="자주 사는 물품 추가"
                value={newFrequent}
                onChange={(e) => setNewFrequent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFrequent()}
              />
              <button onClick={handleAddFrequent} className="bg-gray-200 text-sm px-3 py-1 rounded-lg">+</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 전체 흐름 E2E 확인**

```
1. http://localhost:5173/ — 식단 추천 요청
2. /meals/result — 결과 확인, 재추천, 삭제
3. 레시피 클릭 → /recipes/:menuName — 레시피 상세
4. 인분 변경 → 레시피 재생성 (캐시 미스)
5. 즐겨찾기 추가 → /recipes 에서 목록 확인
6. 장보기 만들기 → /shopping — 체크, 복사
7. /settings — 태그/조미료 수정
```

- [ ] **Step 4: 최종 commit**

```bash
cd D:/Projects/haemeoktime
git add frontend/src/pages/Recipes/RecipesPage.jsx frontend/src/pages/Shopping/ShoppingPage.jsx
git commit -m "feat: recipes page and shopping list - full frontend complete"
```
