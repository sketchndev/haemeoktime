import { createContext, useContext, useState } from 'react'

const MealPlanContext = createContext(null)

export function MealPlanProvider({ children }) {
  const [plan, setPlan] = useState(null)
  const [ingredients, setIngredients] = useState('')
  const [approved, setApproved] = useState(false)

  const updateMenu = (date, mealType, historyId, newMenu) => {
    setApproved(false)
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
    setApproved(false)
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

  const addMenu = (date, mealType, newMenu) => {
    setApproved(false)
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
                menus: [...meal.menus, newMenu],
              }
            ),
          }
        ),
      }
    })
  }

  const removeMenu = (date, mealType, historyId) => {
    setApproved(false)
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

  const removeDateMeals = (date) => {
    setApproved(false)
    setPlan((prev) => {
      if (!prev) return prev
      const newDays = prev.days.filter((day) => day.date !== date)
      return newDays.length === 0 ? null : { ...prev, days: newDays }
    })
  }

  const swapDays = (date1, date2) => {
    setPlan((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((day) => {
          if (day.date === date1) {
            const other = prev.days.find((d) => d.date === date2)
            return other ? { ...other, date: date1 } : day
          }
          if (day.date === date2) {
            const other = prev.days.find((d) => d.date === date1)
            return other ? { ...other, date: date2 } : day
          }
          return day
        }),
      }
    })
  }

  return (
    <MealPlanContext.Provider value={{ plan, setPlan, ingredients, setIngredients, approved, setApproved, updateMenu, replaceMeal, addMenu, removeMenu, removeDateMeals, swapDays }}>
      {children}
    </MealPlanContext.Provider>
  )
}

export const useMealPlan = () => useContext(MealPlanContext)
