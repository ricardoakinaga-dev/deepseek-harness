/**
 * Agent-scoped durable one-shot and fixed-rate reminders over the session event log.
 * @module @deepseek-ai/dsh-schedule
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
// Type-only: resolves the required ctx.sessionProjections host service.
import type {} from '@deepseek-ai/dsh-session-projection'
import { ScheduleLogError } from './domain.ts'
import { scheduleProjectionDefinition } from './projection.ts'
import { ScheduleRuntime } from './runtime.ts'
import { registerScheduleTools } from './tools.ts'

export type * from './types.ts'
export {
  SCHEDULE_CHANGE_VERSION,
  MIN_EVERY_INTERVAL_SECONDS,
  ScheduleId,
  ScheduleInputError,
  ScheduleLogError,
  allocateScheduleId,
  createAfterScheduleRecord,
  createAtScheduleRecord,
  createEveryScheduleRecord,
  decodeScheduleChange,
  foldScheduleEvents,
  renderReminderFraming,
  renderEveryReminderBatchFraming,
  resolveEveryOccurrence,
  scheduleView,
} from './domain.ts'
export { registerScheduleTools } from './tools.ts'

/** Cordis function-plugin name. */
export const name = 'schedule'
/** Services required before future root agents can receive Schedule. */
export const inject = ['agents', 'sessions', 'tools', 'sessionPersistence', 'sessionProjections']

type OwnerCleanup = () => void | Promise<void>

/** Install Schedule only for root agents published after this plugin loads. */
export function apply(ctx: Context): void {
  const projections = ctx.get('sessionProjections')
  if (projections === undefined) {
    throw new Error('Schedule requires the SessionProjectionRegistry service')
  }
  ctx.effect(() => projections.register(scheduleProjectionDefinition))

  const runtimes = new Map<Agent, OwnerCleanup>()
  let stopping = false

  ctx.effect(() => {
    const stopCreated = ctx.on('agent/created', ({ agent }) => {
      if (stopping || runtimes.has(agent) || !ctx.agents.roots().includes(agent)) return
      const runtime = new ScheduleRuntime(ctx, agent)
      const cleanup: OwnerCleanup = agent.ctx.effect(() => {
        const disposeTools = registerScheduleTools(ctx, agent.ctx, agent, () => { runtime.requestDrive() })
        const stopStatus = agent.ctx.on('agent/status', ({ status }) => {
          if (status !== 'idle') return
          try {
            const projection = ctx.sessionProjections.stateOf(agent.session, 'schedule')
            if (projection === undefined) {
              throw new Error('required schedule session projection is unavailable')
            }
            if (projection.seenIds.length > 0) runtime.requestDrive()
          } catch (error: unknown) {
            if (!(error instanceof ScheduleLogError)) throw error
          }
        })
        runtime.start()
        return async () => {
          stopStatus()
          disposeTools()
          try {
            await runtime.dispose()
          } finally {
            if (runtimes.get(agent) === cleanup) runtimes.delete(agent)
          }
        }
      }, 'schedule.runtime()')
      runtimes.set(agent, cleanup)
    })

    return async () => {
      stopping = true
      stopCreated()
      const cleanups = [...runtimes.values()]
      runtimes.clear()
      await Promise.allSettled(cleanups.map(cleanup => Promise.resolve(cleanup())))
    }
  }, 'schedule.lifecycle()')
}
