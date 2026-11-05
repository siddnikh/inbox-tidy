import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ScanStatus, SenderRow } from "../shared/api.ts";

export type Tab = "home" | "senders" | "accounts" | "settings";
export type ToastTone = "success" | "error" | "info";

export interface AppState {
  // Bumped whenever server data may have changed; screens refetch when it moves.
  version: number;
  refresh: () => void;
  toast: (message: string, tone?: ToastTone) => void;
  scan: ScanStatus | null;
  startScan: () => Promise<void>;
  watchScan: () => void;
  navigate: (tab: Tab) => void;
  openAddAccount: () => void;
  openUnsubscribe: (senders: SenderRow[], onFinished?: () => void) => void;
  openTrash: (senders: SenderRow[], onFinished?: () => void) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp must be used inside AppContext");
  return state;
}

export function scanRunning(scan: ScanStatus | null): boolean {
  return scan?.state === "running";
}
