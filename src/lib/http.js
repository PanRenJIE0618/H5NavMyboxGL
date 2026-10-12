import { t } from '../i18n/index.js'
import { toast } from './toast.js'

export class HttpError extends Error {
  /**
   * @param {{ code: string, message: string, status?: number, cause?: unknown }} opts
   */
  constructor(opts) {
    super(opts.message)
    this.name = 'HttpError'
    this.code = opts.code
    this.status = opts.status ?? 0
    this.cause = opts.cause
  }
}

/**
 * @param {string} url
 * @param {RequestInit & {
 *   timeout?: number,
 *   silent?: boolean,
 *   parse?: 'text' | 'json' | 'raw',
 *   toastOnHttpError?: boolean,
 * }} [options]
 */
export async function request(url, options = {}) {
  const {
    timeout = 15000,
    silent = false,
    parse = 'text',
    toastOnHttpError = true,
    signal: outerSignal,
    ...init
  } = options

  const fail = (err) => {
    if (!silent && toastOnHttpError) toast.error(err.message)
    throw err
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return fail(new HttpError({ code: 'offline', message: t('http.offline') }))
  }

  const ctrl = new AbortController()
  // iOS Safari / 微信：abort(reason) 较晚才支持，统一无参 abort 避免启动期抛错
  const safeAbort = () => {
    try {
      ctrl.abort()
    } catch {
      // ignore
    }
  }
  const onAbort = () => safeAbort()
  if (outerSignal) {
    if (outerSignal.aborted) safeAbort()
    else outerSignal.addEventListener('abort', onAbort, { once: true })
  }

  const timer = timeout > 0 ? setTimeout(safeAbort, timeout) : null

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      return fail(
        new HttpError({
          code: 'http',
          status: res.status,
          message: t('http.unavailable', { status: String(res.status) }),
        }),
      )
    }
    if (parse === 'raw') return res
    if (parse === 'json') {
      try {
        return await res.json()
      } catch (cause) {
        return fail(new HttpError({ code: 'parse', message: t('http.parse'), cause }))
      }
    }
    return await res.text()
  } catch (cause) {
    if (cause instanceof HttpError) throw cause
    const aborted =
      cause?.name === 'AbortError' ||
      (typeof DOMException !== 'undefined' && cause instanceof DOMException && cause.name === 'AbortError')
    if (aborted) {
      return fail(new HttpError({ code: 'timeout', message: t('http.timeout'), cause }))
    }
    return fail(new HttpError({ code: 'network', message: t('http.network'), cause }))
  } finally {
    if (timer) clearTimeout(timer)
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort)
  }
}
