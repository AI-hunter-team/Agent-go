import { createdWorld } from "../src/ui/worldCreation";
import { generateWorld, descriptor } from "../src/sim/worldDefinition";
import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type LlmService } from "../server/app";
import { SessionStore } from "../server/sessions";
import { initialFlow, journeyReducer } from "../src/ui/journeyFlow";
import type { JourneyInput } from "../src/shared/journey";
import { fake, jsonResponse } from "./responsesSupport";
import { ModelConfigStore } from "../server/modelConfig";
import { configFromEnv } from "../server/modelSettings";
const plan = {
  understanding: "优先节省时间",
  actions: ["观察可用设施"],
  adjustment: "遇到停用重新选择",
};
const input: JourneyInput = {
  sceneId: "metro",
  seed: 9,
  settings: { timeLimitSeconds: 180, extraQueuePeople: 3 },
  loadout: { backpack: true },
  guidance: "",
  autonomous: true,
  runId: "journey-test",
};
let server: Server;
afterEach(() => {
  server?.close();
  vi.restoreAllMocks();
});
async function start() {
  const prepareJourney = vi.fn(async () => plan);
  const llm: LlmService = {
    model: "fixture-model",
    prepareJourney,
    normalize: vi.fn(),
    decide: vi.fn(),
    classify: vi.fn(),
  };
  const sessions = new SessionStore();
  server = createApp({ llm, sessions }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const call = async (path: string, body: unknown) => {
    const res = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return { status: res.status, body: await res.json() };
  };
  return { call, sessions, prepareJourney };
}
test("autonomous preparation calls model with public inputs and session inherits the returned plan", async () => {
  const { call, sessions, prepareJourney } = await start();
  const prepared = await call("/api/journey/prepare", input);
  expect(prepared.status).toBe(200);
  expect(prepareJourney).toHaveBeenCalledWith(input);
  expect(sessions.size).toBe(0);
  const startInput = {
    ...input,
    preparationId: prepared.body.id,
    normalized: null,
  };
  const session = await call("/api/session", startInput);
  expect(session.status).toBe(200);
  expect(sessions.get(session.body.sessionId)?.normalized?.initialPlan).toEqual(
    [...plan.actions, plan.adjustment],
  );
  expect(sessions.get(session.body.sessionId)?.settings.timeLimitSeconds).toBe(
    180,
  );
  expect(sessions.get(session.body.sessionId)?.loadout.backpack).toBe(true);
  expect((await call("/api/session", startInput)).status).toBe(409);
});

test("preparation keeps the player's refusal condition in session rules even if the plan weakens it", async () => {
  const { call, sessions, prepareJourney } = await start();
  prepareJourney.mockResolvedValueOnce({ ...plan, adjustment: "被拒则改排队" });
  const guided = { ...input, autonomous: false, guidance: "插队，如果对方不同意，改变话术再次尝试" };
  const prepared = await call("/api/journey/prepare", guided);
  expect(prepared.status).toBe(200);
  expect(prepared.body.normalized.rules).toEqual(["插队，如果对方不同意，改变话术再次尝试"]);
  const session = await call("/api/session", { ...guided, preparationId: prepared.body.id });
  expect(session.status).toBe(200);
  expect(sessions.get(session.body.sessionId)?.normalized?.rules).toEqual(["插队，如果对方不同意，改变话术再次尝试"]);
});
test("prepared conditions cannot be silently changed and forged plans cannot override server output", async () => {
  const { call } = await start();
  const result = await call("/api/journey/prepare", input);
  for (const changed of [
    { seed: 2 },
    { sceneId: "other" },
    { settings: { ...input.settings, timeLimitSeconds: 120 } },
    { loadout: { backpack: false } },
    { guidance: "换队" },
    { runId: "other" },
  ]) {
    expect(
      (
        await call("/api/session", {
          ...input,
          preparationId: result.body.id,
          ...changed,
        })
      ).status,
    ).toBe(409);
  }
  expect(
    (
      await call("/api/session", {
        ...input,
        preparationId: result.body.id,
        normalized: { summary: "forged" },
      })
    ).status,
  ).toBe(200);
});
test("invalid preparation is rejected before calling model", async () => {
  const { call, prepareJourney } = await start();
  for (const changed of [
    { seed: 0 },
    { guidance: "x".repeat(301) },
    { settings: null },
    { autonomous: "yes" },
    { sceneId: "other" },
    { loadout: { backpack: "yes" } },
  ]) {
    expect(
      (await call("/api/journey/prepare", { ...input, ...changed })).status,
    ).toBe(400);
  }
  expect(prepareJourney).not.toHaveBeenCalled();
});
test("preparation rejects model plans that exceed session limits before returning an id", async () => {
  const { call, prepareJourney, sessions } = await start();
  for (const invalid of [
    { ...plan, understanding: "x".repeat(1001) },
    { ...plan, adjustment: "x".repeat(1001) },
    { ...plan, actions: Array.from({ length: 8 }, () => "x".repeat(1000)) },
  ]) {
    prepareJourney.mockResolvedValueOnce(invalid);
    const prepared = await call("/api/journey/prepare", input);
    expect(prepared.status).toBe(502);
    expect(prepared.body.id).toBeUndefined();
    expect(sessions.size).toBe(0);
  }
  prepareJourney.mockResolvedValueOnce({ ...plan, understanding: "x".repeat(1000), adjustment: "y".repeat(1000) });
  const prepared = await call("/api/journey/prepare", input);
  expect(prepared.status).toBe(200);
  expect((await call("/api/session", { ...input, preparationId: prepared.body.id })).status).toBe(200);
});
test("a session creation failure does not consume a valid preparation", async () => {
  const { call, sessions } = await start();
  const prepared = await call("/api/journey/prepare", input);
  expect(prepared.status).toBe(200);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(sessions, "create").mockImplementationOnce(() => { throw new Error("fixture session failure"); });
  const request = { ...input, preparationId: prepared.body.id };
  expect((await call("/api/session", request)).status).toBe(500);
  expect((await call("/api/session", request)).status).toBe(200);
  expect((await call("/api/session", request)).status).toBe(409);
});
test("navigation and changed dependencies discard stale planning responses", () => {
  const planning = journeyReducer({...initialFlow,createdWorld:createdWorld(generateWorld(1),{mode:"custom",value:"1"})}, {
    type: "navigate",
    stage: "planning",
  });
  const prepared = {
    id: "plan",
    model: "model",
    plan,
    normalized: {
      summary: "",
      priorities: [],
      risk: "",
      rules: [],
      creativeIdeas: [],
      notExecutable: [],
      initialPlan: [],
    },
  };
  const ready = journeyReducer(planning, {
    type: "prepare",
    revision: planning.revision,
    prepared,
  });
  expect(ready.stage).toBe("plan");
  expect(
    journeyReducer(ready, { type: "navigate", stage: "character" }).prepared,
  ).toBe(prepared);
  const changed = journeyReducer(planning, { type: "invalidate" });
  expect(
    journeyReducer(changed, {
      type: "prepare",
      revision: planning.revision,
      prepared,
    }),
  ).toEqual(changed);
  const returned = journeyReducer(planning, {
    type: "navigate",
    stage: "character",
  });
  expect(
    journeyReducer(returned, {
      type: "prepare",
      revision: planning.revision,
      prepared,
    }),
  ).toEqual(returned);
});

test("Responses planning returns actual structured sections and receives no hidden world data", async () => {
  const { service, requests } = fake([jsonResponse(plan)]);
  expect(await service.prepareJourney(input)).toEqual(plan);
  const payload = JSON.stringify(requests[0].body);
  expect(payload).toContain("180");
  expect(payload).toContain("backpack");
  expect(payload).not.toContain("seed");
  expect(payload).not.toContain("observation");
  expect(requests[0].body.text.format.name).toBe("journey_plan");
  await expect(
    fake([jsonResponse({ ...plan, actions: [] })]).service.prepareJourney(
      input,
    ),
  ).rejects.toThrow();
});

test("a no-backpack plan binds the same loadout to the eventual model session", async () => {
  const { call, sessions } = await start();
  const noBag = { ...input, loadout: { backpack: false } };
  const prepared = await call("/api/journey/prepare", noBag);
  expect(prepared.status).toBe(200);
  expect((await call("/api/session", { ...noBag, loadout: { backpack: true }, preparationId: prepared.body.id })).status).toBe(409);
  const session = await call("/api/session", { ...noBag, preparationId: prepared.body.id });
  expect(session.status).toBe(200);
  expect(sessions.get(session.body.sessionId)?.loadout.backpack).toBe(false);
});

test("changing enabled model under the same token invalidates the old preparation", async () => {
  const modelA: LlmService = {
    model: "model-a",
    prepareJourney: async () => plan,
    normalize: vi.fn(),
    decide: vi.fn(),
    classify: vi.fn(),
  };
  const modelB: LlmService = { ...modelA, model: "model-b" };
  const store = new ModelConfigStore();
  const config = {
    baseUrl: "https://fixture.invalid",
    apiKey: "not-a-real-key",
    models: ["model-a", "model-b"],
    llm: modelA,
    settings: configFromEnv({}),
    lastUsed: 0,
  };
  vi.spyOn(store, "get").mockImplementation(() => config);
  server = createApp({
    llm: null,
    modelConfigs: store,
    sessions: new SessionStore(),
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const call = async (path: string, body: unknown) => {
    const res = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-model-config": "fixture-token",
        },
        body: JSON.stringify(body),
      },
    );
    return { status: res.status, body: await res.json() };
  };
  const prepared = await call("/api/journey/prepare", input);
  config.llm = modelB;
  expect(
    (await call("/api/session", { ...input, preparationId: prepared.body.id }))
      .status,
  ).toBe(409);
});

test("generated layouts are validated and bound to prepared sessions",async()=>{
 const {call,sessions,prepareJourney}=await start();const world=descriptor(generateWorld(input.seed));
 expect((await call("/api/journey/prepare",{...input,world:{...world,layoutHash:"wrong"}})).status).toBe(409);expect(prepareJourney).not.toHaveBeenCalled();
 const result=await call("/api/journey/prepare",{...input,world});expect(result.status).toBe(200);
 const body={...input,world,preparationId:result.body.id};
 expect((await call("/api/session",{...body,world:descriptor(generateWorld(input.seed+1))})).status).toBe(409);
 const created=await call("/api/session",body);expect(created.status).toBe(200);expect(sessions.get(created.body.sessionId)?.publicMap?.layoutHash).toBe(world.layoutHash);
});

test("expired preparation requires replanning", async () => {
  const { call } = await start();
  const result = await call("/api/journey/prepare", input);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 600_001);
  expect(
    (await call("/api/session", { ...input, preparationId: result.body.id }))
      .status,
  ).toBe(409);
});
