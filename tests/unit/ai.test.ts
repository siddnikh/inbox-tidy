import { expect, test } from "bun:test";
import { providerOrder } from "../../src/core/ai/cli.ts";

test("automatic mode tries Claude first, then Codex", () => {
  expect(providerOrder("auto")).toEqual(["claude", "codex"]);
  expect(providerOrder("codex")).toEqual(["codex"]);
});
