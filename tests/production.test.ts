import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../server/app";
import { SessionStore } from "../server/sessions";

let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("production serves the SPA and assets without masking API or missing asset errors", async () => {
  directory = await mkdtemp(join(tmpdir(), "agent-production-"));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), "<!doctype html><title>production frontend</title>");
  await writeFile(join(directory, "assets", "app.js"), "console.log('asset');");
  server = createApp({ llm: null, sessions: new SessionStore(), frontendDir: directory }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const root = await fetch(base);
  expect(root.headers.get("content-type")).toContain("text/html");
  expect(await root.text()).toContain("production frontend");
  expect(await (await fetch(`${base}/settings`, { headers: { accept: "text/html" } })).text()).toContain("production frontend");
  expect(await (await fetch(`${base}/assets/app.js`)).text()).toContain("console.log");
  expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
  expect((await fetch(`${base}/assets/missing`)).status).toBe(404);
  expect((await fetch(`${base}/settings`, { headers: { accept: "application/json" } })).status).toBe(404);
  expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ llm: false, model: null });
  for (const method of ["GET", "POST"]) {
    const missing = await fetch(`${base}/api/missing`, { method });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "API 不存在" });
  }
});
