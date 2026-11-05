import { afterEach, describe, expect, test } from "bun:test";
import type { ActionsResponse, ApiErrorBody } from "../../src/shared/api.ts";
import { actionRows, insertSender } from "./actions-fixtures.ts";
import { startTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
afterEach(() => app?.stop());

async function post(path: string, body: unknown): Promise<Response> {
  return app.call(path, { method: "POST", body });
}

describe("action request validation", () => {
  const bad: [string, unknown][] = [
    ["no body fields", {}],
    ["empty list", { senderIds: [] }],
    ["non-integer id", { senderIds: [1.5] }],
    ["zero id", { senderIds: [0] }],
    ["string id", { senderIds: ["1"] }],
    ["too many", { senderIds: Array.from({ length: 201 }, (_, i) => i + 1) }],
  ];

  for (const [label, ids] of bad) {
    test(`unsubscribe rejects ${label}`, async () => {
      app = startTestApp();
      const res = await post("/api/actions/unsubscribe", { alsoTrash: false, ...(ids as object) });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiErrorBody).error.field).toBe("senderIds");
    });

    test(`trash rejects ${label}`, async () => {
      app = startTestApp();
      const res = await post("/api/actions/trash", {
        olderThanDays: 0,
        onlyRead: false,
        ...(ids as object),
      });
      expect(res.status).toBe(400);
    });
  }

  test("unsubscribe requires alsoTrash to be a boolean", async () => {
    app = startTestApp();
    const res = await post("/api/actions/unsubscribe", { senderIds: [1], alsoTrash: "yes" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.field).toBe("alsoTrash");
  });

  test("trash validates olderThanDays and onlyRead", async () => {
    app = startTestApp();
    for (const olderThanDays of [-1, 3651, 1.5, "30", null]) {
      const res = await post("/api/actions/trash", {
        senderIds: [1],
        olderThanDays,
        onlyRead: false,
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiErrorBody).error.field).toBe("olderThanDays");
    }
    const res = await post("/api/actions/trash", {
      senderIds: [1],
      olderThanDays: 3650,
      onlyRead: 1,
    });
    expect(((await res.json()) as ApiErrorBody).error.field).toBe("onlyRead");
  });

  test("a malformed body is rejected", async () => {
    app = startTestApp();
    for (const body of [[1, 2], "hello", null]) {
      const res = await post("/api/actions/unsubscribe", body);
      expect(res.status).toBe(400);
    }
  });
});

describe("action results", () => {
  test("unknown senders are reported in request order without logging", async () => {
    app = startTestApp();
    const id = insertSender(app.ctx, { address: "news@shop.test", displayName: "Shop" });
    const res = await post("/api/actions/unsubscribe", {
      senderIds: [999, id],
      alsoTrash: false,
    });
    const { results } = (await res.json()) as ActionsResponse;
    expect(results.map((r) => r.senderId)).toEqual([999, id]);
    expect(results[0]).toMatchObject({
      status: "not_available",
      message: "That sender is no longer in your list.",
    });
    expect(results[1]).toMatchObject({ senderName: "Shop", status: "not_available" });
    expect(actionRows(app.ctx, id)).toHaveLength(1);
  });

  test("duplicate sender ids are handled once", async () => {
    app = startTestApp();
    const id = insertSender(app.ctx, { address: "news@shop.test" });
    const res = await post("/api/actions/unsubscribe", { senderIds: [id, id], alsoTrash: false });
    const { results } = (await res.json()) as ActionsResponse;
    expect(results).toHaveLength(1);
    expect(actionRows(app.ctx, id)).toHaveLength(1);
  });

  test("a sender with no unsubscribe option is not available and is logged", async () => {
    app = startTestApp();
    const id = insertSender(app.ctx, { address: "hello@friend.test" });
    const res = await post("/api/actions/unsubscribe", { senderIds: [id], alsoTrash: true });
    const { results } = (await res.json()) as ActionsResponse;
    expect(results[0]).toEqual({
      senderId: id,
      senderName: "hello@friend.test",
      status: "not_available",
      message:
        "This sender doesn't offer a way to unsubscribe. You can move their emails to Trash instead.",
      trashed: 0,
    });
    expect(actionRows(app.ctx, id)).toEqual([
      expect.objectContaining({ kind: "unsubscribe", method: "none", status: "not_available" }),
    ]);
  });

  test("trash with nothing matching says so and logs zero", async () => {
    app = startTestApp();
    const id = insertSender(app.ctx, { address: "deals@amazon.test", displayName: "Amazon" });
    const res = await post("/api/actions/trash", {
      senderIds: [id, 12345],
      olderThanDays: 30,
      onlyRead: true,
    });
    const { results } = (await res.json()) as ActionsResponse;
    expect(results[0]).toEqual({
      senderId: id,
      senderName: "Amazon",
      status: "done",
      message: "There were no emails from Amazon to move.",
      trashed: 0,
    });
    expect(results[1]?.status).toBe("not_available");
    expect(actionRows(app.ctx, id)).toEqual([
      expect.objectContaining({ kind: "trash", status: "done", messages_affected: 0 }),
    ]);
  });
});
