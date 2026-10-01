import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../credentials/authorization/tests/memory.ts'
import CodexLoginController from '../src/index.ts'
import { LoginExchange } from '../src/exchange.ts'

const key = credentialKey('llm-pi-ai', 'openai-codex')
const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

async function fixture() {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AuthorizationService)
  return { ctx, controller: new CodexLoginController(ctx) }
}

it('delivers only progress to the downlink, accepts the matching callback code, and stores the grant on the Host', async () => {
  const { ctx, controller } = await fixture()
  ctx.authorization.registerFlow({
    key, label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Sign in' }],
    async run(session) {
      session.notify({ message: 'Continue', url: 'https://auth.openai.com/example' })
      const code = await session.prompt({ kind: 'secret', message: 'Code' })
      if (code !== 'valid-code') throw new Error('wrong code')
      await session.commit({ kind: 'grant', payload: { access: 'host-only-token' } })
    },
  })
  const exchange = new LoginExchange(new AbortController().signal)
  const frames = exchange.read()[Symbol.asyncIterator]()
  const attempt = ctx.authorization.begin({ key, method: 'oauth', interaction: exchange })
  expect((await frames.next()).value).toEqual({ type: 'notice', message: 'Continue', url: 'https://auth.openai.com/example' })
  const next = await frames.next()
  const prompt = next.done ? undefined : next.value
  expect(prompt).toMatchObject({ type: 'prompt', kind: 'secret', message: 'Code' })
  if (prompt?.type !== 'prompt') throw new Error('missing prompt')
  exchange.accept({ type: 'answer', id: 'wrong-id', value: 'valid-code' })
  expect((await ctx.credentials.describeRecord(key)).configured).toBe(false)
  exchange.accept({ type: 'answer', id: prompt.id, value: 'valid-code' })
  await expect(attempt).resolves.toEqual({ status: 'authorized' })
  expect(await controller.status()).toMatchObject({ available: true, configured: true })
  exchange.finish()
  expect((await frames.next()).done).toBe(true)
  await controller.signOut()
  expect(await controller.status()).toMatchObject({ available: true, configured: false })
})

it('withdraws a pending prompt on cancellation and leaves an API key intact on sign-out', async () => {
  const { ctx, controller } = await fixture()
  const abort = new AbortController()
  const exchange = new LoginExchange(abort.signal)
  const result = expect(exchange.prompt({ kind: 'secret', message: 'Code' })).rejects.toThrow('withdrawn')
  abort.abort()
  await result
  exchange.withdraw()

  await ctx.credentials.modifyRecord(key, async () => ({ kind: 'api-key', key: 'existing-key' }))
  expect(await controller.status()).toMatchObject({ configured: false })
  await controller.signOut()
  expect((await ctx.credentials.describeRecord(key)).kind).toBe('api-key')
})
