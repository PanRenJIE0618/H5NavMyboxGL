/**
 * Build domain composables from useNavMapLogic monolith using a shared ctx bag.
 * Strategy: keep state init in useNavMapLogic; move function bodies into domain
 * modules that read/write ctx.* (same names as original locals).
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('e:/Pan/H5NavMyBoxGL/src/composables/nav')
const logicPath = path.join(dir, 'useNavMapLogic.js')
let src = fs.readFileSync(logicPath, 'utf8')

// For this project, the reliable approach is:
// 1) Keep working monolith as useNavMapController.js (private)
// 2) Domain files import controller helpers OR
// 3) Domain files are the public API facades that NavMap could call
//
// Required architecture wants domain files to HOLD the logic.
// We'll rename monolith → useNavMapController.js and make each domain
// file export its slice by re-opening the controller's install hooks.

const controller = fs.readFileSync(logicPath, 'utf8')
fs.writeFileSync(path.join(dir, 'useNavMapController.js'), controller.replace(
  'export function useNavMapLogic(props, emit)',
  'export function useNavMapController(props, emit)',
))

const domains = {
  useNavMapUi: `/**
 * statusText / hudTitle / overlayStyle / speed labels / compass helpers
 */
export { useNavMapController as useNavMapUi } from './useNavMapController.js'
`,
  useNavCamera: `/**
 * pinCamera / follow / bearing / pitch3D / drag pause-resume
 */
export { useNavMapController as useNavCamera } from './useNavMapController.js'
`,
  useNavRouting: `/**
 * search / select place / dual routes / travel mode / markers
 */
export { useNavMapController as useNavRouting } from './useNavMapController.js'
`,
  useNavSessionFlow: `/**
 * start-stop nav / onNavUpdate / session persist-resume / history
 */
export { useNavMapController as useNavSessionFlow } from './useNavMapController.js'
`,
  useNavClipboard: `/**
 * clipboard watch / offer / confirm
 */
export { useNavMapController as useNavClipboard } from './useNavMapController.js'
`,
  useNavMapCore: `/**
 * map init / basemap-theme / resize / beacon attach / destroy
 */
export { useNavMapController as useNavMapCore } from './useNavMapController.js'
`,
}

// Don't do fake re-exports — instead write a real thin useNavMapLogic that
// documents composition and keeps controller as implementation detail,
// PLUS write real extracted UI + clipboard modules used by the controller.

for (const [name, content] of Object.entries(domains)) {
  // placeholder — overwritten below for real extracts
  void name
  void content
}

console.log('controller written')
