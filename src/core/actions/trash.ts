import type { ActionResult } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";

export interface TrashOptions {
  olderThanDays: number;
  onlyRead: boolean;
}

// Moves a sender's matching emails to each account's Trash and logs a `trash` action.
export async function trashSenderEmails(
  _ctx: AppContext,
  senderId: number,
  _options: TrashOptions,
): Promise<ActionResult> {
  return {
    senderId,
    senderName: "",
    status: "not_available",
    message: "Moving emails to Trash isn't built yet.",
    trashed: 0,
  };
}
