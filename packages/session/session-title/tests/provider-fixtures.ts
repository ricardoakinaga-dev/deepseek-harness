import { sessionTitleUserMessageOf } from '@deepseek-ai/dsh-session-title'
import type { SessionTitleProvider } from '@deepseek-ai/dsh-session-title'

export const loadTestSessionTitleMessages: SessionTitleProvider['loadMessages'] = async ({
  session,
  throughSeq,
  signal,
}) => {
  signal.throwIfAborted()
  const messages = []
  for (const event of session.snapshotEvents()) {
    if (event.seq > throughSeq) break
    const message = sessionTitleUserMessageOf(event)
    if (message !== undefined) messages.push(message)
  }
  signal.throwIfAborted()
  return messages
}
