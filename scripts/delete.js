#!/usr/bin/env node
// Deletes Vercel projects and GitHub repos whose names match a glob pattern.
// Run via `pnpm delete [pattern]` (loads .env then .env.local).
import { createInterface } from "node:readline/promises";
import { Vercel } from "@vercel/sdk";
import { Octokit } from "@octokit/rest";

const OWNER = "csikosbalint";
const PROTECTED = new Set(["webapp-logical-template", "webapp-physical-template"]);
const DEFAULT_PATTERN = "env-*";

const HELP = `Usage: pnpm delete [pattern]

Deletes Vercel projects AND GitHub repos (owner: ${OWNER}) whose name matches
the pattern. Nothing is deleted until you type the exact word "delete".

Pattern (glob-style, matched against the whole name, case-sensitive):
  *   any characters       ?   a single character
  default: ${DEFAULT_PATTERN}
  examples: 'env-*'  'env-dev-*'  'env-dev-1234'
Refused: empty patterns and patterns that match everything ('*', '**', '.*').
Never deleted: ${[...PROTECTED].join(", ")}

Env: VERCEL_TOKEN, GITHUB_TOKEN (GitHub token needs the delete_repo scope).
Options: -h, --help`;

function globToRegExp(pattern) {
  const body = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

function parsePattern(args) {
  const pattern = (args[0] ?? DEFAULT_PATTERN).trim();
  if (!pattern) throw new Error("Empty pattern refused.");
  // Only wildcards (glob or regex-style) means "match everything".
  if (/^[*?.]+$/.test(pattern)) {
    throw new Error(`Pattern '${pattern}' matches everything; refused.`);
  }
  return { pattern, regex: globToRegExp(pattern) };
}

const isTarget = (regex, name) => regex.test(name) && !PROTECTED.has(name);

async function listVercelProjects(vercel, regex) {
  const found = [];
  let from;
  do {
    const res = await vercel.projects.getProjects({ ...(from ? { from } : {}), limit: "100" });
    const projects = Array.isArray(res) ? [] : res.projects;
    for (const p of projects) {
      if (isTarget(regex, p.name)) found.push({ id: p.id, name: p.name });
    }
    const next = Array.isArray(res) ? null : res.pagination?.next;
    from = next == null ? undefined : String(next);
  } while (from);
  return found;
}

async function listGithubRepos(octokit, regex) {
  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    affiliation: "owner",
    per_page: 100,
  });
  return repos
    .filter((r) => r.owner.login === OWNER && isTarget(regex, r.name))
    .map((r) => ({ name: r.name }));
}

async function confirm() {
  if (!process.stdin.isTTY && process.stdin.readableEnded) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Type "delete" to confirm: ');
    return answer.trim() === "delete";
  } catch {
    return false; // EOF / closed input
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  if (args.length > 1) throw new Error("Expected at most one pattern argument. See --help.");

  const { pattern, regex } = parsePattern(args);
  if (!process.env.VERCEL_TOKEN) throw new Error("VERCEL_TOKEN is not set.");
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set.");

  const vercel = new Vercel({ bearerToken: process.env.VERCEL_TOKEN });
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  console.log(`Pattern: ${pattern} (read-only discovery...)`);
  const [projects, repos] = await Promise.all([
    listVercelProjects(vercel, regex),
    listGithubRepos(octokit, regex),
  ]);

  console.log(`\nVercel projects to delete (${projects.length}):`);
  for (const p of projects) console.log(`  - ${p.name} (${p.id})`);
  console.log(`\nGitHub repos to delete (${repos.length}):`);
  for (const r of repos) console.log(`  - ${OWNER}/${r.name}`);
  console.log(`\nProtected (never deleted): ${[...PROTECTED].join(", ")}\n`);

  if (projects.length + repos.length === 0) {
    console.log("Nothing to delete.");
    return 0;
  }
  if (!(await confirm())) {
    console.log("Aborted. Nothing was deleted.");
    return 1;
  }

  let failed = 0;
  for (const p of projects) {
    try {
      await vercel.projects.deleteProject({ idOrName: p.id });
      console.log(`OK    vercel  ${p.name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  vercel  ${p.name}: ${err?.message ?? err}`);
    }
  }
  for (const r of repos) {
    try {
      await octokit.rest.repos.delete({ owner: OWNER, repo: r.name });
      console.log(`OK    github  ${OWNER}/${r.name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  github  ${OWNER}/${r.name}: ${err?.message ?? err}`);
      if (err?.status === 403 || err?.status === 404) {
        console.error("      Hint: deleting repos needs the delete_repo scope on GITHUB_TOKEN (and admin rights on the repo).");
      }
    }
  }
  console.log(`\nDone. ${failed} failure(s).`);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Error: ${err?.message ?? err}`);
    process.exit(1);
  },
);
