export default function LoadingSpinner({ text = '로딩 중...', progress = null, stage = '' }) {
  const showProgress = progress !== null

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-gray-400">
      <div className="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin mb-3" />

      {showProgress && (
        <div className="w-48 mb-3">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-center mt-1.5">{Math.round(progress)}%</p>
        </div>
      )}

      {stage ? <span className="text-sm">{stage}</span> : <span className="text-sm">{text}</span>}
    </div>
  )
}
