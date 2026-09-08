/**
 * 剪贴板文本 → 疑似地址提取（仅本地启发式，不上传）
 */

const ADDRESS_HINT =
  /(?:省|市|区|县|旗|镇|乡|街道|路|街|巷|弄|道|号|栋|幢|座|楼|层|室|村|庄|园|苑|广场|商场|大厦|中心|机场|车站|地铁|公交|大学|医院|酒店|宾馆|公园|路口|立交|高架|环路|大道|支路|胡同|门牌|弄堂|里弄|小区|社区)/

const PLACE_NAME_HINT =
  /[\u4e00-\u9fff]{2,}(?:店|馆|局|所|场|站|校|院|寺|庙|宫|府|厅|部|委|厂|仓|库|港|桥|塔|门|口|城|镇)/

const COORD_RE =
  /(-?\d{1,3}\.\d{3,})\s*[,，\s]\s*(-?\d{1,3}\.\d{3,})/

const SKIP_LINE_RE =
  /^(?:https?:\/\/|www\.|password|密码|验证码|token|bearer|sk-|-----BEGIN|分享|来自|打开|点击|复制|微信|扫码)/i

const LABEL_STRIP_RE =
  /^(?:地址|位置|定位|目的地|终点|导航到|去|到)[:：\s]*/i

/**
 * @param {string} line
 * @returns {{ query: string, kind: 'address' | 'place' | 'coord', lng?: number, lat?: number } | null}
 */
function scoreLine(line) {
  let first = String(line || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!first || first.length < 2) return null
  if (SKIP_LINE_RE.test(first)) return null

  first = first.replace(LABEL_STRIP_RE, '').trim()
  if (!first || first.length < 2) return null
  if (/^[\d\s\-_.]{4,20}$/.test(first) && !COORD_RE.test(first)) return null

  const coordHit = first.match(COORD_RE)
  if (coordHit) {
    const a = Number(coordHit[1])
    const b = Number(coordHit[2])
    if (Number.isFinite(a) && Number.isFinite(b)) {
      let lng = a
      let lat = b
      if (Math.abs(a) <= 90 && Math.abs(b) > 90) {
        lng = b
        lat = a
      }
      // 放宽：国内常见范围；也允许全球粗判
      const inChina = lng >= 70 && lng <= 140 && lat >= 3 && lat <= 55
      const globalOk = Math.abs(lng) <= 180 && Math.abs(lat) <= 90
      if (!inChina && !globalOk) return null
      if (!inChina && (Math.abs(lng) < 0.1 || Math.abs(lat) < 0.1)) return null
      return {
        query: `${lng.toFixed(6)},${lat.toFixed(6)}`,
        kind: 'coord',
        lng,
        lat,
      }
    }
  }

  const candidate = first.slice(0, 120)
  const hanCount = (candidate.match(/[\u4e00-\u9fff]/g) || []).length

  if (ADDRESS_HINT.test(candidate) && hanCount >= 3) {
    return { query: candidate, kind: 'address' }
  }
  if (PLACE_NAME_HINT.test(candidate) && candidate.length <= 48) {
    return { query: candidate, kind: 'place' }
  }
  // 「市/区」结构常见地址
  if (/[\u4e00-\u9fff]{2,}(?:市|州|盟).{0,24}(?:区|县|旗|市)/.test(candidate)) {
    return { query: candidate, kind: 'address' }
  }
  // 短中文地名
  if (
    hanCount >= 2 &&
    candidate.length >= 2 &&
    candidate.length <= 32 &&
    !/[a-zA-Z]{10,}/.test(candidate) &&
    !/[0-9]{8,}/.test(candidate)
  ) {
    return { query: candidate, kind: 'place' }
  }

  return null
}

/**
 * @param {string} text
 * @returns {{ query: string, kind: 'address' | 'place' | 'coord', lng?: number, lat?: number } | null}
 */
export function extractAddressCandidate(text) {
  const raw = String(text || '').replace(/\u00a0/g, ' ').trim()
  if (!raw || raw.length < 2 || raw.length > 800) return null
  if (SKIP_LINE_RE.test(raw) && !ADDRESS_HINT.test(raw)) return null

  const lines = raw
    .split(/\r?\n|[\u2028\u2029]|[|｜]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!lines.length) return null

  // 优先第一行，再扫前几行（分享文案常把地址放第 2 行）
  const candidates = lines.slice(0, 5)
  for (const line of candidates) {
    const hit = scoreLine(line)
    if (hit) return hit
  }

  // 整段里抓「地址：xxx」
  const labeled = raw.match(
    /(?:地址|位置|定位|目的地)\s*[:：]\s*([^\n\r]{4,80})/,
  )
  if (labeled?.[1]) {
    const hit = scoreLine(labeled[1])
    if (hit) return hit
  }

  // 整段含地址关键词时，取最长含关键词的一行
  let best = null
  for (const line of lines.slice(0, 8)) {
    if (!ADDRESS_HINT.test(line)) continue
    const hit = scoreLine(line)
    if (hit && (!best || hit.query.length > best.query.length)) best = hit
  }
  return best
}

/**
 * @param {string} text
 */
export function clipboardFingerprint(text) {
  return String(text || '')
    .trim()
    .slice(0, 240)
    .replace(/\s+/g, ' ')
}

/**
 * @returns {Promise<{ text: string | null, error?: string }>}
 */
export async function readClipboardTextDetailed() {
  if (typeof navigator === 'undefined') {
    return { text: null, error: 'no-navigator' }
  }
  if (!window.isSecureContext) {
    return { text: null, error: 'insecure-context' }
  }
  if (!navigator.clipboard?.readText) {
    return { text: null, error: 'api-unavailable' }
  }
  try {
    const text = await navigator.clipboard.readText()
    if (typeof text !== 'string') return { text: null, error: 'not-string' }
    return { text }
  } catch (err) {
    return {
      text: null,
      error: err?.name || err?.message || 'read-denied',
    }
  }
}

/**
 * 尝试读取系统剪贴板文本（需安全上下文；失败返回 null）
 * @returns {Promise<string | null>}
 */
export async function readClipboardText() {
  const { text } = await readClipboardTextDetailed()
  return text
}
