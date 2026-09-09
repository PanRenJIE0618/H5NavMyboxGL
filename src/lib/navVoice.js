/**
 * H5 导航语音播报（Web Speech API）
 * 针对移动端：必须在用户手势内 unlock；iOS 需 resume 看门狗。
 */

import { getBehaviorPolicy } from '../config/behaviorPolicy.js'
import { getVoiceLang, t } from '../i18n/index.js'

let muted = false
let unlocked = false
let lastSpoken = ''
let lastSpokenAt = 0
let resumeTimer = 0
let voicesReady = false
/** @type {string[]} */
let pendingQueue = []

function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function resolveOpts() {
  const p = getBehaviorPolicy()
  return {
    enabled: p.voiceEnabled !== false,
    rate: Number(p.voiceRate) || 1,
    lang: getVoiceLang() || p.voiceLang || 'zh-CN',
    pitch: 1,
    volume: 1,
  }
}

function pickVoice(lang) {
  try {
    const voices = window.speechSynthesis.getVoices?.() || []
    if (!voices.length) return null
    const wanted = String(lang || 'zh-CN')
    const prefix = wanted.toLowerCase().slice(0, 2)
    return (
      voices.find((v) => String(v.lang).replace('_', '-') === wanted) ||
      voices.find((v) => String(v.lang).toLowerCase().startsWith(prefix)) ||
      voices.find((v) => /zh-CN|zh_CN|zh-TW|zh_TW|zh-HK/i.test(v.lang)) ||
      voices.find((v) => /Chinese|中文|普通话|粤语|國語/i.test(v.name)) ||
      voices[0] ||
      null
    )
  } catch {
    return null
  }
}

function ensureVoicesListener() {
  if (!canSpeak() || voicesReady) return
  const mark = () => {
    const list = window.speechSynthesis.getVoices?.() || []
    if (list.length) {
      voicesReady = true
      flushPending()
    }
  }
  mark()
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', mark)
    // 兼容旧 WebKit
    window.speechSynthesis.onvoiceschanged = mark
  } catch {
    // ignore
  }
  // 部分机型延迟才有 voices
  window.setTimeout(mark, 300)
  window.setTimeout(mark, 1000)
}

function startResumeWatchdog() {
  if (resumeTimer) return
  resumeTimer = window.setInterval(() => {
    if (!canSpeak()) return
    try {
      // iOS / 部分 Android：speaking 时会被置为 paused，需不断 resume
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.resume()
      }
    } catch {
      // ignore
    }
  }, 200)
}

function stopResumeWatchdog() {
  if (!resumeTimer) return
  window.clearInterval(resumeTimer)
  resumeTimer = 0
}

/**
 * 必须在 click / touch 同步调用（任何 await 之前）。
 * @param {{ primingText?: string }} [options]
 */
export function unlockNavVoice(options = {}) {
  if (!canSpeak()) return false
  ensureVoicesListener()
  startResumeWatchdog()

  try {
    // 不要 cancel：移动端 cancel 会清掉手势解锁
    const priming = String(options.primingText || '。').trim() || '。'
    const u = new SpeechSynthesisUtterance(priming)
    u.lang = resolveOpts().lang
    u.volume = options.primingText ? 1 : 0.01
    u.rate = 1
    const voice = pickVoice(u.lang)
    if (voice) u.voice = voice
    u.onend = () => flushPending()
    u.onerror = () => flushPending()
    window.speechSynthesis.resume()
    window.speechSynthesis.speak(u)
    unlocked = true
    // 异步规划后 speak 可能已入队：短暂后再冲一次
    window.setTimeout(() => flushPending(), 80)
    return true
  } catch {
    return false
  }
}

/** @deprecated 请用 unlockNavVoice；保留兼容 */
export function warmUpNavVoice() {
  return unlockNavVoice()
}

export function isNavVoiceMuted() {
  return muted
}

export function isNavVoiceUnlocked() {
  return unlocked
}

export function setNavVoiceMuted(next) {
  muted = Boolean(next)
  if (muted) stopNavVoice()
  return muted
}

