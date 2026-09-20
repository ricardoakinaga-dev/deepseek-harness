/** Deterministic adapter for the assembled compaction-timeout snapshot. */

import { LlmAdapter } from '@deepseek-ai/dsh-llm'

const PROVIDER = 'resilience-snapshot'
const MODEL = 'resilience-model'

class ResilientCompactionSnapshotAdapter extends LlmAdapter {
  preparedCalls = 0
  ordinaryDispatches = 0

  async prepareCall(provider, model) {
    this.preparedCalls += 1
    const contextWindow = this.preparedCalls === 1 ? 1_000_000 : 1
    return {
      model: { provider, id: model, name: model, context: { contextWindow } },
      stream: options => this.stream(options),
    }
  }

  async * stream(options) {
    if (options.purpose === 'compaction') {
      if (options.signal !== undefined && !options.signal.aborted) {
        await new Promise((resolve) => {
          options.signal.addEventListener('abort', resolve, { once: true })
        })
      }
      return
    }

    this.ordinaryDispatches += 1
    if (this.ordinaryDispatches !== 1) {
      throw new Error('oversized second loop request reached the snapshot adapter')
    }
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield {
      type: 'tool-call-delta',
      index: 0,
      id: 'call_resilience_marker',
      name: 'bash',
      argumentsDelta: '{"command":"printf \'resilience\\n\'","description":"Emit resilience marker"}',
    }
    yield {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id: 'call_resilience_marker',
        name: 'bash',
        arguments: '{"command":"printf \'resilience\\n\'","description":"Emit resilience marker"}',
      },
    }
    yield { type: 'usage', usage: { inputTokens: 24, outputTokens: 6 } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

/** Cordis plugin name. */
export const name = 'resilient-compaction-snapshot-adapter'
/** Required model service. */
export const inject = ['llm']

/** Register the deterministic provider route for this scenario. */
export function apply(ctx) {
  ctx.llm.registerAdapter([PROVIDER], new ResilientCompactionSnapshotAdapter())
}
