import { describe, expect, it } from 'vitest'
import { findWorkflowPinViolations } from './verify-workflow-pins.ts'

describe('workflow action pin policy', () => {
  it('rejects a mutable reference', () => {
    expect(findWorkflowPinViolations('fixture.yml', '      - uses: actions/checkout@v6\n')).toEqual([{
      file: 'fixture.yml',
      line: 1,
      action: 'actions/checkout',
      reason: 'reference must be a 40-character commit SHA',
    }])
  })

  it('rejects a pinned reference without its release comment', () => {
    expect(findWorkflowPinViolations('fixture.yml', '      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803\n')).toEqual([{
      file: 'fixture.yml',
      line: 1,
      action: 'actions/checkout',
      reason: 'pinned reference must document its release tag',
    }])
  })

  it('accepts a pinned external action and ignores local reusable workflows', () => {
    expect(findWorkflowPinViolations('fixture.yml', [
      '      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6',
      '    uses: ./.github/workflows/reusable.yml',
    ].join('\n'))).toEqual([])
  })
})
