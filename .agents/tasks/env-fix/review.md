# Load `.env` before the deployment integration test

The intended fix adds Node’s native `--env-file=.env` option to the package test entrypoint, so `.env` is parsed before test modules import and before `API.createApp` reaches `#ensureBuildEnv`. The recorded verification shows the failing integration test, typecheck, and full test command passing, and separately confirms that an explicitly supplied `NPM_TOKEN` remains authoritative. The source validation still rejects a missing token and no `.env` value was recorded in the evidence. **Watch for:** **confirmed** blocking credential exposure in the replacement integration test, **confirmed** untracked package-script changes that will not be part of a normal diff unless added, and **confirmed** scope beyond the smallest env-loading fix.

**Verdict**: NEEDS_CHANGES

## High-level view

The native Node loader is the right mechanism for this Node 24 package: the test command loads `.env` before the test graph starts, and the existing deployment code then reads `process.env.NPM_TOKEN` without changing its fail-closed validation. The verification evidence covers successful resolution and explicit process-environment precedence without printing the token.

The delivery is not shippable as presented. The package script containing the actual fix is untracked, while the tracked replacement test embeds live-looking Vercel and GitHub credentials. The change also replaces the API and test implementation wholesale, including new `any` declarations, rather than making the requested one-line entrypoint change.

<details>
<summary>Issues (3)</summary>

1. **Hard-coded provider credentials** — `test/infra.test.ts` embeds bearer and GitHub token values. Remove them from the change, rotate/revoke them if real, and use non-secret fakes or process-provided credentials without committing values.
2. **Env-loader change is untracked** — `package.json` is not tracked and therefore does not appear in `git diff main`; add the intended script change to the deliverable so the fix actually ships.
3. **Unrelated API/test rewrite** — The diff replaces the API and integration test instead of making the minimal package-script change, and introduces `any` despite repository rules. Split or revert unrelated changes and retain only the env-entrypoint fix for this task.

</details>

<details>
<summary>Details</summary>

### Native loader reaches `API.createApp`

`package.json` defines the test command as `node --env-file=.env --test "test/**/*.test.ts"`. With the package’s Node `>=24` engine, this loads the ignored root `.env` before test modules execute. The recorded `pnpm test` result reaches and completes the test that calls `createEnv` followed by `createApp`, with no `NPM_TOKEN` validation error. The separate `NPM_TOKEN=process-value node --env-file=.env ...` check confirms Node’s explicit process environment wins over the file value. **Confirmed issue:** the package file containing this change is untracked according to the workspace status, so a normal commit based on the tracked diff would omit the actual fix.

### Validation and credential boundary

`#ensureBuildEnv` still reads `process.env.NPM_TOKEN` and throws `TypeError('NPM_TOKEN env var is required to deploy')` when it is absent; the implementation was not weakened. The verification record also states that no environment value was printed, and `.env` remains ignored. **Confirmed issue:** the new `test/infra.test.ts` adds hard-coded Vercel and GitHub authentication values in the source. This violates the no-credentials requirement independently of whether those values are active; they must be removed and treated as compromised if they are real.

### Scope and maintainability of the submitted change

The tracked diff deletes the JavaScript API and test, adds a 214-line TypeScript API implementation, and changes the integration test to perform real provider operations. That is substantially broader than wiring `.env` into the test entrypoint and makes the env fix harder to audit. **Confirmed issue:** the new API contains `#memory: any` and `catch (err: any)`, contrary to the repository’s TypeScript rules, while the test uses an unsafe provider cast and real credentials. Revert or separate those changes and submit only the package-script adjustment required by this task.

The verification evidence is sufficient for the requested narrow behavior: the test command, typecheck, full suite, and precedence spot-check all exited successfully. It does not offset the shipping and security issues above.

</details>

<details>
<summary>File map</summary>

- `package.json` — working-tree test script adds Node’s `.env` loader; currently untracked.
- `src/api.ts` — replacement API implementation; retains `NPM_TOKEN` validation but includes unrelated additions.
- `test/infra.test.ts` — replacement integration test; invokes deployment code and embeds provider credentials.
- `src/api.js` — deleted by the broader TypeScript migration.
- `test/infra.test.js` — deleted by the broader TypeScript migration.

Full tracked comparison: `git diff main`; the intended `package.json` change is not included because the file is untracked.

</details>
