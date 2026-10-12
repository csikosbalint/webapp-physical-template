import { Vercel } from "@vercel/sdk";
import type { Octokit } from "@octokit/rest";
import { createHash } from "node:crypto";
import fs, { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { CreateProjectProjectsType } from "@vercel/sdk/models/createprojectcontenthint8.js";
import { string } from "@vercel/sdk/types/primitives.js";

/** Deployment intents and the Vercel environment they map to. */
export const TARGETS = {
  local: "development",
  dev: "preview",
  prod: "production",
} as const;

export type Intent = keyof typeof TARGETS;

/** Providers the API talks to. Vercel is required; the rest are optional. */
export interface Providers {
  vercel: Vercel;
  github: Octokit;
  aws?: unknown;
}

export interface Env {
  envId: string;
  intent: Intent;
}

export interface InfraOptions {
  intent?: Intent;
  project?: string;
}

export interface InfraResult {
  projectId: string;
  projectName: string;
}

export class API {
  #vercel: Vercel
  #octokit: Octokit
  #memory: any

  #getProjects() {
    return this.#vercel.projects.getProjects({});
  }

  #createProject({ name, repo }: { name: string, repo: string }) {
    return this.#vercel.projects.createProject({
      requestBody: {
        name,
        rootDirectory: "webapp-logical-template/plugins/ui",
        gitRepository: {
          repo,
          type: CreateProjectProjectsType.Github
        }
      },
    });
  }

  async #createRepo({ name }: { name: string }): Promise<{ repo: string }> {
    const { data } = await this.#octokit.rest.repos.createUsingTemplate({
      template_owner: "csikosbalint",
      template_repo: "webapp-logical-template",
      name,
    });
    return ({
      repo: data.full_name
    });
  }

  async #branchRepo({ versionTag, deployTag }: { versionTag: string; deployTag: string }) {
    const owner = 'csikosbalint'
    const repo = this.#memory.env.envId

    // 1. Delete the deployTag branch idempotently (ignore "not found").
    try {
      await this.#octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${deployTag}`,
      })
    } catch (err: any) {
      if (err?.status !== 422 && err?.status !== 404) throw err
    }

    // 2. Find the commit SHA where versionTag is seen; fall back to HEAD.
    let sha: string | undefined

    try {
      const { data: tags } = await this.#octokit.rest.repos.listTags({
        owner,
        repo,
        per_page: 100,
      })
      sha = tags.find((t) => t.name === versionTag)?.commit.sha
    } catch (err: any) {
      if (err?.status !== 404) throw err
    }

    if (!sha) {
      const { data: repoData } = await this.#octokit.rest.repos.get({ owner, repo })
      try {
        const { data: head } = await this.#octokit.rest.repos.getBranch({
          owner,
          repo,
          branch: repoData.default_branch,
        })
        sha = head.commit.sha
      } catch (err) {
        console.error(err)
        sha = 'HEAD'
      }
    }

    // 3. Create the deployTag branch at that commit.
    return await this.#octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${deployTag}`,
      sha,
    })
  }

  constructor({ providers }: { providers: Providers }) {
    if (!providers?.vercel) throw new TypeError("new API() needs providers.vercel");
    this.#vercel = providers.vercel;
    this.#octokit = providers.github;
    this.#memory = {}
  }

  async listEnvs(): Promise<Env[]> {
    const res = await this.#getProjects();
    const projects = Array.isArray(res) ? [] : res.projects;
    return projects
      .filter((p: { name: string }) => p.name.startsWith("env-"))
      .map((p: { name: string }) => ({ envId: p.name, intent: 'dev' }));
  }

  async createEnv({ intent = "dev" }: { intent?: Intent } = {}): Promise<Env> {
    const envs = await this.listEnvs();
    // const repos = listrepos
    let env;
    if (Array.isArray(envs) && envs[0]) {
      env = envs[0]
    } else {
      const name = `env-${intent}-${Math.floor(1000 + Math.random() * 9000)}`
      const { repo } = await this.#createRepo({ name })

      await this.#createProject({
        name,
        repo
      });

      env = {
        envId: name,
        intent
      }
    }
    this.#memory.env = env
    return env
  }

  async createApp({ envId, appVersion = 'HEAD' }: { envId: string, appVersion?: string }): Promise<{ appId: string }> {
    const rnd = Math.floor(1000 + Math.random() * 9000)
    const appId = `app-${rnd}-${envId}`
    const { data } = await this.#branchRepo({
      versionTag: appVersion,
      deployTag: appId
    })
    await this.#ensureBuildEnv()
    const deployment = await this.#deploy({ name: appId, sha: data.object.sha })
    this.#memory.deployment = deployment
    return { appId }
  }

  /** Upsert NPM_TOKEN as a build-time env var on the env's Vercel project. */
  async #ensureBuildEnv() {
    const value = process.env.NPM_TOKEN
    if (!value) throw new TypeError('NPM_TOKEN env var is required to deploy')
    await this.#vercel.projects.createProjectEnv({
      idOrName: this.#memory.env.envId,
      upsert: 'true',
      requestBody: {
        key: 'NPM_TOKEN',
        value,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      },
    })
  }

  /** Create a Vercel deployment for the env's project at a specific commit SHA. */
  async #deploy({ name, sha }: { name: string; sha: string }) {
    const owner = 'csikosbalint'
    const repo = this.#memory.env.envId
    return await this.#vercel.deployments.createDeployment({
      requestBody: {
        name,
        project: this.#memory.env.envId,
        gitSource: {
          type: 'github',
          org: owner,
          repo,
          ref: sha,
        },
        projectSettings: {
          framework: 'nextjs',
          rootDirectory: 'plugins/ui',
          installCommand: "pnpm install --frozen-lockfile",
          buildCommand: "pnpm build"
        },
      },
    })
  }
}
