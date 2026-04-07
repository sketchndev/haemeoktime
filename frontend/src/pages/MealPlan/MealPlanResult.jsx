import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useMealPlan } from '../../contexts/MealPlanContext'
import { reRecommendSingle, reRecommendMealType, addHistoryItem, updateHistoryItem, deleteHistoryItem, deleteMealsByDate, getWeekMeals, approvePlan, getApprovalStatus, swapDates } from '../../api/meals'
import { generateShopping } from '../../api/shopping'

const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export default function MealPlanResult() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromWeekView = location.state?.fromWeekView === true
  const { plan, setPlan, ingredients, approved, setApproved, updateMenu, replaceMeal, addMenu, removeMenu, removeDateMeals, swapDays } = useMealPlan()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const [swapSource, setSwapSource] = useState(null)
  const longPressTimer = { current: null }

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
    if (!plan) return
    const dateExists = plan.days.some((d) => d.date === selectedDate)
    if (!selectedDate || !dateExists) {
      const target =
        plan.days.find((d) => d.date === todayStr)?.date ||
        plan.days[0]?.date ||
        ''
      setSelectedDate(target)
    }
  }, [plan])
  const [loading, setLoading] = useState({})
  const [shoppingLoading, setShoppingLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)
  const [editingMenu, setEditingMenu] = useState(null)  // { historyId, value }
  const [addingMeal, setAddingMeal] = useState(null)    // { mealType, value }


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

  const handleSwap = async (targetDate) => {
    if (!swapSource || swapSource === targetDate) {
      setSwapSource(null)
      return
    }
    try {
      await swapDates(swapSource, targetDate)
      swapDays(swapSource, targetDate)
      const d1 = new Date(swapSource + 'T00:00:00')
      const d2 = new Date(targetDate + 'T00:00:00')
      toast.success(`${d1.getMonth()+1}/${d1.getDate()} ↔ ${d2.getMonth()+1}/${d2.getDate()} 식단을 교환했어요`)
    } catch (e) {
      toast.error(e.message)
    }
    setSwapSource(null)
  }

  const startLongPress = (date) => {
    longPressTimer.current = setTimeout(() => {
      setSwapSource(date)
      setSelectedDate(date)
    }, 700)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const editSubmittedRef = useRef(false)

  const handleEditMenu = async (date, mealType, historyId) => {
    if (editSubmittedRef.current) return
    const newName = editingMenu?.value?.trim()
    if (!newName) {
      setEditingMenu(null)
      return
    }
    editSubmittedRef.current = true
    try {
      const result = await updateHistoryItem(historyId, newName)
      updateMenu(date, mealType, historyId, result)
      toast.success(`메뉴를 "${newName}"(으)로 변경했어요`)
    } catch (e) {
      toast.error(e.message)
    }
    setEditingMenu(null)
    editSubmittedRef.current = false
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

  const handleDeleteDate = async (date) => {
    if (!confirm(`${date} 식단을 삭제할까요?`)) return
    try {
      await deleteMealsByDate(date)
      removeDateMeals(date)
      toast.success('해당 날짜 식단을 삭제했어요')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleAddMenu = async (date, mealType) => {
    const name = addingMeal?.value?.trim()
    if (!name) {
      setAddingMeal(null)
      return
    }
    try {
      const result = await addHistoryItem(date, mealType, name)
      addMenu(date, mealType, result)
      toast.success(`"${name}" 메뉴를 추가했어요`)
    } catch (e) {
      toast.error(e.message)
    }
    setAddingMeal(null)
  }

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

      {swapSource && (
        <div className="bg-blue-50 rounded-xl px-3 py-2 mb-2 text-sm text-blue-700 flex items-center justify-between">
          <span>교환할 날짜를 선택하세요</span>
          <button onClick={() => setSwapSource(null)} className="text-blue-400 text-xs">취소</button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {plan.days.map((day) => {
          const d = new Date(day.date + 'T00:00:00')
          const isSwapSource = swapSource === day.date
          const isSwapTarget = swapSource && swapSource !== day.date
          let tabClass = 'flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium '
          if (isSwapSource) {
            tabClass += 'bg-blue-500 text-white ring-2 ring-blue-300'
          } else if (isSwapTarget) {
            tabClass += 'bg-white border-2 border-dashed border-blue-400 text-blue-600'
          } else if (day.date === selectedDate) {
            tabClass += 'bg-green-500 text-white'
          } else {
            tabClass += 'bg-white border'
          }
          return (
            <button
              key={day.date}
              onClick={() => swapSource ? handleSwap(day.date) : setSelectedDate(day.date)}
              onPointerDown={() => !swapSource && startLongPress(day.date)}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onContextMenu={(e) => e.preventDefault()}
              className={tabClass}
            >
              {DAY_NAMES[d.getDay()]}
              <div className="text-xs">{d.getMonth() + 1}/{d.getDate()}</div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">
          {(() => { const d = new Date(currentDay.date + 'T00:00:00'); return `${d.getMonth()+1}/${d.getDate()} (${DAY_NAMES[d.getDay()]})` })()}
        </span>
        <button
          onClick={() => handleDeleteDate(currentDay.date)}
          className="text-gray-400 hover:text-red-500 p-1"
          title="이 날 식단 삭제"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
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
                {meal.menus.map((menu) => {
                  const isEditing = editingMenu?.historyId === menu.history_id
                  return (
                    <div key={menu.history_id}>
                      {isEditing ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleEditMenu(currentDay.date, meal.meal_type, menu.history_id) }}
                          className="flex gap-1.5 items-center"
                        >
                          <input
                            autoFocus
                            value={editingMenu.value}
                            onChange={(e) => setEditingMenu((prev) => ({ ...prev, value: e.target.value }))}
                            onBlur={() => handleEditMenu(currentDay.date, meal.meal_type, menu.history_id)}
                            className="flex-1 border rounded-lg px-2 py-1 text-sm"
                            placeholder="메뉴명 입력"
                          />
                          <button type="submit" className="text-xs text-green-600 border border-green-300 px-2 py-1 rounded-full">확인</button>
                          <button type="button" onClick={() => setEditingMenu(null)} className="text-xs text-gray-400 px-1">취소</button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => navigate(`/recipes/${encodeURIComponent(menu.name)}`)}
                            className="text-sm text-left flex-1"
                          >
                            • {menu.name}
                          </button>
                          {!meal.is_school_meal && menu.history_id > 0 && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => setEditingMenu({ historyId: menu.history_id, value: menu.name })}
                                className="text-xs text-gray-500 px-1"
                              >
                                ✏️
                              </button>
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
                      )}
                    </div>
                  )
                })}
              </div>

              {!meal.is_school_meal && (
                addingMeal?.mealType === meal.meal_type ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleAddMenu(currentDay.date, meal.meal_type) }}
                    className="mt-2 flex gap-1.5 items-center"
                  >
                    <input
                      autoFocus
                      value={addingMeal.value}
                      onChange={(e) => setAddingMeal((prev) => ({ ...prev, value: e.target.value }))}
                      onBlur={() => { if (!addingMeal?.value?.trim()) setAddingMeal(null) }}
                      className="flex-1 border rounded-lg px-2 py-1 text-sm"
                      placeholder="메뉴명 입력"
                    />
                    <button type="submit" className="text-xs text-green-600 border border-green-300 px-2 py-1 rounded-full">추가</button>
                    <button type="button" onClick={() => setAddingMeal(null)} className="text-xs text-gray-400 px-1">취소</button>
                  </form>
                ) : (
                  <button
                    onClick={() => setAddingMeal({ mealType: meal.meal_type, value: '' })}
                    className="mt-2 w-full text-xs text-gray-400 border border-dashed border-gray-300 py-1.5 rounded-lg hover:text-green-600 hover:border-green-300"
                  >
                    + 메뉴 추가
                  </button>
                )
              )}

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
