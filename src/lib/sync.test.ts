import { describe, expect, it } from "vitest";
import { resolveSyncStatus } from "./sync";
describe("sync confirmation", () => {
  const confirmed = { confirmed: true, pending: false, failed: false };
  it("does not claim server sync in local mode or offline", () => {
    expect(resolveSyncStatus(false, true, [], 0, false)).toBe("local");
    expect(resolveSyncStatus(false, true, [], 1, false)).toBe("saving");
    expect(resolveSyncStatus(true, false, [confirmed], 0, false)).toBe("offline");
  });
  it("requires every source to be confirmed and no pending writes", () => {
    expect(resolveSyncStatus(true, true, [], 0, false)).toBe("loading");
    expect(resolveSyncStatus(true, true, [confirmed, { ...confirmed, confirmed: false }], 0, false)).toBe("loading");
    expect(resolveSyncStatus(true, true, [{ ...confirmed, pending: true }], 0, false)).toBe("saving");
    expect(resolveSyncStatus(true, true, [confirmed], 1, false)).toBe("saving");
    expect(resolveSyncStatus(true, true, [confirmed], 0, false)).toBe("synced");
  });
  it("never hides failed reads, writes or local persistence behind synced", () => {
    expect(resolveSyncStatus(true, true, [{ ...confirmed, failed: true }], 0, false)).toBe("error");
    expect(resolveSyncStatus(true, true, [confirmed], 0, true)).toBe("error");
    expect(resolveSyncStatus(false, true, [], 0, true)).toBe("error");
  });
});
