import fs from 'node:fs'
const p = 'e:/Pan/H5NavMyBoxGL/README.md'
let s = fs.readFileSync(p, 'utf8')
const needle = '见 `src/config/behaviorPolicy.js`，支持运行时热更新。'
if (!s.includes(needle)) {
  console.error('needle missing')
  process.exit(1)
}
if (!s.includes('docs/modules.md')) {
  s = s.replace(needle, `${needle}完整模块与键说明见 [docs/modules.md](docs/modules.md)。`)
  fs.writeFileSync(p, s)
  console.log('updated')
} else {
  console.log('already linked')
}
