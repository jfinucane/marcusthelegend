export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex items-center gap-2 text-gray-400">
      <div className="w-5 h-5 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
