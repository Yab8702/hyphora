# Hyphora

> Turn AI coding agents into 24/7 proactive assistants — controlled via Telegram.

[![CI](https://github.com/Yab8702/hyphora/actions/workflows/ci.yml/badge.svg)](https://github.com/Yab8702/hyphora/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/hyphora)](https://www.npmjs.com/package/hyphora)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Send coding tasks from your phone, get results back — even while you sleep.

## Quick Start

```bash
npm install -g hyphora
hyphora init    # generates soul.yaml + .env
hyphora         # start
```

Then send `/start` to your bot on Telegram. You become the owner automatically.

**From source:**
```bash
git clone https://github.com/Yab8702/hyphora && cd hyphora
pnpm install
npx tsx src/index.ts init
npx tsx src/index.ts
```

## Features

- **Telegram bot** — typing indicators, live progress, file uploads
- **Claude Code** — Agent SDK (streaming) or CLI fallback
- **Auto-registration** — first `/start` = owner, no manual config
- **Proactive scheduling** — cron tasks run autonomously, results sent to Telegram
- **Persistent memory** — markdown files survive restarts
- **God Mode** — `/god` to toggle full permissions
- **Webhooks** — GitHub PRs, CI failures, generic HTTP triggers
- **Multi-channel** — Twitter/X and Discord adapters (optional)

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Register as owner |
| `/ask <prompt>` | Run a task |
| `/god` | Toggle full permissions |
| `/name <name>` | Rename agent (persists) |
| `/status` | Queue and task status |
| `/memory` | View/add persistent memory |
| `/history` | Recent tasks with costs |
| `/cancel` | Cancel running task |

Or just send any message — no prefix needed.

## Scheduling

Run tasks automatically without sending messages:

```yaml
# soul.yaml
telegram:
  notifyChatId: 123456789

schedules:
  - name: "nightly-tests"
    cron: "0 2 * * *"
    prompt: "Run the test suite and report failures"
    enabled: true
```

```
┌─ min  ┌─ hour  ┌─ day  ┌─ month  ┌─ weekday
*  *  *  *  *
```

| Cron | Meaning |
|------|---------|
| `0 2 * * *` | Daily at 2am |
| `0 9 * * 1-5` | Weekdays at 9am |
| `*/30 * * * *` | Every 30 min |

## Configuration

`hyphora init` generates `soul.yaml`. Key options:

```yaml
agent:
  mode: cli          # 'sdk' for streaming (needs API key), 'cli' for Claude Code
  cwd: "/your/project"
  maxBudgetUsd: 1.00

telegram:
  allowedChatIds: [] # empty = auto-registration

heartbeat:
  enabled: true
  intervalMinutes: 60
```

See [`soul.yaml.example`](soul.yaml.example) for full reference.

### Optional channels

**Twitter:** `npm i twitter-api-v2` + set `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`

**Discord:** `npm i discord.js` + set `DISCORD_BOT_TOKEN`

**Webhooks:** Enable in soul.yaml with GitHub secret or bearer token.

## Development

```bash
pnpm dev        # watch mode
pnpm test       # 226 tests
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
pnpm build      # compile
```

## Architecture

```
Telegram / Twitter / Discord
         │
    ChannelAdapter → ChannelDispatcher → CommandHandler
         │
    LaneQueue (serial)
         │
    AgentRunner (SDK streaming | CLI batch)
         │
    Claude Code → Result → Channel

WebhookServer (Fastify) → LaneQueue
CronManager → LaneQueue
```

## License

[MIT](LICENSE)
