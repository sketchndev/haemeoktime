import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { extractMainIngredients, generateCombinedCooking, addFavorite, getFavorites, deleteFavorite } from '../../api/recipes'
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

  const [phase, setPhase] = useState('select') // 'select' | 'loading' | 'result'
  const [tab, setTab] = useState('servings') // 'servings' | 'ingredient'
  const [ingredients, setIngredients] = useState([]) // [{menu, main_ingredient}]
  const [weights, setWeights] = useState({}) // {menuName: grams}
  const [servings, setServings] = useState(2)
  const [ingredientLoading, setIngredientLoading] = useState(false)
  const [ingredientLoaded, setIngredientLoaded] = useState(false)
  const [result, setResult] = useState(null)
  const [favorited, setFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)

  // 메인 재료 추출 (재료 탭 선택 시 lazy load)
  useEffect(() => {
    if (tab !== 'ingredient' || ingredientLoaded || menus.length === 0) return
    setIngredientLoading(true)
    extractMainIngredients(menus)
      .then((data) => { setIngredients(data); setIngredientLoaded(true) })
      .catch((e) => {
        toast.error('재료 정보를 불러오지 못했어요')
        setTab('servings')
      })
      .finally(() => setIngredientLoading(false))
  }, [tab])

  const handleStart = () => {
    setPhase('loading')
    let opts
    if (tab === 'ingredient') {
      // {menuName: "300g"} 또는 {menuName: "3개"} 형태로 단위 포함
      const withUnits = {}
      for (const [menu, amount] of Object.entries(weights)) {
        const unit = ingredients.find(i => i.menu === menu)?.unit || 'g'
        withUnits[menu] = `${amount}${unit}`
      }
      opts = { mainIngredientWeights: Object.keys(withUnits).length > 0 ? withUnits : null, servings: null }
    } else {
      opts = { servings, mainIngredientWeights: null }
    }

    generateCombinedCooking(date, mealType, menus, opts)
      .then((data) => { setResult(data); setPhase('result') })
      .catch((e) => { toast.error(e.message); setPhase('select') })
  }

  const combinedName = menus.join(' + ')

  // Check if this combined recipe is already favorited
  useEffect(() => {
    if (menus.length === 0) return
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.menu_name === combinedName && f.recipe_type === 'combined')
      if (fav) { setFavorited(true); setFavoriteId(fav.id) }
    }).catch(() => {})
  }, [])

  const toggleFavorite = async () => {
    if (!result) return
    try {
      if (favorited && favoriteId) {
        await deleteFavorite(favoriteId)
        setFavorited(false); setFavoriteId(null)
        toast.success('즐겨찾기에서 삭제했어요')
      } else {
        const recipeData = result ? {
          total_minutes: result.total_minutes,
          optimized_minutes: result.optimized_minutes,
          ingredients: result.ingredients,
          steps: result.steps,
          menus: [...menus],
        } : null
        const res = await addFavorite(combinedName, 'combined', recipeData)
        setFavorited(true); setFavoriteId(res.id)
        toast.success('즐겨찾기에 추가했어요')
      }
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (menus.length === 0 && !ingredientLoading) {
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
        <h1 className="text-lg font-bold flex-1">⚡ 함께 요리하기</h1>
        {phase === 'result' && (
          <button onClick={toggleFavorite} className="text-2xl">{favorited ? '♥' : '♡'}</button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">{menus.join(' + ')}</p>

      {/* 분량 선택 화면 */}
      {phase === 'select' && (
        <>
          {/* 탭 */}
              <div className="flex rounded-lg bg-gray-100 p-0.5 mb-4">
                <button
                  onClick={() => setTab('servings')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    tab === 'servings' ? 'bg-white shadow text-green-600' : 'text-gray-500'
                  }`}
                >
                  인원 기준
                </button>
                <button
                  onClick={() => setTab('ingredient')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    tab === 'ingredient' ? 'bg-white shadow text-green-600' : 'text-gray-500'
                  }`}
                >
                  메인 재료 기준
                </button>
              </div>

              {/* 메인 재료 기준 탭 */}
              {tab === 'ingredient' && ingredientLoading && (
                <LoadingSpinner text="재료 정보를 불러오는 중..." />
              )}
              {tab === 'ingredient' && !ingredientLoading && (
                <div className="space-y-3 mb-4">
                  {ingredients.map((item) => (
                    <div key={item.menu} className="bg-white rounded-xl p-3 shadow-sm">
                      <p className="text-xs text-gray-400 mb-1">{item.menu}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium flex-1">{item.main_ingredient}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="0"
                          value={weights[item.menu] || ''}
                          onChange={(e) => {
                            const v = e.target.value
                            setWeights(prev => {
                              if (!v) { const { [item.menu]: _, ...rest } = prev; return rest }
                              return { ...prev, [item.menu]: parseInt(v) }
                            })
                          }}
                          className="w-20 text-right border rounded-lg px-2 py-1.5 text-sm"
                        />
                        <span className="text-sm text-gray-500">{item.unit || 'g'}</span>
                      </div>
                    </div>
                  ))}
                  {ingredients.length > 0 && Object.keys(weights).length === 0 && (
                    <p className="text-xs text-amber-500 text-center">
                      최소 1개 메뉴의 양을 입력해주세요
                    </p>
                  )}
                </div>
              )}

              {/* 인분 기준 탭 */}
              {tab === 'servings' && (
                <div className="bg-white rounded-xl p-6 shadow-sm mb-4 flex items-center justify-center gap-4">
                  <button
                    onClick={() => setServings(s => Math.max(1, s - 1))}
                    className="w-10 h-10 rounded-full border-2 border-gray-300 text-lg font-bold text-gray-600 flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-2xl font-bold w-16 text-center">{servings}인분</span>
                  <button
                    onClick={() => setServings(s => Math.min(10, s + 1))}
                    className="w-10 h-10 rounded-full border-2 border-green-400 text-lg font-bold text-green-600 flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={ingredientLoading || (tab === 'ingredient' && Object.keys(weights).length === 0)}
                className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold disabled:opacity-40"
              >
                요리 시작
          </button>
        </>
      )}

      {/* 로딩 */}
      {phase === 'loading' && <LoadingSpinner text="AI가 최적 순서를 계산 중..." />}

      {/* 결과 */}
      {phase === 'result' && result && (
        <>
          <div className="bg-amber-50 rounded-xl p-3 mb-4 text-sm">
            <span className="text-gray-500">개별 합산</span>
            <span className="line-through ml-2 text-gray-400">{result.total_minutes}분</span>
            <span className="mx-2">→</span>
            <span className="font-bold text-amber-600">{result.optimized_minutes}분</span>
          </div>
          {result.ingredients?.length > 0 && (
            <div className="space-y-3 mb-4">
              {result.ingredients.map((group, i) => (
                <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-sm font-semibold mb-2">{group.menu}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {group.items.map((item, j) => (
                      <span key={j} className="text-sm text-gray-600">
                        {item.name} <span className="text-green-600 font-medium">{item.amount}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="text-sm font-bold mb-2">조리 순서</h2>
          <div className="space-y-3">
            {result.steps.map((step, i) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
                <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                  {step.menu_tag}
                </span>
                <p className="text-sm font-medium mt-1">{i + 1}. {step.label}</p>
                <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                  {(step.actions || [step.description]).map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
