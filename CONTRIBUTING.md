# Contributing to Hyphora

Thanks for your interest in contributing.

## Setup

```bash
git clone https://github.com/yab8702/hyphora
cd hyphora
pnpm install
```

## Development

```bash
pnpm dev          # watch mode
pnpm test         # run tests
pnpm typecheck    # type check
pnpm lint         # lint
pnpm build        # compile
```

## Before submitting a PR

1. **Tests pass:** `pnpm test`
2. **Types clean:** `pnpm typecheck`
3. **Lint clean:** `pnpm lint`
4. **Build works:** `pnpm build`

All four are checked in CI.

## Code style

- TypeScript strict mode
- `import { z } from "zod/v4"` (Zod 4 transition import)
- Async functions must handle errors — no unhandled rejections
- Logger injected via constructor, never global
- Tests in `tests/` mirroring `src/` structure

## Adding a new channel adapter

1. Create `src/channel/your-adapter.ts` implementing `ChannelAdapter`
2. Add config section to `src/config/schema.ts`
3. Wire it in `src/daemon.ts` (conditional start based on config)
4. Add tests in `tests/channel/your-adapter.test.ts`
5. Mark the dependency as optional in docs

## Commit messages

Keep them short and descriptive. No format enforced.

## Issues

- **Bugs:** Use the bug report template
- **Features:** Use the feature request template
- **Questions:** Use GitHub Discussions
