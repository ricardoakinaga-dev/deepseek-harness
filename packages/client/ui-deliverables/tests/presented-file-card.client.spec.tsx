// @vitest-environment jsdom
/** Explicit file actions preserve their destination, availability, and independent failure state. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PresentedFileCard } from '../src/client/PresentedFileCard.tsx'
import { en, zh } from '../src/client/locales.ts'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { isOutsideWorkspace } from '../src/presented.ts'

afterEach(cleanup)
const props = () => ({
  cwd: undefined,
  file: { path: 'out/report.pdf', description: 'Final report', seq: 4, index: 1 },
  host: { name: 'remote-desktop', available: true, fileManager: 'finder' as const },
  phase: undefined,
  onPreview: vi.fn(),
  actions: <button type="button">Native file action</button>,
  downloadUrl: 'api/present.download?sessionId=owner&seq=4&index=1',
  t: makeTranslate(en),
})
it('localizes reveal failures and accurately reports a directory-only action', () => {
  const p = props()
  const view = render(<PresentedFileCard {...p} phase="revealError" t={makeTranslate(zh)} />)
  expect(view.getByText(zh['presented.revealError'])).toBeTruthy()
  view.rerender(<PresentedFileCard {...p} phase="revealed" host={{ ...p.host, fileManager: 'directory' }} />)
  expect(view.getByText(en['presented.directoryOpened'])).toBeTruthy()
  view.rerender(<PresentedFileCard {...p} phase="revealed" />)
  expect(view.getByText(en['presented.revealed'])).toBeTruthy()
})


it('shows the basename while retaining the full location for hover and actions', () => {
  const p = props()
  const path = '/work/reports/result.pdf'
  const view = render(<PresentedFileCard {...p} cwd="/work" file={{ ...p.file, path }} />)
  expect(view.getByTitle(path)).toBeTruthy()
  expect(view.getByText('result.pdf')).toBeTruthy()
  view.rerender(<PresentedFileCard {...p} cwd="/work" />)
  expect(view.getByTitle('/work/out/report.pdf')).toBeTruthy()
  expect(view.getByText('report.pdf')).toBeTruthy()
})

it.each([
  ['Quarterly summary (.pdf)', 'Quarterly summary'],
  ['季度总结（PDF）', '季度总结'],
] as const)('omits a trailing parenthesized file suffix from %s', (description, expected) => {
  const p = props()
  const view = render(<PresentedFileCard {...p} file={{ ...p.file, description }} />)
  expect(view.getByText(expected)).toBeTruthy()
  expect(view.queryByText(description)).toBeNull()
})


it.each([en, zh])('distinguishes directory-only progress and errors in each locale', (dictionary) => {
  const p = { ...props(), t: makeTranslate(dictionary) }
  const view = render(<PresentedFileCard {...p} phase="revealing" />)
  expect(view.getByText(dictionary['presented.revealing'])).toBeTruthy()
  view.rerender(<PresentedFileCard {...p} phase="revealing" host={{ ...p.host, fileManager: 'directory' }} />)
  expect(view.getByText(dictionary['presented.directoryOpening'])).toBeTruthy()
  view.rerender(<PresentedFileCard {...p} phase="revealError" host={{ ...p.host, fileManager: 'directory' }} />)
  expect(view.getByText(dictionary['presented.directoryError'])).toBeTruthy()
})


it('renders the supplied action independently from the card preview', () => {
  const p = props()
  const native = vi.fn()
  const view = render(<PresentedFileCard {...p} actions={<button type="button" onClick={native}>Native file action</button>} />)
  fireEvent.click(view.getByRole('button', { name: 'Native file action' }))
  expect(native).toHaveBeenCalledOnce()
  expect(p.onPreview).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole('button', { name: 'Preview out/report.pdf in sidebar' }))
  expect(p.onPreview).toHaveBeenCalledOnce()
})

it.each([en, zh])('shows localized saved, oversized, historical, and outside-workspace states', (dictionary) => {
  const p = { ...props(), t: makeTranslate(dictionary) }
  const file = { ...p.file, path: '/elsewhere/report.pdf', capture: { status: 'stored' as const, attachment: {
    attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`), name: 'report.pdf', bytes: 4,
  } } }
  const view = render(<PresentedFileCard {...p} file={file} cwd="/workspace" host={{ ...p.host, available: false }} />)
  const link = view.getByRole('link', { name: dictionary['presented.savedCopy'] })
  expect(link.getAttribute('href')).toBe(p.downloadUrl)
  expect(link.getAttribute('download')).toBe('report.pdf')
  expect(link.closest('button')).toBeNull()
  expect(view.getByText(dictionary['presented.outsideWorkspace'])).toBeTruthy()
  view.rerender(<PresentedFileCard {...p} file={{ ...file, capture: { status: 'too-large', maxBytes: 20 } }} />)
  expect(view.queryByRole('link')).toBeNull()
  expect(view.getByText(dictionary['presented.tooLarge'].replace('{maxBytes}', '20'))).toBeTruthy()
  view.rerender(<PresentedFileCard {...p} />)
  expect(view.getByText(dictionary['presented.captureUnknown'])).toBeTruthy()
  expect(view.queryByRole('link')).toBeNull()
  expect(view.queryByText(dictionary['presented.outsideWorkspace'])).toBeNull()
})

it.each([
  ['/work', 'report.pdf', false], ['/work', '../report.pdf', true], ['/work', 'sub/../../report.pdf', true],
  ['/work', '/work/sub/../report.pdf', false], ['/work', '/work-other/report.pdf', true], ['/', '/report.pdf', false],
  ['C:\\Work', 'c:\\work\\report.pdf', false], ['C:\\Work', 'D:\\work\\report.pdf', true],
  ['C:\\Work', '..\\report.pdf', true], ['\\\\host\\share\\work', '\\\\host\\share\\elsewhere\\report.pdf', true],
] as const)('classifies %s and %s without source access', (cwd, path, outside) => {
  expect(isOutsideWorkspace(cwd, path)).toBe(outside)
})
