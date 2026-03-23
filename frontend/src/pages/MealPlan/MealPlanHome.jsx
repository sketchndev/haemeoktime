import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { recommendMeals, getTodayMeals, getWeekMeals } from '../../api/meals'
import { useMealPlan } from '../../contexts/MealPlanContext'
import LoadingSpinner from '../../components/LoadingSpinner'

const PERIODS = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'custom', label: '📅 직접 선택' },
]
const MEAL_TYPES = [
  { key: 'breakfast', label: '아침' },
  { key: 'lunch', label: '점심' },
  { key: 'dinner', label: '저녁' },
]

const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }

function isPastMeal(mealType) {
  const hour = new Date().getHours()
  if (mealType === 'breakfast') return hour >= 10
  if (mealType === 'lunch') return hour >= 15
  return false
}

export default function MealPlanHome() {
  const navigate = useNavigate()
  const { setPlan } = useMealPlan()
  const [period, setPeriod] = useState('today')
  const [mealTypes, setMealTypes] = useState(['breakfast', 'lunch', 'dinner'])
  const [useSchoolMeals, setUseSchoolMeals] = useState(false)
  const [ingredients, setIngredients] = useState('')
  const [loading, setLoading] = useState(false)
  const [todayPlan, setTodayPlan] = useState(null)
  const [todayLoading, setTodayLoading] = useState(true)  // true: avoid flash before fetch
  const [weekLoading, setWeekLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    getTodayMeals()
      .then((data) => setTodayPlan(data))
      .catch(() => {}) // silent fail — show form only
      .finally(() => setTodayLoading(false))
  }, [])

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const computeDates = () => {
    if (period !== 'custom' || !startDate || !endDate) return []
    const dates = []
    const current = new Date(startDate)
    const end = new Date(endDate)
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }
    return dates
  }

  const toggleMealType = (key) => {
    setMealTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const handleRecommend = async () => {
    if (mealTypes.length === 0) {
      toast.error('끼니를 하나 이상 선택해주세요')
      return
    }
    setLoading(true)
    try {
      const computedDates = computeDates()
      const result = await recommendMeals({
        period: period === 'custom' ? 'custom' : period,
        dates: computedDates,
        meal_types: mealTypes,
        available_ingredients: ingredients,
        use_school_meals: useSchoolMeals,
      })
      setPlan(result)
      navigate('/meals/result')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleViewWeek = async () => {
    setWeekLoading(true)
    try {
      const result = await getWeekMeals()
      setPlan(result)
      navigate('/meals/result')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setWeekLoading(false)
    }
  }

  if (loading) return <LoadingSpinner text="AI가 식단을 추천 중..." />

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">해먹타임 🍽</h1>
      </div>

      {!todayLoading && todayPlan?.days?.length > 0 && (() => {
        const todayDate = todayPlan.days[0].date
        const visibleMeals = todayPlan.days[0].meals.filter(
          (m) => m.menus.length > 0 && !isPastMeal(m.meal_type)
        )
        if (visibleMeals.length === 0) return null
        return (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">오늘 식단</h2>
            <div className="space-y-2">
              {visibleMeals.map((meal) => {
                const menuNames = meal.menus.map((m) => m.name)
                const handleRecipe = () => {
                  if (menuNames.length >= 2) {
                    navigate(
                      `/meals/result/${todayDate}/${meal.meal_type}/cooking`,
                      { state: { menus: menuNames } }
                    )
                  } else {
                    navigate(`/recipes/${encodeURIComponent(menuNames[0])}`)
                  }
                }
                return (
                  <div key={meal.meal_type} className="bg-white rounded-xl shadow-sm p-3">
                    <p className="font-semibold text-sm mb-1">{MEAL_LABELS[meal.meal_type]}</p>
                    <p className="text-sm text-gray-700 mb-2">
                      {menuNames.join('  •  ')}
                    </p>
                    <button
                      onClick={handleRecipe}
                      className="text-xs text-amber-600 border border-amber-300 px-3 py-1 rounded-full"
                    >
                      🍳 레시피 보기
                    </button>
                  </div>
                )
              })}
            </div>
            <button
              onClick={handleViewWeek}
              disabled={weekLoading}
              className="mt-3 w-full text-sm text-green-700 border border-green-300 py-2 rounded-xl"
            >
              {weekLoading ? '...' : '📅 이번 주 식단 보기'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 w-full text-sm text-gray-600 border border-gray-300 py-2 rounded-xl"
            >
              ✨ 새로 추천받기
            </button>
          </section>
        )
      })()}

      {(!todayLoading && (!todayPlan?.days?.length || showForm)) && <>
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">기간</h2>
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  period === key ? 'bg-green-500 text-white' : 'bg-white border text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex gap-2 mt-2 items-center">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm"
              />
              <span className="text-gray-400 text-sm">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm"
              />
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">끼니</h2>
          <div className="flex gap-2">
            {MEAL_TYPES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleMealType(key)}
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  mealTypes.includes(key) ? 'bg-green-500 text-white' : 'bg-white border text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
          <span className="text-sm">🏫 급식 연동</span>
          <button
            onClick={() => setUseSchoolMeals((v) => !v)}
            className={`w-12 h-6 rounded-full transition-colors ${useSchoolMeals ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${useSchoolMeals ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">집에 있는 재료</h2>
          <textarea
            className="w-full border rounded-xl px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="예) 냉장고에 두부, 애호박 있어요"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
          />
        </section>

        <button
          onClick={handleRecommend}
          className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg"
        >
          ✨ 식단 추천받기
        </button>
      </>}
    </div>
  )
}
