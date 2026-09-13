import { API_BASE, isMockMode } from '../config/api.js'
import { request } from './http.js'

const AUTH_STORAGE_KEY = 'h5nav:auth'

function readToken() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return ''
    return JSON.parse(raw)?.accessToken || ''
  } catch {
    return ''
  }
}

/**
 * @param {string} path
 * @param {RequestInit & { auth?: boolean, silent?: boolean, parse?: 'json'|'text'|'raw', body?: any }} [options]
 */
export async function apiRequest(path, options = {}) {
  const { auth = false, body, headers, ...rest } = options
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const nextHeaders = { Accept: 'application/json', ...(headers || {}) }
  let payload = body
  if (body != null && typeof body === 'object' && !(body instanceof FormData)) {
    nextHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (auth) {
    const token = readToken()
    if (token) nextHeaders.Authorization = `Bearer ${token}`
  }
  return request(url, {
    parse: 'json',
    ...rest,
    headers: nextHeaders,
    body: payload,
  })
}

export { isMockMode }
