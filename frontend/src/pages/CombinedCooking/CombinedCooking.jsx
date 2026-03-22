import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { generateCombinedCooking } from '../../api/recipes'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function CombinedCooking() {
  const navigate = useNavigate()
  const { date, mealType } = useParams()
  const { state } = useLocation()
  const menus = state?.menus || []
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    generateCombinedCooking(date, mealType, menus)
      .then(setResult)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

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
