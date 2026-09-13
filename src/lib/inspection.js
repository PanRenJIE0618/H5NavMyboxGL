/**
 * 设备巡检任务（mock / real API）
 */

import { API_PATHS } from '../config/api.js'
import { apiRequest, isMockMode } from './apiClient.js'

const STATUSES = ['pending', 'done', 'cancelled']

/** @typedef {'pending'|'done'|'cancelled'} InspectionStatus */

/** @typedef {{
 *   id: string,
 *   title: string,
 *   assetCode: string,
 *   address: string,
 *   lng: number,
 *   lat: number,
 *   status: InspectionStatus,
 *   dueAt: number | null,
 *   remark: string,
 * }} InspectionTask */

/** @typedef {{
 *   id?: string,
 *   url?: string,
 *   name?: string,
 * }} InspectionPhoto */

/** @typedef {{
 *   taskId: string,
 *   lng: number,
 *   lat: number,
 *   accuracy?: number | null,
 *   photos?: InspectionPhoto[],
 *   remark?: string,
 *   submittedAt: number,
 *   deviceInfo?: unknown,
 * }} InspectionSubmitPayload */

/**
 * @param {unknown} raw
 * @returns {InspectionTask | null}
 */
export function normalizeInspectionTask(raw) {
  if (!raw || typeof raw !== 'object') return null
  const src = /** @type {Record<string, unknown>} */ (raw)
  const id = String(src.id || src.taskId || '').trim()
  if (!id) return null

  const statusRaw = String(src.status || 'pending').toLowerCase()
  const status = /** @type {InspectionStatus} */ (
    STATUSES.includes(statusRaw) ? statusRaw : 'pending'
  )

  let dueAt = src.dueAt
  if (dueAt != null && dueAt !== '') {
    dueAt = Number(dueAt)
    if (!Number.isFinite(dueAt)) dueAt = null
  } else {
    dueAt = null
  }

  const lng = Number(src.lng ?? src.longitude)
  const lat = Number(src.lat ?? src.latitude)

  return {
    id,
    title: String(src.title || src.name || '').trim() || id,
    assetCode: String(src.assetCode || src.asset || src.asset_code || '').trim(),
    address: String(src.address || '').trim(),
    lng: Number.isFinite(lng) ? lng : 0,
    lat: Number.isFinite(lat) ? lat : 0,
    status,
    dueAt,
    remark: String(src.remark || src.note || '').trim(),
  }
}

/**
 * @param {unknown} raw
 * @param {string} [fallbackTaskId]
 * @returns {InspectionSubmitPayload | null}
 */
export function normalizeInspectionSubmit(raw, fallbackTaskId = '') {
  if (!raw || typeof raw !== 'object') return null
  const src = /** @type {Record<string, unknown>} */ (raw)
  const taskId = String(src.taskId || src.id || fallbackTaskId).trim()
  if (!taskId) return null

  const lng = Number(src.lng ?? src.longitude)
  const lat = Number(src.lat ?? src.latitude)

  const photosRaw = Array.isArray(src.photos) ? src.photos : []
  /** @type {InspectionPhoto[]} */
  const photos = photosRaw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return { id: `photo-${index}`, name: '' }
    }
    const photo = /** @type {Record<string, unknown>} */ (item)
    const name = String(photo.name || '').trim()
    return {
      id: String(photo.id || `photo-${index}`),
      url: photo.url ? String(photo.url) : undefined,
      name: name || undefined,
    }
  })

  let submittedAt = Number(src.submittedAt)
  if (!Number.isFinite(submittedAt)) submittedAt = Date.now()

  const accuracy = src.accuracy != null ? Number(src.accuracy) : null

  return {
    taskId,
    lng: Number.isFinite(lng) ? lng : 0,
    lat: Number.isFinite(lat) ? lat : 0,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    photos,
    remark: String(src.remark || '').trim(),
    submittedAt,
    deviceInfo: src.deviceInfo,
  }
}

/**
 * @param {unknown} data
 * @returns {InspectionTask[]}
 */
