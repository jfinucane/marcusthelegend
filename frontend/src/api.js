const BASE_URL = import.meta.env.VITE_API_URL || ''

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body.error || message
    } catch (_) {}
    throw new Error(message)
  }
  return res.json()
}

// Auth
export const login = (password) =>
  request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

// Worlds
export const getWorlds = () => request('/api/worlds')
export const createWorld = (data) =>
  request('/api/worlds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const getWorld = (id) => request(`/api/worlds/${id}`)
export const updateWorld = (id, data) =>
  request(`/api/worlds/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const deleteWorld = (id) =>
  request(`/api/worlds/${id}`, { method: 'DELETE' })
export const generateWorldImage = (id) =>
  request(`/api/worlds/${id}/generate-image`, { method: 'POST' })
export const editWorldImage = (id, modificationText) =>
  request(`/api/worlds/${id}/edit-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modification_text: modificationText }),
  })
export const uploadWorldImage = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/worlds/${id}/upload-image`, { method: 'POST', body: form })
}

// Stories
export const getStories = (worldId) => request(`/api/worlds/${worldId}/stories`)
export const createStory = (worldId, data) =>
  request(`/api/worlds/${worldId}/stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const getStory = (id) => request(`/api/stories/${id}`)
export const updateStory = (id, data) =>
  request(`/api/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const deleteStory = (id) =>
  request(`/api/stories/${id}`, { method: 'DELETE' })
export const generateStoryImage = (id) =>
  request(`/api/stories/${id}/generate-image`, { method: 'POST' })
export const editStoryImage = (id, modificationText) =>
  request(`/api/stories/${id}/edit-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modification_text: modificationText }),
  })
export const uploadStoryImage = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/stories/${id}/upload-image`, { method: 'POST', body: form })
}

// Story Items
export const getItems = (storyId) => request(`/api/stories/${storyId}/items`)
export const createItem = (storyId, data) =>
  request(`/api/stories/${storyId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const updateItem = (id, data) =>
  request(`/api/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const deleteItem = (id) =>
  request(`/api/items/${id}`, { method: 'DELETE' })
export const generateItemImage = (id) =>
  request(`/api/items/${id}/generate-image`, { method: 'POST' })
export const editItemImage = (id, modificationText) =>
  request(`/api/items/${id}/edit-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modification_text: modificationText }),
  })
export const uploadItemImage = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/items/${id}/upload-image`, { method: 'POST', body: form })
}
export const reorderItems = (storyId, itemIds) =>
  request(`/api/stories/${storyId}/items/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_ids: itemIds }),
  })
