import { request } from '../lib/http.js'

/**
 * 用户行为策略配置（到达 / 偏航 / 测速 / 语音 / 会话 / 步行朝向等）
 *
 * - 本地默认值见 DEFAULT_BEHAVIOR_POLICY
 * - 运行时用 applyBehaviorPolicy / setBehaviorPolicy 热更新（可接后端下发）
 * - 读取请用 getBehaviorPolicy()，勿缓存解构后的数字常量
 *
 * ## 字段一览（DEFAULT_BEHAVIOR_POLICY）
 *
 * | 字段 | 含义 |
 * | --- | --- |
 * | version | 策略版本号 |
 * | locationResumeAfterDragMs | 拖图后恢复定位回调等待（ms） |
 * | viewLockAfterDragIdleMs | 拖图停止后自动开启视角跟随等待（ms） |
 * | pitch2d / pitch3d / maxPitch | 2D/3D 俯仰角与上限 |
 * | followUserOnInit / headingLockOnInit | 进页默认视角跟随 / 朝向锁定 |
 * | followUserOnNavStart / headingLockOnNavStart | 开始导航时默认开关 |
 * | pinCameraHoldMs | 强制居中后钉住相机时长（ms） |
 * | headingSampleWindowMs | 朝向采样窗口（ms） |
 * | arriveMeters | 到达判定距离（m） |
 * | offRouteMeters / offRouteHits | 偏航距离阈值与连续命中次数 |
 * | rerouteCooldownMs | 重规划冷却（ms） |
 * | offRouteAutoReroute | 偏航后是否自动重规划 |
 * | speedLimitKmh / speedIdleKmh | 限速与静止显示阈值（km/h） |
 * | voiceEnabled / voiceRate / voiceLang | 语音总开关、语速、语言 |
 * | navSessionTtlMs | 会话快照有效期（ms） |
 * | navSessionPersistThrottleMs / navSessionPersistMinMeters | 会话持久化节流 |
 * | navVoiceRelockHiddenMs | 挂起过久回前台后需重新解锁语音 |
 * | walk.* | 未导航时步行稳定朝向自动校正参数 |
 */

/** @typedef {typeof DEFAULT_BEHAVIOR_POLICY} BehaviorPolicy */

export const DEFAULT_BEHAVIOR_POLICY = Object.freeze({
  version: 1,

  /** 拖图后无再拖动，恢复定位回调的等待（ms） */
  locationResumeAfterDragMs: 10000,
  /** 拖图停止后自动开启视角跟随（视角锁定）的等待（ms） */
  viewLockAfterDragIdleMs: 10000,

  /** 2D / 3D 俯仰（Mapbox pitch，maxPitch 上限 60） */
  pitch2d: 0,
  pitch3d: 55,
  maxPitch: 60,

  /** 进入页面默认开关 */
  followUserOnInit: false,
  headingLockOnInit: false,

  /** 开始导航时默认开关 */
  followUserOnNavStart: true,
  headingLockOnNavStart: true,

  /** 强制居中后短时钉住相机（ms） */
  pinCameraHoldMs: 2800,
  /** 朝向采样窗口（ms） */
  headingSampleWindowMs: 2800,

  /** 导航到达 / 偏航 */
  arriveMeters: 35,
  offRouteMeters: 50,
  offRouteHits: 3,
  rerouteCooldownMs: 8000,
  /** 偏航后是否自动重规划（false 时仅提示，需用户点「重新规划」） */
  offRouteAutoReroute: true,

  /** 测速：超速阈值（km/h），可热更新 */
  speedLimitKmh: 60,
  /** 低于该速度（km/h）视为静止显示 0 */
  speedIdleKmh: 1.5,

  /** 导航语音播报（H5 Web Speech） */
  voiceEnabled: true,
  voiceRate: 1,
  voiceLang: 'zh-CN',

  /** 导航会话挂起恢复（sessionStorage） */
  navSessionTtlMs: 7200000,
  navSessionPersistThrottleMs: 15000,
  navSessionPersistMinMeters: 50,
  /** 挂起超过该时长回前台后需重新手势解锁语音 */
  navVoiceRelockHiddenMs: 30000,

  /** 未导航时步行稳定朝向自动校正 */
  walk: Object.freeze({
    minStableMs: 6000,
    windowMs: 10000,
    maxDevDeg: 30,
    minSpeedMps: 0.55,
    stopGraceMs: 1800,
    cooldownMs: 20000,
    turnBreakDeg: 55,
  }),
})

