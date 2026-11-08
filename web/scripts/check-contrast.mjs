// Checks registered text/background pairs against the HIG minimum contrast (4.5:1, WCAG AA) in
// light, dark, and increased-contrast appearances. Tokens are read from src/index.css, so changing a color
// there is checked automatically. Part of `npm run check`; see docs/design.md.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

/** Token declarations (--color-x: value) inside the block that starts at `marker`. */
function block(marker) {
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`index.css has no block starting with: ${marker}`)
  let depth = 0
  let end = start
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const body = css.slice(start, end)
  return Object.fromEntries([...body.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const light = block('@theme static {')
const dark = { ...light, ...block(":root[data-theme='dark'] {") }
const more = block('@media (prefers-contrast: more) {')
const moreDark = block('/* Increase Contrast in the dark appearance */')
const modes = {
  light,
  dark,
  'light + increase contrast': { ...light, ...more },
  'dark + increase contrast': { ...dark, ...more, ...moreDark },
}

const resolve = (tokens, value) => {
  for (let i = 0; i < 5; i++) {
    const ref = value.match(/^var\(--color-([\w-]+)\)$/)
    if (!ref) return value
    value = tokens[ref[1]]
  }
  return value
}
const rgb = (hex) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
}
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const WHITE = '#ffffff'
// [foreground, background]: token names, or WHITE. Text uses 4.5:1 regardless of size.
const PAIRS = [
  ...['slate', 'slate-2', 'slate-3'].flatMap((fg) => ['surface', 'canvas', 'canvas-2', 'brand-soft', 'link-soft', 'good-soft', 'warn-soft', 'bad-soft'].map((bg) => [fg, bg])),
  ['link', 'surface'], ['link', 'canvas'], ['link', 'link-soft'],
  ['brand-dark', 'surface'], ['brand-dark', 'canvas'], ['brand-dark', 'brand-soft'],
  ['good', 'good-soft'], ['good', 'surface'], ['good', 'canvas'],
  ['warn', 'warn-soft'], ['warn', 'surface'], ['warn', 'canvas'],
  ['bad', 'bad-soft'], ['bad', 'surface'], ['bad', 'canvas'],
  [WHITE, 'accent'], [WHITE, 'accent-hover'], [WHITE, 'obsidian'], [WHITE, 'obsidian-2'],
  ['rail-text', 'obsidian'], ['rail-muted', 'obsidian'],
  ['rail-text', 'obsidian-2'],
  ...[1, 2, 3, 4, 5].map((i) => [WHITE, `avatar-${i}`]),
]
const MIN = 4.5
const CONTROL_PAIRS = ['surface', 'canvas', 'canvas-2'].map((bg) => ['control-line', bg])

let failures = 0
for (const [mode, tokens] of Object.entries(modes)) {
  for (const [fg, bg] of [...PAIRS, ...CONTROL_PAIRS]) {
    const minimum = fg === 'control-line' ? 3 : MIN
    const f = fg === WHITE ? WHITE : resolve(tokens, tokens[fg] ?? '')
    const b = resolve(tokens, tokens[bg] ?? '')
    if (!/^#[0-9a-f]{3,6}$/i.test(f) || !/^#[0-9a-f]{3,6}$/i.test(b)) {
      console.error(`✗ ${mode}: can't resolve ${fg} on ${bg}`)
      failures++
      continue
    }
    const r = ratio(f, b)
    if (r < minimum) {
      console.error(`✗ ${mode}: ${fg} (${f}) on ${bg} (${b}) is ${r.toFixed(2)}:1, needs ${minimum}:1`)
      failures++
    }
  }
}
if (failures) {
  console.error(`\n${failures} contrast failure(s). Adjust the tokens in src/index.css.`)
  process.exit(1)
}
console.log(`Contrast OK: ${PAIRS.length} text pairs at ≥ ${MIN}:1 + ${CONTROL_PAIRS.length} control pairs at ≥ 3:1 × ${Object.keys(modes).length} appearances`)
