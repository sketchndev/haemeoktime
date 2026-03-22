import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getSchoolMeals, uploadSchoolMealPhoto } from '../../api/schoolMeals'
import LoadingSpinner from '../../components/LoadingSpinner'

const DAY_NAMES = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 0: '일' }

export default function SchoolMealsPage() {
  const navigate = useNavigate()
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    try {
      setMeals(await getSchoolMeals())
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadSchoolMealPhoto(file)
      await load()
      toast.success('급식표를 저장했어요')
    } catch (e) {
      toast.error(e.message)
    } finally { setUploading(false) }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-xl">←</button>
        <h1 className="text-xl font-bold">급식 메뉴 관리</h1>
      </div>

      <label className={`flex items-center justify-center gap-2 bg-green-500 text-white py-3 rounded-xl mb-4 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
        <span>📷 급식표 사진 업로드</span>
        <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} disabled={uploading} />
      </label>
      {uploading && <p className="text-sm text-center text-gray-400 mb-4">AI가 급식표를 분석 중...</p>}

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {meals.length === 0 ? (
            <p className="text-center text-gray-400 py-8">이번 주 급식이 없어요</p>
          ) : meals.map((m) => {
            const d = new Date(m.date + 'T00:00:00')
            return (
              <div key={m.date} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="font-semibold text-sm mb-1">
                  {m.date} ({DAY_NAMES[d.getDay()]})
                </div>
                <div className="text-sm text-gray-600">{m.menu_items.join(' / ')}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
