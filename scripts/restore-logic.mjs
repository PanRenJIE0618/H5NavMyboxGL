import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('e:/Pan/H5NavMyBoxGL/src/composables/nav')
const imports = fs.readFileSync(path.join(dir, '_imports_tmp.js'), 'utf8')
const body = fs.readFileSync(path.join(dir, '_body_tmp.js'), 'utf8')
let ret = fs.readFileSync(path.join(dir, '_return_tmp.js'), 'utf8').trim()

// _return_tmp is: return { ... }\n}  (extra function closer)
if (ret.endsWith('}')) {
  const withoutLast = ret.slice(0, ret.lastIndexOf('}')).trimEnd()
  if (withoutLast.endsWith('}')) ret = withoutLast
}

const out = `${imports}

/**
 * @param {{ active?: boolean }} props
 * @param {(event: string, ...args: any[]) => void} emit
 */
export function useNavMapLogic(props, emit) {
${body}

  ${ret}
}
`

fs.writeFileSync(path.join(dir, 'useNavMapLogic.js'), out)
console.log('lines', out.split(/\r?\n/).length)
console.log('tail:\n', out.slice(-120))
