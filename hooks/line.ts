import type { Activity, Git, Identity, Telemetry } from '../types'

export type Run = { text: string; fg?: string; bg?: string; bold?: boolean }

/**
 * Every color the line paints: a hex color, or a Claude Code theme key
 * (`success`, `warning`, ...), which follows the person's light or dark theme.
 * A meter runs `ok` below 60%, `warn` below 85%, `hot` above.
 */
export type Palette = {
  ok: string
  warn: string
  hot: string
  working: string
  feed: string
  scramble: string
  dim: string
  muted: string
  track: string
  tagInk: string
  model: string
  git: string
  cost: string
}

export const THEMES = {
  matrix: {
    ok: '#00FF9C',
    warn: '#FFB000',
    hot: '#FF3860',
    working: '#00E5FF',
    feed: '#00E5FF',
    scramble: '#0F8F5A',
    dim: '#4F6660',
    muted: '#7A8C85',
    track: '#1E4535',
    tagInk: '#04140D',
    model: '#82AAFF',
    git: '#C792EA',
    cost: '#C792EA',
  },
  cyber: {
    ok: '#00D9FF',
    warn: '#FFB000',
    hot: '#FF3860',
    working: '#B388FF',
    feed: '#5CC8FF',
    scramble: '#1F6FB2',
    dim: '#3E5373',
    muted: '#7F8DA6',
    track: '#16304F',
    tagInk: '#020A17',
    model: '#82AAFF',
    git: '#FF79C6',
    cost: '#B388FF',
  },
  // Claude Code's own theme keys: right on light, dark and colorblind themes alike.
  native: {
    ok: 'success',
    warn: 'warning',
    hot: 'error',
    working: 'claude',
    feed: 'suggestion',
    scramble: 'inactive',
    dim: 'subtle',
    muted: 'inactive',
    track: 'subtle',
    tagInk: 'inverseText',
    model: 'permission',
    git: 'merged',
    cost: 'planMode',
  },
  // Monochrome phosphor: dim amber, brightening as it fills, red at the end.
  amber: {
    ok: '#CC8A00',
    warn: '#FFC94D',
    hot: '#FF4A2E',
    working: '#FFD27A',
    feed: '#FFB000',
    scramble: '#7A5200',
    dim: '#5C4720',
    muted: '#A68A55',
    track: '#2E2410',
    tagInk: '#140D00',
    model: '#FFC94D',
    git: '#FFD27A',
    cost: '#FFB000',
  },
  // '80s neon: a pink tag, a sunset across the meters, cyan and sun-yellow accents.
  synthwave: {
    ok: '#FF2E97',
    warn: '#FF9E3D',
    hot: '#FF3B3B',
    working: '#B967FF',
    feed: '#00F0FF',
    scramble: '#7B2CBF',
    dim: '#5A3E7A',
    muted: '#A88BC7',
    track: '#2A1340',
    tagInk: '#14001F',
    model: '#00F0FF',
    git: '#B967FF',
    cost: '#FFD319',
  },
} satisfies Record<string, Palette>

export type ThemeName = keyof typeof THEMES
export const themeOf = (name: unknown): Palette => THEMES[name as ThemeName] ?? THEMES.matrix

const SPINNER = [...'⣾⣽⣻⢿⡿⣟⣯⣷']
const GLYPHS = [...'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ABCDEF']
const EIGHTHS = [...' ▏▎▍▌▋▊▉']
const LEET: Record<string, string> = { C: '¢', L: '1', A: '4', U: 'µ', D: 'Ð', E: '3' }
const METER_CELLS = 8
const MIN_FEED = 14

const TAG_TEXT = ' λ CLAUDE '

/** A stable pseudo-random number per frame and slot, so a frame always draws the same. */
const noise = (frame: number, slot: number) => (((frame + 1) * 2654435761 + slot * 40503) >>> 0) % 997

export const heat = (percent: number, p: Palette) => (percent < 60 ? p.ok : percent < 85 ? p.warn : p.hot)

export const width = (runs: readonly Run[]) => runs.reduce((n, r) => n + [...r.text].length, 0)

/** `█████▋██  71%`: eighth-cell precision on a dark track, colored by how hot it runs. */
export const meter = (label: string, percent: number, p: Palette, suffix?: string): Run[] => {
  const eighths = Math.round((Math.max(0, Math.min(100, percent)) / 100) * METER_CELLS * 8)
  const full = Math.floor(eighths / 8)
  const part = eighths % 8
  const color = heat(percent, p)
  const track = METER_CELLS - full - (part ? 1 : 0)

  return [
    { text: `${label} `, fg: p.muted },
    { text: '█'.repeat(full), fg: color },
    // The partial cell sits on the track, so the bar reads as one piece.
    ...(part ? [{ text: EIGHTHS[part], fg: color, bg: p.track }] : []),
    { text: '█'.repeat(track), fg: p.track },
    { text: `${String(Math.round(percent)).padStart(4)}%`, fg: color, bold: true },
    ...(suffix ? [{ text: ` ${suffix}`, fg: p.muted }] : []),
  ]
}

export const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

export const duration = (ms: number) => {
  const m = Math.floor(ms / 60_000)

  return m < 1
    ? `${Math.floor(ms / 1000)}s`
    : m < 60
      ? `${m}m`
      : m < 1440
        ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
        : `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`
}

