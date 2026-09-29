/** Compare reported child checks with the tool calls recorded in a Session v4 log. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AuditReport } from './contracts.ts'

type ObjectValue = Record<string, unknown>
type SessionEvidenceRecord = Pick<AuditReport, 'agentId' | 'sessionId' | 'sessionSha256' | 'findings'>

function object(value: unknown, label: string): ObjectValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as ObjectValue
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a string`)
  return value
}

function position(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function shellExit(message: ObjectValue, meta: unknown): number | null {
  if (message.isError !== false) return null
  if (meta !== undefined) {
    if (meta === null) return null
    const status = object(meta, 'bash result metadata')
    if (status.kind !== 'bash-foreground-exit' || status.timedOut !== false || status.aborted !== false ||
      status.signal !== null || status.stopped !== false) return null
    return typeof status.exitCode === 'number' && Number.isSafeInteger(status.exitCode) && status.exitCode >= 0
      ? status.exitCode : null
  }
  const contents = message.content
  if (!Array.isArray(contents) || contents.length !== 1) return null
  const block = object(contents[0], 'tool content')
  if (block.type !== 'text') return null
  const output = text(block.text, 'tool output')
  if (output.startsWith('Your command timed out after ') || /(?:^|\n)\[shell (?:exited|killed by signal:)/.test(output)) return null
  const interrupted = /(?:^|\n)\[(?:timed out after \d+ms|stopped: [^\]]+|killed by signal: [^\]]+)\](?:\n\[exit code: \d+\])?\s*$/
  if (interrupted.test(output)) return null
  const persistent = /\[Command finished with exit code (\d+)\]\s*$/.exec(output)
  if (persistent) return Number(persistent[1])
  const marker = /\[exit code: (\d+)\]\s*$/.exec(output)
  return marker ? Number(marker[1]) : null
}

/** Session bytes and diagnostics never include command output or arguments. */
export interface ChildSessionCheck {
  agentId: string
  sessionId: string
  sha256: string
  role: 'child' | 'parent'
  parentSessionId: string | null
  errors: string[]
}

/**
 * Verify reported test commands against one Session v4 generation.
 * @param report - Evidence record whose agent ID owns this log.
 * @param path - Path to the raw child Session v4 JSONL file.
 * @param role - Whether the log belongs to a child report or parent adjudication.
 * @returns Content hash and check diagnostics without exposing tool output.
 */
