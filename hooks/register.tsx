import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionCost, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { Telemetry } from '../types'
import { duration, gaugeLine, identityLine, parseGit, themeOf } from './line'
import type { Frame, Run } from './line'

const telemetry = atom({ plugin: 'wills-status', key: 'telemetry' } as const, {})
const identity = atom({ plugin: 'wills-status', key: 'identity' } as const, {})
const git = atom({ plugin: 'wills-status', key: 'git' } as const, null)
const activity = atom({ plugin: 'wills-status', key: 'activity' } as const, { isWorking: false, calls: 0 })
const alerted = atom({ plugin: 'wills-status', key: 'alerted' } as const, {})
const alertUntil = atom({ plugin: 'wills-status', key: 'alertUntil' } as const, 0)
const frame = atom({ plugin: 'wills-status', key: 'frame' } as const, 0)
const now = atom({ plugin: 'wills-status', key: 'now' } as const, 0)

const FRAME_MS = 110
const CLOCK_MS = 30_000
const GIT_MIN_GAP_MS = 2_000
const ALERT_FLASH_MS = 3_000
const THRESHOLDS = [95, 80]
const DETAIL_CHARS = 48
const TOUCHES_TREE = /^(Bash|PowerShell|Edit|MultiEdit|Write|NotebookEdit)$/

const fromUsage = (
  context: SessionContextUsage,
  rateLimits: readonly SessionRateLimit[],
  cost: SessionCost | undefined,
): Telemetry => {
  const five = rateLimits.find(r => r.kind === 'five_hour')
  const seven = rateLimits.find(r => r.kind === 'seven_day')

  return {
    contextPercent: context.percent,
    contextTokens: context.tokens,
    contextWindow: context.window,
    fiveHour: five?.percentUsed,
    fiveHourResetsAt: five?.resetsAt,
    sevenDay: seven?.percentUsed,
    sevenDayResetsAt: seven?.resetsAt,
    usd: cost?.usd,
  }
}

/** The argument that says what a tool call is about, on one line. */
const detailOf = (input: Record<string, unknown>): string | undefined => {
  const raw = ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'skill', 'description', 'prompt']
    .map(k => input[k])
    .find((v): v is string => typeof v === 'string' && v.length > 0)
  if (!raw) return undefined

  const flat = raw.replace(/\s+/g, ' ').trim()
  const short = /[\\/]/.test(flat) && !flat.includes(' ') ? flat.split(/[\\/]/).pop() ?? flat : flat

  return short.length > DETAIL_CHARS ? `${short.slice(0, DETAIL_CHARS - 1)}…` : short
}

let spinner: Timer | undefined
let clock: Timer | undefined
let gitCheckedAt = 0

const isAnimating = async ($: EngineInterface) =>
  (await read($, activity)).isWorking || (await $.clock.now()) < (await read($, alertUntil))

/** Animates the line while a turn runs or an alert flashes; stops itself after. */
async function animate($: EngineInterface): Promise<void> {
  if (spinner || !(await isAnimating($))) return

  spinner = $.clock.every(FRAME_MS, async () => {
    if (!(await isAnimating($))) {
      spinner?.cancel()
      spinner = undefined
    }
    await update($, frame, f => (f + 1) % 1_000_000)
  })
}

/** Reads the working tree; null outside a repository. At most once per gap. */
async function refreshGit($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  if (at - gitCheckedAt < GIT_MIN_GAP_MS) return
  gitCheckedAt = at

  // No git on the machine (a fresh Mac has none until the command line tools
  // are installed) rejects the run: the segment just stays hidden.
  const r = await $.process.run(['git', 'status', '--porcelain=v1', '--branch'], { timeoutMs: 3_000 }).catch(() => null)
  await update($, git, () => (r?.exitCode === 0 ? parseGit(r.stdout) : null))
}

/** Keeps the uptime and the working tree current between events. */
async function tick($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  if (!clock) {
    clock = $.clock.every(CLOCK_MS, async () => {
      const later = await $.clock.now()
      await update($, now, () => later)
      await refreshGit($)
    })
  }
}

