import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { generateCombinedCooking } from '../../api/recipes'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useMealPlan } from '../../contexts/MealPlanContext'

export default function CombinedCooking() {
  const navigate = useNavigate()
  const { date, mealType } = useParams()
  const { state } = useLocation()
  const { plan } = useMealPlan()

  let menus = state?.menus
  if (!menus && plan) {
    const day = plan.days.find(d => d.date === date)
    const meal = day?.meals.find(m => m.meal_type === mealType)
    menus = meal?.menus.map(m => m.name) ?? []
  }
  menus = menus ?? []
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (menus.length === 0) {
      setLoading(false)
      return
    }
    generateCombinedCooking(date, mealType, menus)
      .then(setResult)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (!loading && menus.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="text-xl">←</button>
          <h1 className="text-lg font-bold">⚡ 함께 요리하기</h1>
        </div>
        <p className="text-center text-gray-400 py-8 text-sm">메뉴 정보를 찾을 수 없어요</p>
        <button onClick={() => navigate(-1)} className="w-full border rounded-xl py-2 text-sm text-gray-600">
          뒤로 가기
        </button>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-lg font-bold">⚡ 함께 요리하기</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">{menus.join(' + ')}</p>

      {loading ? <LoadingSpinner text="AI가 최적 순서를 계산 중..." /> : result && (
        <>
          <div className="bg-amber-50 rounded-xl p-3 mb-4 text-sm">
            <span className="text-gray-500">개별 합산</span>
            <span className="line-through ml-2 text-gray-400">{result.total_minutes}분</span>
            <span className="mx-2">→</span>
            <span className="font-bold text-amber-600">{result.optimized_minutes}분</span>
          </div>
          <div className="space-y-3">
            {result.steps.map((step, i) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                    {step.menu_tag}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{i + 1}. {step.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