function normalizeTaskList(data) {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? /** @type {Record<string, unknown>} */ (data).items ||
        /** @type {Record<string, unknown>} */ (data).tasks ||
        /** @type {Record<string, unknown>} */ (data).list ||
        []
      : []
  if (!Array.isArray(list)) return []
  return list.map((item) => normalizeInspectionTask(item)).filter(Boolean)
}

/** @type {InspectionTask[]} */
let mockTasks = [
  {
    id: 'task-001',
    title: '箱体外观巡检',
    assetCode: 'BOX-A12',
    address: '示范路 1 号',
    lng: 116.391,
    lat: 39.907,
    status: 'pending',
    dueAt: null,
    remark: '',
  },
  {
    id: 'task-002',
    title: '设备接地检查',
    assetCode: 'BOX-B08',
    address: '科技大道 88 号',
    lng: 116.402,
    lat: 39.915,
    status: 'pending',
    dueAt: Date.now() + 2 * 24 * 3600 * 1000,
    remark: '',
  },
  {
    id: 'task-003',
    title: '箱体标识复核',
    assetCode: 'BOX-C03',
    address: '创新园 5 栋',
    lng: 116.385,
    lat: 39.898,
    status: 'done',
    dueAt: null,
    remark: '标识清晰',
  },
]

/** @type {Map<string, InspectionSubmitPayload>} */
const mockLastSubmits = new Map()

/**
 * @param {{ status?: InspectionStatus }} [options]
 * @returns {Promise<InspectionTask[]>}
 */
export async function listInspectionTasks(options = {}) {
  const status = options.status ? String(options.status).toLowerCase() : ''

  if (isMockMode()) {
    let list = mockTasks.map((task) => ({ ...task }))
    if (status && STATUSES.includes(status)) {
      list = list.filter((task) => task.status === status)
    }
    return list
  }

  const query = status && STATUSES.includes(status) ? `?status=${encodeURIComponent(status)}` : ''
  const data = await apiRequest(`${API_PATHS.inspectionTasks}${query}`, { auth: true })
  return normalizeTaskList(data)
}

/**
 * @param {string} id
 * @returns {Promise<InspectionTask>}
 */
export async function getInspectionTask(id) {
  const taskId = String(id || '').trim()
  if (!taskId) throw new Error('Missing task id')

  if (isMockMode()) {
    const task = mockTasks.find((item) => item.id === taskId)
    if (!task) throw new Error('Task not found')
    return { ...task }
  }

  const data = await apiRequest(API_PATHS.inspectionTask(taskId), { auth: true })
  const task = normalizeInspectionTask(data)
  if (!task) throw new Error('Task not found')
  return task
}

/**
 * @param {Partial<InspectionSubmitPayload> & { taskId?: string }} payload
 * @returns {Promise<InspectionSubmitPayload>}
 */
export async function submitInspectionResult(payload = {}) {
  const normalized = normalizeInspectionSubmit(payload)
  if (!normalized?.taskId) throw new Error('Invalid submit payload')

  if (isMockMode()) {
    const index = mockTasks.findIndex((item) => item.id === normalized.taskId)
    if (index < 0) throw new Error('Task not found')
    mockTasks[index] = {
      ...mockTasks[index],
      status: 'done',
      remark: normalized.remark || mockTasks[index].remark,
    }
    mockLastSubmits.set(normalized.taskId, { ...normalized })
    return { ...normalized }
  }

  const data = await apiRequest(API_PATHS.inspectionSubmit(normalized.taskId), {
    method: 'POST',
    body: normalized,
    auth: true,
  })
  return normalizeInspectionSubmit(data, normalized.taskId) || normalized
}

/**
 * @param {string} taskId
 * @returns {InspectionSubmitPayload | null}
 */
export function getLastSubmit(taskId) {
  if (!isMockMode()) return null
  const id = String(taskId || '').trim()
  if (!id) return null
  const record = mockLastSubmits.get(id)
  return record ? { ...record } : null
}
