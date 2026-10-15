/** Root-session inbox retention across a killed headless process and explicit cold recovery. */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { expect, it, onTestFinished } from 'vitest'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tool-todo'

const pendingId = 'cold-pending-input'
const pendingText = 'PENDING_COLD'

interface BarrierReport {
  rootId: string
  rejectedClaims: number
  claims: string[]
  requests: { id: string; text: string }[][]
  pending: string[]
  attachedPending: string[]
  turnEnds: string[]
}

function foldInbox(events: readonly SessionEvent[]) {
  type Input = SessionEvent<'agent/inbox/spliced'>['data']['inserted'][number]
  const pending: Record<'next-turn' | 'next-step', Input[]> = { 'next-turn': [], 'next-step': [] }
  const claimed: string[] = []
  const discarded: string[] = []
  for (const event of events) {
    if (event.type !== 'agent/inbox/spliced') continue
    const { target, start, removedCount = 0, inserted, outcome } = event.data
    const removed = pending[target].splice(start, removedCount, ...inserted)
    for (const message of removed) (outcome === undefined ? claimed : discarded).push(message.id)
  }
  return { pending: [...pending['next-turn'], ...pending['next-step']], claimed, discarded }
}

async function readRootLog(root: string, id: string) {
  const paths = (await readdir(root, { recursive: true })).filter(path => /session\.v\d+\.jsonl$/.test(path))
  const matches = []
  for (const path of paths) {
    const text = await readFile(join(root, path), 'utf8')
    const [first, ...rows] = text.trimEnd().split('\n')
    const header = JSON.parse(first!) as { type: string; id: string; parentSession?: string; delegationDepth: number }
    if (header.id !== id) continue
    matches.push({ text, header, events: rows.map(row => JSON.parse(row) as SessionEvent) })
  }
  expect(matches).toHaveLength(1)
  return matches[0]!
}

