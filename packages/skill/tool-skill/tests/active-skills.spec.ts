/** A retained instruction body can be reused; shadowed or modified bodies must be loaded again. */
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import Tools from '@deepseek-ai/dsh-tools'
import Skills from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import * as ToolSkill from '../src/index.ts'
import type {} from '../src/active-skills.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Projections)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  await ctx.plugin(Skills)
  await ctx.plugin(ToolSkill)
  let remove = ctx.skills.register({ name: 'review', description: 'Review', source: 'runtime', provider: 'runtime', content: 'Keep the complete evidence. 🧪' })
  const session = ctx.sessions.create(SessionId('skill-context'))
  return { ctx, session, change: () => {
    remove()
    remove = ctx.skills.register({ name: 'review', description: 'Review', source: 'runtime', provider: 'runtime', content: 'Updated instructions.' })
  } }
}

async function load(ctx: Context, session: Session, id: string) {
  const callId = ToolCallId(id)
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant',
    source: { kind: 'model', provider: 'test', model: 'test' },
    content: [{ type: 'tool-call', id: callId, name: 'skill', arguments: '{"name":"review"}' }],
  }) }, { surfaceOp: 'append' })
  const result = await ctx.tools.execute({ name: 'skill', arguments: { name: 'review' }, callId, signal: new AbortController().signal,
    agent: { session } as never })
  expect(result.isError).toBe(false)
  const logged = session.append('tool/result', { turn: 1, step: 1,
    message: createToolResultMessage({ callId, content: result.content, isError: false }),
    ...result.meta === undefined ? {} : { meta: result.meta },
  }, { surfaceOp: 'append' })
  return { result, logged }
}

it('reuses an intact body, reloads changed contents, and reconstructs the decision after resume', async () => {
  const { ctx, session, change } = await setup()
  const first = await load(ctx, session, 'first')
  expect(first.result.content[0]).toHaveProperty('text', expect.stringContaining('Keep the complete evidence'))
  const second = await load(ctx, session, 'second')
  expect(second.result.content[0]).toHaveProperty('text', expect.stringContaining('already loaded'))
  const resumed = ctx.sessions.create(SessionId('resumed'), { seed: session.snapshotEvents(), meta: { isSeeded: false } })
  expect((await load(ctx, resumed, 'third')).result.content[0]).toHaveProperty('text', expect.stringContaining('already loaded'))
  change()
  expect((await load(ctx, session, 'changed')).result.content[0]).toHaveProperty('text', expect.stringContaining('Updated instructions'))
})

it('reloads after a pruner replaces the original result even if its metadata is retained', async () => {
  const { ctx, session } = await setup()
  const { logged } = await load(ctx, session, 'original')
  session.append('tool/result', { ...logged.data, message: { ...logged.data.message, content: [{ type: 'text', text: 'pruned' }] } }, {
    surfaceOp: { op: 'replace', startSeq: logged.seq, endSeq: logged.seq }, sourceEventSeqs: [logged.seq],
  })
  expect((await load(ctx, session, 'reload')).result.content[0]).toHaveProperty('text', expect.stringContaining('Keep the complete evidence'))
})

it('reloads when a positional replacement crosses non-monotonic surface sequences', async () => {
  const { ctx, session } = await setup()
  const opening = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Review this task.' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const { logged } = await load(ctx, session, 'original')
  const tail = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Keep the result.' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const prefix = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Earlier summary.' }], source: { kind: 'user' },
  }), { surfaceOp: { op: 'replace', startSeq: opening.seq, endSeq: opening.seq }, sourceEventSeqs: [opening.seq] })
  expect(ctx.sessionProjections.stateOf(session, 'activeSkills')).toMatchObject({ review: { seq: logged.seq } })
  const shadowed = session.snapshotEvents().filter(event => event.surfaceOp === 'append' && event.seq > opening.seq)
    .map(event => event.seq)
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'All previous instructions condensed.' }], source: { kind: 'user' },
  }), { surfaceOp: { op: 'replace', startSeq: prefix.seq, endSeq: tail.seq }, sourceEventSeqs: [prefix.seq, ...shadowed] })
  expect(ctx.sessionProjections.stateOf(session, 'activeSkills')).toEqual({})
  expect((await load(ctx, session, 'after-summary')).result.content[0])
    .toHaveProperty('text', expect.stringContaining('Keep the complete evidence'))
})
