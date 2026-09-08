/**
 * 快捷导航 · 推荐导航点（固定配置，可按项目改坐标）
 * 坐标系：WGS84（与地图一致）
 */

/** @typedef {{ id: string, name: string, lng: number, lat: number, address?: string, tag?: string }} RecommendPlace */

/** @type {readonly RecommendPlace[]} */
export const RECOMMEND_PLACES = Object.freeze([
  {
    id: 'rec-tiananmen',
    name: '天安门',
    lng: 116.397455,
    lat: 39.909187,
    address: '北京市东城区天安门广场',
    tag: '地标',
  },
  {
    id: 'rec-bj-west',
    name: '北京西站',
    lng: 116.322056,
    lat: 39.89491,
    address: '北京市丰台区莲花池东路118号',
    tag: '交通',
  },
  {
    id: 'rec-bj-south',
    name: '北京南站',
    lng: 116.378545,
    lat: 39.865195,
    address: '北京市丰台区永外大街车站路12号',
    tag: '交通',
  },
  {
    id: 'rec-capital-t3',
    name: '首都机场 T3',
    lng: 116.597122,
    lat: 40.079857,
    address: '北京市顺义区首都国际机场3号航站楼',
    tag: '机场',
  },
  {
    id: 'rec-sanlitun',
    name: '三里屯',
    lng: 116.4551,
    lat: 39.9375,
    address: '北京市朝阳区三里屯路',
    tag: '商圈',
  },
])

export function listRecommendPlaces() {
  return [...RECOMMEND_PLACES]
}

/**
 * 转成与历史记录兼容的选择载荷（供 applyHistoryItem）
 * @param {RecommendPlace} place
 */
export function recommendToHistoryShape(place) {
  if (!place) return null
  return {
    id: place.id,
    travelMode: 'drive',
    driveStyle: '0',
    destination: {
      name: place.name,
      lng: Number(place.lng),
      lat: Number(place.lat),
      address: place.address ? String(place.address) : '',
    },
  }
}
