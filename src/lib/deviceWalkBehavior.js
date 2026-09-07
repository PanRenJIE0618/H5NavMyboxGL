import { normalizeHeading, shortestDelta } from './heading.js'
import { DEFAULT_BEHAVIOR_POLICY } from '../config/behaviorPolicy.js'

/**
 * 设备步行朝向行为：
 * 进入页面且未导航时，若用户持续朝同一方向行走约 5–10 秒，
 * 触发一次地图朝向修正（地图 bearing = 设备/行进朝向），
 * 并在仍保持同向行走时继续跟踪；停下、大幅转向、开始导航或手动拖图后释放。
 *
 * @param {object|(() => object)} options 静态配置，或返回 walk 配置的函数（支持热更新）
 */
export function createDeviceWalkBehavior(options = {}) {
  const staticOpts = typeof options === 'function' ? {} : options
  const resolveOpts = typeof options === 'function' ? options : () => staticOpts

  function walkCfg() {
    const o = resolveOpts() || {}
    const d = DEFAULT_BEHAVIOR_POLICY.walk
    return {
      minStableMs: o.minStableMs ?? d.minStableMs,
      windowMs: o.windowMs ?? d.windowMs,
      maxDevDeg: o.maxDevDeg ?? d.maxDevDeg,
      minSpeedMps: o.minSpeedMps ?? d.minSpeedMps,
      stopGraceMs: o.stopGraceMs ?? d.stopGraceMs,
      cooldownMs: o.cooldownMs ?? d.cooldownMs,
      turnBreakDeg: o.turnBreakDeg ?? d.turnBreakDeg,
      onCorrect: o.onCorrect ?? staticOpts.onCorrect,
      onRelease: o.onRelease ?? staticOpts.onRelease,
    }
  }

  /** @type {{ t: number, h: number }[]} */
  let samples = []
  let tracking = false
  let trackingHeading = null
  let lastAlignAt = 0
  let lastMovingAt = 0
  let lastSeenHeading = null

  function reset(reason = 'reset') {
    const wasTracking = tracking
    samples = []
    tracking = false
    trackingHeading = null
    lastSeenHeading = null
    if (wasTracking) walkCfg().onRelease?.(reason)
  }

  function isTracking() {
    return tracking
  }

  function getTrackingHeading() {
    return tracking ? trackingHeading : null
  }

  /**
   * @param {{ heading: number|null, speed: number|null, navigating?: boolean, t?: number }} input
   * @returns {{ corrected?: number, tracking?: number, released?: boolean } | null}
   */
  function update(input) {
    const t = input.t ?? Date.now()
    const cfg = walkCfg()
    const {
      minStableMs,
      windowMs,
      maxDevDeg,
      minSpeedMps,
      stopGraceMs,
      cooldownMs,
      turnBreakDeg,
      onCorrect,
      onRelease,
    } = cfg

    const heading = Number.isFinite(input.heading) ? normalizeHeading(input.heading) : null
    const speed = Number(input.speed)
    const navigating = Boolean(input.navigating)

    if (navigating) {
      if (tracking || samples.length) {
        reset('navigating')
        return { released: true }
      }
      return null
    }

    const moving = Number.isFinite(speed) && speed >= minSpeedMps

    if (moving && heading != null) {
      lastMovingAt = t
      // 大幅转向：打断当前跟踪与采样 streak
      if (
        lastSeenHeading != null &&
        Math.abs(shortestDelta(lastSeenHeading, heading)) > turnBreakDeg
      ) {
        samples = []
        if (tracking) {
          tracking = false
          trackingHeading = null
          onRelease?.('turn')
          lastSeenHeading = heading
          return { released: true }
        }
      }
      lastSeenHeading = heading
      samples.push({ t, h: heading })
      while (samples.length && t - samples[0].t > windowMs) samples.shift()
    } else if (tracking && t - lastMovingAt > stopGraceMs) {
      reset('stopped')
      return { released: true }
    } else if (!tracking && t - lastMovingAt > stopGraceMs) {
      samples = []
      return null
    }

    const stats = analyzeSamples(samples, maxDevDeg)
    if (!stats) return tracking && trackingHeading != null ? { tracking: trackingHeading } : null

    if (tracking) {
      trackingHeading = stats.mean
      return { tracking: trackingHeading }
    }

    // 尚未触发：稳定行走满 minStableMs（约 5–10s 窗口内）
    if (stats.durationMs < minStableMs) return null
    if (t - lastAlignAt < cooldownMs) return null

    tracking = true
    trackingHeading = stats.mean
    lastAlignAt = t
    onCorrect?.(trackingHeading, {
      durationMs: stats.durationMs,
      sampleCount: samples.length,
      maxDev: stats.maxDev,
    })
    return { corrected: trackingHeading, tracking: trackingHeading }
  }

  return {
    update,
    reset,
    isTracking,
    getTrackingHeading,
  }
}

function analyzeSamples(samples, maxDevDeg) {
  if (!samples?.length) return null
  const durationMs = samples[samples.length - 1].t - samples[0].t
  if (samples.length < 5) return null

  const rad = samples.map((s) => (s.h * Math.PI) / 180)
  const ax = rad.reduce((sum, a) => sum + Math.cos(a), 0) / rad.length
  const ay = rad.reduce((sum, a) => sum + Math.sin(a), 0) / rad.length
  const mean = normalizeHeading((Math.atan2(ay, ax) * 180) / Math.PI)

  let maxDev = 0
  for (const s of samples) {
    maxDev = Math.max(maxDev, Math.abs(shortestDelta(mean, s.h)))
  }
  if (maxDev > maxDevDeg) return null

  return { mean, maxDev, durationMs }
}