/** `claude-opus-5-5[1m]` → `opus 5.5`; anything else as it came. */
export const shortModel = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(id)

  return m ? `${m[1]} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id.replace(/\[.*\]$/, '')
}

/** `git status --porcelain --branch` → branch, ahead/behind, changed files. */
export const parseGit = (stdout: string): Git => {
  const [head = '', ...files] = stdout.split(/\r?\n/)
  const name = head.replace(/^## /, '').replace(/^No commits yet on /, '').split('...')[0].split(' ')[0]

  return {
    branch: name === 'HEAD' ? 'detached' : name,
    ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(head)?.[1] ?? 0),
    dirty: files.filter(f => f.trim().length > 0).length,
  }
}

/** The tag: theme color at rest, the working color with a letter glitching, red while an alert flashes. */
const tag = (frame: number, isWorking: boolean, isAlerting: boolean, p: Palette): Run => {
  const letters = [...TAG_TEXT]
  if (isWorking && frame % 3 === 0) {
    const i = 3 + (noise(frame, 0) % 6)
    letters[i] = LEET[letters[i]] ?? letters[i]
  }
  const bg = isAlerting && frame % 2 === 0 ? p.hot : isWorking ? p.working : p.ok

  return { text: letters.join(''), fg: p.tagInk, bg, bold: true }
}

const gitSegment = (g: Git, p: Palette): Run[] => [
  { text: '⎇ ', fg: p.git },
  { text: g.branch, fg: p.git, bold: true },
  ...(g.ahead ? [{ text: ` ↑${g.ahead}`, fg: p.feed }] : []),
  ...(g.behind ? [{ text: ` ↓${g.behind}`, fg: p.warn }] : []),
  g.dirty ? { text: ` ±${g.dirty}`, fg: p.warn } : { text: ' ✓', fg: p.ok },
]

/** The live feed: spinner, tool, its argument, a tail of scrambling glyphs. */
const feed = (a: Activity, frame: number, isWorking: boolean, p: Palette): Run[] =>
  isWorking
    ? [
        { text: `${SPINNER[frame % SPINNER.length]} `, fg: p.feed },
        { text: a.tool ? a.tool : 'thinking', fg: p.feed, bold: true },
        ...(a.detail ? [{ text: ` ${a.detail}`, fg: p.muted }] : []),
        { text: ' ' + Array.from({ length: 6 }, (_, i) => GLYPHS[noise(frame, i + 1) % GLYPHS.length]).join(''), fg: p.scramble },
      ]
    : [
        { text: '◉ ', fg: p.ok },
        { text: 'standby', fg: p.muted },
        ...(a.tool ? [{ text: ` ⟨last ${a.tool}⟩`, fg: p.dim }] : []),
        { text: ` ${a.calls} ops`, fg: p.dim },
      ]

/** Cuts runs to `room` cells from the end, marking the cut. */
const clip = (runs: readonly Run[], room: number): Run[] => {
  const out: Run[] = []
  let left = room
  for (const r of runs) {
    const chars = [...r.text]
    if (chars.length <= left) {
      out.push(r)
      left -= chars.length
    } else {
      if (left > 1) out.push({ ...r, text: chars.slice(0, left - 1).join('') + '…' })
      break
    }
  }

  return out
}

/** `head`, then as many segments as fit (lowest priority dropped first), then `tail` clipped into what is left. */
const fit = (head: Run[], segments: Run[][], tail: Run[], columns: number, tailMin: number, p: Palette): Run[] => {
  const sep: Run = { text: ' │ ', fg: p.dim }
  let kept = segments
  const build = () => [...head, ...kept.flatMap((s, i) => (i < kept.length - 1 || tail.length ? [...s, sep] : s))]

  while (kept.length > 0 && width(build()) + tailMin > columns) {
    kept = kept.slice(0, -1)
  }

  const body = build()

  return [...body, ...clip(tail, Math.max(0, columns - width(body)))]
}

export type Frame = {
  telemetry: Telemetry
  identity: Identity
  git: Git | null
  activity: Activity
  frame: number
  now: number
  isWorking: boolean
  isAlerting: boolean
  columns: number
  palette: Palette
}

/** Line one: who and where, then what is happening. */
export const identityLine = (f: Frame): Run[] => {
  const p = f.palette
  const segments: Run[][] = []
  const { model, effort, cwd } = f.identity

  if (model) {
    segments.push([
      { text: shortModel(model), fg: p.model, bold: true },
      ...(effort ? [{ text: `·${effort}`, fg: p.model }] : []),
    ])
  }
  if (f.git) segments.push(gitSegment(f.git, p))
  if (cwd) segments.push([{ text: cwd, fg: p.muted }])

  return fit([tag(f.frame, f.isWorking, f.isAlerting, p), { text: ' ' }], segments, feed(f.activity, f.frame, f.isWorking, p), f.columns, MIN_FEED, p)
}

/** Line two: the gauges, branching off under the tag. */
export const gaugeLine = (f: Frame): Run[] => {
  const p = f.palette
  const t = f.telemetry
  const segments: Run[][] = []

  if (t.contextPercent !== undefined) {
    segments.push(meter('ctx', t.contextPercent, p, t.contextTokens ? tokens(t.contextTokens) : undefined))
  } else if (t.contextWindow) {
    segments.push([{ text: 'ctx ', fg: p.muted }, { text: `0/${tokens(t.contextWindow)}`, fg: p.ok }])
  }
  if (t.fiveHour !== undefined) segments.push(meter('5h', t.fiveHour, p))
  if (t.sevenDay !== undefined) segments.push(meter('7d', t.sevenDay, p))
  if (t.usd !== undefined) segments.push([{ text: `$${t.usd.toFixed(2)}`, fg: p.cost }])
  if (t.startedAt !== undefined) segments.push([{ text: `↑${duration(Math.max(0, f.now - t.startedAt))}`, fg: p.muted }])

  const branch: Run = { text: `${' '.repeat(TAG_TEXT.length - 2)}└ `, fg: p.dim }

  return fit([branch], segments, [], f.columns, 0, p)
}
