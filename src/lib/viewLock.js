/**
 * 自动视角锁定（相机跟随当前位置）
 * 持久化：localStorage `h5nav:autoViewLock`
 */

export const AUTO_VIEW_LOCK_KEY = 'h5nav:autoViewLock'

/** @type {Set<(enabled: boolean) => void>} */
const listeners = new Set()

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeAutoViewLock(value) {
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  // 默认开启，与原先拖图后自动回锁行为一致
  return true
}

export function getAutoViewLock() {
  try {
    const raw = localStorage.getItem(AUTO_VIEW_LOCK_KEY)
    if (raw == null) return true
    return normalizeAutoViewLock(raw)
  } catch {
    return true
  }
}

/**
 * @param {boolean} enabled
 */
export function setAutoViewLock(enabled) {
  const next = Boolean(enabled)
  try {
    localStorage.setItem(AUTO_VIEW_LOCK_KEY, next ? '1' : '0')
  } catch {
    // ignore
  }
  listeners.forEach((fn) => {
    try {
      fn(next)
    } catch {
      // ignore
    }
  })
  return next
}

/**
 * @param {(enabled: boolean) => void} fn
 * @returns {() => void}
 */
export function onAutoViewLockChange(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}