/** @type {BehaviorPolicy} */
let current = clonePolicy(DEFAULT_BEHAVIOR_POLICY)

/** @type {Set<(p: BehaviorPolicy) => void>} */
const listeners = new Set()

function clonePolicy(src) {
  return {
    ...src,
    walk: { ...(src.walk || DEFAULT_BEHAVIOR_POLICY.walk) },
  }
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  if (min != null && n < min) return min
  if (max != null && n > max) return max
  return n
}

function normalizeWalk(patchWalk, baseWalk) {
  const w = { ...baseWalk, ...(patchWalk && typeof patchWalk === 'object' ? patchWalk : {}) }
  return {
    minStableMs: clampNumber(w.minStableMs, baseWalk.minStableMs, 500, 120000),
    windowMs: clampNumber(w.windowMs, baseWalk.windowMs, 1000, 120000),
    maxDevDeg: clampNumber(w.maxDevDeg, baseWalk.maxDevDeg, 1, 180),
    minSpeedMps: clampNumber(w.minSpeedMps, baseWalk.minSpeedMps, 0, 20),
    stopGraceMs: clampNumber(w.stopGraceMs, baseWalk.stopGraceMs, 0, 60000),
    cooldownMs: clampNumber(w.cooldownMs, baseWalk.cooldownMs, 0, 300000),
    turnBreakDeg: clampNumber(w.turnBreakDeg, baseWalk.turnBreakDeg, 1, 180),
  }
}

/**
 * 规范化并合并策略片段（非法字段忽略，数值做合理钳制）
 * @param {Partial<BehaviorPolicy>} [patch]
 * @param {BehaviorPolicy} [base]
 */
