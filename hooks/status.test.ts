import { expect, mock, test } from 'claude-code/testing'

import { duration, gaugeLine, identityLine, meter, parseGit, shortModel, THEMES, width } from './line'
import type { Frame } from './line'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 140,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const text = (runs: { text: string }[]) => runs.map(r => r.text).join('')

const FRAME: Frame = {
  telemetry: { contextPercent: 71, contextTokens: 142_000, contextWindow: 200_000, fiveHour: 42, sevenDay: 25, usd: 1.37, startedAt: 0 },
  identity: { model: 'claude-opus-5-5[1m]', effort: 'high', cwd: 'claude-wills-status' },
  git: { branch: 'main', ahead: 1, behind: 0, dirty: 3 },
  activity: { isWorking: true, tool: 'PowerShell', detail: 'git status --porcelain', calls: 12 },
  frame: 3,
  now: 83 * 60_000,
  isWorking: true,
  isAlerting: false,
  columns: 140,
  palette: THEMES.matrix,
}

test('meters fill to the eighth and run hot', () => {
  expect(text(meter('ctx', 50, THEMES.matrix))).toBe('ctx ████████  50%')
  expect(text(meter('5h', 71, THEMES.matrix))).toBe('5h █████▋██  71%')
  expect(meter('7d', 90, THEMES.matrix).find(r => r.bold)?.fg).toBe('#FF3860')
})

test('the cyber theme turns the healthy meters blue, the warnings stay', () => {
  expect(meter('ctx', 30, THEMES.cyber).find(r => r.bold)?.fg).toBe(THEMES.cyber.ok)
  expect(meter('ctx', 70, THEMES.cyber).find(r => r.bold)?.fg).toBe('#FFB000')
  const tag = identityLine({ ...FRAME, isWorking: false, palette: THEMES.cyber })[0]
  expect(tag.bg).toBe(THEMES.cyber.ok)
})

test('every theme colors the meters ok, warn, hot and draws both lines', () => {
  for (const [name, p] of Object.entries(THEMES)) {
    expect(meter('ctx', 30, p).find(r => r.bold)?.fg, name).toBe(p.ok)
    expect(meter('ctx', 70, p).find(r => r.bold)?.fg, name).toBe(p.warn)
    expect(meter('ctx', 90, p).find(r => r.bold)?.fg, name).toBe(p.hot)
    // The tag may be mid-glitch (`CL4UDE`) on a working frame; its λ never is.
    expect(text(identityLine({ ...FRAME, palette: p })), name).toContain(' λ ')
    expect(text(gaugeLine({ ...FRAME, palette: p })), name).toContain('$1.37')
  }
})

test('native paints with theme keys, so it follows light and dark themes', () => {
  expect(Object.values(THEMES.native).every(c => !c.startsWith('#'))).toBe(true)
  expect(identityLine({ ...FRAME, isWorking: false, palette: THEMES.native })[0]).toMatchObject({ bg: 'success', fg: 'inverseText' })
})

test('small readers', () => {
  expect(duration(42_000)).toBe('42s')
  expect(duration(83 * 60_000)).toBe('1h23m')
  expect(shortModel('claude-opus-5-5[1m]')).toBe('opus 5.5')
  expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
  expect(parseGit('## main...origin/main [ahead 2, behind 1]\n M a.ts\n?? b.ts\n')).toEqual({ branch: 'main', ahead: 2, behind: 1, dirty: 2 })
  expect(parseGit('## No commits yet on dev\n')).toEqual({ branch: 'dev', ahead: 0, behind: 0, dirty: 0 })
})

test('two lines: identity and feed, then gauges', () => {
  const top = text(identityLine(FRAME))
  const bottom = text(gaugeLine(FRAME))

  expect(top).toContain('opus 5.5·high')
  expect(top).toContain('⎇ main ↑1 ±3')
  expect(top).toContain('PowerShell git status')
  expect(bottom).toContain(' 71% 142k')
  expect(bottom).toContain('$1.37')
  expect(bottom).toContain('↑1h23m')
})

test('neither line outgrows its columns', () => {
  for (const columns of [40, 60, 80, 100, 140]) {
    expect(width(identityLine({ ...FRAME, columns }))).toBeLessThanOrEqual(columns)
    expect(width(gaugeLine({ ...FRAME, columns }))).toBeLessThanOrEqual(columns)
  }
  expect(text(gaugeLine({ ...FRAME, columns: 60 }))).not.toContain('$1.37')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`alerts once at 80%, flashing the tag (${surface})`, async ($, on) => {
    mock.clock(on, { now: 1_000 })
    on('session.measure', ($, e) => ({ changed: e.changed }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)

      return { value: undefined } as never
    })

    const measure = (percentUsed: number) =>
      $.session.measure({
        context: { window: 200_000 },
        rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt: new Date(1_000 + 90 * 60_000).toISOString() }],
        changed: ['rateLimits'],
      })

    await measure(70)
    await measure(82)
    await measure(84)

    expect(toasts).toEqual(['⚠ 5h usage at 82% · resets in 1h30m'])

    const ui = await $.ui.mount({ plugin: 'wills-status', surface, component: 'AbovePrompt', props: PROPS })
    const tag = await ui.find({ type: 'Text', text: 'CLAUDE' })
    expect(['#FF3860', THEMES.matrix.ok]).toContain(tag?.props.backgroundColor)
  })

  for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    test(`theme option ${theme} paints the tag (${surface})`, { options: { theme } }, async ($, on) => {
      mock.clock(on, { now: 1_000 })

      const ui = await $.ui.mount({ plugin: 'wills-status', surface, component: 'AbovePrompt', props: PROPS })
      const tag = await ui.find({ type: 'Text', text: 'CLAUDE' })
      expect(tag?.props.backgroundColor).toBe(THEMES[theme].ok)
    })
  }
}
