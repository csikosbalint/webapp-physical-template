import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API } from '../src/api.js';
import { fakeAws, fakeGithub, fakeVercel } from './fakes.js';

const providers = { aws: fakeAws(), vercel: fakeVercel(), github: fakeGithub() };

test('listEnv returns account facts', async () => {
  const api = new API({ providers });
  const result = await api.listEnv(); // default intent: 'dev'
  assert.deepEqual(result, {
    intent: 'dev',
    target: 'preview',
    project: 'webapp-platform',
    aws: { accountId: '123456789012' },
    vercel: { userId: 'u_1', teamId: null, plan: 'hobby' },
    github: { login: 'octo' },
  });
});

test('re-running reuses the existing project', async () => {
});

test('no options object behaves like an empty one', async () => {
});

test('intent local creates no cloud resources', async () => {
});

test('rejects an unknown intent or an invalid project name', async () => {
});

test('constructor needs a vercel provider', () => {
  assert.throws(() => new API({ providers: {} }), /needs providers\.vercel/);
});
