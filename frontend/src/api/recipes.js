import client, { fetchSSE } from './client'
import { getRecipe, setRecipe, getMainIngredient, setMainIngredient, getCombinedCooking, setCombinedCooking, getAnyCachedRecipe } from './recipeCache'

export const generateRecipe = async (menuName, servings, mainIngredientWeight = null, userContext = null) => {
  if (!userContext) {
    const cached = getRecipe(menuName, servings)
    if (cached) return cached
  }
  const data = await client.post('/recipes/generate', {
    menu_name: menuName, servings, main_ingredient_weight: mainIngredientWeight,
    ...(userContext ? { user_context: userContext } : {}),
  })
  setRecipe(menuName, servings, data)
  if (data.main_ingredient) {
    setMainIngredient(menuName, {
      menu: menuName,
      main_ingredient: data.main_ingredient,
      unit: data.main_ingredient_unit || 'g',
    })
  }
  return data
}

export const generateRecipeStream = async (menuName, servings, mainIngredientWeight = null, userContext = null, onProgress) => {
  if (!userContext) {
    const cached = getRecipe(menuName, servings)
    if (cached) return cached
  }
  const data = await fetchSSE('/recipes/generate/stream', {
    menu_name: menuName, servings, main_ingredient_weight: mainIngredientWeight,
    ...(userContext ? { user_context: userContext } : {}),
  }, onProgress)
  setRecipe(menuName, servings, data)
  if (data.main_ingredient) {
    setMainIngredient(menuName, {
      menu: menuName,
      main_ingredient: data.main_ingredient,
      unit: data.main_ingredient_unit || 'g',
    })
  }
  return data
}

export { getMainIngredient, getAnyCachedRecipe }

export const extractMainIngredients = async (menus) => {
  const data = await client.post('/recipes/extract-main-ingredients', { menus })
  return data.ingredients
}

export const generateCombinedCooking = async (date, mealType, menus, { servings = null, mainIngredientWeights = null, userContext = null } = {}) => {
  if (!userContext) {
    const cacheKey = JSON.stringify({ menus: [...menus].sort(), servings, mainIngredientWeights })
    const cached = getCombinedCooking(cacheKey)
    if (cached) return cached
  }
  const data = await client.post('/recipes/combined-cooking', {
    date, meal_type: mealType, menus,
    servings, main_ingredient_weights: mainIngredientWeights,
    ...(userContext ? { user_context: userContext } : {}),
  })
  const cacheKey = JSON.stringify({ menus: [...menus].sort(), servings, mainIngredientWeights })
  setCombinedCooking(cacheKey, data)
  return data
}

export const generateCombinedCookingStream = async (date, mealType, menus, { servings = null, mainIngredientWeights = null, userContext = null } = {}, onProgress) => {
  if (!userContext) {
    const cacheKey = JSON.stringify({ menus: [...menus].sort(), servings, mainIngredientWeights })
    const cached = getCombinedCooking(cacheKey)
    if (cached) return cached
  }
  const data = await fetchSSE('/recipes/combined-cooking/stream', {
    date, meal_type: mealType, menus,
    servings, main_ingredient_weights: mainIngredientWeights,
    ...(userContext ? { user_context: userContext } : {}),
  }, onProgress)
  const cacheKey = JSON.stringify({ menus: [...menus].sort(), servings, mainIngredientWeights })
  setCombinedCooking(cacheKey, data)
  return data
}

export const getFavorites = () => client.get('/recipes/favorites')
export const addFavorite = (menuName, recipeType = 'individual', recipeData = null) =>
  client.post('/recipes/favorites', { menu_name: menuName, recipe_type: recipeType, recipe_data: recipeData })
export const deleteFavorite = (id) => client.delete(`/recipes/favorites/${id}`)
