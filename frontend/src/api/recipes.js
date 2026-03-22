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
