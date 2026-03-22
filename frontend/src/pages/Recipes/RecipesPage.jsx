import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getFavorites, deleteFavorite } from '../../api/recipes'

export default function RecipesPage() {
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getFavorites().then(setFavorites).catch((e) => toast.error(e.message))
  }, [])

  const handleDelete = async (id) => {
    try {
      await deleteFavorite(id)
      setFavorites((prev) => prev.filter((f) => f.id !== id))
      toast.success('즐겨찾기에서 삭제했어요')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleSearch = () => {
    if (!search.trim()) return
    navigate(`/recipes/${encodeURIComponent(search.trim())}`)
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">레시피 📖</h1>

      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 border rounded-xl px-3 py-2 text-sm"
          placeholder="메뉴 이름으로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm">
          검색
        </button>
      </div>

      <h2 className="font-semibold mb-2">즐겨찾기 ♥</h2>
      {favorites.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">즐겨찾기한 레시피가 없어요</p>
      ) : (
        <div className="space-y-2">
          {favorites.map((f) => (
            <div key={f.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between">
              <button
                onClick={() => navigate(`/recipes/${encodeURIComponent(f.menu_name)}`)}
                className="text-sm font-medium flex-1 text-left"
              >
                {f.menu_name}
              </button>
              <button onClick={() => handleDelete(f.id)} className="text-gray-400 text-xl">♥</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
