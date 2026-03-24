import { useNavigate } from 'react-router-dom'

const BASE_URL = import.meta.env.VITE_API_URL || ''

export default function WorldCard({ world, onEdit, onDelete }) {
  const navigate = useNavigate()

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
      {world.image_path ? (
        <img
          src={`${BASE_URL}${world.image_path}`}
          alt={world.title}
          className="w-full h-48 object-cover"
        />
      ) : (
        <div className="w-full h-48 bg-gray-700 flex items-center justify-center text-gray-500 text-sm">
          No image
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-lg font-semibold text-gray-100 mb-1">{world.title}</h3>
        <p className="text-gray-400 text-sm flex-1 line-clamp-3">{world.description}</p>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => navigate(`/worlds/${world.id}`)}
            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            Open
          </button>
          <button
            onClick={() => onEdit(world)}
            className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(world.id)}
            className="flex-1 py-1.5 bg-red-800 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
