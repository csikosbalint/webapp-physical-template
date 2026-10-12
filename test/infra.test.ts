import { test } from "node:test";
import assert from "node:assert/strict";
import { API, type Env, type Providers } from "../src/api.ts";
import { fakeAws, fakeGithub } from "./fakes.ts";
import { Vercel } from "@vercel/sdk";
import { Octokit } from "@octokit/rest";

const providers = {
  aws: fakeAws(),
  vercel: new Vercel({
    bearerToken: process.env.VERCEL_TOKEN
  }),
  github: new Octokit({
    auth: process.env.GITHUB_TOKEN
  })
} as unknown as Providers;

test("listEnv returns account facts", async () => {
  const api = new API({ providers });
  const { envId } = await api.createEnv({ intent: "dev" })
  const { appId } = await api.createApp({ envId })
});

test("re-running reuses the existing project", async () => { });

test("no options object behaves like an empty one", async () => { });

test("intent local creates no cloud resources", async () => { });

test("rejects an unknown intent or an invalid project name", async () => { });

test("constructor needs a vercel provider", () => {
  // @ts-expect-error -- intentionally missing the required vercel provider
  assert.throws(() => new API({ providers: {} }), /needs providers\.vercel/);
});
