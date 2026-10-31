export type ModelLoadStatus = "idle" | "loading" | "loaded" | "failed";

export interface ModelLoadingState {
  url: string | null;
  status: ModelLoadStatus;
  progress: number;
}

export function modelResourceKey(url: string) {
  return url.split("?", 1)[0];
}

export function clampModelProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function shouldShowModelLoadingOverlay(state: ModelLoadingState) {
  return Boolean(state.url) && state.status === "loading";
}
