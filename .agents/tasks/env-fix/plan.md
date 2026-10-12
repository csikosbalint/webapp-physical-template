# Implementation Plan

Investigation findings:

- `/Users/bcsikos/Downloads/Code/POC/webapp-physical-template/package.json` defines only `typecheck` (`tsc -p tsconfig.json`) and `test` (`node --test "test/**/*.test.ts"`); it has no `dotenv`, env-loader, lint, or build script/dependency.
- Node `v24.14.1` runs the `.ts` test files directly with its built-in type stripping. This matches `tsconfig.json` (`module`/`moduleResolution: nodenext`, `allowImportingTsExtensions`, and its Node type-stripping comment); no custom loader is configured.
- The ignored `.env` file contains the keys `VERCEL_TOKEN`, `GITHUB_TOKEN`, and `NPM_TOKEN`; values are intentionally not recorded here. The file is not loaded by the current test script.
- `src/api.ts` reads `process.env.NPM_TOKEN` in `#ensureBuildEnv` and correctly rejects a missing/falsy value. That validation must remain unchanged.
- `spike/tag-deploy.ts` already documents the intended native invocation as `node --env-file=.env ...`. Node’s native env-file behavior was confirmed from the package root: an explicitly supplied `NPM_TOKEN` remains authoritative over the `.env` value.
- No physical-template `AGENTS.md`, `.kiro` steering file, or package-level lint/build configuration was found. The architecture documentation reviewed in the sibling logical template keeps environment/entrypoint wiring at the outer assembly boundary, so no domain/API validation change is needed.
- The existing integration test constructs real Vercel and GitHub providers, so the full test command may perform external deployment operations; it must be run only with the repository’s intended credentials and permissions, without printing credential values.

## Implementation Plan

- [ ] 1. Wire the native `.env` loader into the package test entrypoint.
      Change the `test` script in `/Users/bcsikos/Downloads/Code/POC/webapp-physical-template/package.json` to invoke `node --env-file=.env --test "test/**/*.test.ts"`. Keep the relative path rooted at the package script’s working directory so the existing `/Users/bcsikos/Downloads/Code/POC/webapp-physical-template/.env` is used. Do not add `dotenv`, change `src/api.ts`, weaken `NPM_TOKEN` validation, add fallback credentials, or edit the ignored `.env` file; the native loader preserves explicit process-environment precedence and also supplies `NPM_TOKEN` to the deployment path exercised by `API.createApp`.
      Files: `/Users/bcsikos/Downloads/Code/POC/webapp-physical-template/package.json`
      Verify: From `/Users/bcsikos/Downloads/Code/POC/webapp-physical-template`, run `pnpm typecheck` and confirm it passes; run `pnpm test` and confirm the integration test no longer fails at `#ensureBuildEnv` because `.env` is loaded (the test’s existing external Vercel/GitHub operations must be available); run `NPM_TOKEN=process-value node --env-file=.env -e 'if (process.env.NPM_TOKEN !== "process-value") process.exit(1)'` and confirm exit code 0 to verify explicit process environment precedence. This package has no configured lint or build command, so do not invent one.
