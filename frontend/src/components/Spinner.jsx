export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex items-center gap-3 text-white">
      <div className="w-10 h-10 border-4 border-gray-500 border-t-indigo-400 rounded-full animate-spin" />
      <span className="text-base font-medium">{label}</span>
    </div>
  )
}
