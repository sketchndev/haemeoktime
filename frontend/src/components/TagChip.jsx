export default function TagChip({ label, onDelete }) {
  return (
    <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-sm px-2 py-1 rounded-full">
      {label}
      {onDelete && (
        <button onClick={onDelete} className="text-green-600 hover:text-red-500 ml-1">✕</button>
      )}
    </span>
  )
}
