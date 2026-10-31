import type Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { NormalizedGuidance } from "../src/shared/types";
import type { ChatMessage } from "./openai";
import { assertSafeText, validateNormalized } from "./security";
import { resolveGameSettings, type GameSettings } from "../src/shared/gameSettings";
import { filterUnrequestedCutIn } from "../src/shared/strategyPermissions";

/** In-run memory for one game: the frozen system prompt and the append-only history. */
export interface Session {
  settings: Readonly<GameSettings>;
  id: string;
  runId: string;
  guidance: string;
  normalized: NormalizedGuidance | null;
  messages: Anthropic.Beta.BetaMessageParam[];
  chatMessages: ChatMessage[];
  /** Every tool id must be answered, even when a batched response is rejected. */
  pendingToolUseIds: string[];
  lastUsed: number;
}

const TTL_MS = 30 * 60 * 1000;

export class SessionStore {
  private sessions = new Map<string, Session>();

  create(guidance: string, normalized: NormalizedGuidance | null, runId?: string, settings: Partial<GameSettings> = {}): Session {
    assertSafeText(guidance);
    validateNormalized(normalized);
    this.sweep();
    const s: Session = {
      id: randomUUID(),
      settings: resolveGameSettings(settings),
      runId: runId || randomUUID(),
      guidance,
      normalized: filterUnrequestedCutIn(guidance, normalized),
      messages: [],
      chatMessages: [],
      pendingToolUseIds: [],
      lastUsed: Date.now(),
    };
    this.sessions.set(s.id, s);
    return s;
  }

  get(id: string): Session | undefined {
    const s = this.sessions.get(id);
    if (s) s.lastUsed = Date.now();
    return s;
  }

  /** End-of-run cleanup: in-run memory does not carry over to the next run. */
  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  get size(): number {
    return this.sessions.size;
  }

  private sweep() {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, s] of this.sessions) if (s.lastUsed < cutoff) this.sessions.delete(id);
  }
}
