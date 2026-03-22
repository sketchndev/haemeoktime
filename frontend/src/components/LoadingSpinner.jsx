export default function LoadingSpinner({ text = '로딩 중...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin mb-2" />
      <span className="text-sm">{text}</span>
    </div>
  )
}
