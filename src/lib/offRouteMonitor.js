/**
 * 导航偏航监测模块
 *
 * - 仅在导航中由调用方喂入定位与路线投影结果
 * - 阈值来自行为策略（offRouteMeters / offRouteHits / rerouteCooldownMs）
 * - 自动重规划开关：offRouteAutoReroute（后续可改由后端决策）
 * - replanHook 预留后端联调入口
 */

/**
 * @typedef {object} OffRouteEvalInput
 * @property {boolean} onRoute
 * @property {number} [distanceMeters]
 * @property {number} [now]
 */

/**
 * @typedef {object} OffRouteEvalResult
 * @property {boolean} offRoute
 * @property {boolean} shouldReroute
 * @property {number} hits
 * @property {number} distanceMeters
 */

/**
 * @param {() => { offRouteHits?: number, rerouteCooldownMs?: number, offRouteAutoReroute?: boolean }} getPolicy
 * @param {{ onShouldReroute?: (ctx: object) => void, replanHook?: (ctx: object) => Promise<object|null>|object|null }} [hooks]
 */
export function createOffRouteMonitor(getPolicy, hooks = {}) {
  let hits = 0
  let lastRerouteAt = 0
  let lastDistanceMeters = 0
  let active = false

  function resolvePolicy() {
    const p = typeof getPolicy === 'function' ? getPolicy() : getPolicy || {}
    return {
      offRouteHits: Number(p.offRouteHits) > 0 ? Number(p.offRouteHits) : 3,
      rerouteCooldownMs: Number.isFinite(Number(p.rerouteCooldownMs)) ? Number(p.rerouteCooldownMs) : 8000,
      offRouteAutoReroute: p.offRouteAutoReroute !== false,
    }
  }

  function start() {
    active = true
    reset('start')
  }

  function stop() {
    active = false
    reset('stop')
  }

  function reset(_reason = 'reset') {
    hits = 0
    lastDistanceMeters = 0
  }

  function isActive() {
    return active
  }

  function getState() {
    return {
      active,
      hits,
      lastRerouteAt,
      distanceMeters: lastDistanceMeters,
      offRoute: hits > 0,
    }
  }

  /**
   * @param {OffRouteEvalInput} input
   * @returns {OffRouteEvalResult | null}
   */
  function evaluate(input) {
    if (!active) return null
    const now = input.now ?? Date.now()
    const distanceMeters = Number(input.distanceMeters)
    lastDistanceMeters = Number.isFinite(distanceMeters) ? distanceMeters : lastDistanceMeters

    if (input.onRoute) {
      hits = 0
      return {
        offRoute: false,
        shouldReroute: false,
        hits: 0,
        distanceMeters: lastDistanceMeters,
      }
    }

    hits += 1
    const policy = resolvePolicy()
    const cooled = now - lastRerouteAt > policy.rerouteCooldownMs
    const shouldReroute =
      policy.offRouteAutoReroute && hits >= policy.offRouteHits && cooled

    const result = {
      offRoute: true,
      shouldReroute,
      hits,
      distanceMeters: lastDistanceMeters,
    }

    if (shouldReroute) {
      hooks.onShouldReroute?.(result)
    }
    return result
  }

  function markRerouteStarted(now = Date.now()) {
    lastRerouteAt = now
    hits = 0
  }

  /**
   * 手动 / 自动重规划统一入口；优先走 replanHook（后端），否则由调用方本地规划
   * @param {object} ctx
   */
  async function requestReplan(ctx) {
    if (typeof hooks.replanHook === 'function') {
      return hooks.replanHook(ctx)
    }
    return null
  }

  return {
    start,
    stop,
    reset,
    evaluate,
    markRerouteStarted,
    requestReplan,
    isActive,
    getState,
  }
}
