// Throwaway spike: does a Vercel git deployment accept a TAG as gitSource.ref?
// Run: node --env-file=.env spike/tag-deploy.js
import { Octokit } from '@octokit/rest';
import { Vercel } from '@vercel/sdk';

const OWNER = 'csikosbalint';
const REPO = 'webapp-logical-template';
const PROJECT = 'webapp-platform-spike';
const INTENT = 'dev';

const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
const vc = new Vercel({ bearerToken: process.env.VERCEL_TOKEN });

// ENV: accounts + repo
const { data: me } = await gh.users.getAuthenticated();
const { data: repo } = await gh.repos.get({ owner: OWNER, repo: REPO });
const auth = await vc.user.getAuthUser();
console.log('github:', me.login, 'repo:', repo.full_name, repo.id, 'vercel:', auth?.user.username);

// INF: git-linked project (get-or-create)
let project;
try {
  project = await vc.projects.createProject({
    requestBody: {
      name: PROJECT,
      framework: 'nextjs',
      rootDirectory: 'plugins/ui',
      // core must be built before the app; pnpm --filter works from any workspace dir
      buildCommand: 'pnpm --filter @csikosbalint/webapp-platform-core build && next build',
      gitRepository: { type: 'github', repo: `${OWNER}/${REPO}` },
    },
  });
  console.log('project created:', project.id);
} catch (err) {
  if (!String(err).includes('already exists')) throw err;
  project = await vc.projects.getProject({ idOrName: PROJECT });
  console.log('project exists:', project.id);
}

// APP 1: tag origin/main HEAD as <intent>-NNN (retry on collision)
const { data: main } = await gh.repos.getBranch({ owner: OWNER, repo: REPO, branch: 'main' });
const sha = main.commit.sha;
let tag;
for (let i = 0; i < 5 && !tag; i++) {
  const candidate = `${INTENT}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  try {
    await gh.git.createRef({ owner: OWNER, repo: REPO, ref: `refs/tags/${candidate}`, sha });
    tag = candidate;
  } catch (err) {
    if ((err as { status?: number }).status !== 422) throw err; // 422 = ref already exists
  }
}
if (!tag) throw new Error('could not allocate a free tag');
console.log('tagged', sha.slice(0, 7), 'as', tag);

// APP 2: deployment from the tag
// createDeployment and getDeployment return different response unions; this spike
// reads only the common fields, so narrow both to one minimal structural shape.
type Dpl = {
  id: string;
  url?: string;
  readyState: string;
  gitSource?: { ref?: string };
  meta?: { githubCommitRef?: string };
};

let dpl = (await vc.deployments.createDeployment({
  requestBody: {
    name: PROJECT,
    project: project.id,
    gitSource: { type: 'github', repoId: repo.id, ref: tag, sha },
    meta: { intent: INTENT, tag },
  },
})) as Dpl;
console.log('deployment:', dpl.id, dpl.readyState, `https://${dpl.url}`);

for (let i = 0; i < 120 && !['READY', 'ERROR', 'CANCELED'].includes(dpl.readyState); i++) {
  await new Promise((r) => setTimeout(r, 5000));
  dpl = (await vc.deployments.getDeployment({ idOrUrl: dpl.id })) as Dpl;
  process.stdout.write(`${dpl.readyState} `);
}
console.log('\nfinal:', dpl.readyState, `https://${dpl.url}`, 'ref:', dpl.gitSource?.ref ?? dpl.meta?.githubCommitRef);
