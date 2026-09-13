/**
 * 登录会话（localStorage `h5nav:auth`）
 */

import { API_PATHS } from '../config/api.js'
import { t } from '../i18n/index.js'
import { apiRequest, isMockMode } from './apiClient.js'
import { HttpError } from './http.js'

export const AUTH_KEY = 'h5nav:auth'
const AUTH_VERSION = 1

/** @typedef {{ id: string, name: string, roles: string[] }} AuthUser */

/** @typedef {{ version: number, accessToken: string, user: AuthUser, expiresAt: number }} AuthRecord */

/** @type {AuthRecord | null} */
let cached = null

/** @type {Set<(state: { user: AuthUser | null, isLoggedIn: boolean }) => void>} */
const listeners = new Set()

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/**
 * @param {unknown} raw
 * @returns {AuthRecord | null}
 */
export function normalizeAuthRecord(raw) {
  if (!raw || typeof raw !== 'object') return null
  const src = /** @type {Record<string, unknown>} */ (raw)
  const accessToken = String(src.accessToken || src.token || '').trim()
  if (!accessToken) return null

  const userRaw =
    src.user && typeof src.user === 'object' ? /** @type {Record<string, unknown>} */ (src.user) : {}
  const name = String(userRaw.name || userRaw.username || '').trim()
  const id = String(userRaw.id || (name ? `u-${name}` : '')).trim()
  if (!id && !name) return null

  const roles = Array.isArray(userRaw.roles) ? userRaw.roles.map((role) => String(role)) : []

  let expiresAt = Number(src.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    expiresAt = Date.now() + 7 * 24 * 3600 * 1000
  }

  return {
    version: AUTH_VERSION,
    accessToken,
    user: { id: id || `u-${name}`, name: name || id, roles },
    expiresAt,
  }
}

/**
 * @param {AuthRecord} record
 */
function isExpired(record) {
  return Number(record.expiresAt) > 0 && Date.now() >= Number(record.expiresAt)
}

/**
 * @returns {AuthRecord | null}
 */
function loadFromStorage() {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const record = normalizeAuthRecord(parsed)
    if (!record || isExpired(record)) return null
    return record
  } catch {
    return null
  }
}

/**
 * @param {AuthRecord | null} record
 */
function saveToStorage(record) {
  const store = storage()
  if (!store) return
  try {
    if (!record) store.removeItem(AUTH_KEY)
    else store.setItem(AUTH_KEY, JSON.stringify(record))
  } catch {
    // ignore
  }
}

function getAuthState() {
  return {
    user: cached?.user ?? null,
    isLoggedIn: Boolean(cached?.accessToken && cached?.user && !isExpired(cached)),
  }
}

function notifyListeners() {
  const state = getAuthState()
  listeners.forEach((fn) => {
    try {
      fn(state)
    } catch {
      // ignore
    }
  })
}

/**
 * @param {AuthRecord} record
 */
function setSession(record) {
  cached = record
  saveToStorage(record)
  notifyListeners()
}

async function refreshFromMe() {
  if (!cached?.accessToken) return
  try {
    const data = await apiRequest(API_PATHS.me, { auth: true, silent: true })
    const refreshed = normalizeAuthRecord({
      ...(data && typeof data === 'object' ? data : {}),
      accessToken: cached.accessToken,
      expiresAt: cached.expiresAt,
    })
    if (refreshed) {
      cached = refreshed
      saveToStorage(refreshed)
      notifyListeners()
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 0
    if (status === 401 || status === 403) {
      clearAuthStorage()
    } else {
      console.warn('[auth] refreshFromMe failed:', err)
    }
  }
}

export function clearAuthStorage() {
  cached = null
  saveToStorage(null)
  notifyListeners()
}

export function getAccessToken() {
  if (cached?.accessToken && !isExpired(cached)) return cached.accessToken
  cached = loadFromStorage()
  return cached?.accessToken || ''
}

/** @returns {AuthUser | null} */
export function getUser() {
  if (cached?.user && !isExpired(cached)) return cached.user
  cached = loadFromStorage()
  return cached?.user ?? null
}

export function isLoggedIn() {
  return getAuthState().isLoggedIn
}

/**
 * @param {(state: { user: AuthUser | null, isLoggedIn: boolean }) => void} fn
 * @returns {() => void}
 */
export function onAuthChange(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function initAuth() {
  cached = loadFromStorage()
  if (cached && isExpired(cached)) {
    clearAuthStorage()
    return getAuthState()
  }
  if (!isMockMode() && cached?.accessToken) {
    refreshFromMe().catch(() => {})
  }
  return getAuthState()
}

/**
 * @param {{ username?: string, password?: string }} credentials
 * @returns {Promise<{ user: AuthUser | null, isLoggedIn: boolean }>}
 */
export async function login(credentials = {}) {
  const username = String(credentials.username || '').trim()
  const password = String(credentials.password || '')

  if (!username) {
    throw new Error(t('auth.needUsername'))
  }

  let record = null

  if (isMockMode()) {
    record = normalizeAuthRecord({
      accessToken: `mock-${username}-${Date.now()}`,
      user: { id: `u-${username}`, name: username, roles: ['user'] },
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    })
  } else {
    try {
      const data = await apiRequest(API_PATHS.login, {
        method: 'POST',
        body: { username, password },
      })
      record = normalizeAuthRecord(data)
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error(t('auth.loginFail'))
    }
    if (!record) throw new Error(t('auth.loginFail'))
  }

  setSession(record)
  return getAuthState()
}

export async function logout() {
  if (!isMockMode() && cached?.accessToken) {
    try {
      await apiRequest(API_PATHS.logout, { method: 'POST', auth: true, silent: true })
    } catch {
      // ignore remote logout failures
    }
  }
  clearAuthStorage()
  return getAuthState()
}
