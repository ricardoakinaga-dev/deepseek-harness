/** Enforce SBOM and GitHub attestation coverage for the release workflows. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const sbomAction = 'anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610'
const attestAction = 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6'
const sbomPredicate = 'https://spdx.dev/Document/v2.3'

/** Release workflow paths covered by the supply-chain policy. */
export const RELEASE_SUPPLY_CHAIN_WORKFLOWS = [
  '.github/workflows/node-addon-system-release.yml',
  '.github/workflows/python-release.yml',
  '.github/workflows/release-publish.yml',
  '.github/workflows/release-vendor-publish.yml',
  '.github/workflows/release-vendor.yml',
] as const

interface DownloadExpectation {
  name: string
  path: string
}

interface WorkflowExpectation {
  producerJob: string
  subjectPath: string
  sbomScanPath: string
  sbomPath: string
  sbomUploadPath: string
  sbomArtifactName?: string
  publishJobs: readonly string[]
  downloads: Readonly<Record<string, readonly DownloadExpectation[]>>
  verificationPaths?: Readonly<Record<string, readonly string[]>>
  attestationCondition?: string
}

const EXPECTATIONS: Readonly<Record<string, WorkflowExpectation>> = {
  '.github/workflows/node-addon-system-release.yml': {
    producerJob: 'pack',
    subjectPath: 'native/system/dist/npm/*.tgz',
    sbomScanPath: 'native/system/dist/npm',
    sbomPath: 'native/system/dist/node-addon-system-release.spdx.json',
    sbomUploadPath: 'native/system/dist/node-addon-system-release.spdx.json',
    sbomArtifactName: 'node-addon-system-release-sbom',
    publishJobs: ['publish'],
    downloads: {
      publish: [
        { name: 'npm-tarballs', path: 'native/system/dist/npm' },
        { name: 'node-addon-system-release-sbom', path: 'native/system/dist' },
      ],
    },
    verificationPaths: {
      pack: ['native/system/dist/npm/*.tgz'],
      publish: ['native/system/dist/npm/*.tgz'],
    },
  },
  '.github/workflows/python-release.yml': {
    producerJob: 'validate',
    subjectPath: 'dist/*.whl',
    sbomScanPath: 'dist',
    sbomPath: 'dist/python-release.spdx.json',
    sbomUploadPath: 'dist/*',
    publishJobs: ['publish-runtime', 'publish-sdk'],
    downloads: {
      'publish-runtime': [{ name: 'python-release-${{ needs.validate.outputs.version }}', path: 'dist' }],
      'publish-sdk': [{ name: 'python-release-${{ needs.validate.outputs.version }}', path: 'dist' }],
    },
    verificationPaths: {
      validate: ['dist/*.whl'],
      'publish-runtime': ['dist/deepseek_harness_runtime_bin-*.whl'],
      'publish-sdk': ['dist/deepseek_harness_sdk-*.whl'],
    },
  },
  '.github/workflows/release-publish.yml': {
    producerJob: 'pack',
    subjectPath: 'dist/npm/*.tgz',
    sbomScanPath: 'dist/npm',
    sbomPath: 'dist/dsh-release.spdx.json',
    sbomUploadPath: 'dist/dsh-release.spdx.json',
    sbomArtifactName: 'dsh-release-sbom',
    publishJobs: ['publish'],
    downloads: {
      publish: [
        { name: 'dsh-npm-tarballs', path: 'dist/npm' },
        { name: 'dsh-release-sbom', path: 'dist' },
      ],
    },
    verificationPaths: {
      pack: ['dist/npm/*.tgz'],
      publish: ['dist/npm/*.tgz'],
    },
  },
  '.github/workflows/release-vendor-publish.yml': {
    producerJob: 'pack',
    subjectPath: 'dist/npm-vendor/*.tgz',
    sbomScanPath: 'dist/npm-vendor',
    sbomPath: 'dist/vendor-release.spdx.json',
    sbomUploadPath: 'dist/vendor-release.spdx.json',
    sbomArtifactName: 'vendor-release-sbom',
    publishJobs: ['publish'],
    downloads: {
      publish: [
        { name: 'vendor-npm-tarballs', path: 'dist/npm-vendor' },
        { name: 'vendor-release-sbom', path: 'dist' },
      ],
    },
    verificationPaths: {
      pack: ['dist/npm-vendor/*.tgz'],
      publish: ['dist/npm-vendor/*.tgz'],
    },
  },
  '.github/workflows/release-vendor.yml': {
    producerJob: 'pack',
    subjectPath: 'dist/npm-vendor/*.tgz',
    sbomScanPath: 'dist/npm-vendor',
    sbomPath: 'dist/vendor-release.spdx.json',
    sbomUploadPath: 'dist/vendor-release.spdx.json',
    sbomArtifactName: 'vendor-release-sbom',
    publishJobs: [],
    downloads: {},
    verificationPaths: {
      pack: ['dist/npm-vendor/*.tgz'],
    },
    attestationCondition: "github.event_name != 'pull_request' || (github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.head.repo.fork == false && github.event.pull_request.user.login != 'dependabot[bot]')",
  },
}

