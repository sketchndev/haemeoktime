import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ProfileProvider } from './contexts/ProfileContext'
import { MealPlanProvider } from './contexts/MealPlanContext'
import BottomNav from './components/BottomNav'

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
