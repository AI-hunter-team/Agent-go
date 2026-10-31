import { resolveLoadout } from "../src/shared/interaction";
import { randomUUID } from "node:crypto";
import type { NormalizedGuidance } from "../src/shared/types";
import type { ResponseItem } from "./responsesTypes";
import { assertSafeText, validateNormalized } from "./security";
import { resolveGameSettings, type GameSettings } from "../src/shared/gameSettings";

/** In-run memory for one game: the frozen system prompt and the append-only history. */
export interface Session {
  loadout: Readonly<import("../src/shared/interaction").Loadout>;
  settings: Readonly<GameSettings>;
  id: string;
  runId: string;
  guidance: string;
  normalized: NormalizedGuidance | null;
  responseItems: ResponseItem[];
  /** Every tool id must be answered, even when a batched response is rejected. */
  pendingCallIds: string[];
  lastUsed: number;
}

const TTL_MS = 30 * 60 * 1000;

export class SessionStore {
  private sessions = new Map<string, Session>();

  create(guidance: string, normalized: NormalizedGuidance | null, runId?: string, settings: Partial<GameSettings> = {}, loadout?: import("../src/shared/interaction").Loadout): Session {
    assertSafeText(guidance);
    validateNormalized(normalized);
    this.sweep();
    const s: Session = {
      id: randomUUID(),
      loadout: resolveLoadout(loadout),
      settings: resolveGameSettings(settings),
      runId: runId || randomUUID(),
      guidance,
      normalized,
      responseItems: [],
      pendingCallIds: [],
      lastUsed: Date.now(),
    };
    this.sessions.set(s.id, s);
    return s;
  }

  /** 读取会话并刷新最后访问时间。 */
  get(id: string): Session | undefined {
    const s = this.sessions.get(id);
    if (s) s.lastUsed = Date.now();
    return s;
  }

  /** End-of-run cleanup: in-run memory does not carry over to the next run. */
  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** 返回当前保留的会话数量。 */
  get size(): number {
    return this.sessions.size;
  }

  /** 清理超时会话，不跨局保留模型历史。 */
  private sweep() {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, s] of this.sessions) if (s.lastUsed < cutoff) this.sessions.delete(id);
  }
}
