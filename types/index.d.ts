/** The session's figures; a field absent until the engine has a reading. */
export type Telemetry = {
  contextPercent?: number
  contextTokens?: number
  contextWindow?: number
  /** `five_hour` percent used, and when that window resets (ISO 8601). */
  fiveHour?: number
  fiveHourResetsAt?: string
  /** `seven_day` percent used, and when that window resets (ISO 8601). */
  sevenDay?: number
  sevenDayResetsAt?: string
  usd?: number
  startedAt?: number
}

/** What the session runs on and where. */
export type Identity = { model?: string; effort?: string; cwd?: string }

/** The working tree: branch, commits ahead/behind upstream, changed files. */
export type Git = { branch: string; ahead: number; behind: number; dirty: number }

/** What Claude is doing: the tool it last reached for, and whether a turn runs. */
export type Activity = { isWorking: boolean; tool?: string; detail?: string; calls: number }

declare module 'claude-code' {
  interface PluginState {
    'wills-status': {
      telemetry: Telemetry
      identity: Identity
      git: Git | null
      activity: Activity
      /** The highest alert threshold already toasted, per window. */
      alerted: Record<string, number>
      /** Epoch ms until which the tag flashes red after an alert. */
      alertUntil: number
      frame: number
      now: number
    }
  }
}
