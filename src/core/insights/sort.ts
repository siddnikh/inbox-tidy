import type { AppContext } from "../context.ts";

export interface SortProgress {
  done: number;
  total: number;
}

export interface SortResult {
  usedAi: boolean;
  sorted: number;
}

// Categorises senders that lack fresh AI data. Called by the scanner during its
// "understanding" stage; must never throw for AI failures (fall back instead).
export async function sortSenders(
  _ctx: AppContext,
  _onProgress: (progress: SortProgress) => void,
): Promise<SortResult> {
  return { usedAi: false, sorted: 0 };
}
