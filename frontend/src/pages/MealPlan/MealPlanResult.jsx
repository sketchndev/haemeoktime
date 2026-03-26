import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useMealPlan } from '../../contexts/MealPlanContext'
import { reRecommendSingle, reRecommendMealType, deleteHistoryItem, getWeekMeals, approvePlan, getApprovalStatus } from '../../api/meals'
import { generateShopping } from '../../api/shopping'

const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export default function MealPlanResult() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromWeekView = location.state?.fromWeekView === true
  const { plan, setPlan, ingredients, approved, setApproved, updateMenu, replaceMeal, removeMenu } = useMealPlan()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)

  useEffect(() => {
    if (!plan) {
      setFetchLoading(true)
      Promise.all([getWeekMeals(), getApprovalStatus()])
        .then(([data, statusData]) => {
          if (data?.days?.length > 0) setPlan(data)
          if (statusData?.approved) setApproved(true)
        })
        .catch(() => {})
        .finally(() => setFetchLoading(false))
    }
  }, [])

  useEffect(() => {
    const target =
      plan?.days?.find((d) => d.date === todayStr)?.date ||
      plan?.days?.[0]?.date ||
      ''
    setSelectedDate(target)
  }, [plan])
  const [loading, setLoading] = useState({})
  const [shoppingLoading, setShoppingLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)

  const handleApprove = async () => {
    setApproveLoading(true)
    try {
      await approvePlan()
      setApproved(true)
      toast.success('식단을 확정했어요!')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setApproveLoading(false)
    }
  }

  if (fetchLoading) {
    return (
      <div className="p-4 text-center text-gray-400 py-20">
        <p>식단을 불러오는 중...</p>
      </div>
    )
  }

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
    setShoppingLoading(true)
    try {
      await generateShopping(allMenus)
      navigate('/shopping')
      toast.success('장보기 리스트를 만들었어요')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setShoppingLoading(false)
    }
  }

  const currentDay = plan.days.find((d) => d.date === selectedDate) || plan.days[0]

  const Spinner = () => <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate('/')} className="text-xl">←</button>
        <h1 className="text-lg font-bold flex-1">
          {plan.days.length === 1 ? '오늘 식단' : `${plan.days.length}일 식단`}
        </h1>
      </div>

      {(() => {
        const displayIngredients = fromWeekView ? plan.available_ingredients : ingredients
        return displayIngredients ? (
          <div className="bg-amber-50 rounded-xl px-3 py-2 mb-4 text-sm text-amber-800">
            <span className="font-semibold">집에 있는 재료: </span>{displayIngredients}
          </div>
        ) : null
      })()}

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {plan.days.map((day) => {
          const d = new Date(day.date + 'T00:00:00')
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
                    className="text-xs text-green-600 border border-green-300 px-2 py-1 rounded-full disabled:opacity-50 flex items-center gap-1"
                  >
                    {loading[mealKey] ? <><Spinner /> 바꾸는 중</> : '🔀 전체 바꾸기'}
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
                          className="text-xs text-blue-500 border border-blue-200 px-2 py-0.5 rounded-full disabled:opacity-50 flex items-center gap-1"
                        >
                          {loading[`single-${menu.history_id}`] ? <><Spinner /> 바꾸는 중</> : '🔀 바꾸기'}
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

              {!meal.is_school_meal && menuNames.length >= 2 && (
                <button
                  onClick={() => navigate(
                    `/meals/result/${currentDay.date}/${meal.meal_type}/cooking`,
                    { state: { menus: menuNames } }
                  )}
                  className="mt-2 w-full text-xs text-amber-600 border border-amber-300 py-1 rounded-lg"
                >
                  ⚡ 한꺼번에 요리하기
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!approved ? (
        <button
          onClick={handleApprove}
          disabled={approveLoading || Object.values(loading).some(Boolean)}
          className="mt-4 w-full bg-blue-500 text-white py-3 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {approveLoading ? (
            <><Spinner /> 확정하는 중...</>
          ) : (
            '✅ 이 식단으로 확정'
          )}
        </button>
      ) : (
        <button
          onClick={handleGenerateShopping}
          disabled={shoppingLoading || Object.values(loading).some(Boolean)}
          className="mt-4 w-full bg-green-500 text-white py-3 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {shoppingLoading ? (
            <><Spinner /> 장보기 리스트 만드는 중...</>
          ) : (
            '🛒 장보기 리스트 만들기'
          )}
        </button>
      )}
    </div>
  )
}
