import { describe, expect, it } from 'vitest'
import { ToolCallId, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createSettlementMessage, withContinuableReturnGuidance } from '../src/continuation-messages.ts'

const childId = SessionId('settled-child')
const summary = { type: 'text', text: `Background subagent ${childId} finished and will do no further work unless you send it more.` }
const reasoning: ContentBlock = { type: 'reasoning', text: 'private child reasoning' }
const toolCall: ContentBlock = { type: 'tool-call', id: ToolCallId('child-call'), name: 'read', arguments: '{}' }

describe('continuable final-result guidance', () => {
  it('uses the final reply for automatic result delivery and reserves sends for progress', () => {
    const prompt: ContentBlock[] = [{ type: 'text', text: 'task' }]
    const content = withContinuableReturnGuidance(SessionId('parent"\nagent'), prompt)
    expect(content.slice(0, 1)).toEqual(prompt)
    expect(content[1]).toEqual({
      type: 'text',
      text: 'Your parent agent id is "parent\\"\\nagent". Put your self-contained final result in your final reply; '
        + 'it will be delivered to your parent automatically when you finish. Use '
        + 'send_message({ agent_id: "parent\\"\\nagent", message: "<progress or coordination>" }) '
        + 'when a finding changes what the parent should do next. Do not send a second copy of your final result. '
        + 'The parent shares your workspace but does not automatically receive your transcript, tool output, or reasoning. '
        + 'Sending a message does not end your turn.',
    })
  })
})

describe('continuable settlement content', () => {
  it.each([
    ['reasoning before the answer', [reasoning, { type: 'text', text: 'answer' }]],
    ['a tool call after the answer', [{ type: 'text', text: 'answer' }, toolCall]],
  ] satisfies [string, ContentBlock[]][])('reports only the closing text with %s', (_label, output) => {
    const original = structuredClone(output)
    const message = createSettlementMessage(childId, { stopReason: 'completed', output })

    expect(message.role).toBe('user')
    expect(message.content).toEqual([
      summary,
      { type: 'text', text: 'Its closing message:' },
      { type: 'text', text: 'answer' },
    ])
    expect(output).toEqual(original)
  })

  it.each([
    ['empty output', []],
    ['reasoning-only output', [reasoning]],
    ['empty text', [{ type: 'text', text: '' }]],
  ] satisfies [string, ContentBlock[]][])('reports no closing message for %s', (_label, output) => {
    const message = createSettlementMessage(childId, { stopReason: 'completed', output })

    expect(message.content).toEqual([
      summary,
      { type: 'text', text: 'It left no closing message.' },
    ])
  })

  it('preserves text block order and bytes around omitted reasoning and tool calls', () => {
    const first: ContentBlock = { type: 'text', text: '  first\n' }
    const second: ContentBlock = { type: 'text', text: '\n第二段  ' }
    const message = createSettlementMessage(childId, {
      stopReason: 'completed',
      output: [reasoning, first, toolCall, second],
    })

    expect(message.content).toEqual([
      summary,
      { type: 'text', text: 'Its closing message:' },
      first,
      second,
    ])
  })
})

it('includes closing text alongside structured results and diagnostics', () => {
  expect(createSettlementMessage(childId, {
    stopReason: 'completed', output: [{ type: 'text', text: 'final answer' }],
    structured: { answer: 42 }, diagnostic: 'safe diagnostic',
  }).content).toEqual([
    summary,
    { type: 'text', text: 'Its closing message:' },
    { type: 'text', text: 'final answer' },
    { type: 'text', text: 'Structured result: {"answer":42}' },
    { type: 'text', text: 'safe diagnostic' },
  ])
})
