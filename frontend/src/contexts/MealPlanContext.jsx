import { createContext, useContext, useState } from 'react'

const MealPlanContext = createContext(null)

export function MealPlanProvider({ children }) {
  const [plan, setPlan] = useState(null)
  const [ingredients, setIngredients] = useState('')

  const updateMenu = (date, mealType, historyId, newMenu) => {
    setPlan((prev) => {
      if (!prev) return prev
      return {
        ...prev,
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
        ...prev,
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
        ...prev,
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
    <MealPlanContext.Provider value={{ plan, setPlan, ingredients, setIngredients, updateMenu, replaceMeal, removeMenu }}>
      {children}
    </MealPlanContext.Provider>
  )
}

export const useMealPlan = () => useContext(MealPlanContext)
