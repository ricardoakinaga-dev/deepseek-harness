import { readiness } from './a24-03.ts'

if (!readiness()) throw new Error('A24-03 is not ready')
