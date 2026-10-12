/** In-memory providers that record calls; no network, no filesystem. */

export interface FakeProject {
  id: string;
  name: string;
}

export function fakeAws() {
  return {
    calls: [] as string[],
    async whoami() {
      this.calls.push("whoami");
      return { accountId: "123456789012", arn: "arn:aws:iam::123456789012:user/test" };
    },
  };
}

export function fakeGithub() {
  return {
    calls: [] as string[],
    async whoami() {
      this.calls.push("whoami");
      return { login: "octo" };
    },
  };
}

export function fakeVercel({ readyState = "READY" }: { readyState?: string } = {}) {
  const projects = new Map<string, FakeProject>();
  return {
    calls: [] as unknown[][],
    projects,
    async whoami() {
      this.calls.push(["whoami"]);
      return { userId: "u_1", teamId: null, plan: "hobby" };
    },
    async ensureProject({ name }: { name: string }) {
      this.calls.push(["ensureProject", { name }]);
      const existing = projects.get(name);
      if (existing) return { ...existing, created: false };
      const project: FakeProject = { id: `prj_${projects.size + 1}`, name };
      projects.set(name, project);
      return { ...project, created: true };
    },
    async deploy(params: { projectName: string }) {
      this.calls.push(["deploy", params]);
      return { id: "dpl_1", url: `${params.projectName}-abc123.vercel.app`, readyState };
    },
    async alias(params: { alias: string }) {
      this.calls.push(["alias", params]);
      return { alias: params.alias };
    },
  };
}

export function fakeArtifact() {
  return {
    opened: [] as string[],
    disposed: 0,
    async open(url: URL) {
      this.opened.push(url.href);
      return {
        path: "/tmp/fake-artifact",
        dispose: async () => {
          this.disposed += 1;
        },
      };
    },
  };
}
