#!/usr/bin/env node
// Creates an env (GitHub repo from template + Vercel project). Creates REAL resources.
// Run via `pnpm create:env [intent]` (loads .env then .env.local).
import { API, TARGETS, type Intent } from "../src/api.ts";
import { buildProviders, requireEnv, run } from "./lib.ts";

const DEFAULT_INTENT: Intent = "dev";

const HELP = `Usage: pnpm create:env [intent]

Creates an env (GitHub repo + Vercel project). Prints JSON: {"envId","intent"}.
Use \`pnpm -s create:env\` to suppress pnpm's own banner on stdout.

Intent: ${Object.keys(TARGETS).join(" | ")} (default: ${DEFAULT_INTENT})
Env:    VERCEL_TOKEN, GITHUB_TOKEN, NPM_TOKEN
Options: -h, --help`;

function isIntent(value: string): value is Intent {
  return Object.hasOwn(TARGETS, value);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  if (args.length > 1) throw new Error("Expected at most one intent argument. See --help.");

  const arg = args[0] ?? DEFAULT_INTENT;
  if (!isIntent(arg)) {
    throw new Error(`Unknown intent '${arg}'. Expected one of: ${Object.keys(TARGETS).join(", ")}.`);
  }

  requireEnv(["VERCEL_TOKEN", "GITHUB_TOKEN", "NPM_TOKEN"]);

  const api = new API({ providers: buildProviders() });
  const env = await api.createEnv({ intent: arg });

  console.log(JSON.stringify({ envId: env.envId, intent: env.intent }));
  return 0;
}

run(main);
