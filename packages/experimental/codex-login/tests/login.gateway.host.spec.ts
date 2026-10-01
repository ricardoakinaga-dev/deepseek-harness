/** An OAuth answer may half-close its uplink while the Host commits the grant. */
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { TYPERT } from '@deepseek-ai/dsh-experimental-codex-login/typert'
import { MemoryCredentials } from '../../../credentials/authorization/tests/memory.ts'
import CodexLoginController from '../src/index.ts'
import type { CodexLoginFrame, CodexLoginReply } from '../src/types.ts'

const key = credentialKey('llm-pi-ai', 'openai-codex')
const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

it('keeps the OAuth attempt alive after the answer uplink ends and reports a committed grant', async () => {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AuthorizationService)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(CodexLoginController)
  ctx.typert.register(TYPERT as TypertContribution)
  ctx.authorization.registerFlow({
    key, label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Sign in' }],
    async run(session) {
      session.notify({ message: 'Open browser', url: 'https://auth.openai.com/example' })
      const code = await session.prompt({ kind: 'text', message: 'Code' })
      if (code !== 'valid') throw new Error('unexpected code')
      await session.commit({ kind: 'grant', payload: { access: 'host-only-token' } })
    },
  })
  const answer = Promise.withResolvers<CodexLoginReply>()
  async function* uplink(): AsyncGenerator<CodexLoginReply> { yield await answer.promise }
  const stream = await ctx.typertGateway.stream({
    namespace: 'codexLogin', method: 'login', args: {}, uplink: uplink(),
  })
  const reader = stream[Symbol.asyncIterator]()
  const notice = await reader.next()
  expect(notice.value).toMatchObject({ type: 'notice', url: 'https://auth.openai.com/example' })
  const next = await reader.next()
  if (next.done || next.value === null || typeof next.value !== 'object' || !('type' in next.value)
    || next.value.type !== 'prompt' || !('id' in next.value) || typeof next.value.id !== 'string') {
    throw new Error('missing callback prompt')
  }
  answer.resolve({ type: 'answer', id: next.value.id, value: 'valid' })
  const settled = await reader.next()
  expect(settled.value).toEqual({ type: 'settled', status: 'authorized' } satisfies CodexLoginFrame)
  expect((await reader.next()).done).toBe(true)
  expect((await ctx.credentials.describeRecord(key)).kind).toBe('grant')
})
