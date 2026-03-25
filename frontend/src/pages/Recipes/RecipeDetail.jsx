import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { generateRecipe, generateRecipeStream, addFavorite, deleteFavorite, getFavorites, getMainIngredient } from '../../api/recipes'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function RecipeDetail() {
  const navigate = useNavigate()
  const { menuName } = useParams()
  const { state } = useLocation()
  const decodedName = decodeURIComponent(menuName)

  const [phase, setPhase] = useState('select') // 'select' | 'loading' | 'result'
  const [tab, setTab] = useState('servings') // 'servings' | 'weight'
  const [servings, setServings] = useState(2)
  const [weight, setWeight] = useState('')
  const [recipe, setRecipe] = useState(null)
  const [favorited, setFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [mainIngredientInfo, setMainIngredientInfo] = useState(null)
  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState('')

  const load = async (s, w, userContext = null) => {
    try {
      const data = await generateRecipe(decodedName, s, w || null, userContext)
      setRecipe(data)
      if (data.main_ingredient) {
        setMainIngredientInfo({
          main_ingredient: data.main_ingredient,
          unit: data.main_ingredient_unit || 'g',
        })
      }
      return data
    } catch (e) {
      toast.error(e.message)
      return null
    }
  }

  const loadStream = async (s, w) => {
    try {
      const data = await generateRecipeStream(decodedName, s, w || null, null, ({ progress: p, stage: st }) => {
        if (p != null) setProgress(p)
        if (st) setProgressStage(st)
      })
      setRecipe(data)
      if (data.main_ingredient) {
        setMainIngredientInfo({
          main_ingredient: data.main_ingredient,
          unit: data.main_ingredient_unit || 'g',
        })
      }
      return data
    } catch (e) {
      toast.error(e.message)
      return null
    }
  }

  useEffect(() => {
    if (state?.recipeData) {
      setRecipe(state.recipeData)
      setServings(state.recipeData.servings || 2)
      setPhase('result')
      if (state.recipeData.main_ingredient) {
        setMainIngredientInfo({
          main_ingredient: state.recipeData.main_ingredient,
          unit: state.recipeData.main_ingredient_unit || 'g',
        })
      }
    }
    const cached = getMainIngredient(decodedName)
    if (cached) setMainIngredientInfo(cached)
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.menu_name === decodedName)
      if (fav) { setFavorited(true); setFavoriteId(fav.id) }
    })
  }, [])

  const handleStart = async () => {
    setPhase('loading')
    setProgress(0)
    setProgressStage('')
    const w = tab === 'weight' && weight ? parseInt(weight) : null
    const s = tab === 'servings' ? servings : null
    const data = await loadStream(s || 2, w)
    if (data) {
      setPhase('result')
    } else {
      setPhase('select')
    }
  }

  const handleChatSubmit = () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatLoading(true)

    const w = tab === 'weight' && weight ? parseInt(weight) : null
    const s = tab === 'servings' ? servings : null

    load(s || 2, w, msg)
      .finally(() => setChatLoading(false))
  }

  const toggleFavorite = async () => {
    try {
      if (favorited && favoriteId) {
        await deleteFavorite(favoriteId)
        setFavorited(false); setFavoriteId(null)
        toast.success('즐겨찾기에서 삭제했어요')
      } else {
        const recipeData = recipe ? {
          menu_name: recipe.menu_name,
          servings: recipe.servings,
          calories: recipe.calories,
          main_ingredient: recipe.main_ingredient,
          main_ingredient_unit: recipe.main_ingredient_unit,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
        } : null
        const result = await addFavorite(decodedName, 'individual', recipeData)
        setFavorited(true); setFavoriteId(result.id)
        toast.success('즐겨찾기에 추가했어요')
      }
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className={`p-4${phase === 'result' ? ' pb-24' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-lg font-bold flex-1">{decodedName}</h1>
        {phase === 'result' && (
          <button onClick={toggleFavorite} className="text-2xl">{favorited ? '♥' : '♡'}</button>
        )}
      </div>

      {/* 분량 선택 화면 */}
      {phase === 'select' && (
        <>
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
              onClick={() => setTab('weight')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'weight' ? 'bg-white shadow text-green-600' : 'text-gray-500'
              }`}
            >
              주재료 중량 기준
            </button>
          </div>

          {tab === 'servings' && (
            <div className="bg-white rounded-xl p-6 shadow-sm mb-4 flex items-center justify-center gap-4">
              <button
                onClick={() => setServings(s => Math.max(2, s - 1))}
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

          {tab === 'weight' && (
            <div className="bg-white rounded-xl p-6 shadow-sm mb-4">
              <p className="text-sm text-gray-500 mb-3">
                {mainIngredientInfo
                  ? <><span className="font-medium text-green-600">{mainIngredientInfo.main_ingredient}</span> 중량을 입력하면 그에 맞게 레시피를 생성해요</>
                  : '주재료 중량을 입력하면 그에 맞게 레시피를 생성해요'}
              </p>
              <div className="flex items-center justify-center gap-3">
                {mainIngredientInfo && (
                  <span className="text-sm font-medium text-gray-700">{mainIngredientInfo.main_ingredient}</span>
                )}
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={weight}
                  onChange={(e) => { if (e.target.value === '' || Number(e.target.value) >= 0) setWeight(e.target.value) }}
                  className="w-24 text-right border-2 border-gray-200 rounded-lg px-3 py-2 text-lg font-semibold focus:border-green-400 outline-none"
                />
                <span className="text-lg text-gray-500">{mainIngredientInfo?.unit || 'g'}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={tab === 'weight' && !weight}
            className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold disabled:opacity-40"
          >
            레시피 보기
          </button>
        </>
      )}

      {/* 로딩 */}
      {phase === 'loading' && <LoadingSpinner text="" progress={progress} stage={progressStage} />}

      {/* 결과 */}
      {phase === 'result' && recipe && (
        <div className="relative">
          {chatLoading && (
            <div className="absolute inset-0 bg-white/70 z-10 flex flex-col items-center justify-center">
              <LoadingSpinner text="상황을 반영하여 재생성 중..." />
            </div>
          )}

          {recipe.calories && (
            <div className="bg-amber-50 rounded-xl p-3 mb-4 text-sm">
              <span className="text-gray-500">칼로리</span>
              <span className="font-bold text-amber-600 ml-2">약 {recipe.calories} kcal</span>
            </div>
          )}

          <div className="bg-white rounded-xl p-3 shadow-sm mb-4">
            <p className="text-sm font-semibold mb-2">재료</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {recipe.ingredients.map((ing, i) => (
                <span key={i} className="text-sm text-gray-600">
                  {ing.name} <span className="text-green-600 font-medium">{ing.amount}</span>
                </span>
              ))}
            </div>
          </div>

          <h2 className="text-sm font-bold mb-2">조리 순서</h2>
          <div className="space-y-3">
            {recipe.steps.map((step, i) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow-sm">
                <p className="text-sm font-medium">
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full mr-2">
                    Step {i + 1}
                  </span>
                </p>
                <p className="text-sm text-gray-600 mt-1">{step}</p>
              </div>
            ))}
          </div>


        </div>
      )}

      {/* 하단 고정 채팅 입력 */}
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
