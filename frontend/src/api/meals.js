import client, { fetchSSE } from './client'
import { setMainIngredient } from './recipeCache'

function cacheMenuIngredient(menu) {
  if (menu?.main_ingredient) {
    setMainIngredient(menu.name, {
      menu: menu.name,
      main_ingredient: menu.main_ingredient,
      unit: menu.main_ingredient_unit || 'g',
    })
  }
  return menu
}

function cachePlanIngredients(data) {
  for (const day of data?.days || []) {
    for (const meal of day.meals || []) {
      for (const menu of meal.menus || []) {
        cacheMenuIngredient(menu)
      }
    }
  }
  return data
}

export const recommendMeals = (body) => client.post('/meals/recommend', body).then(cachePlanIngredients)

export const recommendMealsStream = (body, onProgress) =>
  fetchSSE('/meals/recommend/stream', body, onProgress).then(cachePlanIngredients)
export const reRecommendSingle = (body) => client.post('/meals/recommend/single', body).then(cacheMenuIngredient)
export const reRecommendMealType = (body) => client.post('/meals/recommend/meal-type', body).then(data => {
  (data.menus || []).forEach(cacheMenuIngredient)
  return data
})
export const deleteHistoryItem = (id) => client.delete(`/meals/history/${id}`)
export const getTodayMeals = () => client.get('/meals/today')
export const getWeekMeals = () => client.get('/meals/week')
export const approvePlan = () => client.put('/meals/approve')
export const getApprovalStatus = () => client.get('/meals/approval-status')
