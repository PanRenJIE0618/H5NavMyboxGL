function envFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

/**
 * 登录页 + 巡检 Tab 是否上图。
 * 巡检暂关（写死 false）。恢复时改为：
 *   envFlag(import.meta.env.VITE_SHOW_AUTH_INSPECTION_UI, false)
 */
export const SHOW_AUTH_INSPECTION_UI = false

/**
 * 自动读取剪贴板并弹「前往剪贴板地点」
 * 默认关闭：iOS/微信会反复弹「粘贴」授权并打断输入
 * 开启：VITE_ENABLE_CLIPBOARD_AUTO=true
 */
export const ENABLE_CLIPBOARD_AUTO = envFlag(
  import.meta.env.VITE_ENABLE_CLIPBOARD_AUTO,
  false,
)
