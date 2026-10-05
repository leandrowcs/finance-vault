import { describe, expect, it } from "vitest";
import { localBackupKey, persistLocalFinance } from "./localFinance";
import { parseBackup, type FinanceData } from "./backup";
import { buildSeedPlanningMigration } from "./finance";
import { financePeriods } from "../data/financeSeed";

function data(): FinanceData {
  const planning = buildSeedPlanningMigration(financePeriods);
  return { movements: [], goals: [], periods: planning.periods, bills: planning.bills, occurrences: planning.occurrences, settings: { billPaidState: {}, entryOverrides: {}, incomeAllocations: {} } };
}
describe("local financial persistence", () => {
  it("stores every financial collection together and reloads the same state", () => {
    const stored = new Map<string, string>();
    const value = data();
    const actual = persistLocalFinance({ setItem: (key, json) => { stored.set(key, json); } }, value);
    expect(stored.size).toBe(1);
    expect(parseBackup(stored.get(localBackupKey)!).data).toEqual(actual);
    expect(actual).toEqual(value);
  });
  it("keeps the previous saved state when storage quota rejects an update", () => {
    let stored = "original saved data";
    const storage = { setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(() => { const next = persistLocalFinance(storage, data()); stored = JSON.stringify(next); }).toThrow(/Nenhuma alteração/);
    expect(stored).toBe("original saved data");
  });
  it("rejects inconsistent backups before touching storage", () => {
    const value = data();
    value.occurrences[0].billId = "missing";
    let writes = 0;
    expect(() => persistLocalFinance({ setItem: () => { writes++; } }, value)).toThrow();
    expect(writes).toBe(0);
  });
});