/** A release supply-chain policy violation. */
export interface ReleaseSupplyChainViolation {
  /** Repository-relative workflow path. */
  file: string
  /** Workflow job containing the violation. */
  job: string
  /** Stable policy rule identifier. */
  rule: string
  /** Concrete failure detail. */
  detail: string
}

/** Check whether a value is a string-keyed record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Return the mapping behind a workflow step's `with` or `env` block. */
function stepRecord(step: Record<string, unknown>, key: 'env' | 'with'): Record<string, unknown> {
  return isRecord(step[key]) ? step[key] : {}
}

/** Return all mapping-valued steps in a workflow job. */
function jobSteps(job: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(job.steps) ? job.steps.filter(isRecord) : []
}

/** Return whether a workflow path value covers the expected file or glob. */
function pathCovers(value: unknown, expected: string): boolean {
  return typeof value === 'string' && (value === expected || value.split('\n').some(line => line.trim() === expected))
}

/** Find an artifact download with the expected name and destination. */
function hasDownload(steps: readonly Record<string, unknown>[], expected: DownloadExpectation): boolean {
  return steps.some((step) => {
    if (typeof step.uses !== 'string' || !step.uses.startsWith('actions/download-artifact@')) return false
    const withBlock = stepRecord(step, 'with')
    return withBlock.name === expected.name && withBlock.path === expected.path
  })
}

/** Add a policy violation to a mutable result list. */
function violation(
  violations: ReleaseSupplyChainViolation[],
  file: string,
  job: string,
  rule: string,
  detail: string,
): void {
  violations.push({ file, job, rule, detail })
}

