export const TIANDITU_TK =
  import.meta.env.VITE_TIANDITU_TK || '01351bc3b46456a67a34f45c5a62c76d'

/** 天地图 Web 墨卡托矢量底图（与 Mapbox 默认 EPSG:3857 一致） */
export const TIANDITU_BASE_LAYER = 'vec_w'
/** 矢量注记 */
export const TIANDITU_LABEL_LAYER = 'cva_w'

/**
 * 底图提供方：
 * - auto：优先天地图，瓦片失败则切 SuperMap（微信/部分网络天地图常 403/418）
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

export function tiandituTileUrls(layerType, tk = TIANDITU_TK) {
  return SUBDOMAINS.map(
    (n) =>
      `https://t${n}.tianditu.gov.cn/DataServer?T=${layerType}&x={x}&y={y}&l={z}&tk=${tk}`,
  )
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
