/**
 * Boots the built game in headless Chrome, starts a match and reports runtime
 * errors plus a few HUD values. Usage:
 *   npm run build && npm run preview   (in one shell)
 *   node scripts/browser-check.mjs
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.SURGE_URL || 'http://localhost:4173/'
const PORT = 9333
// Chrome needs an isolated, absolute profile or it joins the running desktop session.
const PROFILE = path.join(os.tmpdir(), 'surge-chrome-profile')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-sandbox',
    '--no-default-browser-check',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1280,720',
    URL,
  ],
  { stdio: 'ignore' },
)

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('Chrome did not expose a debuggable page')
}

const problems = []
const page = await targets()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let id = 0
const pending = new Map()
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    problems.push(`exception: ${d.exception?.description ?? d.text}`)
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`)
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    const url = msg.params.entry.url ? ` (${msg.params.entry.url})` : ''
    problems.push(`log: ${msg.params.entry.text}${url}`)
  }
}

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const msgId = ++id
    pending.set(msgId, resolve)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return res.result?.result?.value
}

await send('Runtime.enable')
await send('Log.enable')
await sleep(1500)

const menuVisible = await evaluate(`!!document.querySelector('[data-action="start"]')`)
if (!menuVisible) problems.push('main menu did not render')

const started = await evaluate(
  `(() => { const b = document.querySelector('[data-action="start"]'); if (!b) return false; b.click(); return true })()`,
)
if (!started) problems.push('could not start a match')

await sleep(5000)

const hud = await evaluate(`JSON.stringify({
  timer: document.getElementById('hud-timer')?.textContent,
  hp: document.getElementById('hud-hp')?.textContent,
  weapon: document.getElementById('hud-weapon')?.textContent,
  slots: document.querySelectorAll('#hud-slots .slot').length,
  abilities: document.querySelectorAll('.ability').length,
  score: document.getElementById('hud-score')?.textContent,
})`)

const parsed = hud ? JSON.parse(hud) : null
if (!parsed) problems.push('HUD did not render')
else {
  if (parsed.timer === '8:00') problems.push(`match clock did not advance (${parsed.timer})`)
  if (parsed.slots !== 7) problems.push(`expected 7 loadout slots in HUD, got ${parsed.slots}`)
  if (parsed.abilities !== 2) problems.push(`expected 2 ability tiles, got ${parsed.abilities}`)
}

console.log('HUD:', parsed)
console.log(problems.length ? `PROBLEMS:\n- ${problems.join('\n- ')}` : 'No runtime errors detected')

ws.close()
chrome.kill()
await sleep(500)
rmSync(PROFILE, { recursive: true, force: true })
process.exit(problems.length ? 1 : 0)
