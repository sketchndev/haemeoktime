import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getShopping, addShoppingItem, checkShoppingItem, deleteShoppingItem,
  getFrequent, addFrequent,
} from '../../api/shopping'
import LoadingSpinner from '../../components/LoadingSpinner'

const CATEGORIES = ['채소/과일', '육류/해산물', '유제품/계란', '가공식품', '기타']

export default function ShoppingPage() {
  const [shopping, setShopping] = useState({ week_start: '', items: [] })
  const [frequent, setFrequent] = useState([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [newFrequent, setNewFrequent] = useState('')
  const [showFrequent, setShowFrequent] = useState(false)

  const load = async () => {
    try {
      const [s, f] = await Promise.all([getShopping(), getFrequent()])
      setShopping(s)
      setFrequent(f)
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCheck = async (id, checked) => {
    await checkShoppingItem(id, !checked)
    setShopping((prev) => ({
      ...prev,
      items: prev.items.map((i) => i.id === id ? { ...i, is_checked: !checked } : i),
    }))
  }

  const handleDelete = async (id) => {
    await deleteShoppingItem(id)
    setShopping((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }))
  }

  const handleAddItem = async () => {
    if (!newItem.trim()) return
    try {
      const item = await addShoppingItem(newItem.trim(), null, null)
      setShopping((prev) => ({ ...prev, items: [...prev.items, item] }))
      setNewItem('')
    } catch (e) { toast.error(e.message) }
  }

  const handleCopy = () => {
    const unchecked = shopping.items.filter((i) => !i.is_checked).map((i) => `- ${i.name} ${i.quantity || ''}`).join('\n')
    navigator.clipboard.writeText(unchecked)
    toast.success('복사했어요')
  }

  const handleAddFrequent = async () => {
    if (!newFrequent.trim()) return
    try {
      const item = await addFrequent(newFrequent.trim())
      setFrequent((prev) => [...prev, item])
      setNewFrequent('')
    } catch (e) { toast.error(e.message) }
  }

  const handleFrequentToList = async (name) => {
    try {
      const item = await addShoppingItem(name, null, null)
      setShopping((prev) => ({ ...prev, items: [...prev.items, item] }))
      toast.success(`${name} 추가됐어요`)
    } catch (e) { toast.error(e.message) }
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = shopping.items.filter((i) => i.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})
  const uncategorized = shopping.items.filter((i) => !i.category || !CATEGORIES.includes(i.category))
  if (uncategorized.length) grouped['기타'] = [...(grouped['기타'] || []), ...uncategorized.filter(i => !grouped['기타']?.includes(i))]

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">장보기 🛒</h1>
        <button onClick={handleCopy} className="text-sm text-green-600 border border-green-300 px-3 py-1 rounded-full">
          복사
        </button>
      </div>

      {shopping.week_start && (
        <p className="text-xs text-gray-400 mb-3">{shopping.week_start} 주 기준</p>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-4">
          <h2 className="text-xs font-semibold text-gray-500 mb-1">{cat}</h2>
          <div className="space-y-1">
            {items.map((item) => (
              <div key={item.id} className={`flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm ${item.is_checked ? 'opacity-50' : ''}`}>
                <button onClick={() => handleCheck(item.id, item.is_checked)}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 ${item.is_checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
                />
                <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-gray-400' : ''}`}>
                  {item.name} <span className="text-gray-400">{item.quantity}</span>
                </span>
                <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {shopping.items.length === 0 && (
        <p className="text-center text-gray-400 py-8 text-sm">
          식단 추천 후 장보기 리스트를 만들어보세요
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <input
          className="flex-1 border rounded-xl px-3 py-2 text-sm"
          placeholder="+ 항목 직접 추가"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
        />
        <button onClick={handleAddItem} className="bg-green-500 text-white px-4 rounded-xl text-sm">추가</button>
      </div>

      <div className="mt-4">
        <button
          onClick={() => setShowFrequent((v) => !v)}
          className="text-sm text-gray-600 font-semibold"
        >
          자주 사는 물품 {showFrequent ? '▲' : '▼'}
        </button>
        {showFrequent && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {frequent.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFrequentToList(f.name)}
                  className="bg-gray-100 text-sm px-3 py-1 rounded-full"
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-2 py-1 text-sm"
                placeholder="자주 사는 물품 추가"
                value={newFrequent}
                onChange={(e) => setNewFrequent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFrequent()}
              />
              <button onClick={handleAddFrequent} className="bg-gray-200 text-sm px-3 py-1 rounded-lg">+</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
