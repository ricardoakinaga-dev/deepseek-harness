import { describe, expect, it } from 'vitest'
import { pinWorkflowImages } from './pin-workflow-images.ts'

describe('workflow image pinning', () => {
  it('pins known mutable images', () => {
    expect(pinWorkflowImages('image=node:24-alpine\n')).toBe('image=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1\n')
  })

  it('leaves reviewed digests unchanged', () => {
    const source = 'image=quay.io/pypa/manylinux_2_28_x86_64@sha256:e84d335c4c0ab4dbc8efcd055a645d9665eed249454fe068a58355698944accd\n'
    expect(pinWorkflowImages(source)).toBe(source)
  })
})
