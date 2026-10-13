function envFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

export const TIANDITU_TK =
  import.meta.env.VITE_TIANDITU_TK || '01351bc3b46456a67a34f45c5a62c76d'

/** 天地图 Web 墨卡托矢量底图（与 Mapbox 默认 EPSG:3857 一致） */
export const TIANDITU_BASE_LAYER = 'vec_w'
/** 矢量注记 */
export const TIANDITU_LABEL_LAYER = 'cva_w'

/**
 * 是否经本站同源代理访问天地图（默认开）。
 * 微信等内置浏览器常拦截/WAF 直连 tianditu.gov.cn，同源代理可恢复瓦片与 API。
 * 关闭：VITE_TIANDITU_PROXY=false
 */
export const USE_TIANDITU_PROXY = envFlag(import.meta.env.VITE_TIANDITU_PROXY, true)

/**
 * 底图提供方：
 * - auto：优先天地图，瓦片失败则切 SuperMap
 * - supermap：固定 SuperMap 中国底图
 * - tianditu：固定天地图
 */
export const TILE_PROVIDER = String(import.meta.env.VITE_TILE_PROVIDER || 'auto')
  .trim()
  .toLowerCase()

/** SuperMap 在线中国底图（EPSG:3857），作天地图不可用时的兜底 */
export const SUPERMAP_CHINA_TILE_URL =
  'https://iserver.supermap.io/iserver/services/map-china400/rest/maps/China/zxyTileImage.png?z={z}&x={x}&y={y}'

const SUBDOMAINS = [0, 1, 2, 3, 4, 5, 6, 7]

/** 瓦片：同源 `/proxy/tianditu/t{n}/...` 或直连官方域名 */
export function tiandituTileUrls(layerType, tk = TIANDITU_TK) {
  return SUBDOMAINS.map((n) =>
    USE_TIANDITU_PROXY
      ? `/proxy/tianditu/t${n}/DataServer?T=${layerType}&x={x}&y={y}&l={z}&tk=${tk}`
      : `https://t${n}.tianditu.gov.cn/DataServer?T=${layerType}&x={x}&y={y}&l={z}&tk=${tk}`,
  )
}

/** 检索 / 地理编码 / 驾车：同源 `/proxy/tianditu/api/...` 或直连 */
export function tiandituApiUrl(pathAndQuery) {
  const path = String(pathAndQuery || '').replace(/^\//, '')
  if (USE_TIANDITU_PROXY) return `/proxy/tianditu/api/${path}`
  return `https://api.tianditu.gov.cn/${path}`
}

export function supermapChinaTileUrls() {
  return [SUPERMAP_CHINA_TILE_URL]
}

export const DEFAULT_CENTER = { lng: 116.40969, lat: 39.89945 }
export const DEFAULT_ZOOM = 5
export const LOCATED_ZOOM = 18
export const NAV_ZOOM = 18
export const MAX_ZOOM = 18

export {
  DEFAULT_BEHAVIOR_POLICY,
  applyBehaviorPolicy,
  fetchBehaviorPolicy,
  getBehaviorPolicy,
  normalizeBehaviorPolicy,
  onBehaviorPolicyChange,
  resetBehaviorPolicy,
  setBehaviorPolicy,
} from './config/behaviorPolicy.js'
