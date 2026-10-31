import type { GameReport } from "../shared/types";
import { ReviewFailure, buildReviewInput, type DraftResult, type ReviewAttempt, type ReviewInput, type ReviewResult, type ReviewStrategy } from "../shared/review";
import { guidanceError } from "../shared/guidance";

interface ReviewApi {
  review(input: ReviewInput): Promise<ReviewResult>;
  draftGuidance(guidance: string, strategies: ReviewStrategy[]): Promise<DraftResult>;
}
interface ReviewState {
  status: "idle" | "loading" | "ready" | "error";
  review: ReviewResult | null;
  error: string | null;
  selected: string[];
  draftStatus: "idle" | "loading" | "ready" | "error";
  draft: DraftResult | null;
  editedGuidance: string;
  draftError: string | null;
}

/** One controller per ended report. It never edits App guidance or starts a game. */
export class ReviewSession {
  state: ReviewState = { status: "idle", review: null, error: null, selected: [], draftStatus: "idle", draft: null, editedGuidance: "", draftError: null };
  readonly originalGuidance: string;
  private readonly input: ReviewInput;
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private draftVersion = 0;
  private draftHistory: DraftResult[] = [];
  private attempts: ReviewAttempt[] = [];

  constructor(report: GameReport, private api: ReviewApi) {
    this.input = buildReviewInput(report);
    this.originalGuidance = report.guidance;
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<ReviewState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  ensureReview = (): Promise<void> => {
    if (this.state.review) return Promise.resolve();
    if (this.pending) return this.pending;
    this.update({ status: "loading", error: null });
    this.pending = this.api.review(this.input).then(review => {
      this.attempts.push({ model: review.model, usage: review.usage, latencyMs: review.latencyMs, operation: "review", status: "success" });
      this.update({ status: "ready", review });
    }).catch(error => {
      if (error instanceof ReviewFailure && error.attempt) this.attempts.push(error.attempt);
      this.update({ status: "error", error: error instanceof Error ? error.message : "复盘生成失败，请重试" });
    })
      .finally(() => { this.pending = null; });
    return this.pending;
  };
  toggle = (id: string) => {
    if (!this.state.review?.analysis.strategies.some(s => s.id === id)) return;
    this.draftVersion++;
    const selected = this.state.selected.includes(id) ? this.state.selected.filter(s => s !== id) : [...this.state.selected, id];
    this.update({ selected, draftStatus: "idle", draft: null, editedGuidance: "", draftError: null });
  };
  generateDraft = async () => {
    if (!this.state.review || !this.state.selected.length || this.state.draftStatus === "loading") return;
    const version = ++this.draftVersion;
    const strategies = this.state.review.analysis.strategies.filter(s => this.state.selected.includes(s.id));
    this.update({ draftStatus: "loading", draftError: null });
    try {
      const draft = await this.api.draftGuidance(this.originalGuidance, strategies);
      this.draftHistory.push(draft);
      this.attempts.push({ model: draft.model, usage: draft.usage, latencyMs: draft.latencyMs, operation: "draft", status: "success" });
      if (version !== this.draftVersion) { this.update({}); return; }
      this.update({ draftStatus: "ready", draft, editedGuidance: draft.guidance });
    } catch (error) {
      if (error instanceof ReviewFailure && error.attempt) this.attempts.push(error.attempt);
      if (version === this.draftVersion) this.update({ draftStatus: "error", draftError: error instanceof Error ? error.message : "草稿生成失败，请重试" });
      else this.update({});
    }
  };
  setEditedGuidance = (editedGuidance: string) => {
    if (this.state.draftStatus === "loading" && this.state.draft) {
      this.draftVersion++;
      this.update({ editedGuidance, draftStatus: "ready" });
    } else this.update({ editedGuidance });
  };
  get canApply() { return this.state.draftStatus === "ready" && !!this.state.editedGuidance.trim() && !guidanceError(this.state.editedGuidance); }
  exportData(): Partial<GameReport> {
    return {
      ...(this.state.review ? { review: this.state.review } : {}), selectedStrategyIds: [...this.state.selected],
      ...(this.state.draft ? { reviewDraft: { ...this.state.draft, guidance: this.state.editedGuidance } } : {}),
      reviewDraftHistory: [...this.draftHistory],
      reviewAttempts: structuredClone(this.attempts),
    };
  }
}
