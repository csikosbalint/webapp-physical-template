// Shared helpers for the create-* scripts.
import { type Providers } from "../src/api.ts";
import { Vercel } from "@vercel/sdk";
import { Octokit } from "@octokit/rest";

/** Fail fast when a required env var is missing. Never prints values. */
export function requireEnv(names: string[]): void {
  for (const name of names) {
    if (!process.env[name]) throw new Error(`${name} is not set.`);
  }
}

export function buildProviders(): Providers {
  return {
    vercel: new Vercel({ bearerToken: process.env.VERCEL_TOKEN }),
    github: new Octokit({ auth: process.env.GITHUB_TOKEN }),
  } as unknown as Providers;
}

/** Run a script's main(); print errors without stack traces and set the exit code. */
export function run(main: () => Promise<number>): void {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
