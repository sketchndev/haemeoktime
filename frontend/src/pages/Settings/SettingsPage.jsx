import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useProfile } from '../../contexts/ProfileContext'
import {
  addFamilyTag, deleteFamilyTag, addCondiment, deleteCondiment,
  updateCookingTimes, parseCondimentPhoto, updateMealPlanSettings,
} from '../../api/profile'
import TagChip from '../../components/TagChip'
import compressImage from '../../utils/compressImage'

const MEAL_LABELS = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁' }

export default function SettingsPage() {
  const { profile, loading, refresh } = useProfile()
  const navigate = useNavigate()
  const [newTag, setNewTag] = useState('')
  const [newCondiment, setNewCondiment] = useState('')
  const [times, setTimes] = useState(profile.cooking_times)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [mealPlanSettings, setMealPlanSettings] = useState(profile.meal_plan_settings)

  useEffect(() => {
    if (!loading) {
      setTimes(profile.cooking_times)
      setMealPlanSettings(profile.meal_plan_settings)
    }
  }, [loading, profile.cooking_times, profile.meal_plan_settings])

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    try {
      await addFamilyTag(newTag.trim())
      setNewTag('')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleDeleteTag = async (id) => {
    try { await deleteFamilyTag(id); await refresh() }
    catch (e) { toast.error(e.message) }
  }

  const handleAddCondiment = async () => {
    if (!newCondiment.trim()) return
    try {
      await addCondiment(newCondiment.trim())
      setNewCondiment('')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleDeleteCondiment = async (id) => {
    try { await deleteCondiment(id); await refresh() }
    catch (e) { toast.error(e.message) }
  }

  const handleSaveTimes = async () => {
    try {
      await updateCookingTimes(times)
      toast.success('저장됐어요')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleSaveMealPlanSettings = async () => {
    try {
      await updateMealPlanSettings(mealPlanSettings)
      toast.success('저장됐어요')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleCondimentPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoLoading(true)
    try {
      const compressed = await compressImage(file)
      const result = await parseCondimentPhoto(compressed)
      for (const name of result.extracted) {
        await addCondiment(name)
      }
      await refresh()
      toast.success(`${result.extracted.length}개 조미료를 추가했어요`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPhotoLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">내 설정</h1>

      <section>
        <h2 className="font-semibold mb-2">👨‍👩‍👧 가족 상황</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {profile.family_tags.map((t) => (
            <TagChip key={t.id} label={t.tag} onDelete={() => handleDeleteTag(t.id)} />
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="예) 허리디스크, 8살 아이"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
          />
          <button onClick={handleAddTag} className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm">
            추가
          </button>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">⏱️ 끼니별 최대 요리 시간</h2>
        <div className="space-y-2">
          {Object.entries(MEAL_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm">
              <span className="text-sm">{label}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimes((t) => ({ ...t, [key]: Math.max(5, t[key] - 5) }))}
                  className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                >-</button>
                <span className="w-16 text-center font-medium">{times[key]}분</span>
                <button
                  onClick={() => setTimes((t) => ({ ...t, [key]: t[key] + 5 }))}
                  className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                >+</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={handleSaveTimes} className="mt-2 w-full bg-green-500 text-white py-2 rounded-lg text-sm">
          저장
        </button>
      </section>

      <section>
        <h2 className="font-semibold mb-2">🧂 보유 조미료</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {profile.condiments.map((c) => (
            <TagChip key={c.id} label={c.name} onDelete={() => handleDeleteCondiment(c.id)} />
          ))}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="조미료 이름"
            value={newCondiment}
            onChange={(e) => setNewCondiment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCondiment()}
          />
          <button onClick={handleAddCondiment} className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm">
            추가
          </button>
        </div>
        <label className={`flex items-center gap-2 text-sm text-green-600 cursor-pointer ${photoLoading ? 'opacity-50' : ''}`}>
          <span>📷 사진으로 한 번에 추가</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleCondimentPhoto} disabled={photoLoading} />
        </label>
        {photoLoading && (
          <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
            <span className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            AI가 조미료를 분석 중...
          </p>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">📋 식단 구성 설정</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600 block mb-1">주간 식단 구성</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              rows={2}
              maxLength={500}
              placeholder="예) 주말 점심만 양식, 그 외 한식"
              value={mealPlanSettings.weekly_rule}
              onChange={(e) => setMealPlanSettings((s) => ({ ...s, weekly_rule: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">한끼 식단 구성</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              rows={2}
              maxLength={500}
              placeholder="예) 한식은 국+반찬 2개, 양식은 에피타이저+메인요리"
              value={mealPlanSettings.composition_rule}
              onChange={(e) => setMealPlanSettings((s) => ({ ...s, composition_rule: e.target.value }))}
            />
          </div>
        </div>
        <button onClick={handleSaveMealPlanSettings} className="mt-2 w-full bg-green-500 text-white py-2 rounded-lg text-sm">
          저장
        </button>
      </section>

      <section>
        <h2 className="font-semibold mb-2">🏫 급식 메뉴</h2>
        <button
          onClick={() => navigate('/settings/school-meals')}
          className="w-full bg-white border rounded-lg p-3 text-sm text-left shadow-sm"
        >
          급식표 관리 →
        </button>
      </section>
    </div>
  )
}
