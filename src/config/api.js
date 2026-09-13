export const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const mode = String(import.meta.env.VITE_API_MODE || 'mock').toLowerCase()
export const API_MODE = mode === 'real' ? 'real' : 'mock'

export const API_PATHS = Object.freeze({
  login: '/api/auth/login',
  me: '/api/auth/me',
  logout: '/api/auth/logout',
  inspectionTasks: '/api/inspection/tasks',
  inspectionTask: (id) => `/api/inspection/tasks/${encodeURIComponent(id)}`,
  inspectionSubmit: (id) => `/api/inspection/tasks/${encodeURIComponent(id)}/submit`,
})

export function isMockMode() {
  return API_MODE === 'mock'
}
