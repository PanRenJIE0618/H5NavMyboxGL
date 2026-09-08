/**
 * H5 UI 主题（浅色 / 深色 / 高对比）
 * 持久化：localStorage `h5nav:uiTheme`
 */

export const UI_THEME_KEY = 'h5nav:uiTheme'

/** @type {readonly ['light', 'dark', 'contrast']} */
export const UI_THEMES = Object.freeze(['light', 'dark', 'contrast'])

export const UI_THEME_OPTIONS = Object.freeze([
  { id: 'light', label: '浅色', desc: '白底面板，默认风格' },
  { id: 'dark', label: '深色', desc: '深色面板，夜间更护眼' },
  { id: 'contrast', label: '高对比', desc: '黑白强化，户外更清晰' },
])

/**
 * @param {unknown} value
 * @returns {'light' | 'dark' | 'contrast'}
 */
export function normalizeUiTheme(value) {
  const id = String(value || '').trim()
  return UI_THEMES.includes(/** @type {'light'} */ (id)) ? /** @type {'light'|'dark'|'contrast'} */ (id) : 'light'
}

export function getStoredUiTheme() {
  try {
    return normalizeUiTheme(localStorage.getItem(UI_THEME_KEY))
  } catch {
    return 'light'
  }
}

/**
 * @param {'light' | 'dark' | 'contrast'} theme
 */
export function applyUiTheme(theme) {
  const id = normalizeUiTheme(theme)
  try {
    document.documentElement.dataset.theme = id
  } catch {
    // ignore
  }
  return id
}

/**
 * @param {'light' | 'dark' | 'contrast'} theme
 */
export function setUiTheme(theme) {
  const id = applyUiTheme(theme)
  try {
    localStorage.setItem(UI_THEME_KEY, id)
  } catch {
    // ignore
  }
  return id
}

/** 启动时读取并应用 */
export function initUiTheme() {
  return applyUiTheme(getStoredUiTheme())
}
