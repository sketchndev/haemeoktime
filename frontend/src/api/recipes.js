import client from './client'
import { getRecipe, setRecipe, getCombinedCooking, setCombinedCooking } from './recipeCache'

export const generateRecipe = async (menuName, servings, mainIngredientWeight = null) => {
  const cached = getRecipe(menuName, servings)
  if (cached) return cached
  const data = await client.post('/recipes/generate', {
    menu_name: menuName, servings, main_ingredient_weight: mainIngredientWeight,
  })
  setRecipe(menuName, servings, data)
  return data
}

export const extractMainIngredients = async (menus) => {
  const data = await client.post('/recipes/extract-main-ingredients', { menus })
  return data.ingredients
}

export const generateCombinedCooking = async (date, mealType, menus, { servings = null, mainIngredientWeights = null } = {}) => {
  const cacheKey = JSON.stringify({ menus: [...menus].sort(), servings, mainIngredientWeights })
  const cached = getCombinedCooking(cacheKey)
  if (cached) return cached
  const data = await client.post('/recipes/combined-cooking', {
    date, meal_type: mealType, menus,
    servings, main_ingredient_weights: mainIngredientWeights,
  })
  setCombinedCooking(cacheKey, data)
  return data
}

export const getFavorites = () => client.get('/recipes/favorites')
export const addFavorite = (menuName, recipeType = 'individual', recipeData = null) =>
  client.post('/recipes/favorites', { menu_name: menuName, recipe_type: recipeType, recipe_data: recipeData })
export const deleteFavorite = (id) => client.delete(`/recipes/favorites/${id}`)
