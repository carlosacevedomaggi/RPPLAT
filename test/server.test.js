import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from '../server/index.js'
import { createState } from '../server/state.js'

async function listen(options = {}) {
  const ctx = createServer({
    port: 0,
    host: '127.0.0.1',
    state: createState(),
    ...options,
  })
  ctx.server.listen(0, ctx.host)
  await once(ctx.server, 'listening')
  const address = ctx.server.address()
  const port = address && typeof address === 'object' ? address.port : 0
  return {
    ...ctx,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        ctx.server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

test('health reports the bound port and listen host', async () => {
  const app = await listen()
  try {
    const response = await fetch(`${app.url}/api/health`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.name, 'slipway')
    assert.equal(body.port, app.port)
    assert.equal(body.listenHost, '127.0.0.1')
    assert.equal(typeof body.hostname, 'string')
    assert.ok(Array.isArray(body.addresses))
  } finally {
    await app.close()
  }
})

test('notes round-trip and reject an empty note', async () => {
  const app = await listen()
  try {
    const empty = await fetch(`${app.url}/api/checks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '   ' }),
    })
    assert.equal(empty.status, 400)

    const created = await fetch(`${app.url}/api/checks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Phone on the kitchen Wi-Fi' }),
    })
    assert.equal(created.status, 201)
    const createdBody = await created.json()
    assert.equal(createdBody.check.note, 'Phone on the kitchen Wi-Fi')

    const list = await fetch(`${app.url}/api/checks`)
    const listBody = await list.json()
    assert.equal(listBody.checks.length, 1)
    assert.equal(listBody.checks[0].note, 'Phone on the kitchen Wi-Fi')
  } finally {
    await app.close()
  }
})

test('keeps the twenty newest notes', async () => {
  const app = await listen()
  try {
    for (let index = 0; index < 21; index += 1) {
      const response = await fetch(`${app.url}/api/checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: `note ${index}` }),
      })
      assert.equal(response.status, 201)
    }
    const list = await fetch(`${app.url}/api/checks`)
    const body = await list.json()
    assert.equal(body.checks.length, 20)
    assert.equal(body.checks[0].note, 'note 20')
    assert.equal(body.checks.at(-1).note, 'note 1')
  } finally {
    await app.close()
  }
})

function rawGet(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port, path: requestPath, method: 'GET' },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    request.on('error', reject)
    request.end()
  })
}

test('serves the built page and blocks paths outside dist', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'slipway-'))
  const dist = path.join(parent, 'dist')
  fs.mkdirSync(dist)
  fs.writeFileSync(path.join(parent, 'secret.txt'), 'top-secret-marker')
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Slipway</title><p>built</p>')
  fs.mkdirSync(path.join(dist, 'assets'))
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)')

  const app = await listen({ distDir: dist })
  try {
    const home = await fetch(app.url)
    assert.equal(home.status, 200)
    assert.match(await home.text(), /built/)

    const route = await fetch(`${app.url}/preview/phone`)
    assert.equal(route.status, 200)
    assert.match(await route.text(), /built/)

    const missingAsset = await fetch(`${app.url}/assets/missing.js`)
    assert.equal(missingAsset.status, 404)

    const normalized = await rawGet(app.port, '/../secret.txt')
    assert.equal(normalized.status, 200)
    assert.doesNotMatch(normalized.body, /top-secret-marker/)

    const encoded = await rawGet(app.port, '/%2e%2e%2fsecret.txt')
    assert.equal(encoded.status, 400)
    assert.doesNotMatch(encoded.body, /top-secret-marker/)
  } finally {
    await app.close()
  }
})

test('a missing build explains the next command', async () => {
  const app = await listen({ distDir: path.join(os.tmpdir(), `slipway-missing-${Date.now()}`) })
  try {
    const response = await fetch(app.url)
    assert.equal(response.status, 503)
    assert.match(await response.text(), /npm run build/)
  } finally {
    await app.close()
  }
})
