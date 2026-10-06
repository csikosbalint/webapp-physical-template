import { Vercel } from "@vercel/sdk";
import { createHash } from "node:crypto";
import fs, { createReadStream } from "node:fs"
import { Readable } from "node:stream";

export class API {
  #vercel;

  #listProjects() {
    return this.#vercel.projects.getProjects({})
  }

  constructor({ providers }) {
    if (!providers?.vercel) throw new TypeError('new API() needs providers.vercel');
    this.#vercel = providers.vercel;
  }

  async listEnv() {
    return (await this.#listProjects()).projects.map(({ id, name }) => ({ envId: name }));
  }

  async createApp() {
    const file = '/Users/bcsikos/Downloads/Code/POC/webapp-physical-template/README.md'
    const data = Readable.toWeb(createReadStream(file))
    const { size } = fs.statSync(file)
    const digest = createHash('sha1').update(fs.readFileSync(file)).digest('hex')
    const resp = this.#vercel.deployments.uploadFile({
      requestBody: data,
      contentLength: size,
      xVercelDigest: digest
    });
    // return this.#vercel.deployments.createDeployment({
    //   requestBody: {
    //     customEnvironmentSlugOrId: "staging",
    //     files: [
    //       {
    //         file: file,
    //         data: data
    //       },
    //     ],
    //     name: "my-instant-deployment",
    //     project: "poc",
    //   }
    // })
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