export function toggleNavVoiceMuted() {
  return setNavVoiceMuted(!muted)
}

export function stopNavVoice() {
  if (!canSpeak()) return
  pendingQueue = []
  try {
    window.speechSynthesis.cancel()
  } catch {
    // ignore
  }
}

function flushPending() {
  if (!pendingQueue.length) return
  const next = pendingQueue.shift()
  if (next) speakNav(next, { interrupt: false, dedupeMs: 0, _fromQueue: true })
}

/**
 * @param {string} text
 * @param {{ interrupt?: boolean, dedupeMs?: number, force?: boolean, _fromQueue?: boolean }} [options]
 */
export function speakNav(text, options = {}) {
  const raw = String(text || '').trim()
  if (!raw || !canSpeak()) return false

  const opts = resolveOpts()
  if (!opts.enabled && !options.force) return false
  if (muted && !options.force) return false

  ensureVoicesListener()
  startResumeWatchdog()

  // 尚未在手势内解锁：先入队，等 unlock / voices
  if (!unlocked && !options.force) {
    if (!pendingQueue.includes(raw)) pendingQueue.push(raw)
    return false
  }

  const dedupeMs = options.dedupeMs ?? 2500
  const now = Date.now()
  if (raw === lastSpoken && now - lastSpokenAt < dedupeMs) return false

  const interrupt = options.interrupt !== false
  if (interrupt) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  }

  try {
    const u = new SpeechSynthesisUtterance(raw)
    u.lang = opts.lang
    u.rate = Math.min(1.4, Math.max(0.75, opts.rate))
    u.pitch = opts.pitch
    u.volume = opts.volume
    const voice = pickVoice(opts.lang)
    if (voice) u.voice = voice

    u.onend = () => {
      flushPending()
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        // 保持 watchdog，导航中还要用
      }
    }
    u.onerror = () => {
      flushPending()
    }

    lastSpoken = raw
    lastSpokenAt = now
    window.speechSynthesis.resume()
    window.speechSynthesis.speak(u)
    // 部分机型 speak 后立刻 paused
    window.setTimeout(() => {
      try {
        window.speechSynthesis.resume()
      } catch {
        // ignore
      }
    }, 40)
    return true
  } catch {
    return false
  }
}

/** 开始导航概要 */
export function speakNavOverview({ modeLabel, distanceText, durationText } = {}) {
  const parts = [t('voice.startNav', { mode: modeLabel || t('voice.nav') })]
  if (distanceText) parts.push(t('voice.distance', { distance: distanceText }))
  if (durationText) parts.push(t('voice.duration', { duration: durationText }))
  return speakNav(parts.join(getVoiceLang().startsWith('zh') ? '，' : ', '), {
    interrupt: true,
    dedupeMs: 0,
  })
}

export function getNavVoiceSupportHint() {
  if (!canSpeak()) {
    return t('voice.unsupported')
  }
  return ''
}

let pageHiddenAt = 0

/** 页面进入后台：停播报与看门狗 */
export function onNavVoicePageHidden() {
  pageHiddenAt = Date.now()
  stopResumeWatchdog()
  if (!canSpeak()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // ignore
  }
}

/**
 * 页面回前台。
 * @param {{ hiddenMs?: number }} [options]
 */
export function onNavVoicePageVisible(options = {}) {
  const policyMs = Number(getBehaviorPolicy().navVoiceRelockHiddenMs)
  const relockAfter = Number.isFinite(policyMs) ? policyMs : 30000
  const hiddenMs =
    options.hiddenMs != null
      ? Number(options.hiddenMs)
      : pageHiddenAt
        ? Date.now() - pageHiddenAt
        : 0
  pageHiddenAt = 0

  if (Number.isFinite(hiddenMs) && hiddenMs >= relockAfter) {
    unlocked = false
  }
  ensureVoicesListener()
  startResumeWatchdog()
  if (canSpeak()) {
    try {
      window.speechSynthesis.resume()
    } catch {
      // ignore
    }
  }
}
