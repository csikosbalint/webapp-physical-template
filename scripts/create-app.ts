#!/usr/bin/env node
// Creates an app (branch + deployment) in an existing env. Creates REAL resources.
// Run via `pnpm create:app [envId] [appVersion]` (loads .env then .env.local).
import { API } from "../src/api.ts";
import { buildProviders, requireEnv, run } from "./lib.ts";

const HELP = `Usage: pnpm create:app [envId] [appVersion]

Creates an app (branch + deployment) in an env. Prints envId and appId.

envId:      e.g. env-dev-1234 (default: first env from listEnvs)
appVersion: tag to branch from (default: HEAD)
Env:        VERCEL_TOKEN, GITHUB_TOKEN, NPM_TOKEN
Options:    -h, --help`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  if (args.length > 2) throw new Error("Expected at most two arguments: [envId] [appVersion]. See --help.");

  requireEnv(["VERCEL_TOKEN", "GITHUB_TOKEN", "NPM_TOKEN"]);

  const api = new API({ providers: buildProviders() });

  let envId = args[0];
  if (!envId) {
    const first = (await api.listEnvs())[0];
    if (!first) throw new Error("No envs found. Run `pnpm create:env` first or pass an envId.");
    envId = first.envId;
  }
  console.log(`Using envId: ${envId}`);

  const appVersion = args[1];
  const { appId } = await api.createApp(appVersion ? { envId, appVersion } : { envId });

  console.log(`envId: ${envId}`);
  console.log(`appId: ${appId}`);
  return 0;
}

run(main);
