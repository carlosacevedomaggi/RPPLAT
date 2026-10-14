import os from 'node:os'

const MAX_NOTE = 140
const MAX_CHECKS = 20
const MAX_BODY = 4096

export function lanAddresses(port) {
  const interfaces = os.networkInterfaces()
  const addresses = []

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const family = entry.family
      const isIpv4 = family === 'IPv4' || family === 4
      if (!isIpv4 || entry.internal) continue
      addresses.push({
        name,
        address: entry.address,
        url: `http://${entry.address}:${port}`,
      })
    }
  }

  return addresses
}

export function healthPayload(state, port, listenHost) {
  return {
    ok: true,
    name: 'slipway',
    hostname: os.hostname(),
    arch: os.arch(),
    platform: os.platform(),
    node: process.version,
    port,
    listenHost,
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: new Date(state.startedAt).toISOString(),
    addresses: lanAddresses(port),
    localUrl: `http://127.0.0.1:${port}`,
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('That note is too large.'), { status: 413 }))
        req.destroy()
      } else {
        chunks.push(chunk)
      }
    })

    req.on('end', () => {
      if (size === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('Send a JSON body with a note.'), { status: 400 }))
      }
    })

    req.on('error', reject)
  })
}

function clientAddress(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

export async function handleApi(req, res, ctx) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (!url.pathname.startsWith('/api/')) return false

  const { state, port, listenHost } = ctx
  const method = req.method ?? 'GET'

  try {
    if (url.pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, healthPayload(state, port, listenHost))
      return true
    }

    if (url.pathname === '/api/checks' && method === 'GET') {
      sendJson(res, 200, { checks: state.checks })
      return true
    }

    if (url.pathname === '/api/checks' && method === 'POST') {
      const body = await readBody(req)
      const note = typeof body.note === 'string' ? body.note.trim() : ''
      if (!note) {
        sendJson(res, 400, { error: 'Write a short note before sending it.' })
        return true
      }
      if (note.length > MAX_NOTE) {
        sendJson(res, 400, { error: `Keep the note to ${MAX_NOTE} characters.` })
        return true
      }

      const check = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        note,
        at: new Date().toISOString(),
        from: clientAddress(req),
      }
      state.checks.unshift(check)
      state.checks.splice(MAX_CHECKS)
      sendJson(res, 201, { check })
      return true
    }

    sendJson(res, 404, { error: 'No such API route.' })
    return true
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : 500
    const message = error instanceof Error ? error.message : 'The preview server failed.'
    if (!res.headersSent) sendJson(res, status, { error: message })
    return true
  }
}
