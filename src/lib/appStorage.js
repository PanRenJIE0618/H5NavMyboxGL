/**
 * 本机存储清单：查看占用、单项清理、清空、恢复默认偏好
 */

import { LOCALE_KEY, setLocale } from '../i18n/index.js'
import { UI_THEME_KEY, setUiTheme } from './uiTheme.js'
import { BASEMAP_KEY, setBasemap } from './basemap.js'
import { NAV_PREFS_KEY, defaultNavPrefs, setNavPrefs } from './navPrefs.js'
import { AUTO_VIEW_LOCK_KEY, setAutoViewLock } from './viewLock.js'
import { NAV_HISTORY_KEY, clearNavHistory } from './navHistory.js'
import { NAV_SESSION_KEY, clearNavSession } from './navSession.js'
import {
  FREQUENT_PLACES_KEY,
  clearFrequentPlaces,
} from './frequentPlaces.js'
import { AUTH_KEY, clearAuthStorage } from './auth.js'

export const COORD_KERNEL_KEY = 'h5nav_myboxgl_coord_kernel_v1'

/** @typedef {'local' | 'session'} StorageScope */
/** @typedef {'pref' | 'data' | 'cache'} StorageKind */

/**
 * @typedef {{
 *   id: string,
 *   key: string,
 *   scope: StorageScope,
 *   kind: StorageKind,
 *   labelKey: string,
 *   clearable: boolean,
 * }} StorageCatalogItem
 */

/** @type {readonly StorageCatalogItem[]} */
export const STORAGE_CATALOG = Object.freeze([
  {
    id: 'locale',
    key: LOCALE_KEY,
    scope: 'local',
    kind: 'pref',
    labelKey: 'storage.item.locale',
    clearable: true,
  },
  {
    id: 'theme',
    key: UI_THEME_KEY,
    scope: 'local',
    kind: 'pref',
    labelKey: 'storage.item.theme',
    clearable: true,
  },
  {
    id: 'basemap',
    key: BASEMAP_KEY,
    scope: 'local',
    kind: 'pref',
    labelKey: 'storage.item.basemap',
    clearable: true,
  },
  {
    id: 'navPrefs',
    key: NAV_PREFS_KEY,
    scope: 'local',
    kind: 'pref',
    labelKey: 'storage.item.navPrefs',
    clearable: true,
  },
  {
    id: 'viewLock',
    key: AUTO_VIEW_LOCK_KEY,
    scope: 'local',
    kind: 'pref',
    labelKey: 'storage.item.viewLock',
    clearable: true,
  },
  {
    id: 'history',
    key: NAV_HISTORY_KEY,
    scope: 'local',
    kind: 'data',
    labelKey: 'storage.item.history',
    clearable: true,
  },
  {
    id: 'auth',
    key: AUTH_KEY,
    scope: 'local',
    kind: 'data',
    labelKey: 'storage.item.auth',
    clearable: true,
  },
  {
    id: 'frequent',
    key: FREQUENT_PLACES_KEY,
    scope: 'local',
    kind: 'data',
    labelKey: 'storage.item.frequent',
    clearable: true,
  },
  {
    id: 'session',
    key: NAV_SESSION_KEY,
    scope: 'session',
    kind: 'data',
    labelKey: 'storage.item.session',
    clearable: true,
  },
  {
    id: 'coordKernel',
    key: COORD_KERNEL_KEY,
    scope: 'session',
    kind: 'cache',
    labelKey: 'storage.item.coordKernel',
    clearable: true,
  },
])

function getStore(scope) {
  try {
    if (scope === 'session') {
      return typeof sessionStorage !== 'undefined' ? sessionStorage : null
    }
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/**
 * @param {number} bytes
 */
export function formatStorageBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function byteLength(value) {
  if (value == null) return 0
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(String(value)).length
    }
  } catch {
    // ignore
  }
  return String(value).length * 2
}

/**
 * @returns {Array<StorageCatalogItem & { present: boolean, bytes: number, preview: string }>}
 */
export function listAppStorage() {
  return STORAGE_CATALOG.map((item) => {
    const store = getStore(item.scope)
    let raw = null
    try {
      raw = store?.getItem(item.key) ?? null
    } catch {
      raw = null
    }
    const present = raw != null && raw !== ''
    const preview = present
      ? String(raw).replace(/\s+/g, ' ').slice(0, 48) + (String(raw).length > 48 ? '…' : '')
      : ''
    return {
      ...item,
      present,
      bytes: present ? byteLength(raw) : 0,
      preview,
    }
  })
}

export function getAppStorageSummary() {
  const rows = listAppStorage()
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0)
  const usedCount = rows.filter((row) => row.present).length
  return {
    rows,
    totalBytes,
    usedCount,
    totalCount: rows.length,
  }
}

/**
 * 清理单项（偏好类清理后写回默认值）
 * @param {string} id
 */
export function clearAppStorageItem(id) {
  const item = STORAGE_CATALOG.find((row) => row.id === id)
  if (!item?.clearable) return getAppStorageSummary()

  if (item.id === 'locale') setLocale('zh-CN')
  else if (item.id === 'theme') setUiTheme('light')
  else if (item.id === 'basemap') setBasemap('vec')
  else if (item.id === 'navPrefs') setNavPrefs(defaultNavPrefs())
  else if (item.id === 'viewLock') setAutoViewLock(true)
  else if (item.id === 'history') clearNavHistory()
  else if (item.id === 'auth') clearAuthStorage()
  else if (item.id === 'frequent') clearFrequentPlaces()
  else if (item.id === 'session') clearNavSession()
  else if (item.id === 'coordKernel') {
    try {
      getStore('session')?.removeItem(COORD_KERNEL_KEY)
    } catch {
      // ignore
    }
  }

  return getAppStorageSummary()
}

/** 清空导航数据与缓存（保留偏好） */
export function clearAppDataStorage() {
  clearNavHistory()
  clearFrequentPlaces()
  clearNavSession()
  try {
    getStore('session')?.removeItem(COORD_KERNEL_KEY)
  } catch {
    // ignore
  }
  return getAppStorageSummary()
}

/** 清空全部本应用存储，并恢复默认偏好 */
export function clearAllAppStorage() {
  clearAppDataStorage()
  restoreAppDefaults()
  return getAppStorageSummary()
}

/**
 * 恢复默认偏好（不清空历史 / 常去 / 会话）
 */
export function restoreAppDefaults() {
  setLocale('zh-CN')
  setUiTheme('light')
  setBasemap('vec')
  setNavPrefs(defaultNavPrefs())
  setAutoViewLock(true)
  return {
    locale: 'zh-CN',
    theme: 'light',
    basemap: 'vec',
    prefs: defaultNavPrefs(),
    autoViewLock: true,
  }
}
