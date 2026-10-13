import { TIANDITU_TK } from '../../config'
import { ENABLE_CLIPBOARD_AUTO } from '../../config/featureFlags'
import { unlockNavVoice } from '../../lib/navVoice'
import { searchPlaces } from '../../lib/search'
import {
  clipboardFingerprint,
  extractAddressCandidate,
  isClipboardPromptingBrowser,
  isEditingTextField,
  readClipboardTextDetailed,
} from '../../lib/clipboardAddress'
import { debugLog } from '../../lib/debugLog'
import { t } from '../../i18n'

/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function installNavClipboard(ctx) {
  const {
    address,
    clipboardOffer,
    destination,
    error,
    keyword,
    lat,
    lng,
    locatingHint,
    navigating,
    pendingResume,
    routing,
    searchError,
  } = ctx

/** @type {string} 已弹出过的内容指纹 */
ctx.lastOfferedClipboardFp = ''

/** @type {string} 用户忽略的内容指纹 */
ctx.dismissedClipboardFp = ''

/** @type {string} 已判定非地址的内容指纹 */
ctx.lastIgnoredClipboardFp = ''

ctx.clipboardPollTimer = 0

ctx.clipboardCheckInFlight = false

ctx.clipboardGestureBound = false

/** iOS 上读剪贴板会弹系统「粘贴」条；仅在回前台时探测一次 */
ctx.clipboardPromptingBrowser = isClipboardPromptingBrowser()

ctx.onClipboardUserGesture = function onClipboardUserGesture(event) {
  if (isEditingTextField()) return
  const target = event?.target
  if (
    target &&
    typeof target.closest === 'function' &&
    target.closest('input, textarea, select, [contenteditable="true"], button, a')
  ) {
    return
  }
  void ctx.checkClipboardForAddress({ reason: 'gesture' })
}

ctx.startClipboardWatch = function startClipboardWatch() {
  ctx.stopClipboardWatch()
  if (typeof window === 'undefined') return
  if (!ENABLE_CLIPBOARD_AUTO) return
  // iOS：禁止轮询与全局手势读剪贴板，否则输入时反复弹「粘贴」且键盘失效
  if (ctx.clipboardPromptingBrowser) return
  ctx.clipboardPollTimer = window.setInterval(() => {
    void ctx.checkClipboardForAddress({ reason: 'poll' })
  }, 2500)
  ctx.bindClipboardGestureHook()
}

ctx.stopClipboardWatch = function stopClipboardWatch() {
  if (ctx.clipboardPollTimer) {
    window.clearInterval(ctx.clipboardPollTimer)
    ctx.clipboardPollTimer = 0
  }
}

ctx.bindClipboardGestureHook = function bindClipboardGestureHook() {
  if (ctx.clipboardGestureBound || typeof window === 'undefined') return
  if (ctx.clipboardPromptingBrowser) return
  ctx.clipboardGestureBound = true
  // 仅 pointerdown：keydown 会在输入时每敲一字触发读剪贴板
  window.addEventListener('pointerdown', ctx.onClipboardUserGesture, { passive: true })
}

ctx.unbindClipboardGestureHook = function unbindClipboardGestureHook() {
  if (!ctx.clipboardGestureBound || typeof window === 'undefined') return
  ctx.clipboardGestureBound = false
  window.removeEventListener('pointerdown', ctx.onClipboardUserGesture)
}

/**
 * 读取剪贴板；若文本像地址则弹出前往提示
 * @param {{ reason?: string }} [opts]
 */
ctx.checkClipboardForAddress = async function checkClipboardForAddress(opts = {}) {
  if (!ENABLE_CLIPBOARD_AUTO && opts.reason !== 'manual') return
  if (ctx.clipboardCheckInFlight) return
  if (!ctx.props.active || navigating.value || routing.value) return
  if (pendingResume.value) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (isEditingTextField()) return
  // iOS：忽略 focus/gesture/poll，只保留回前台探测，避免粘贴条打断操作
  if (
    ctx.clipboardPromptingBrowser &&
    opts.reason !== 'visible' &&
    opts.reason !== 'pageshow' &&
    opts.reason !== 'manual'
  ) {
    return
  }

  ctx.clipboardCheckInFlight = true
  try {
    const { text, error } = await readClipboardTextDetailed()
    if (text == null) {
      if (opts.reason === 'gesture' || opts.reason === 'focus') {
        debugLog('clipboard 读取失败', { reason: opts.reason, error })
      }
      return
    }

    const fp = clipboardFingerprint(text)
    if (!fp) return
    if (fp === ctx.dismissedClipboardFp) return
    if (fp === ctx.lastOfferedClipboardFp && clipboardOffer.value) return
    if (fp === ctx.lastIgnoredClipboardFp) return

    const hit = extractAddressCandidate(text)
    if (!hit) {
      ctx.lastIgnoredClipboardFp = fp
      if (clipboardOffer.value) clipboardOffer.value = null
      debugLog('clipboard 非地址', {
        reason: opts.reason,
        preview: fp.slice(0, 48),
      })
      return
    }

    if (
      destination.value?.name &&
      (destination.value.name === hit.query ||
        destination.value.address === hit.query)
    ) {
      ctx.lastIgnoredClipboardFp = fp
      return
    }

    ctx.lastOfferedClipboardFp = fp
    clipboardOffer.value = {
      query: hit.query,
      kind: hit.kind,
      lng: hit.lng,
      lat: hit.lat,
      preview: hit.query.length > 36 ? `${hit.query.slice(0, 36)}…` : hit.query,
      fingerprint: fp,
    }
    debugLog('clipboard 命中地址', {
      reason: opts.reason,
      kind: hit.kind,
      query: hit.query,
    })
  } finally {
    ctx.clipboardCheckInFlight = false
  }
}

ctx.discardClipboardOffer = function discardClipboardOffer() {
  const fp = clipboardOffer.value?.fingerprint || ctx.lastOfferedClipboardFp
  if (fp) ctx.dismissedClipboardFp = fp
  clipboardOffer.value = null
}

ctx.confirmClipboardOffer = async function confirmClipboardOffer() {
  const offer = clipboardOffer.value
  if (!offer?.query || routing.value || navigating.value) return
  unlockNavVoice({ primingText: t('voice.unlockStart') })
  ctx.dismissedClipboardFp = offer.fingerprint || ''
  clipboardOffer.value = null
  locatingHint.value = t('hint.clipboardRecognizing')

  try {
    let place = null
    if (
      offer.kind === 'coord' &&
      Number.isFinite(Number(offer.lng)) &&
      Number.isFinite(Number(offer.lat))
    ) {
      place = {
        name: t('map.clipboardCoord'),
        address: offer.query,
        lng: Number(offer.lng),
        lat: Number(offer.lat),
      }
    } else {
      const around =
        lng.value != null && lat.value != null
          ? { lng: Number(lng.value), lat: Number(lat.value) }
          : null
      const found = await searchPlaces(offer.query, around, TIANDITU_TK)
      place = found[0] || null
    }

    if (!place) {
      locatingHint.value = t('hint.clipboardNotFound')
      keyword.value = offer.query
      return
    }

    keyword.value = place.name || offer.query
    await ctx.selectPlace(place)
    locatingHint.value = t('hint.planning')
    const ok = await ctx.prepareDualRoutes({ previewDual: false })
    if (ok) await ctx.startNavigation()
    else if (!searchError.value) locatingHint.value = t('hint.routeFail')
  } catch (err) {
    locatingHint.value = err?.message || t('hint.clipboardNavFail')
  }
}
}

/** @see installNavClipboard */
export const useNavClipboard = installNavClipboard
