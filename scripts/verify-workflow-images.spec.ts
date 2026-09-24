import { describe, expect, it } from 'vitest'
import { findWorkflowImageViolations } from './verify-workflow-images.ts'

describe('workflow image digest policy', () => {
  it('rejects a mutable manylinux image', () => {
    expect(findWorkflowImageViolations('fixture.yml', 'image=quay.io/pypa/manylinux_2_28_x86_64\n')).toEqual([{
      file: 'fixture.yml',
      line: 1,
      image: 'quay.io/pypa/manylinux_2_28_x86_64',
    }])
  })

  it('accepts digest-pinned images', () => {
    expect(findWorkflowImageViolations('fixture.yml', [
      'node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1',
      'quay.io/pypa/manylinux_2_28_aarch64@sha256:dd795d9b88abe7960ef59f980472e4792ebbf2f70b5967f529286bfb5fb68fb8',
    ].join('\n'))).toEqual([])
  })
})
