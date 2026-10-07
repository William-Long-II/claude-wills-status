# wills-status

A two-line hacker HUD for Claude Code, drawn above the prompt.

```
 λ CLAUDE  opus 5.5·high │ ⎇ main ↑1 ±3 │ my-project │ ⣾ Bash git status ｱ7ﾈ3ｸF
         └ ctx █████▋██  71% 142k │ 5h ███▍████  42% │ 7d ██████  25% │ $1.37 │ ↑1h23m
```

**Line 1: what is running, and where**

- **Tag**: turns a different color while Claude works, glitching a letter now and then, and flashes red on an alert.
- **Model and effort**: as the last request actually ran.
- **Git**: branch, commits ahead ↑ or behind ↓ its upstream, and changed files ±, or ✓ when clean. Hidden outside a repo, or when git isn't installed.
- **Folder**: the directory's name, or `~` for home.
- **Live feed**: the tool Claude is running and its argument, with a spinner and scrambling glyphs. At rest it shows `◉ standby`, the last tool and how many tool calls the session has made.

**Line 2: the gauges**

- **Meters**: context window, 5-hour usage and 7-day usage. They read healthy below 60%, amber below 85% and red above that.
- **Cost and uptime**: the session's cost and how long it has run.

**Alerts:** when 5h usage, 7d usage or context crosses 80%, and again at 95%, you get a toast. The usage toasts say when the window resets. The tag flashes red. Each alert fires once, and again after its window resets.

On a narrow terminal each line drops its lowest-priority segments first instead of wrapping.

## Install

In a Claude Code terminal session:

```
/plugin install wills-status --marketplace William-Long-II/claude-wills-status
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). It starts drawing right away.

## Themes

Pick one in `/config` under **wills-status → Theme**:

| Theme | Look |
| --- | --- |
| `matrix` (default) | Neon green, cyan while working |
| `cyber` | Electric blue, violet while working |
| `native` | Your Claude Code theme's own colors. **Use this on a light terminal.** |
| `amber` | Monochrome retro CRT: dim amber brightening to gold, red at the top |
| `synthwave` | Hot pink and purple, with a pink-to-orange-to-red sunset on the meters |

In every theme, the meters move through three colors as they fill: healthy below 60%, a warning color below 85%, and an alarm color above that.

## Notes

- **Requirements**: Claude Code 2.1.292 or newer, which has function-hook plugins (early access).
- **Usage meters**: the 5h and 7d meters appear only on a Claude subscription, after the first reply of a session.
- **Colors**: every theme except `native` is tuned for dark terminal backgrounds. Terminals with 24-bit color show them exactly (Windows Terminal, iTerm2, Ghostty, WezTerm, Kitty). Older Terminal.app versions round them to the nearest of 256.
- **Collapsing**: collapse the band with `[-]` or `ctrl+x ctrl+a`.

## Develop

```
claude plugin validate .
claude plugin test .
```

The line rendering and themes are in `hooks/line.ts`. The data and events are in `hooks/register.tsx`.
