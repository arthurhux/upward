import http from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const port = Number(process.env.PORT || 8787)
const host = '127.0.0.1'
const clients = new Set()
let latest = { type: 'motion', connected: false, available: false, roll: 0, pitch: 0, sequence: 0 }
let lastPacketAt = 0
let helper
let stopping = false

function broadcast(packet) {
  const frame = `data: ${JSON.stringify(packet)}\n\n`
  for (const response of clients) {
    // A slow/hidden tab must not build up a queue of old steering samples.
    if (response.writableLength > 8192) { response.destroy(); clients.delete(response) }
    else response.write(frame)
  }
}

function startMotion() {
  const binary = path.join(root, '.bridge', 'UpwardMotion')
  if (!existsSync(binary) || process.platform !== 'darwin') {
    console.log('Motion bridge not built; keyboard and touch controls are available.')
    return
  }
  helper = spawn(binary, ['--stream-motion'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let buffer = ''
  helper.stdout.setEncoding('utf8')
  helper.stdout.on('data', chunk => {
    buffer += chunk
    if (buffer.length > 65536) buffer = ''
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
      try {
        const packet = JSON.parse(line)
        if (packet.type !== 'motion' || !Number.isFinite(packet.roll) || !Number.isFinite(packet.pitch)) continue
        latest = packet; lastPacketAt = Date.now(); broadcast(packet)
      } catch { /* Incomplete/diagnostic lines are not sensor data. */ }
    }
  })
  helper.stderr.on('data', chunk => process.stderr.write(chunk))
  helper.on('error', error => console.error('Motion reader:', error.message))
  helper.on('exit', () => {
    latest = { ...latest, connected: false }; broadcast(latest)
    if (!stopping) console.log('Motion reader stopped. Keyboard and touch still work.')
  })
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' }
export const server = http.createServer((request, response) => {
  const hostname = (request.headers.host || '').split(':')[0]
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    response.writeHead(403); response.end('Local connections only.'); return
  }
  const origin = request.headers.origin
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    response.writeHead(403); response.end('Origin not allowed.'); return
  }
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return }
  if (url.pathname === '/api/motion/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' })
    response.write(`data: ${JSON.stringify(latest)}\n\n`)
    clients.add(response)
    request.on('close', () => clients.delete(response))
    return
  }
  if (url.pathname === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ ok: true, motion: latest.connected, sequence: latest.sequence })); return
  }
  const dist = path.join(root, 'dist')
  let relative
  try { relative = decodeURIComponent(url.pathname) } catch { response.writeHead(400); response.end(); return }
  const file = path.resolve(dist, `.${relative === '/' ? '/index.html' : relative}`)
  if (!file.startsWith(dist + path.sep) || relative.split('/').some(part => part.startsWith('.'))) {
    response.writeHead(403); response.end(); return
  }
  if (!existsSync(file)) { response.writeHead(404); response.end('Build the game with npm run build first.'); return }
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'Cache-Control': relative.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
  createReadStream(file).on('error', () => response.destroy()).pipe(response)
})

const heartbeat = setInterval(() => {
  if (latest.connected && Date.now() - lastPacketAt > 1000) {
    latest = { ...latest, connected: false }; broadcast(latest)
  }
  for (const response of clients) response.write(': heartbeat\n\n')
}, 1000)

function stop() {
  if (stopping) return
  stopping = true; clearInterval(heartbeat)
  for (const response of clients) response.end()
  helper?.kill('SIGTERM')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}
process.on('SIGINT', stop); process.on('SIGTERM', stop)
server.listen(port, host, () => { console.log(`Upward: http://${host}:${port}`); startMotion() })
