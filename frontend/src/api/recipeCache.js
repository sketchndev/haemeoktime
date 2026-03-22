const KEY = (menuName, servings) => `recipe:${menuName}:${servings}`

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
