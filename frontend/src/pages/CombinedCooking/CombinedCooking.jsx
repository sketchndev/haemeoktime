import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { extractMainIngredients, generateCombinedCooking, generateCombinedCookingStream, addFavorite, getFavorites, deleteFavorite, getMainIngredient } from '../../api/recipes'
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

  const [phase, setPhase] = useState('select')
  const [menuModes, setMenuModes] = useState(() => {
    const init = {}
    menus.forEach(m => { init[m] = 'servings' })
    return init
  })
  const [ingredients, setIngredients] = useState([])
  const [weights, setWeights] = useState({})
  const [servings, setServings] = useState(2)
  const [ingredientLoading, setIngredientLoading] = useState(false)
  const [ingredientLoaded, setIngredientLoaded] = useState(false)
  const [result, setResult] = useState(null)
  const [favorited, setFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState('')

  const hasIngredientMode = Object.values(menuModes).some(m => m === 'ingredient')

  useEffect(() => {
    if (!hasIngredientMode || ingredientLoaded || menus.length === 0) return

    const cached = []
    const uncachedMenus = []
    for (const menu of menus) {
      const info = getMainIngredient(menu)
      if (info) cached.push(info)
      else uncachedMenus.push(menu)
    }

    if (uncachedMenus.length === 0) {
      setIngredients(cached)
      setIngredientLoaded(true)
      return
    }

    setIngredientLoading(true)
    extractMainIngredients(uncachedMenus)
      .then((data) => {
        const all = [...cached, ...data]
        const ordered = menus.map(m => all.find(i => i.menu === m)).filter(Boolean)
        setIngredients(ordered)
        setIngredientLoaded(true)
      })
      .catch(() => {
        if (cached.length > 0) {
          const ordered = menus.map(m => cached.find(i => i.menu === m)).filter(Boolean)
          setIngredients(ordered)
          setIngredientLoaded(true)
          toast('일부 재료 정보만 불러왔어요', { icon: 'ℹ️' })
        } else {
          toast.error('재료 정보를 불러오지 못했어요')
          setMenuModes(prev => {
            const reset = { ...prev }
            Object.keys(reset).forEach(k => { if (reset[k] === 'ingredient') reset[k] = 'servings' })
            return reset
          })
        }
      })
      .finally(() => setIngredientLoading(false))
  }, [hasIngredientMode])

  const buildOpts = (userContext = null) => {
    const withUnits = {}
    for (const [menu, mode] of Object.entries(menuModes)) {
      if (mode === 'ingredient' && weights[menu]) {
        const unit = ingredients.find(i => i.menu === menu)?.unit || 'g'
        withUnits[menu] = `${weights[menu]}${unit}`
      }
    }
    return {
      servings,
      mainIngredientWeights: Object.keys(withUnits).length > 0 ? withUnits : null,
      ...(userContext ? { userContext } : {}),
    }
  }

  const ingredientMenusMissingWeight = Object.entries(menuModes)
    .filter(([_, mode]) => mode === 'ingredient')
    .some(([menu]) => !weights[menu])

  const handleStart = () => {
    if (ingredientMenusMissingWeight) {
      toast.error('재료 기준 메뉴의 양을 모두 입력해주세요')
      return
    }
    setPhase('loading')
    setProgress(0)
    setProgressStage('')
    generateCombinedCookingStream(
      date, mealType, menus, buildOpts(),
      ({ progress: p, stage: s }) => {
        if (p != null) setProgress(p)
        if (s) setProgressStage(s)
      },
    )
      .then((data) => { setResult(data); setPhase('result') })
      .catch((e) => { toast.error(e.message); setPhase('select') })
  }

  const combinedName = menus.join(' + ')

  useEffect(() => {
    if (menus.length === 0) return
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.menu_name === combinedName && f.recipe_type === 'combined')
      if (fav) { setFavorited(true); setFavoriteId(fav.id) }
    }).catch(() => {})
  }, [])

  const handleChatSubmit = () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatLoading(true)

    generateCombinedCooking(date, mealType, menus, buildOpts(msg))
      .then((data) => setResult(data))
      .catch((e) => toast.error(e.message))
      .finally(() => setChatLoading(false))
  }

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
          total_calories: result.total_calories,
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

  const getIngredientInfo = (menu) => ingredients.find(i => i.menu === menu)

  return (
    <div className={`p-4${phase === 'result' ? ' pb-24' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-lg font-bold flex-1">⚡ 함께 요리하기</h1>
        {phase === 'result' && (
          <button onClick={toggleFavorite} className="text-2xl">{favorited ? '♥' : '♡'}</button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">{menus.join(' + ')}</p>

      {phase === 'select' && (
        <>
          {/* 기본 인분 설정 */}
          <p className="text-xs font-semibold text-gray-500 mb-2">기본 인분</p>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-5 flex items-center justify-center gap-4">
            <button
              onClick={() => setServings(s => Math.max(1, s - 1))}
              className="w-9 h-9 rounded-full border-2 border-gray-300 text-lg font-bold text-gray-600 flex items-center justify-center"
            >
              −
            </button>
            <span className="text-xl font-bold w-16 text-center">{servings}인분</span>
            <button
              onClick={() => setServings(s => Math.min(10, s + 1))}
              className="w-9 h-9 rounded-full border-2 border-green-400 text-lg font-bold text-green-600 flex items-center justify-center"
            >
              +
            </button>
          </div>

          {/* 메뉴별 기준 설정 */}
          <p className="text-xs font-semibold text-gray-500 mb-2">메뉴별 기준</p>
          <div className="space-y-3 mb-5">
            {menus.map((menu) => {
              const mode = menuModes[menu] || 'servings'
              const info = getIngredientInfo(menu)
              const isIngredientMode = mode === 'ingredient'
              const showIngredientLoading = isIngredientMode && ingredientLoading && !info

              return (
                <div key={menu} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-sm font-medium mb-2">{menu}</p>

                  {/* 메뉴별 모드 토글 */}
                  <div className="flex rounded-md bg-gray-100 p-0.5 mb-2">
                    <button
                      onClick={() => setMenuModes(prev => ({ ...prev, [menu]: 'servings' }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                        !isIngredientMode ? 'bg-white shadow text-green-600' : 'text-gray-500'
                      }`}
                    >
                      인분 기준
                    </button>
                    <button
                      onClick={() => setMenuModes(prev => ({ ...prev, [menu]: 'ingredient' }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                        isIngredientMode ? 'bg-white shadow text-green-600' : 'text-gray-500'
                      }`}
                    >
                      재료 기준
                    </button>
                  </div>

                  {/* 인분 기준 선택 시 */}
                  {!isIngredientMode && (
                    <p className="text-xs text-gray-400 text-center py-1">
                      {servings}인분 적용
                    </p>
                  )}

                  {/* 재료 기준 - 로딩 중 */}
                  {showIngredientLoading && (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-gray-400">재료 정보 불러오는 중...</span>
                    </div>
                  )}

                  {/* 재료 기준 - 입력 */}
                  {isIngredientMode && !showIngredientLoading && (
                    <div className="flex items-center gap-2 py-1">
                      <span className="text-sm text-gray-600 flex-1">
                        {info?.main_ingredient || '주재료'}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="0"
                        value={weights[menu] || ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setWeights(prev => {
                            if (!v) { const { [menu]: _, ...rest } = prev; return rest }
                            const num = parseInt(v)
                            if (num < 0) return prev
                            return { ...prev, [menu]: num }
                          })
                        }}
                        className="w-20 text-right border rounded-lg px-2 py-1.5 text-sm focus:border-green-400 outline-none"
                      />
                      <span className="text-sm text-gray-500 w-6">{info?.unit || 'g'}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={handleStart}
            disabled={ingredientLoading || (hasIngredientMode && ingredientMenusMissingWeight)}
            className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold disabled:opacity-40"
          >
            레시피 보기
          </button>
        </>
      )}

      {phase === 'loading' && <LoadingSpinner text="" progress={progress} stage={progressStage} />}

      {phase === 'result' && result && (
        <div className="relative">
          {chatLoading && (
            <div className="absolute inset-0 bg-white/70 z-10 flex flex-col items-center justify-center">
              <LoadingSpinner text="상황을 반영하여 재생성 중..." />
            </div>
          )}
          <div className="bg-amber-50 rounded-xl p-3 mb-4 text-sm flex items-center justify-between">
            <div>
              <span className="text-gray-500">개별 합산</span>
              <span className="line-through ml-2 text-gray-400">{result.total_minutes}분</span>
              <span className="mx-2">→</span>
              <span className="font-bold text-amber-600">{result.optimized_minutes}분</span>
            </div>
            {result.total_calories && (
              <div>
                <span className="text-gray-500">칼로리</span>
                <span className="font-bold text-amber-600 ml-2">약 {result.total_calories} kcal</span>
              </div>
            )}
          </div>
          {result.ingredients?.length > 0 && (
            <div className="space-y-3 mb-4">
              {result.ingredients.map((group, i) => (
                <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">{group.menu}</p>
                    <button
                      onClick={() => navigate(`/recipes/${encodeURIComponent(group.menu)}`)}
                      className="text-xs text-green-600 font-medium"
                    >
                      레시피 →
                    </button>
                  </div>
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
        </div>
      )}

      {phase === 'result' && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t px-4 py-3 z-20">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !chatLoading && chatInput.trim() && handleChatSubmit()}
              placeholder="예) 마늘이 1쪽만 있어요"
              className="flex-1 border rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={handleChatSubmit}
              disabled={chatLoading || !chatInput.trim()}
              className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 flex-shrink-0"
            >
              반영
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