/** Validate the producer job's SBOM, attestation, and verification sequence. */
function checkProducer(
  file: string,
  expectation: WorkflowExpectation,
  job: string,
  definition: Record<string, unknown>,
  violations: ReleaseSupplyChainViolation[],
): void {
  const steps = jobSteps(definition)
  const sbom = steps.find(step => step.uses === sbomAction)
  if (sbom === undefined) {
    violation(violations, file, job, 'missing-sbom-generation', `use ${sbomAction}`)
  } else {
    const withBlock = stepRecord(sbom, 'with')
    for (const [key, expected] of [
      ['path', expectation.sbomScanPath],
      ['format', 'spdx-json'],
      ['output-file', expectation.sbomPath],
      ['upload-artifact', false],
      ['upload-release-assets', false],
    ] as const) {
      if (withBlock[key] !== expected) {
        violation(violations, file, job, 'invalid-sbom-generation', `${key} must be ${JSON.stringify(expected)}`)
      }
    }
  }

  const attestations = steps.filter(step => step.uses === attestAction)
  const sourceIdentityAttestation = attestations.find(step => stepRecord(step, 'with')['sbom-path'] === undefined)
  const sbomAttestation = attestations.find(step => stepRecord(step, 'with')['sbom-path'] === expectation.sbomPath)
  if (sourceIdentityAttestation === undefined) {
    violation(violations, file, job, 'missing-source-identity-attestation', `attest ${expectation.subjectPath}`)
  }
  if (sbomAttestation === undefined) {
    violation(violations, file, job, 'missing-sbom-attestation', `attest ${expectation.sbomPath}`)
  }
  for (const attestation of [sourceIdentityAttestation, sbomAttestation]) {
    if (attestation === undefined) continue
    const withBlock = stepRecord(attestation, 'with')
    if (withBlock['subject-path'] !== expectation.subjectPath) {
      violation(violations, file, job, 'invalid-attestation-subject', `subject-path must be ${expectation.subjectPath}`)
    }
    if (expectation.attestationCondition !== undefined && attestation.if !== expectation.attestationCondition) {
      violation(violations, file, job, 'invalid-attestation-condition', `if must be ${expectation.attestationCondition}`)
    }
    if (expectation.attestationCondition === undefined && attestation.if !== undefined) {
      violation(violations, file, job, 'unexpected-attestation-condition', 'attestation must run for every release candidate')
    }
  }

  const permissions = isRecord(definition.permissions) ? definition.permissions : {}
  for (const key of ['id-token', 'attestations'] as const) {
    if (permissions[key] !== 'write') {
      violation(violations, file, job, 'missing-attestation-permissions', `${key}: write is required`)
    }
  }

  const sbomUpload = steps.find((step) => {
    if (typeof step.uses !== 'string' || !step.uses.startsWith('actions/upload-artifact@')) return false
    const withBlock = stepRecord(step, 'with')
    return pathCovers(withBlock.path, expectation.sbomUploadPath)
      && (expectation.sbomArtifactName === undefined || withBlock.name === expectation.sbomArtifactName)
  })
  if (sbomUpload === undefined) {
    violation(violations, file, job, 'missing-sbom-upload', `upload ${expectation.sbomUploadPath}`)
  } else if (sbom !== undefined && steps.indexOf(sbomUpload) < steps.indexOf(sbom)) {
    violation(violations, file, job, 'sbom-upload-before-generation', 'upload the generated SBOM after the generator step')
  }

  checkVerification(file, expectation, job, steps, violations)
}

/** Validate a verification job's downloaded subjects and CLI checks. */
function checkVerification(
  file: string,
  expectation: WorkflowExpectation,
  job: string,
  steps: readonly Record<string, unknown>[],
  violations: ReleaseSupplyChainViolation[],
): void {
  const verifyIndex = steps.findIndex(step => typeof step.run === 'string' && step.run.includes('gh attestation verify'))
  const verify = verifyIndex >= 0 ? steps[verifyIndex] : undefined
  if (verify === undefined) {
    violation(violations, file, job, 'missing-attestation-verification', 'run gh attestation verify for source identity and SBOM')
  } else {
    const run = typeof verify.run === 'string' ? verify.run : ''
    const verificationPaths = expectation.verificationPaths?.[job] ?? [expectation.subjectPath]
    if (!verificationPaths.some(path => run.includes(path))
      || !run.includes('--repo "$GITHUB_REPOSITORY"')
      || !run.includes(`--predicate-type ${sbomPredicate}`)) {
      violation(violations, file, job, 'invalid-attestation-verification', 'use the dynamic repository and SPDX predicate type')
    }
    if (stepRecord(verify, 'env').GH_TOKEN !== '${{ github.token }}') {
      violation(violations, file, job, 'missing-attestation-token', 'set GH_TOKEN from github.token')
    }
    if (expectation.attestationCondition !== undefined && verify.if !== expectation.attestationCondition) {
      violation(violations, file, job, 'invalid-attestation-condition', `if must be ${expectation.attestationCondition}`)
    }
    if (expectation.attestationCondition === undefined && verify.if !== undefined) {
      violation(violations, file, job, 'unexpected-attestation-condition', 'verification must run for every release candidate')
    }
  }

  for (const expected of expectation.downloads[job] ?? []) {
    if (!hasDownload(steps, expected)) {
      violation(violations, file, job, 'missing-artifact-download', `download ${expected.name} into ${expected.path}`)
    }
  }
  const lastDownloadIndex = steps.reduce((index, step, stepIndex) => (
    typeof step.uses === 'string' && step.uses.startsWith('actions/download-artifact@') ? stepIndex : index
  ), -1)
  const lastAttestationIndex = steps.reduce((index, step, stepIndex) => (
    step.uses === attestAction ? stepIndex : index
  ), -1)
  if (verifyIndex >= 0 && lastDownloadIndex >= 0 && verifyIndex < lastDownloadIndex) {
    violation(violations, file, job, 'verification-before-download', 'verify only after all release artifacts are downloaded')
  }
  if (verifyIndex >= 0 && lastAttestationIndex >= 0 && verifyIndex < lastAttestationIndex) {
    violation(violations, file, job, 'verification-before-attestation', 'verify only after both attestations are generated')
  }
  if (expectation.publishJobs.includes(job)) {
    const publishIndex = steps.findIndex(step => typeof step.name === 'string' && step.name.startsWith('Publish '))
    if (publishIndex < 0 || verifyIndex < 0 || publishIndex < verifyIndex) {
      violation(violations, file, job, 'publish-before-attestation-verification', 'verify attestations before publication')
    }
  }
}

