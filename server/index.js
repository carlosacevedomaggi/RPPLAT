import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './api.js'
import { getSharedState } from './state.js'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const defaultDist = path.resolve(serverDir, '../dist')

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function resolveFile(distDir, urlPath) {
  let decoded = '/'
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }

  const relative = decoded.replace(/^\/+/, '')
  const root = path.resolve(distDir)
  const full = path.resolve(root, relative)
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) return null
  return full
}

function sendText(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(message)
}

function serveStatic(req, res, distDir) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed.')
    return
  }

  if (!fs.existsSync(distDir)) {
    sendText(
      res,
      503,
      'Slipway has no build yet. From the repo root run: npm run build\n',
    )
    return
  }

  const requested = resolveFile(distDir, url.pathname)
  if (!requested) {
    sendText(res, 400, 'Bad path.')
    return
  }

  let filePath = requested
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  const isAsset = url.pathname.startsWith('/assets/')
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const fallback = path.join(distDir, 'index.html')
    if (!isAsset && fs.existsSync(fallback)) {
      filePath = fallback
    } else {
      sendText(res, 404, 'Not found.')
      return
    }
  }

  const type = MIME[path.extname(filePath)] ?? 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(filePath).pipe(res)
}

export function createServer(options = {}) {
  const distDir = options.distDir ?? defaultDist
  const state = options.state ?? getSharedState()
  const listenHost = options.host ?? process.env.HOST ?? '0.0.0.0'
  const port = options.port ?? Number(process.env.PORT ?? 8787)

  const server = http.createServer(async (req, res) => {
    const address = server.address()
    const boundPort = address && typeof address === 'object' ? address.port : port
    const handled = await handleApi(req, res, {
      state,
      port: boundPort,
      listenHost,
    })
    if (!handled) serveStatic(req, res, distDir)
  })

  return { server, port, host: listenHost, state, distDir }
}

function printListening(port, host) {
  console.log(`Slipway is listening on port ${port}`)
  console.log(`  local    http://127.0.0.1:${port}`)
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const isIpv4 = entry.family === 'IPv4' || entry.family === 4
      if (!isIpv4 || entry.internal) continue
      console.log(`  network  http://${entry.address}:${port}`)
    }
  }
  if (host === '127.0.0.1' || host === 'localhost') {
    console.log('Bound to localhost only. Set HOST=0.0.0.0 so other devices can open it.')
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const { server, port, host } = createServer()
  server.listen(port, host, () => {
    const bound = server.address()
    const boundPort = bound && typeof bound === 'object' ? bound.port : port
    printListening(boundPort, host)
  })
}
