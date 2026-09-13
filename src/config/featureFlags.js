function envFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

/** 登录/巡检页面是否上图（App Tab） */
export const SHOW_AUTH_INSPECTION_UI = envFlag(
  import.meta.env.VITE_SHOW_AUTH_INSPECTION_UI,
  false,
)