/** Validate one allowed release workflow from its YAML source. */
export function findReleaseSupplyChainViolations(file: string, source: string): ReleaseSupplyChainViolation[] {
  const expectation = EXPECTATIONS[file]
  if (expectation === undefined) return []
  const violations: ReleaseSupplyChainViolation[] = []
  let parsed: unknown
  try {
    parsed = yaml.load(source)
  } catch (error) {
    violation(violations, file, '<workflow>', 'invalid-yaml', error instanceof Error ? error.message : String(error))
    return violations
  }
  if (!isRecord(parsed) || !isRecord(parsed.jobs)) {
    violation(violations, file, '<workflow>', 'missing-jobs', 'workflow must define jobs')
    return violations
  }
  const producer = parsed.jobs[expectation.producerJob]
  if (!isRecord(producer)) {
    violation(violations, file, expectation.producerJob, 'missing-producer-job', 'producer job is required')
  } else {
    checkProducer(file, expectation, expectation.producerJob, producer, violations)
  }
  for (const job of expectation.publishJobs) {
    const definition = parsed.jobs[job]
    if (!isRecord(definition)) {
      violation(violations, file, job, 'missing-publish-job', 'publish job is required')
      continue
    }
    const permissions = isRecord(definition.permissions) ? definition.permissions : {}
    if (permissions.attestations !== 'read' && permissions.attestations !== 'write') {
      violation(violations, file, job, 'missing-attestation-permissions', 'attestations: read is required')
    }
    const steps = jobSteps(definition)
    checkVerification(file, expectation, job, steps, violations)
  }
  return violations
}

/** Scan all release workflows covered by the REM-025 policy. */
export function scanReleaseSupplyChainViolations(repoRoot: string): ReleaseSupplyChainViolation[] {
  return RELEASE_SUPPLY_CHAIN_WORKFLOWS.flatMap((file) => {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    return findReleaseSupplyChainViolations(file, source)
  })
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const violations = scanReleaseSupplyChainViolations(root)
  if (violations.length === 0) {
    console.log('verify-release-supply-chain: all permitted release workflows generate and verify source-identity and SBOM attestations.')
  } else {
    console.error('verify-release-supply-chain: release workflows do not satisfy source-identity/SBOM policy:')
    for (const item of violations) console.error(`  ${item.file}:${item.job} ${item.rule}: ${item.detail}`)
    process.exitCode = 1
  }
}
