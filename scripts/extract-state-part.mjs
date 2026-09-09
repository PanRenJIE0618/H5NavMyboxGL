import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('e:/Pan/H5NavMyBoxGL/src/composables/nav')
const s = fs.readFileSync(path.join(dir, 'useNavMapLogic.js'), 'utf8')
const m = s.match(/const statePart = ("(?:\\.|[^"\\])*")/)
if (!m) {
  console.error('statePart not found')
  process.exit(1)
}
const part = JSON.parse(m[1])
fs.writeFileSync(path.join(dir, 'useNavMapState.part.js'), part)
console.log('wrote useNavMapState.part.js lines', part.split(/\n/).length)

// Rewrite orchestrator to import statePart from file
const importsEnd = s.indexOf('import { useNavMapUi }')
const head = s.slice(0, importsEnd)
const restStart = s.indexOf('export function useNavMapLogic')
const fnBody = s.slice(restStart)

const newFn = fnBody
  .replace(/const statePart = "(?:\\.|[^"\\])*";?\r?\n\s*/, '')
  .replace(
    'export function useNavMapLogic(props, emit) {\n  const ctx = { props, emit }\n\n  // Evaluate state init inside with(ctx) so let/const land on ctx\n  new Function',
    'export function useNavMapLogic(props, emit) {\n  const ctx = { props, emit }\n\n  new Function',
  )

const out = `${head}import { useNavMapUi } from './useNavMapUi.js'
import { useNavClipboard } from './useNavClipboard.js'
import { useNavMapCore } from './useNavMapCore.js'
import { useNavCamera } from './useNavCamera.js'
import { useNavRouting } from './useNavRouting.js'
import { useNavSessionFlow } from './useNavSessionFlow.js'
import statePart from './useNavMapState.part.js?raw'

${newFn}`

fs.writeFileSync(path.join(dir, 'useNavMapLogic.js'), out)
console.log('rewrote orchestrator lines', out.split(/\n/).length)
