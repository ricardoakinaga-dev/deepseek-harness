// Title-source invariant: `messageSeqs` is empty iff `source.kind` is `user`.
// — the durable relationship every appended session/title event must keep.
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as SessionTitleInvariantCompanion from '@deepseek-ai/dsh-session-title/invariant'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { Session, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import { createUserMessage, type ImageBlock } from '@deepseek-ai/dsh-llm'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(SessionTitleInvariantCompanion)
  return ctx
}

describe('session-title source invariant', () => {
  it('accepts cited automatic titles and citation-free user renames', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('title-invariant-valid'))
    const source = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'title me' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const blank = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: '   ' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const nonText = session.append('user/message', createUserMessage({
      content: [{
        type: 'image',
        attachment: {
          attachmentId: 'title-invariant-image' as ImageBlock['attachment']['attachmentId'],
          mediaType: 'image/png',
          bytes: 1,
          width: 1,
          height: 1,
        },
      }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    expect(() => {
      session.append('session/title', { title: 'auto', messageSeqs: [source.seq], source: { kind: 'fallback' } })
      session.append('session/title', { title: 'blank source', messageSeqs: [blank.seq], source: { kind: 'fallback' } })
      session.append('session/title', { title: 'non-text source', messageSeqs: [nonText.seq], source: { kind: 'fallback' } })
      session.append('session/title', { title: 'named', messageSeqs: [], source: { kind: 'user' } })
    }).not.toThrow()
  })

  it('rejects a citation-free automatic title and a user rename that cites messages', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('title-invariant-invalid'))
    const source = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'title me' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    expect(() => {
      session.append('session/title', { title: 'auto', messageSeqs: [], source: { kind: 'fallback' } })
    }).toThrow(expect.objectContaining<Partial<InvariantError>>({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-session-title',
    }))
    expect(() => {
      session.append('session/title', { title: 'named', messageSeqs: [source.seq], source: { kind: 'user' } })
    }).toThrow(expect.objectContaining<Partial<InvariantError>>({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-session-title',
    }))
    expect(session.seq).toBe(1)
  })

  it('requires automatic-title citations to name distinct earlier human messages', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('title-invariant-sources'))
    const boundary = session.append('turn/start', { turn: 1 })
    expect(() => session.append('session/title', {
      title: 'wrong source', messageSeqs: [boundary.seq], source: { kind: 'fallback' },
    })).toThrow(/must name an earlier human user\/message/)
    expect(() => session.append('session/title', {
      title: 'future source', messageSeqs: [SessionSeq(session.seq)], source: { kind: 'fallback' },
    })).toThrow(/must name an earlier human user\/message/)
    expect(() => session.append('session/title', {
      title: 'malformed source', messageSeqs: [-1 as never], source: { kind: 'fallback' },
    })).toThrow(/invalid message seq/)
    const pluginMessage = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'plugin context' }],
      source: { kind: 'plugin', plugin: 'test' },
    }), { surfaceOp: 'append' })
    expect(() => session.append('session/title', {
      title: 'plugin source', messageSeqs: [pluginMessage.seq], source: { kind: 'fallback' },
    })).toThrow(/must name an earlier human user\/message/)
    const source = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'title me' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    expect(() => session.append('session/title', {
      title: 'duplicate source', messageSeqs: [source.seq, source.seq], source: { kind: 'fallback' },
    })).toThrow(/repeats message seq/)
  })

  it('does not index an uncommitted human message emitted for another event sequence', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('title-invariant-fake-event'))
    const boundary = session.append('turn/start', { turn: 1 })
    ctx.emit('session/event', session, {
      type: 'user/message',
      seq: boundary.seq,
      time: boundary.time,
      data: createUserMessage({
        content: [{ type: 'text', text: 'uncommitted fake prompt' }], source: { kind: 'user' },
      }),
      surfaceOp: 'append',
    })

    expect(() => session.append('session/title', {
      title: 'must reject fake source', messageSeqs: [boundary.seq], source: { kind: 'fallback' },
    })).toThrow(/must name an earlier human user\/message/)
    expect(session.seq).toBe(1)
  })

  it('validates seeded title events from the creation baseline without rereading the new Session', async () => {
    const ctx = await setup()
    const snapshot = vi.spyOn(Session.prototype, 'snapshotEvents')
    try {
      const message = createUserMessage({
        content: [{ type: 'text', text: 'seeded title source' }], source: { kind: 'user' },
      })
      const session = ctx.sessions.create(SessionId('title-invariant-seeded'), {
        seed: [
          { type: 'user/message', seq: SessionSeq(0), time: 1, data: message, surfaceOp: 'append' },
          {
            type: 'session/title', seq: SessionSeq(1), time: 2,
            data: { title: 'seeded', messageSeqs: [SessionSeq(0)], source: { kind: 'fallback' } },
          },
        ],
        inheritedEventCount: SessionLogOffset(2),
        meta: { isSeeded: true },
      })
      expect(snapshot).not.toHaveBeenCalled()
      expect(session.seq).toBe(3)
    } finally {
      snapshot.mockRestore()
    }
  })

  it('validates title relations when the companion loads after a Session', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('title-invariant-existing'))
    const boundary = session.append('turn/start', { turn: 1 })
    session.append('session/title', {
      title: 'wrong source', messageSeqs: [boundary.seq], source: { kind: 'fallback' },
    })
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(SessionTitleInvariantCompanion).then(() => undefined))
      .rejects.toThrow(/must name an earlier human user\/message/)
  })
})