export function verifyChildSession(report: SessionEvidenceRecord, path: string, role: 'child' | 'parent' = 'child'): ChildSessionCheck {
  const bytes = readFileSync(path)
  const lines = bytes.toString('utf8').trimEnd().split('\n')
  const header = object(JSON.parse(lines[0] ?? ''), 'session header')
  if (header.type !== 'session' || header.version !== 4) throw new Error('expected Session v4 header')
  const sessionId = text(header.id, 'session id')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const parentSessionId = typeof header.parentSession === 'string' && header.parentSession.length > 0
    ? header.parentSession : null
  const calls = new Map<string, { command: string; turn: number; step: number; result?: ObjectValue; meta?: unknown }>()
  const allCallIds = new Set<string>()
  const errors: string[] = []
  if (header.origin !== undefined && header.origin !== 'subagent') {
    errors.push(`${report.agentId}: Session header has an unsupported origin`)
  }
  if (header.parentSession !== undefined && parentSessionId === null) {
    errors.push(`${report.agentId}: Session header has invalid parent lineage`)
  }
  if (role === 'child' && (header.origin !== 'subagent' || parentSessionId === null)) {
    errors.push(`${report.agentId}: Session header does not establish subagent origin and parent lineage`)
  }
  if (report.sessionId !== undefined && report.sessionId !== sessionId) errors.push(`${report.agentId}: report Session ID differs from log`)
  if (report.sessionSha256 !== undefined && report.sessionSha256 !== sha256) {
    errors.push(`${report.agentId}: report Session SHA-256 differs from log`)
  }
  let toolErrors = 0
  for (const [index, line] of lines.slice(1).entries()) {
    const event = object(JSON.parse(line), `event ${index}`)
    if (event.seq !== index) throw new Error('non-contiguous Session event sequence')
    if (event.type !== 'tool/call' && event.type !== 'tool/result') continue
    const data = object(event.data, `event ${index} data`)
    if (event.type === 'tool/call') {
      const callId = text(data.callId, 'tool call id')
      if (allCallIds.has(callId)) throw new Error('duplicate Session tool call id')
      allCallIds.add(callId)
      const name = text(data.name, 'tool name')
      if (name !== 'bash') continue
      const args = object(JSON.parse(text(data.arguments, 'tool arguments')), 'tool arguments')
      calls.set(callId, { command: text(args.command, 'shell command'),
        turn: position(data.turn, 'tool call turn'), step: position(data.step, 'tool call step') })
    } else if (event.surfaceOp === 'append') {
      const message = object(data.message, 'tool result message')
      if (message.isError === true) toolErrors++
      const callId = text(message.toolCallId, 'tool result call id')
      if (!allCallIds.has(callId)) errors.push(`${report.agentId}: orphan tool result has no recorded call`)
      const call = calls.get(callId)
      if (call) {
        if (call.result) throw new Error('duplicate Session tool result')
        if (position(data.turn, 'tool result turn') !== call.turn || position(data.step, 'tool result step') !== call.step) {
          errors.push(`${report.agentId}: tool result step differs from its Bash call`)
        }
        call.result = message
        call.meta = data.meta
      }
    }
  }
  const checks = report.findings.flatMap(finding => finding.evidence)
    .filter(evidence => evidence.kind === 'test-run' && (evidence.outcome === 'PASS' || evidence.outcome === 'FAIL'))
  const hasResolved = report.findings.some(finding => finding.status === 'RESOLVED')
  if (toolErrors > 0 && hasResolved) {
    errors.push(`${report.agentId}: Session has ${toolErrors} tool error(s); resolved report needs direct adjudication`)
  }
  const missingResults = [...calls.values()].filter(call => !call.result).length
  if (missingResults > 0 && hasResolved) {
    errors.push(`${report.agentId}: Session has ${missingResults} Bash call(s) without a result; resolved report needs direct adjudication`)
  }
  const indeterminateCalls = [...calls.values()].filter(call => call.result && shellExit(call.result, call.meta) === null).length
  if (indeterminateCalls > 0 && hasResolved) {
    errors.push(`${report.agentId}: Session has ${indeterminateCalls} Bash call(s) without a completed exit; resolved report needs direct adjudication`)
  }
  const failedShellCalls = [...calls.values()].filter((call) => {
    if (!call.result) return false
    const exitCode = shellExit(call.result, call.meta)
    return exitCode !== null && exitCode !== 0
  }).length
  if (failedShellCalls > 0 && hasResolved) {
    errors.push(`${report.agentId}: Session has ${failedShellCalls} failed shell call(s); resolved report needs direct adjudication`)
  }
  const usedCalls = new Set<string>()
  for (const check of checks) {
    const matches = report.sessionSha256 === undefined
      ? [...calls.entries()].filter(([, call]) => call.command === check.command)
      : [...calls.entries()].filter(([callId]) => check.reference === `session:${sha256}#${callId}`)
    if (matches.length !== 1) {
      errors.push(report.sessionSha256 === undefined
        ? `${report.agentId}:${check.id}: expected one matching shell call, found ${matches.length}`
        : `${report.agentId}:${check.id}: evidence reference does not identify the recorded tool call`)
      continue
    }
    const match = matches[0]
    if (!match) throw new Error('matching shell call disappeared')
    const [callId, call] = match
    if (usedCalls.has(callId)) errors.push(`${report.agentId}:${check.id}: Bash call is reused by another executed test claim`)
    usedCalls.add(callId)
    if (call.command !== check.command) errors.push(`${report.agentId}:${check.id}: reported command differs from Session call`)
    const observed = call.result ? shellExit(call.result, call.meta) : null
    if (observed === null) errors.push(`${report.agentId}:${check.id}: Session does not establish a completed shell exit`)
    else if (observed !== check.exitCode) errors.push(`${report.agentId}:${check.id}: reported exit code differs from Session result`)
  }
  return { agentId: report.agentId, sessionId, sha256, role, parentSessionId, errors }
}
