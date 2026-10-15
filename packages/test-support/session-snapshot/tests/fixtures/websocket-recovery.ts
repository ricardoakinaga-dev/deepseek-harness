/** Local Responses peer for a real WebSocket close/retry through the shipped profile. */
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

function responseFrames(request: number): object[] {
  const id = `response-${request}`
  const tool = request !== 3
  const item = tool
    ? { type: 'function_call', id: `fc-${request}`, call_id: `write-${request}`, name: 'bash',
      arguments: JSON.stringify({ description: 'Write a single transport-recovery marker', command: `printf '${request === 1 ? 'once' : 'uncommitted'}\\n' >> once.txt` }) }
    : { type: 'message', id: `msg-${request}`, role: 'assistant', content: [{ type: 'output_text', text: 'DONE' }] }
  return [
    { type: 'response.created', response: { id } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, ...tool ? { arguments: '' } : { content: [] } } },
    ...tool
      ? [{ type: 'response.function_call_arguments.delta', output_index: 0, delta: item.arguments }]
      : [{ type: 'response.output_text.delta', output_index: 0, delta: 'DONE' }],
    { type: 'response.output_item.done', output_index: 0, item },
    ...request === 2 ? [] : [{ type: 'response.completed', response: {
      id, status: 'completed', output: [item], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 },
    } }],
  ]
}

/** Start an ephemeral local provider; request two closes before its terminal response frame.
 * @returns URL, observed request counts, and awaited socket/listener cleanup.
 */
export async function startWebSocketRecoveryPeer(): Promise<{
  url: string
  requests: unknown[]
  httpRequests: string[]
  close(): Promise<void>
}> {
  const requests: unknown[] = []
  const httpRequests: string[] = []
  const server = createServer((request, response) => {
    httpRequests.push(request.url ?? '')
    response.writeHead(500).end('unexpected HTTP fallback')
  })
  const peer = new WebSocketServer({ server })
  peer.on('connection', (socket) => {
    socket.on('message', (data) => {
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)
      const request: unknown = JSON.parse(bytes.toString('utf8'))
      requests.push(request)
      if (requests.length > 3) {
        socket.close(1011, 'fixture request budget exhausted')
        return
      }
      for (const frame of responseFrames(requests.length)) socket.send(JSON.stringify(frame))
      socket.close(1000)
    })
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => { reject(error) }
      server.once('error', onError)
      server.listen({ port: 0, host: '127.0.0.1' }, () => {
        server.off('error', onError)
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture has no TCP address')
    return {
      url: `http://127.0.0.1:${address.port}`, requests, httpRequests,
      async close() {
        for (const socket of peer.clients) socket.terminate()
        await Promise.all([
          new Promise<void>((resolve, reject) => { peer.close((error) => { if (error) reject(error); else resolve() }) }),
          new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) }),
        ])
      },
    }
  } catch (error) {
    for (const socket of peer.clients) socket.terminate()
    peer.close()
    server.close()
    throw error
  }
}
