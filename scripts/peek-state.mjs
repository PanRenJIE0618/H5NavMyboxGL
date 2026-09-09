import fs from 'node:fs'
const s = fs.readFileSync('e:/Pan/H5NavMyBoxGL/src/composables/nav/useNavMapLogic.js', 'utf8')
const idx = s.indexOf('const statePart = ')
const start = s.indexOf('"', idx)
// statePart is JSON.stringify so it's a quoted string — find end carefully
let i = start + 1
let out = ''
while (i < s.length) {
  const ch = s[i]
  if (ch === '\\') {
    out += JSON.parse(`"${s.slice(i, i + 2)}"`) === undefined ? s[i + 1] : JSON.parse(`"${s[i]}${s[i + 1]}"`)
    // simpler:
    break
  }
  i++
}
const m = s.slice(idx).match(/const statePart = ("(?:\\.|[^"\\])*")/)
const part = JSON.parse(m[1])
const g = part.indexOf('useGeolocation')
console.log('GEO:\n', part.slice(Math.max(0, g - 100), g + 500))
const h = part.indexOf('useDeviceHeading')
console.log('HEAD:\n', part.slice(Math.max(0, h - 100), h + 400))