/** Toasts once per window as it crosses 80% and 95%, and flashes the tag red. */
async function alert($: EngineInterface, t: Telemetry): Promise<void> {
  const at = await $.clock.now()
  const windows: [string, string, number | undefined, string | undefined][] = [
    ['five_hour', '5h usage', t.fiveHour, t.fiveHourResetsAt],
    ['seven_day', '7d usage', t.sevenDay, t.sevenDayResetsAt],
    ['context', 'context', t.contextPercent, undefined],
  ]
  const seen = await read($, alerted)
  const next: Record<string, number> = { ...seen }
  let isRaised = false

  for (const [kind, label, percent, resetsAt] of windows) {
    if (percent === undefined) continue

    const level = THRESHOLDS.find(th => percent >= th) ?? 0
    if (level > (seen[kind] ?? 0)) {
      const when = resetsAt ? ` · resets in ${duration(Date.parse(resetsAt) - at)}` : kind === 'context' ? ' · compaction is near' : ''
      $.ui.toast(`⚠ ${label} at ${Math.round(percent)}%${when}`, { timeoutMs: 8_000 })
      isRaised = true
    }
    // Falls back with the window, so the next climb alerts again.
    next[kind] = level
  }

  await update($, alerted, () => next)
  if (isRaised) {
    await update($, alertUntil, () => at + ALERT_FLASH_MS)
    await animate($)
  }
}

async function measure($: EngineInterface, latest: Telemetry): Promise<void> {
  await update($, telemetry, t => ({ ...latest, startedAt: latest.startedAt ?? t.startedAt }))
  await alert($, latest)
  await tick($)
}

/** The session's directory, as a prompt would show it. */
async function where($: EngineInterface): Promise<string> {
  const cwd = (await $.session.cwd()).replace(/[\\/]+$/, '')
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/[\\/]+$/, '')

  return home && cwd.toLowerCase() === home.toLowerCase() ? '~' : cwd.split(/[\\/]/).pop() ?? cwd
}

export const register: Register = (on, options) => {
  // Picked in /config; a change there reloads the module with the new value.
  const palette = themeOf(options.theme)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const usage = await $.session.usage()
    const model = await $.session.model()
    const cwd = await where($)

    await update($, identity, i => ({ ...i, model, cwd }))
    await measure($, { ...fromUsage(usage.context, usage.rateLimits, usage.cost), startedAt: usage.startedAt })
    await refreshGit($)

    return started
  })

  on('session.measure', async ($, e, next) => {
    await measure($, fromUsage(e.context, e.rateLimits, e.cost))

    return next(e)
  })

  // Each main-loop request names the model and effort it really runs on.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const effort = e.effort === undefined ? undefined : String(e.effort)
      await update($, identity, i => ({ ...i, model: e.model, effort }))
    }

    return yield* next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, activity, a => ({ ...a, isWorking: true, tool: undefined, detail: undefined }))
    await animate($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's tools feed the line too: the main turn is still running.
    await update($, activity, a => ({
      ...a,
      tool: e.tool.replace(/^mcp__([^_]+)__/, '$1:'),
      detail: detailOf(e as unknown as Record<string, unknown>),
      calls: a.calls + 1,
    }))

    const ran = await next(e)
    if (TOUCHES_TREE.test(e.tool)) await refreshGit($)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await update($, activity, a => ({ ...a, isWorking: false }))
    await tick($)
    await refreshGit($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const a = await read($, activity)
    const at = await read($, now)
    const f: Frame = {
      telemetry: await read($, telemetry),
      identity: await read($, identity),
      git: await read($, git),
      activity: a,
      frame: await read($, frame),
      now: at,
      isWorking: e.props.isWorking || a.isWorking,
      isAlerting: (await $.clock.now()) < (await read($, alertUntil)),
      columns: e.props.bodyColumns,
      palette,
    }

    const row = (runs: Run[]) => (
      <Box flexDirection="row">
        {runs.map(r => (
          <Text
            {...(r.fg ? { color: r.fg } : {})}
            {...(r.bg ? { backgroundColor: r.bg } : {})}
            {...(r.bold ? { bold: true } : {})}
            wrap="truncate"
          >
            {r.text}
          </Text>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {row(identityLine(f))}
        {row(gaugeLine(f))}
      </Box>
    )
  })
}
