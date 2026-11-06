import { useState } from "preact/hooks";
import type { SenderRow } from "../shared/api.ts";
import { ApiError, api } from "./api.ts";
import { useApp } from "./app-state.ts";
import { senderName } from "./components/Sender.tsx";

// Records the user's tick that they finished on a sender's unsubscribe web page.
export function useConfirmUnsubscribe() {
  const app = useApp();
  const [pending, setPending] = useState<Set<number>>(new Set());

  const confirm = async (sender: SenderRow): Promise<SenderRow | null> => {
    setPending((s) => new Set(s).add(sender.id));
    try {
      const updated = await api<SenderRow>(`/api/senders/${sender.id}/confirm-unsubscribe`, {
        method: "POST",
      });
      app.toast(`Marked ${senderName(sender)} as unsubscribed.`, "success");
      app.refresh();
      return updated;
    } catch (e) {
      const reason = e instanceof ApiError ? e.message : "Please try again.";
      app.toast(`Couldn't mark ${senderName(sender)} as unsubscribed. ${reason}`, "error");
      return null;
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(sender.id);
        return next;
      });
    }
  };

  return { pending, confirm };
}