export function normalizeBehaviorPolicy(patch, base = current) {
  const p = patch && typeof patch === 'object' ? patch : {}
  const next = clonePolicy(base)

  if (p.version != null) next.version = clampNumber(p.version, base.version, 1, 999)

  if (p.locationResumeAfterDragMs != null) {
    next.locationResumeAfterDragMs = clampNumber(
      p.locationResumeAfterDragMs,
      base.locationResumeAfterDragMs,
      1000,
      120000,
    )
  }
  if (p.viewLockAfterDragIdleMs != null) {
    next.viewLockAfterDragIdleMs = clampNumber(
      p.viewLockAfterDragIdleMs,
      base.viewLockAfterDragIdleMs,
      1000,
      120000,
    )
  }

  if (p.pitch2d != null) next.pitch2d = clampNumber(p.pitch2d, base.pitch2d, 0, 60)
  if (p.pitch3d != null) next.pitch3d = clampNumber(p.pitch3d, base.pitch3d, 0, 60)
  if (p.maxPitch != null) next.maxPitch = clampNumber(p.maxPitch, base.maxPitch, 0, 60)
  if (next.pitch3d > next.maxPitch) next.pitch3d = next.maxPitch
  if (next.pitch2d > next.maxPitch) next.pitch2d = next.maxPitch

  if (typeof p.followUserOnInit === 'boolean') next.followUserOnInit = p.followUserOnInit
  if (typeof p.headingLockOnInit === 'boolean') next.headingLockOnInit = p.headingLockOnInit
  if (typeof p.followUserOnNavStart === 'boolean') next.followUserOnNavStart = p.followUserOnNavStart
  if (typeof p.headingLockOnNavStart === 'boolean') next.headingLockOnNavStart = p.headingLockOnNavStart

  if (p.pinCameraHoldMs != null) {
    next.pinCameraHoldMs = clampNumber(p.pinCameraHoldMs, base.pinCameraHoldMs, 0, 30000)
  }
  if (p.headingSampleWindowMs != null) {
    next.headingSampleWindowMs = clampNumber(
      p.headingSampleWindowMs,
      base.headingSampleWindowMs,
      500,
      30000,
    )
  }

  if (p.arriveMeters != null) {
    next.arriveMeters = clampNumber(p.arriveMeters, base.arriveMeters, 1, 500)
  }
  if (p.offRouteMeters != null) {
    next.offRouteMeters = clampNumber(p.offRouteMeters, base.offRouteMeters, 1, 500)
  }
  if (p.offRouteHits != null) {
    next.offRouteHits = clampNumber(p.offRouteHits, base.offRouteHits, 1, 20)
  }
  if (p.rerouteCooldownMs != null) {
    next.rerouteCooldownMs = clampNumber(p.rerouteCooldownMs, base.rerouteCooldownMs, 0, 120000)
  }
  if (typeof p.offRouteAutoReroute === 'boolean') {
    next.offRouteAutoReroute = p.offRouteAutoReroute
  }

  if (p.speedLimitKmh != null) {
    next.speedLimitKmh = clampNumber(p.speedLimitKmh, base.speedLimitKmh, 5, 200)
  }
  if (p.speedIdleKmh != null) {
    next.speedIdleKmh = clampNumber(p.speedIdleKmh, base.speedIdleKmh, 0, 20)
  }

  if (typeof p.voiceEnabled === 'boolean') next.voiceEnabled = p.voiceEnabled
  if (p.voiceRate != null) next.voiceRate = clampNumber(p.voiceRate, base.voiceRate, 0.7, 1.5)
  if (typeof p.voiceLang === 'string' && p.voiceLang.trim()) {
    next.voiceLang = p.voiceLang.trim()
  }

  if (p.navSessionTtlMs != null) {
    next.navSessionTtlMs = clampNumber(p.navSessionTtlMs, base.navSessionTtlMs, 60000, 86400000)
  }
  if (p.navSessionPersistThrottleMs != null) {
    next.navSessionPersistThrottleMs = clampNumber(
      p.navSessionPersistThrottleMs,
      base.navSessionPersistThrottleMs,
      1000,
      300000,
    )
  }
  if (p.navSessionPersistMinMeters != null) {
    next.navSessionPersistMinMeters = clampNumber(
      p.navSessionPersistMinMeters,
      base.navSessionPersistMinMeters,
      5,
      2000,
    )
  }
  if (p.navVoiceRelockHiddenMs != null) {
    next.navVoiceRelockHiddenMs = clampNumber(
      p.navVoiceRelockHiddenMs,
      base.navVoiceRelockHiddenMs,
      0,
      600000,
    )
  }

  if (p.walk != null) next.walk = normalizeWalk(p.walk, base.walk)

  return next
}

/** 当前生效策略（只读快照，修改请走 apply/set） */
export function getBehaviorPolicy() {
  return clonePolicy(current)
}

/** 全量替换（会与默认值做规范化） */
export function setBehaviorPolicy(policy) {
  current = normalizeBehaviorPolicy(policy, DEFAULT_BEHAVIOR_POLICY)
  emitChange()
  return getBehaviorPolicy()
}

/** 增量合并热更新 */
export function applyBehaviorPolicy(patch) {
  current = normalizeBehaviorPolicy(patch, current)
  emitChange()
  return getBehaviorPolicy()
}

/** 恢复内置默认 */
export function resetBehaviorPolicy() {
  current = clonePolicy(DEFAULT_BEHAVIOR_POLICY)
  emitChange()
  return getBehaviorPolicy()
}

/**
 * 订阅策略变更（返回取消函数）
 * @param {(policy: BehaviorPolicy) => void} listener
 */
export function onBehaviorPolicyChange(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitChange() {
  const snap = getBehaviorPolicy()
  listeners.forEach((fn) => {
    try {
      fn(snap)
    } catch {
      // ignore listener errors
    }
  })
}

/**
 * 从后端 URL 拉取并热更新（后续对接用）
 * 期望 JSON 为 BehaviorPolicy 或其子集
 * @param {string} url
 * @param {RequestInit} [init]
 */
export async function fetchBehaviorPolicy(url, init) {
  const data = await request(url, { ...init, parse: 'json', timeout: 12000 })
  return applyBehaviorPolicy(data)
}
