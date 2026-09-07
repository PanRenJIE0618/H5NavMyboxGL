import { onUnmounted, ref } from 'vue'

export function useDeviceHeading() {
  const heading = ref(null)
  const available = ref(false)
  const needsTap = ref(false)
  const error = ref('')

  let bound = false
  let hasAbsolute = false

  function onOrientation(event) {
    const isAbsolute =
      event.type === 'deviceorientationabsolute' ||
      event.absolute === true ||
      typeof event.webkitCompassHeading === 'number'
    if (hasAbsolute && !isAbsolute) return
    if (isAbsolute) hasAbsolute = true

    const next = readHeading(event)
    if (next == null) return
    heading.value = compensateScreen(next)
    available.value = true
  }

  async function start(fromUserGesture = false) {
    error.value = ''
    const Orientation = window.DeviceOrientationEvent
    if (!Orientation) {
      error.value = '当前设备不支持朝向感应'
      return false
    }

    if (typeof Orientation.requestPermission === 'function') {
      if (!fromUserGesture) {
        needsTap.value = true
        return false
      }
      try {
        const state = await Orientation.requestPermission()
        if (state !== 'granted') {
          needsTap.value = true
          error.value = '需要授权才能读取设备朝向'
          return false
        }
      } catch {
        needsTap.value = true
        error.value = '请点击按钮授权设备朝向'
        return false
      }
    }

    bind()
    return true
  }

  function bind() {
    if (bound) return
    bound = true
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', onOrientation, true)
    }
    window.addEventListener('deviceorientation', onOrientation, true)
  }

  function stop() {
    if (!bound) return
    window.removeEventListener('deviceorientationabsolute', onOrientation, true)
    window.removeEventListener('deviceorientation', onOrientation, true)
    bound = false
  }

  onUnmounted(stop)

  return { heading, available, needsTap, error, start, stop }
}

function readHeading(event) {
  if (!event) return null

  if (typeof event.webkitCompassHeading === 'number' && !Number.isNaN(event.webkitCompassHeading)) {
    return event.webkitCompassHeading
  }

  if (typeof event.alpha !== 'number' || Number.isNaN(event.alpha)) return null

  if (event.absolute === true) {
    return (360 - event.alpha) % 360
  }

  return compassHeading(event.alpha, event.beta, event.gamma)
}

function compassHeading(alpha, beta, gamma) {
  const degtorad = Math.PI / 180
  const x = (beta || 0) * degtorad
  const y = (gamma || 0) * degtorad
  const z = (alpha || 0) * degtorad

  const cX = Math.cos(x)
  const cY = Math.cos(y)
  const cZ = Math.cos(z)
  const sX = Math.sin(x)
  const sY = Math.sin(y)
  const sZ = Math.sin(z)

  const vx = -cZ * sY - sZ * sX * cY
  const vy = -sZ * sY + cZ * sX * cY

  let heading = Math.atan2(vx, vy)
  return (heading * (180 / Math.PI) + 360) % 360
}

function compensateScreen(heading) {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0
  return (heading + Number(angle) + 360) % 360
}
