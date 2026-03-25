import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { generateRecipe, addFavorite, deleteFavorite, getFavorites } from '../../api/recipes'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function RecipeDetail() {
  const navigate = useNavigate()
  const { menuName } = useParams()
  const decodedName = decodeURIComponent(menuName)
  const [servings, setServings] = useState(2)
  const [weight, setWeight] = useState('')
  const [recipe, setRecipe] = useState(null)
  const [loading, setLoading] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)

  const load = async (s, w) => {
    setLoading(true)
    try {
      const data = await generateRecipe(decodedName, s, w || null)
      setRecipe(data)
    } catch (e) {
      toast.error(e.message)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load(servings, null)
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.menu_name === decodedName)
      if (fav) { setFavorited(true); setFavoriteId(fav.id) }
    })
  }, [])

  const handleServingsChange = (delta) => {
    const next = Math.max(1, servings + delta)
    setServings(next)
    load(next, weight ? parseInt(weight) : null)
  }

  const handleWeightSubmit = () => {
    load(servings, weight ? parseInt(weight) : null)
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
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          health_notes: recipe.health_notes,
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
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-xl font-bold flex-1">{decodedName}</h1>
        <button onClick={toggleFavorite} className="text-2xl">{favorited ? '♥' : '♡'}</button>
      </div>

      <div className="bg-white rounded-xl p-3 shadow-sm mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">인분</span>
          <div className="flex items-center gap-3">
            <button onClick={() => handleServingsChange(-1)} className="w-8 h-8 rounded-full bg-gray-100 font-bold">-</button>
            <span className="font-semibold">{servings}인분</span>
            <button onClick={() => handleServingsChange(1)} className="w-8 h-8 rounded-full bg-gray-100 font-bold">+</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm flex-1">주재료 중량 (선택)</span>
          <input
            type="number"
            className="w-20 border rounded-lg px-2 py-1 text-sm text-right"
            placeholder="g"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={handleWeightSubmit}
          />
          <span className="text-sm">g</span>
        </div>
        {recipe && (
          <p className="text-sm text-gray-500">칼로리: 약 {recipe.calories} kcal</p>
        )}
      </div>

      {loading ? <LoadingSpinner text="레시피 불러오는 중..." /> : recipe && (
        <>
          <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
            <h2 className="font-semibold mb-2">재료</h2>
            <div className="space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{ing.name}</span>
                  <span className="text-gray-500">{ing.amount}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
            <h2 className="font-semibold mb-2">조리 순서</h2>
            <ol className="space-y-2">
              {recipe.steps.map((step, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-green-500 font-bold flex-shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {recipe.health_notes && (
            <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800">
              ⚠️ {recipe.health_notes}
            </div>
          )}
        </>
      )}
    </div>
  )
}
