import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getFavorites, deleteFavorite } from '../../api/recipes'

export default function CombinedFavoriteDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { state } = useLocation()
  const [favorite, setFavorite] = useState(state?.favorite || null)
  const [favorited, setFavorited] = useState(true)

  useEffect(() => {
    if (favorite) return
    // If no state passed, fetch from favorites list
    getFavorites().then((favs) => {
      const fav = favs.find((f) => f.id === parseInt(id))
      if (fav) setFavorite(fav)
      else toast.error('즐겨찾기를 찾을 수 없어요')
    }).catch((e) => toast.error(e.message))
  }, [id])

  const handleToggleFavorite = async () => {
    try {
      await deleteFavorite(parseInt(id))
      setFavorited(false)
      toast.success('즐겨찾기에서 삭제했어요')
      navigate(-1)
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (!favorite) return <div className="p-4 text-center text-gray-400">불러오는 중...</div>

  const data = favorite.recipe_data
  if (!data) return <div className="p-4 text-center text-gray-400">레시피 데이터가 없어요</div>

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-lg font-bold flex-1">⚡ {favorite.menu_name}</h1>
        {favorited && <button onClick={handleToggleFavorite} className="text-2xl">♥</button>}
      </div>

      <div className="bg-amber-50 rounded-xl p-3 mb-4 text-sm">
        <span className="text-gray-500">개별 합산</span>
        <span className="line-through ml-2 text-gray-400">{data.total_minutes}분</span>
        <span className="mx-2">→</span>
        <span className="font-bold text-amber-600">{data.optimized_minutes}분</span>
      </div>

      {data.ingredients?.length > 0 && (
        <div className="space-y-3 mb-4">
          {data.ingredients.map((group, i) => (
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
        {data.steps.map((step, i) => (
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
  )
}
