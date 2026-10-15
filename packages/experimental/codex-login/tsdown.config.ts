import { clientBundle } from '../../client/tsdown.client.ts'

/** Build the Host Remote and optional browser UI in their respective passes. */
export default clientBundle(import.meta.dirname, ['lib/types/index.js'], { hostPhase: true })
