/** @import { AwsProvider, VercelProvider, GithubProvider, ArtifactProvider, EnvOptions, EnvResult, InfraOptions, InfraResult } from './types.js' */
import { createEnv, TARGETS } from './layers/env.js';

/**
 * Entry point of the physical template: one object, providers injected once,
 * one method per deployment layer.
 */
export class API {
  #vercel;
  #env;

  /**
   * @param {{ providers: { aws?: AwsProvider, vercel: VercelProvider, github?: GithubProvider, artifact?: ArtifactProvider } }} deps
   */
  constructor({ providers }) {
    if (!providers?.vercel) throw new TypeError('new API() needs providers.vercel');
    this.#vercel = providers.vercel;
    this.#env = createEnv({ aws: providers.aws, vercel: providers.vercel, github: providers.github });
  }

  /**
   * ENV layer: read-only account checks. Creates nothing.
   * @param {EnvOptions} [options]
   * @returns {Promise<EnvResult>}
   */
  async listEnv(options) {
    return this.#env(options);
  }

  /**
   * INF layer: ensures the shared, long-lived resources an app deployment needs.
   * AWS: nothing yet. Vercel: the project (get-or-create). Never mutates `options`.
   * @param {InfraOptions} [options]
   * @returns {Promise<InfraResult>}
   */
  async createInfra({ intent = 'dev', project = 'webapp-platform' } = {}) {
    if (!Object.hasOwn(TARGETS, intent)) {
      throw new TypeError(`Unknown intent "${intent}"; expected one of ${Object.keys(TARGETS).join(', ')}`);
    }

    const { id, name } = await this.#vercel.ensureProject({ name: project });
    return { projectId: id, projectName: name };
  }
}
