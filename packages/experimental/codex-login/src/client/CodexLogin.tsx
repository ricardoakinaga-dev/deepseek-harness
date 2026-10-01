/** Models-card control for the existing OpenAI Codex OAuth flow. */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteStreamHandle } from '@deepseek-ai/dsh-typert-protocol'
import type { CodexLoginFrame, CodexLoginReply, CodexLoginStatus } from '../types.ts'
import type { NS } from './locales.ts'

/** Browser operations supplied by the optional Remote contribution. */
export interface CodexLoginActions {
  status: () => Promise<CodexLoginStatus>
  login: (signal: AbortSignal) => RemoteStreamHandle<CodexLoginFrame, CodexLoginReply>
  signOut: () => Promise<void>
}

/** Full slot props from Models, locale, and the plugin. */
export type CodexLoginProps = PropsRuntime<'settings.models.provider-card'> & PropsLocale<typeof NS> & CodexLoginActions

/** @param props - provider facts and browser operations. @returns Codex sign-in controls for its row. */
export function CodexLogin({ provider, configured, keyConfigured, t, status, login, signOut }: CodexLoginProps) {
  const [state, setState] = useState<CodexLoginStatus>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string>()
  const [code, setCode] = useState<string>()
  const [prompt, setPrompt] = useState<Extract<CodexLoginFrame, { type: 'prompt' }>>()
  const [answer, setAnswer] = useState('')
  const stream = useRef<RemoteStreamHandle<CodexLoginFrame, CodexLoginReply>>()
  const abort = useRef<AbortController>()

  useEffect(() => {
    if (provider.provider !== 'openai-codex') return
    let live = true
    void status().then((value) => { if (live) setState(value) }, () => { if (live) setError(t('loadFailed')) })
    return () => {
      live = false
      abort.current?.abort()
      stream.current?.dispose()
    }
  }, [provider.provider, status, t])

  if (provider.provider !== 'openai-codex') return null

  const refresh = (): void => {
    void status().then(setState, () => { setError(t('loadFailed')) })
  }
  const start = (): void => {
    setError(undefined)
    setLink(undefined)
    setCode(undefined)
    setPrompt(undefined)
    setAnswer('')
    setBusy(true)
    const controller = new AbortController()
    abort.current = controller
    let handle: RemoteStreamHandle<CodexLoginFrame, CodexLoginReply>
    try { handle = login(controller.signal) } catch {
      abort.current = undefined
      setBusy(false)
      setError(t('failed'))
      return
    }
    stream.current = handle
    void (async () => {
      try {
        for await (const frame of handle) {
          switch (frame.type) {
            case 'notice':
              if (frame.url !== undefined && /^https?:\/\//i.test(frame.url)) setLink(frame.url)
              if (frame.code !== undefined) setCode(frame.code)
              break
            case 'prompt':
              setPrompt(frame)
              break
            case 'settled':
              setPrompt(undefined)
              if (frame.status === 'cancelled') setError(t('cancelled'))
              refresh()
              break
            case 'failed':
              setPrompt(undefined)
              setError(t(frame.reason === 'callback-busy' ? 'callbackBusy' : 'failed'))
              refresh()
              break
          }
        }
      } catch {
        if (!controller.signal.aborted) setError(t('failed'))
      } finally {
        if (stream.current === handle) stream.current = undefined
        if (abort.current === controller) abort.current = undefined
        setBusy(false)
      }
    })()
  }
  const cancel = (): void => {
    abort.current?.abort()
    stream.current?.dispose()
    setPrompt(undefined)
    setBusy(false)
  }
  const leave = (): void => {
    setError(undefined)
    void signOut().then(refresh, () => { setError(t('signOutFailed')) })
  }
  const submit = (value: string): void => {
    if (prompt === undefined) return
    if (stream.current === undefined) {
      cancel()
      setError(t('failed'))
      return
    }
    try { stream.current.send({ type: 'answer', id: prompt.id, value }) } catch {
      cancel()
      setError(t('failed'))
      return
    }
    setPrompt(undefined)
    setAnswer('')
  }

  return <div style={{ display: 'grid', gap: 8, padding: '8px 0' }}>
    <span>{state === undefined ? t('checking') : state.configured ? t('signedIn') : t('signedOut')}</span>
    {!configured && <span>{t('saveFirst')}</span>}
    {keyConfigured && <span>{t('keyOverride')}</span>}
    {state !== undefined && !state.available && <span>{t('unavailable')}</span>}
    {state?.inFlight && !busy && <span>{t('busy')}</span>}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" disabled={!configured || keyConfigured || !state?.available || !state.writable || state.inFlight || busy} onClick={start}>{t('signIn')}</button>
      {state?.configured && <button type="button" disabled={busy || !state.writable} onClick={leave}>{t('signOut')}</button>}
      {busy && <button type="button" onClick={cancel}>{t('cancel')}</button>}
    </div>
    {link && busy && <a href={link} target="_blank" rel="noopener noreferrer">{t('continue')}</a>}
    {code && busy && <span>{t('deviceCode', { code })}</span>}
    {prompt && busy && <div style={{ display: 'grid', gap: 8 }}>
      <span>{t('copyCode')}</span>
      {prompt.kind === 'select'
        ? <div>{prompt.options?.map(option => <button key={option.id} type="button" onClick={() => { submit(option.id) }}>{option.label}</button>)}</div>
        : <form onSubmit={(event) => { event.preventDefault(); submit(answer) }}>
          <label>{t('code')} <input type={prompt.kind === 'secret' ? 'password' : 'text'} value={answer} onChange={(event) => { setAnswer(event.target.value) }} autoComplete="off" /></label>
          <button type="submit" disabled={answer.length === 0}>{t('submit')}</button>
        </form>}
    </div>}
    {error && <span role="alert">{error}</span>}
  </div>
}