it('retains unclaimed waking input after request failure and SIGKILL, then claims its original id once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cold-inbox-'))
  const children: (() => Promise<void>)[] = []
  onTestFinished(async () => {
    try { await Promise.all(children.map(close => close())) }
    finally { await rm(root, { recursive: true, force: true }) }
  })
  const sessionsRoot = join(root, 'sessions')
  const marker = join(root, 'durable.json')
  const recovered = join(root, 'recovered.json')
  const plugin = join(root, 'cold-fixture.mjs')
  const firstPatch = join(root, 'first.patch.json')
  const secondPatch = join(root, 'second.patch.json')
  await writeFile(plugin, `
import { renameSync, writeFileSync } from 'node:fs'
import { LlmAdapter, freezeMessage } from '@deepseek-ai/dsh-llm'
export const name = 'cold-inbox-fixture'
export const inject = ['llm', 'sessions', 'agents']
export function apply(ctx, config) {
  let accepted = false
  let rejectedClaims = 0
  let reported = false
  let attachedPending = []
  const claims = []
  const requests = []
  const hold = new AbortController()
  ctx.effect(() => () => hold.abort())
  class ColdAdapter extends LlmAdapter {
    async * stream(options) {
      const users = options.messages.filter(message => message.role === 'user').map(message => ({
        id: message.id, text: message.content.filter(block => block.type === 'text').map(block => block.text).join(''),
      }))
      requests.push(users)
      if (config.phase === 'crash') {
        if (requests.length !== 1) throw new Error('unexpected request after rejected durable claim')
        const args = JSON.stringify({ todos: [] })
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id: 'cold-todo-write', name: 'todo_write', argumentsDelta: args }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'cold-todo-write', name: 'todo_write', arguments: args } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
      if (requests.length > 2) throw new Error('unexpected extra recovery wake')
      if (!users.some(message => message.id === ${JSON.stringify(pendingId)} && message.text === ${JSON.stringify(pendingText)})) {
        throw new Error('cold request lost the original pending identity')
      }
      const hasRecovery = users.some(message => message.text === 'RECOVER_NOW')
      if (hasRecovery !== (requests.length === 2)) throw new Error('unexpected recovery request order')
      const text = hasRecovery ? 'COLD_RECOVERY_OK' : 'COLD_PENDING_ACK'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['cold-fixture'], new ColdAdapter())
  ctx.on('agent/created', ({ agent }) => {
    attachedPending = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].map(message => message.id)
  })
  ctx.on('agent/inbox/claimed', ({ message }) => { claims.push(message.id) })
  ctx.on('agent/request', async ({ agent, turn, step }, next) => {
    if (config.phase !== 'crash' || turn !== 1 || step !== 2) return next()
    agent.followup(freezeMessage({ id: ${JSON.stringify(pendingId)}, role: 'user',
      content: [{ type: 'text', text: ${JSON.stringify(pendingText)} }], source: { kind: 'user' } }))
    accepted = true
    throw new Error('cold fixture request failure')
  })
  ctx.on('internal/dispatch', (_mode, name, args) => {
    if (config.phase !== 'crash' || !accepted || rejectedClaims !== 0 || name !== 'session/event') return
    const event = args[1]
    if (event.type !== 'agent/inbox/spliced' || event.data.target !== 'next-turn'
      || (event.data.removedCount ?? 0) === 0 || event.data.outcome !== undefined) return
    rejectedClaims += 1
    throw new Error('cold fixture claim persistence rejected')
  })
  const originalFlush = ctx.sessions.flush.bind(ctx.sessions)
  ctx.sessions.flush = async session => {
    const durable = await originalFlush(session)
    const agent = ctx.agents.get(session.id)
    if (agent === undefined || agent.status !== 'idle') return durable
    const turnEnds = session.snapshotEvents().filter(event => event.type === 'turn/end').map(event => event.data.reason.kind)
    const pending = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].map(message => message.id)
    const report = { rootId: session.id, rejectedClaims, claims, requests, pending, attachedPending, turnEnds }
    if (config.phase === 'crash') {
      if (!durable || !accepted || rejectedClaims !== 1 || turnEnds.join(',') !== 'error,error'
        || pending.length !== 1 || pending[0] !== ${JSON.stringify(pendingId)}) {
        const errors = session.snapshotEvents().flatMap(event => event.type === 'turn/end' && event.data.reason.kind === 'error'
          ? [event.data.reason.error] : [])
        throw new Error('cold crash barrier reached without durable retained input: ' + JSON.stringify({ ...report, errors }))
      }
      writeFileSync(config.marker + '.tmp', JSON.stringify(report), { flag: 'wx', mode: 0o600 })
      renameSync(config.marker + '.tmp', config.marker)
      process.stdout.write('COLD_DURABLE\\n')
      const keepAlive = setInterval(() => {}, 1000)
      try {
        await new Promise(resolve => {
          if (hold.signal.aborted) resolve()
          else hold.signal.addEventListener('abort', () => resolve(), { once: true })
        })
      } finally { clearInterval(keepAlive) }
    } else if (requests.length !== 0 && !reported) {
      writeFileSync(config.recovered, JSON.stringify(report), { flag: 'wx', mode: 0o600 })
      reported = true
    }
    return durable
  }
  ctx.effect(() => () => { ctx.sessions.flush = originalFlush })
}
`, { flag: 'wx', mode: 0o600 })
  const patch = (phase: 'crash' | 'recover') => [
    { id: 'agent-default-model', config: { provider: 'cold-fixture', model: 'cold-model' } },
    { id: 'session-persistence-jsonl', config: { root: sessionsRoot, compression: 'none' } },
    ...['session-title-llm', 'llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai'].map(id => ({ id, disabled: true })),
    { insert: [{ id: 'cold-inbox-fixture', name: pathToFileURL(plugin).href, config: { phase, marker, recovered } }] },
  ]
  await writeFile(firstPatch, JSON.stringify(patch('crash')), { flag: 'wx', mode: 0o600 })
  await writeFile(secondPatch, JSON.stringify(patch('recover')), { flag: 'wx', mode: 0o600 })
  const scrubbed: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(scrubbed)) {
    if (/KEY|SECRET|TOKEN|PASSWORD/i.test(key)) Reflect.deleteProperty(scrubbed, key)
  }
  const spawn = (overlay: string, appArgs: string[]) => {
    const launch = resolveExampleLaunch({
      srcBin: fileURLToPath(new URL('../../src/bin.ts', import.meta.url)),
      tsconfigPath: fileURLToPath(new URL('../../../../tsconfig.base.json', import.meta.url)),
      mode: 'src', sourceImport: 'tsx/esm', configArgs: ['--profile', 'headless', '--patch', overlay, ...appArgs],
    })
    const child = execa(launch.command, launch.args, {
      cwd: root, extendEnv: false,
      env: { ...scrubbed, ...launch.env, DSH_HOME: join(root, '.dsh'), DSH_TELEMETRY_DISABLED: '1' },
      stdin: 'pipe', timeout: 45_000, killSignal: 'SIGKILL', reject: false,
    })
    children.push(async () => { child.kill('SIGKILL'); await child })
    return child
  }
  const first = spawn(firstPatch, ['START_COLD'])
  const markerReady = Promise.withResolvers<undefined>()
  let output = ''
  const onOutput = (chunk: Buffer): void => {
    output += chunk.toString('utf8')
    if (output.includes('COLD_DURABLE\n')) markerReady.resolve(undefined)
  }
  first.stdout?.on('data', onOutput)
  try {
    await Promise.race([markerReady.promise, first.then((exit) => {
      throw new Error(`headless exited before durable crash barrier: ${JSON.stringify(exit)}`)
    })])
  } finally { first.stdout?.off('data', onOutput) }
  const barrier = JSON.parse(await readFile(marker, 'utf8')) as BarrierReport
  const beforeCrash = await readRootLog(sessionsRoot, barrier.rootId)
  expect(beforeCrash.header).toMatchObject({ type: 'session', id: barrier.rootId, delegationDepth: 0 })
  expect(beforeCrash.header.parentSession).toBeUndefined()
  expect(barrier).toMatchObject({ rejectedClaims: 1, pending: [pendingId], turnEnds: ['error', 'error'] })
  expect(barrier.requests).toHaveLength(1)
  expect(barrier.claims).not.toContain(pendingId)
  const failures = beforeCrash.events.flatMap(event => event.type === 'turn/end' && event.data.reason.kind === 'error'
    ? [event.data.reason.error.message] : [])
  expect(failures).toHaveLength(2)
  expect(failures[0]).toContain('cold fixture request failure')
  expect(failures[1]).toContain('cold fixture claim persistence rejected')
  expect(foldInbox(beforeCrash.events).pending.map(message => message.id)).toEqual([pendingId])
  expect(beforeCrash.events.filter(event => event.type === 'user/message' && event.data.id === pendingId)).toHaveLength(0)
  expect(beforeCrash.events.filter(event => event.type === 'todo/write')).toHaveLength(1)
  const completed = beforeCrash.events.filter(event => event.type === 'tool/result')
  expect(completed.map(event => event.data.message))
    .toEqual([expect.objectContaining({ toolCallId: 'cold-todo-write', isError: false })])
  const accepted = beforeCrash.events.find(event => event.type === 'agent/inbox/spliced'
    && event.data.inserted.some(message => message.id === pendingId))
  expect(accepted?.seq).toBeGreaterThan(completed[0]!.seq)
  expect(accepted?.seq).toBeLessThan(beforeCrash.events.find(event => event.type === 'turn/end')!.seq)
  expect(first.kill('SIGKILL')).toBe(true)
  const crashed = await first
  expect(crashed.timedOut, crashed.stderr).toBe(false)
  expect(crashed.signal, crashed.stderr).toBe('SIGKILL')
  const afterCrash = await readRootLog(sessionsRoot, barrier.rootId)
  expect(afterCrash.text).toBe(beforeCrash.text)
  expect(foldInbox(afterCrash.events).pending.map(message => message.id)).toEqual([pendingId])
  const second = spawn(secondPatch, ['--session-id', barrier.rootId, 'RECOVER_NOW'])
  const exit = await second
  expect(exit.timedOut, exit.stderr).toBe(false)
  expect(exit.signal, exit.stderr).toBeUndefined()
  expect(exit.exitCode, exit.stderr).toBe(0)
  expect(exit.stdout.trim()).toBe('COLD_RECOVERY_OK')
  const report = JSON.parse(await readFile(recovered, 'utf8')) as BarrierReport
  expect(report.rootId).toBe(barrier.rootId)
  expect(report.rejectedClaims).toBe(0)
  expect(report.pending).toEqual([])
  expect(report.attachedPending).toEqual([pendingId])
  expect(report.claims.filter(id => id === pendingId)).toHaveLength(1)
  expect(report.requests).toHaveLength(2)
  expect(report.requests[0]).toContainEqual({ id: pendingId, text: pendingText })
  expect(report.requests[0]?.some(message => message.text === 'RECOVER_NOW')).toBe(false)
  expect(report.requests[1]).toContainEqual({ id: pendingId, text: pendingText })
  expect(report.requests[1]?.filter(message => message.text === 'RECOVER_NOW')).toHaveLength(1)
  const final = await readRootLog(sessionsRoot, barrier.rootId)
  expect(final.text.startsWith(beforeCrash.text)).toBe(true)
  expect(final.events.slice(0, beforeCrash.events.length)).toEqual(beforeCrash.events)
  expect(final.events.filter(event => event.type === 'user/message' && event.data.id === pendingId)).toHaveLength(1)
  expect(final.events.filter(event => event.type === 'todo/write')).toHaveLength(1)
  expect(final.events.filter(event => event.type === 'tool/call')).toHaveLength(1)
  expect(final.events.filter(event => event.type === 'tool/call').map(event => event.data))
    .toEqual([{ turn: 1, step: 1, callId: 'cold-todo-write', name: 'todo_write', arguments: '{"todos":[]}' }])
  expect(final.events.filter(event => event.type === 'tool/result').map(event => event.data.message))
    .toEqual([expect.objectContaining({ toolCallId: 'cold-todo-write', isError: false })])
  expect(final.events.filter(event => event.type === 'turn/end').map(event => event.data.reason.kind))
    .toEqual(['error', 'error', 'completed', 'completed'])
  expect(final.events.filter(event => event.type === 'turn/start').map(event => event.data.turn)).toEqual([1, 2, 3, 4])
  const inbox = foldInbox(final.events)
  expect(inbox.pending).toEqual([])
  expect(inbox.claimed.filter(id => id === pendingId)).toHaveLength(1)
  expect(inbox.discarded).not.toContain(pendingId)
}, 120_000)
