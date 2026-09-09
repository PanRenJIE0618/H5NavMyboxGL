/**
 * 简易 i18n：界面文案 + 语音语言
 * 持久化：localStorage `h5nav:locale`
 */

import { ref } from 'vue'
import zhCN from './locales/zh-CN.js'
import en from './locales/en.js'
import zhTW from './locales/zh-TW.js'

export const LOCALE_KEY = 'h5nav:locale'

/** @typedef {'zh-CN' | 'en' | 'zh-TW'} AppLocale */

/** @type {readonly { id: AppLocale, label: string, nativeLabel: string, voiceLang: string }[]} */
export const LOCALE_OPTIONS = Object.freeze([
  { id: 'zh-CN', label: '简体中文', nativeLabel: '简体中文', voiceLang: 'zh-CN' },
  { id: 'en', label: 'English', nativeLabel: 'English', voiceLang: 'en-US' },
  { id: 'zh-TW', label: '繁體中文', nativeLabel: '繁體中文', voiceLang: 'zh-TW' },
])

const MESSAGES = {
  'zh-CN': zhCN,
  en,
  'zh-TW': zhTW,
}

/** @type {Set<(id: AppLocale) => void>} */
const listeners = new Set()

/**
 * @param {unknown} value
 * @returns {AppLocale}
 */
export function normalizeLocale(value) {
  const id = String(value || '').trim()
  return LOCALE_OPTIONS.some((item) => item.id === id) ? /** @type {AppLocale} */ (id) : 'zh-CN'
}

export function getStoredLocale() {
  try {
    return normalizeLocale(localStorage.getItem(LOCALE_KEY))
  } catch {
    return 'zh-CN'
  }
}

/** 当前语言（响应式） */
export const locale = ref(/** @type {AppLocale} */ ('zh-CN'))

export function getLocale() {
  return normalizeLocale(locale.value)
}

export function getVoiceLang() {
  const opt = LOCALE_OPTIONS.find((item) => item.id === getLocale())
  return opt?.voiceLang || 'zh-CN'
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 */
export function t(key, params) {
  const id = getLocale()
  const dict = MESSAGES[id] || zhCN
  let text = dict[key] ?? zhCN[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return text
}

/**
 * @param {AppLocale | string} next
 */
export function setLocale(next) {
  const id = normalizeLocale(next)
  locale.value = id
  try {
    localStorage.setItem(LOCALE_KEY, id)
  } catch {
    // ignore
  }
  try {
    document.documentElement.lang = id
  } catch {
    // ignore
  }
  listeners.forEach((fn) => {
    try {
      fn(id)
    } catch {
      // ignore
    }
  })
  return id
}

/**
 * @param {(id: AppLocale) => void} fn
 */
export function onLocaleChange(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function initI18n() {
  const id = getStoredLocale()
  locale.value = id
  try {
    document.documentElement.lang = id
  } catch {
    // ignore
  }
  return id
}
