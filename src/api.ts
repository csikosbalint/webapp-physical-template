import { Vercel } from "@vercel/sdk";
import type { Octokit } from "@octokit/rest";
import { CreateProjectProjectsType } from "@vercel/sdk/models/createprojectcontenthint8.js";
import { CreateProjectEnv1Type } from "@vercel/sdk/models/createprojectenvop.js";

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

  async #branchRepo({ commitFrom, branchName }: { commitFrom: string; branchName: string }) {
    const owner = 'csikosbalint'
    const repo = this.#memory.env.envId

    // 1. find and delete branch if exists
    try {
      await this.#octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${branchName}` })
    } catch (err: any) {
      console.warn(`branch heads/${branchName} did not exist!`)
    }

    // 2. Find the commit SHA where branchFrom is seen; fall back to HEAD.
    let sha: string | undefined

    if (commitFrom !== 'HEAD') {
      try {
        const { data: tags } = await this.#octokit.rest.repos.listTags({
          owner,
          repo,
          per_page: 100,
        })
        sha = tags.find((t) => t.name === commitFrom)?.commit.sha
      } catch (err: any) {
        console.warn(`No such commit: ${commitFrom}..using HEAD`)
      }
    }

    if (!sha) {
      const { data: repoData } = await this.#octokit.rest.repos.get({ owner, repo })
      const { data: head } = await this.#octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: repoData.default_branch,
      })
      sha = head.commit.sha
    }

    // 3. Create the branch at that commit.
    return await this.#octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha,
    })
  }

  /**
   * Repos created from a template are populated asynchronously, so the default
   * branch can 404 right after creation. Poll until it exists.
   */
  async #waitForDefaultBranch({ owner, repo }: { owner: string; repo: string }) {
    const attempts = 30
    const delayMs = 2000
    for (let i = 1; ; i++) {
      try {
        const { data: repoData } = await this.#octokit.rest.repos.get({ owner, repo })
        const { data: head } = await this.#octokit.rest.repos.getBranch({
          owner,
          repo,
          branch: repoData.default_branch,
        })
        return { branch: repoData.default_branch, sha: head.commit.sha }
      } catch (err: any) {
        if (err?.status !== 404 || i >= attempts) throw err
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
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
      this.#memory.env = env

      // The project's first deployment is the production one: deploy the
      // default branch HEAD with the production target.
      const owner = 'csikosbalint'
      const { branch, sha } = await this.#waitForDefaultBranch({ owner, repo: name })
      await this.#ensureBuildEnv()
      await this.#deploy({ name, branch, sha, target: 'production' })
    }
    this.#memory.env = env
    return env
  }

  async createApp({ envId, appVersion = 'HEAD' }: { envId: string, appVersion?: string }): Promise<{ appId: string }> {
    this.#memory.env = { envId, intent: this.#memory.env?.intent ?? 'dev' }
    const rnd = Math.floor(1000 + Math.random() * 9000)
    const appId = `app-${rnd}-${envId}`
    const { data } = await this.#branchRepo({
      commitFrom: appVersion,
      branchName: appId
    })
    await this.#ensureBuildEnv()
    const sha = data.object.sha
    // Branch deployment: no target => preview (env creation already made the
    // production deployment).
    const deployment = await this.#deploy({ name: appId, branch: appId, sha })
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
        type: CreateProjectEnv1Type.Sensitive,
        value,
        target: ['production', 'preview', 'development'],
      },
    })
  }

  /**
   * Create a Vercel deployment for a branch of the env's repo.
   * `ref` is the branch (Vercel infers production vs preview from it);
   * `sha` pins the exact commit on that branch.
   */
  async #deploy({ name, branch, sha, target = 'staging' }: { name: string; branch: string; sha: string; target?: string }) {
    const owner = 'csikosbalint'
    const repo = this.#memory.env.envId
    return await this.#vercel.deployments.createDeployment({
      forceNew: "1",
      requestBody: {
        name,
        project: this.#memory.env.envId,
        gitSource: {
          type: 'github',
          org: owner,
          repo,
          ref: branch,
          sha,
        },
        gitMetadata: {
          remoteUrl: `https://github.com/${owner}/${repo}`,
          commitRef: branch,
          commitSha: sha,
        },
        projectSettings: {
          framework: 'nextjs',
          rootDirectory: 'plugins/ui',
          installCommand: 'npm config set //npm.pkg.github.com/:_authToken=$NPM_TOKEN && pnpm install --frozen-lockfile',
        },
        target,
      },
    })
  }
}
