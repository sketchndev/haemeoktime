const KEY = (menuName, servings) => `recipe:${menuName}:${servings}`
const COMBINED_KEY = (key) => `combined:v4:${typeof key === 'string' ? key : [...key].sort().join(',')}`
const MAIN_INGREDIENT_KEY = (menuName) => `main_ing:${menuName}`

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

export const getMainIngredient = (menuName) => {
  try {
    const raw = localStorage.getItem(MAIN_INGREDIENT_KEY(menuName))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const setMainIngredient = (menuName, data) => {
  try {
    localStorage.setItem(MAIN_INGREDIENT_KEY(menuName), JSON.stringify(data))
  } catch {}
}

export const getCombinedCooking = (menus) => {
  try {
    const raw = localStorage.getItem(COMBINED_KEY(menus))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const setCombinedCooking = (menus, data) => {
  try {
    localStorage.setItem(COMBINED_KEY(menus), JSON.stringify(data))
  } catch {
    // localStorage 가득 찼을 때 무시
  }
}
