export function normalizeHeading(deg) {
  return ((Number(deg) || 0) % 360 + 360) % 360
}

/** Shortest signed turn from current angle to target, in (-180, 180]. */
export function shortestDelta(fromDeg, toDeg) {
  let delta = normalizeHeading(toDeg) - normalizeHeading(fromDeg)
  if (delta > 180) delta -= 360
  if (delta <= -180) delta += 360
  return delta
}

/** Keep a continuous rotation so 359° → 1° becomes +2°, not -358°. */
export function unwrapHeading(currentUnwrapped, nextDeg) {
  if (currentUnwrapped == null || Number.isNaN(Number(currentUnwrapped))) {
    return normalizeHeading(nextDeg)
  }
  return Number(currentUnwrapped) + shortestDelta(currentUnwrapped, nextDeg)
}
