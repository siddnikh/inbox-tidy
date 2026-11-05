// The single contract between the UI (src/ui) and the core (src/core).
// Every /api route returns either the documented payload or ApiErrorBody with a non-2xx status.

export type AiProviderChoice = "auto" | "claude" | "codex";
export type AiProviderId = "claude" | "codex";

export interface ApiErrorBody {
  error: {
    // A sentence written for a non-technical person: what happened and what to do next.
    message: string;
    // Form field the message refers to, so the UI can highlight it.
    field?: string;
  };
}

// GET /api/health
export interface HealthResponse {
  ok: boolean;
  version: string;
  database: { ok: boolean; schemaVersion: number };
  ai: {
    choice: AiProviderChoice;
    providers: { id: AiProviderId; label: string; available: boolean }[];
  };
}

// POST /api/ai/check
export interface AiCheckResponse {
  provider: AiProviderId;
  label: string;
  reply: string;
  durationMs: number;
}

export type MailProviderId = "gmail" | "icloud" | "yahoo" | "rediffmail_pro" | "other";

export interface ServerSettings {
  host: string;
  port: number;
  secure: boolean;
}

// GET /api/providers
export interface ProviderPreset {
  id: MailProviderId;
  label: string;
  imap: ServerSettings | null;
  smtp: ServerSettings | null;
  appPasswordUrl: string | null;
  // Plain-language steps for creating an app password.
  steps: string[];
  note?: string;
}

// GET /api/accounts -> AccountSummary[]
export interface AccountSummary {
  id: number;
  provider: MailProviderId;
  email: string;
  messageCount: number;
  lastScanAt: string | null;
  lastScanError: string | null;
}

// POST /api/accounts -> AccountSummary (201). The connection is tested before saving.
export interface AddAccountRequest {
  provider: MailProviderId;
  email: string;
  password: string;
  // Only used when provider is "other".
  imap?: ServerSettings;
  smtp?: ServerSettings;
}

// DELETE /api/accounts/:id -> { ok: true }

export type ScanState = "idle" | "running" | "done" | "failed";
export type ScanStage = "connecting" | "reading" | "understanding" | "done";

// POST /api/scan -> ScanStatus (starts a scan of every account; returns current status if one is running)
// GET /api/scan -> ScanStatus
export interface ScanStatus {
  state: ScanState;
  stage: ScanStage | null;
  accountEmail: string | null;
  processed: number;
  total: number;
  // Human sentence describing the current step, e.g. "Reading emails from you@gmail.com (1,200 of 4,000)".
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  errors: { accountEmail: string; message: string }[];
}

// GET /api/summary
export interface HomeSummary {
  impact: {
    sendersUnsubscribed: number;
    emailsAvoidedPerMonth: number;
    emailsTrashed: number;
  };
  inbox: {
    accounts: number;
    totalEmails: number;
    emailsPerMonth: number;
    unreadPercent: number;
    senders: number;
    canUnsubscribe: number;
    suggested: number;
  };
  lookbackMonths: number;
  lastScanAt: string | null;
}

export type SenderCategory =
  | "shopping"
  | "news"
  | "social"
  | "bills"
  | "travel"
  | "work"
  | "personal"
  | "other";

export type Recommendation = "unsubscribe" | "keep" | "review";
export type UnsubscribeMethod = "one_click" | "mailto" | "web" | "none";
export type SenderStatus = "active" | "unsubscribed" | "kept";
export type SenderFilter = "suggested" | "all" | "can_unsubscribe" | "kept" | "unsubscribed";
export type SenderSort = "most" | "least_read" | "recent";

// GET /api/senders?filter=SenderFilter&sort=SenderSort&q=search -> SenderRow[]
export interface SenderRow {
  id: number;
  address: string;
  displayName: string;
  domain: string;
  emailsTotal: number;
  emailsPerMonth: number;
  unreadCount: number;
  readPercent: number;
  lastReceivedAt: string;
  category: SenderCategory | null;
  summary: string | null;
  recommendation: Recommendation | null;
  recommendationReason: string | null;
  unsubscribeMethod: UnsubscribeMethod;
  status: SenderStatus;
  recentSubjects: string[];
}

// POST /api/senders/:id/keep -> SenderRow   (hide from suggestions)
// DELETE /api/senders/:id/keep -> SenderRow

export type ActionStatus = "done" | "opened_in_browser" | "failed" | "not_available";

export interface ActionResult {
  senderId: number;
  senderName: string;
  status: ActionStatus;
  // Plain sentence: "Unsubscribed.", "Opened their unsubscribe page in your browser.", ...
  message: string;
  trashed: number;
}

// POST /api/actions/unsubscribe -> ActionsResponse
export interface UnsubscribeRequest {
  senderIds: number[];
  alsoTrash: boolean;
}

// POST /api/actions/trash -> ActionsResponse
export interface TrashRequest {
  senderIds: number[];
  // Only trash emails older than this many days; 0 means all of them.
  olderThanDays: number;
  // Only trash emails already read.
  onlyRead: boolean;
}

export interface ActionsResponse {
  results: ActionResult[];
}

// GET /api/settings, PUT /api/settings (partial) -> AppSettings
export interface AppSettings {
  aiProvider: AiProviderChoice;
  lookbackMonths: number;
}
