# Verification

All commands were run from `/Users/bcsikos/Downloads/Code/POC/webapp-physical-template`. No environment variable values are recorded.

| Command | Result |
|---|---|
| `pnpm exec node --env-file=.env --test test/infra.test.ts` | Exit 0. All 6 tests passed, including `listEnv returns account facts`; no `NPM_TOKEN` validation error occurred. |
| `pnpm typecheck` | Exit 0. `tsc -p tsconfig.json` passed. |
| `pnpm test` | Exit 0. All 6 tests passed, including `listEnv returns account facts`; no `NPM_TOKEN` validation error occurred. |
| `NPM_TOKEN=process-value node --env-file=.env -e 'if (process.env.NPM_TOKEN !== "process-value") process.exit(1)'` | Exit 0. Explicit process environment precedence was confirmed without printing any env value. |

The test script now loads `.env` with Node's native `--env-file=.env` option. The NPM_TOKEN validation in `src/api.ts` was not changed.
