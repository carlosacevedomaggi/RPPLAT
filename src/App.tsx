import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Radio, RotateCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Address = {
  name: string
  address: string
  url: string
}

type Health = {
  ok: true
  hostname: string
  arch: string
  platform: string
  node: string
  port: number
  listenHost: string
  uptimeSeconds: number
  addresses: Address[]
  localUrl: string
}

type Note = {
  id: string
  note: string
  at: string
  from: string
}

const NOTE_LIMIT = 140

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${rest}s`
  return `${rest}s`
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

async function writeClipboard(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value)
    return true
  }

  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.focus()
  area.select()
  const wrote = document.execCommand('copy')
  document.body.removeChild(area)
  return wrote
}

function isLocalOnly(host: string) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // The server sometimes answers with plain text.
  }
  return 'The preview server did not answer.'
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [healthResponse, notesResponse] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/checks'),
      ])
      if (!healthResponse.ok) throw new Error(await readError(healthResponse))
      if (!notesResponse.ok) throw new Error(await readError(notesResponse))
      const healthBody = (await healthResponse.json()) as Health
      const notesBody = (await notesResponse.json()) as { checks: Note[] }
      setHealth(healthBody)
      setNotes(notesBody.checks)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The preview server did not answer.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const kick = window.setTimeout(() => {
      void load()
    }, 0)
    const timer = window.setInterval(() => {
      void load()
    }, 10000)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(timer)
    }
  }, [load])

  async function copyUrl(url: string) {
    try {
      const wrote = await writeClipboard(url)
      if (!wrote) throw new Error('copy failed')
      setFormError(null)
      setCopied(url)
      window.setTimeout(() => {
        setCopied((current) => (current === url ? null : current))
      }, 2000)
    } catch {
      setCopied(null)
      setFormError('Copy failed. Select the address and copy it yourself.')
    }
  }

  async function sendNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = draft.trim()
    if (!note || sending) return
    setSending(true)
    setFormError(null)
    try {
      const response = await fetch('/api/checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { check: Note }
      setNotes((current) => [body.check, ...current].slice(0, 20))
      setDraft('')
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'The note was not saved.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-svh">
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="font-heading text-xl leading-none text-foreground">Slipway</p>
            <p className="mt-1 text-sm text-muted-foreground">Pre-deploy bench</p>
          </div>
          <Badge variant={error ? 'destructive' : 'secondary'} className="h-7 gap-1.5 px-2.5">
            <Radio className="size-3" />
            {loading ? 'Checking' : error ? 'Unreachable' : 'Listening'}
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Raspberry Pi · local network
            </p>
            <h1 className="mt-3 max-w-xl font-heading text-4xl leading-tight text-foreground sm:text-5xl">
              This build is on the slipway.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Clone this repo on the Pi, build it, and open one of the addresses below from a phone
              or laptop on the same network. If the page loads there, the path you will use before a
              real deploy works.
            </p>
            <div className="mt-6">
              <AddressCard
                health={health}
                loading={loading}
                error={error}
                copied={copied}
                onCopy={copyUrl}
                onRetry={() => {
                  setLoading(true)
                  void load()
                }}
              />
            </div>
          </section>

          <section className="lg:col-span-2 lg:self-start">
            <MachineCard health={health} loading={loading} error={error} />
          </section>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Check in from this device</CardTitle>
            <CardDescription>
              Notes stay in this process and disappear when it restarts. Send one here, then open the
              same address on your phone. If it shows up there, both devices reached this Pi.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={sendNote}>
              <div className="flex-1">
                <label className="sr-only" htmlFor="note">
                  Note from this device
                </label>
                <Input
                  id="note"
                  value={draft}
                  maxLength={NOTE_LIMIT}
                  placeholder="Kitchen phone, same Wi-Fi"
                  className="h-11"
                  onChange={(event) => setDraft(event.target.value)}
                />
              </div>
              <Button type="submit" size="lg" className="h-11 px-4" disabled={sending || draft.trim().length === 0}>
                {sending ? 'Sending' : 'Leave note'}
              </Button>
            </form>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formError ?? 'Visible to anyone who can open this address.'}</span>
              <span>
                {draft.trim().length}/{NOTE_LIMIT}
              </span>
            </div>
            <NoteList notes={notes} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function AddressCard({
  health,
  loading,
  error,
  copied,
  onCopy,
  onRetry,
}: {
  health: Health | null
  loading: boolean
  error: string | null
  copied: string | null
  onCopy: (url: string) => void
  onRetry: () => void
}) {
  if (loading && !health) {
    return <LoadingBlock label="Looking up addresses" />
  }

  if (error && !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>The preview server did not answer</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={onRetry}>
            <RotateCw />
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!health) return null

  const localOnly = isLocalOnly(health.listenHost)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open it from the network</CardTitle>
        <CardDescription>
          Port {health.port}. Use a network address from another device. The local address only works
          on this machine.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {localOnly ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This process is only listening on this machine. Start it with HOST=0.0.0.0 so other
            devices can open it.
          </p>
        ) : null}
        {health.addresses.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
            No IPv4 address is assigned yet. Connect Ethernet or Wi-Fi, then refresh this page.
          </p>
        ) : (
          health.addresses.map((address) => (
            <AddressRow
              key={`${address.name}-${address.address}`}
              label={address.name}
              url={address.url}
              copied={copied === address.url}
              onCopy={() => onCopy(address.url)}
            />
          ))
        )}
        <AddressRow
          label="This machine"
          url={health.localUrl}
          copied={copied === health.localUrl}
          onCopy={() => onCopy(health.localUrl)}
        />
      </CardContent>
    </Card>
  )
}

function AddressRow({
  label,
  url,
  copied,
  onCopy,
}: {
  label: string
  url: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <a href={url} className="block truncate font-mono text-sm text-foreground hover:underline">
          {url}
        </a>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onCopy}>
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function MachineCard({
  health,
  loading,
  error,
}: {
  health: Health | null
  loading: boolean
  error: string | null
}) {
  if (loading && !health) return <LoadingBlock label="Reading this machine" />
  if ((error && !health) || !health) {
    return (
    <Card>
      <CardHeader>
        <CardTitle>This machine</CardTitle>
        <CardDescription>Facts appear when the preview server answers.</CardDescription>
      </CardHeader>
    </Card>
    )
  }

  const facts = [
    ['Hostname', health.hostname],
    ['System', `${health.platform} · ${health.arch}`],
    ['Node', health.node],
    ['Uptime', formatUptime(health.uptimeSeconds)],
    ['Bind', health.listenHost],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>This machine</CardTitle>
        <CardDescription>Reported live by the process that served this page.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          {facts.map(([label, value]) => (
            <div key={label} className={label === 'Hostname' ? 'col-span-2' : undefined}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-medium break-all text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function NoteList({ notes }: { notes: Note[] }) {
  if (notes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        No notes yet.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {notes.map((note) => (
        <li key={note.id} className="rounded-lg bg-muted/70 px-3 py-2">
          <p className="text-sm text-foreground">{note.note}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatWhen(note.at)} · {note.from}
          </p>
        </li>
      ))}
    </ul>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="sr-only">{label}</CardTitle>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3 w-64 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
      </CardContent>
    </Card>
  )
}
