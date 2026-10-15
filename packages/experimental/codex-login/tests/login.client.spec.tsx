// @vitest-environment jsdom
/** The Models card keeps the OAuth URL visible and returns a typed callback code. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { RemoteStreamHandle } from '@deepseek-ai/dsh-typert-protocol'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { CodexLogin, type CodexLoginProps } from '../src/client/CodexLogin.tsx'
import { en } from '../src/client/locales.ts'
import type { CodexLoginFrame, CodexLoginReply } from '../src/types.ts'

afterEach(cleanup)

const standard: GlobalStandardProps = {
  usePanelInfo: vi.fn() as GlobalStandardProps['usePanelInfo'],
  useSessions: vi.fn() as GlobalStandardProps['useSessions'],
  useSessionStatus: vi.fn() as GlobalStandardProps['useSessionStatus'],
  useSessionRetainInfo: vi.fn() as GlobalStandardProps['useSessionRetainInfo'],
  useResource: vi.fn() as GlobalStandardProps['useResource'],
  useWorkspaces: vi.fn() as GlobalStandardProps['useWorkspaces'],
}

it('opens ChatGPT sign-in, submits the callback code, and refreshes stored-grant status', async () => {
  const answer = Promise.withResolvers<CodexLoginReply>()
  const send = vi.fn((reply: CodexLoginReply) => { answer.resolve(reply) })
  const dispose = vi.fn()
  const handle: RemoteStreamHandle<CodexLoginFrame, CodexLoginReply> = {
    send, dispose, end: vi.fn(),
    async *[Symbol.asyncIterator]() {
      yield { type: 'notice', message: 'Continue', url: 'https://auth.openai.com/example' } as const
      yield { type: 'prompt', id: 'request-1', kind: 'secret', message: 'Callback code' } as const
      await answer.promise
      yield { type: 'settled', status: 'authorized' } as const
    },
  }
  const status = vi.fn()
    .mockResolvedValueOnce({ available: true, configured: false, writable: true, inFlight: false })
    .mockResolvedValueOnce({ available: true, configured: true, writable: true, inFlight: false })
  const props: CodexLoginProps = {
    ...standard,
    provider: { provider: 'openai-codex', displayName: 'Codex', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai-codex'], active: true },
    configured: true, keyConfigured: false,
    t: ((key: keyof typeof en) => en[key]) as CodexLoginProps['t'],
    status, login: vi.fn(() => handle), signOut: vi.fn(),
  }
  render(<CodexLogin {...props} />)
  await screen.findByText(en.signedOut)
  fireEvent.click(screen.getByRole('button', { name: en.signIn }))
  expect((await screen.findByRole('link', { name: en.continue })).getAttribute('href')).toBe('https://auth.openai.com/example')
  fireEvent.change(screen.getByLabelText(en.code), { target: { value: 'private-code' } })
  fireEvent.click(screen.getByRole('button', { name: en.submit }))
  await waitFor(() => { expect(send).toHaveBeenCalledWith({ type: 'answer', id: 'request-1', value: 'private-code' }) })
  const signedIn = await screen.findByText(en.signedIn)
  expect(signedIn.parentElement?.outerHTML).toMatchSnapshot()
  expect(screen.queryByDisplayValue('private-code')).toBeNull()
})
