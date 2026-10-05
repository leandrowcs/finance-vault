import { describe, expect, it } from "vitest";
import { createBackup, movementsCsv, parseBackup, previewRestore, validateBackup, type FinanceData } from "./backup";
import { buildSeedPlanningMigration } from "./finance";
import { financePeriods } from "../data/financeSeed";

function empty(): FinanceData {
  return { movements: [], goals: [], periods: [], bills: [], occurrences: [], settings: { billPaidState: {}, entryOverrides: {}, incomeAllocations: {} } };
}
function sample(): FinanceData {
  const data = empty();
  data.movements.push({ id: "salary", amount: 1000, date: "2026-10-01", type: "income", owner: "Você", category: "Salário", description: "Salário" });
  data.goals.push({ id: "trip", name: "Viagem", target: 500, saved: 100, contributions: [{ id: "aporte", amount: 100, date: "2026-10-01", incomeSourceId: "salary" }] });
  data.settings.incomeAllocations.salary = 100;
  return data;
}
describe("financial backups", () => {
  it("round trips all seed planning and contributions without identity or financial loss", () => {
    const seed = buildSeedPlanningMigration(financePeriods);
    const data = { ...sample(), periods: seed.periods, bills: seed.bills, occurrences: seed.occurrences };
    const backup = createBackup("owner", data);
    expect(parseBackup(JSON.stringify(backup)).data).toEqual(data);
    expect(previewRestore(empty(), backup).data).toEqual(data);
  });
  it("restores once and deduplicates a repeated restore by ID", () => {
    const backup = createBackup("owner", sample());
    const first = previewRestore(empty(), backup);
    const second = previewRestore(first.data, backup);
    expect(first.added).toBe(3);
    expect(second.added).toBe(0);
    expect(second.conflicts).toEqual([]);
    expect(second.data).toEqual(first.data);
  });
  it("preserves current records and reports conflicts instead of overwriting", () => {
    const current = sample();
    current.movements[0].amount = 2000;
    const result = previewRestore(current, createBackup("owner", sample()));
    expect(result.conflicts).toEqual(["Lançamento: salary"]);
    expect(result.data.movements[0].amount).toBe(2000);
    expect(current.movements[0].amount).toBe(2000);
  });
  it("rejects incompatible reservations even when the two source maps match", () => {
    const current = sample();
    const incoming = sample();
    incoming.goals[0].id = "other-goal";
    incoming.goals[0].contributions[0].id = "other-contribution";
    const result = previewRestore(current, createBackup("owner", incoming));
    expect(result.conflicts).toContain("Reserva insuficiente para objetivos combinados: salary");
  });
  it("rejects unknown versions, currencies and non-financial fields", () => {
    const backup = createBackup("owner", empty());
    expect(() => validateBackup({ ...backup, version: 2 })).toThrow();
    expect(() => validateBackup({ ...backup, currency: "USD" })).toThrow();
    expect(() => validateBackup({ ...backup, credentials: "not-allowed" })).toThrow();
    expect(() => validateBackup({ ...backup, data: { ...backup.data, invites: [] } })).toThrow();
  });
  it("rejects malformed JSON, invalid dates, path IDs and duplicate IDs", () => {
    expect(() => parseBackup("not JSON")).toThrow();
    const backup = createBackup("owner", sample());
    backup.data.movements[0].date = "2026-02-30";
    expect(() => validateBackup(backup)).toThrow();
    backup.data.movements[0].date = "2026-10-01";
    backup.data.movements[0].id = "../bad";
    expect(() => validateBackup(backup)).toThrow();
    backup.data.movements[0].id = "salary";
    backup.data.movements.push({ ...backup.data.movements[0] });
    expect(() => validateBackup(backup)).toThrow(/duplicados/);
  });
  it("rejects inconsistent goal balances and missing reservations", () => {
    const backup = createBackup("owner", sample());
    backup.data.goals[0].saved = 200;
    expect(() => validateBackup(backup)).toThrow(/saldo/);
    backup.data.goals[0].saved = 100;
    backup.data.settings.incomeAllocations = {};
    expect(() => validateBackup(backup)).toThrow(/Reservas/);
  });
  it("rejects missing replacement references and orphan occurrences", () => {
    const backup = createBackup("owner", empty());
    backup.data.settings.entryOverrides.x = { deleted: true, replacedByMovementId: "missing" };
    expect(() => validateBackup(backup)).toThrow(/substituições/);
    backup.data.settings.entryOverrides = {};
    backup.data.occurrences = [{ id: "occurrence", billId: "missing", periodDate: "2026-10-01", dueDate: "2026-10-01", name: "Rent", owner: "Você", amount: 10, category: "Casa", status: "planned", history: [] }];
    expect(() => validateBackup(backup)).toThrow(/vencimentos/);
  });
  it("escapes CSV formulas, quotes and preserves cents", () => {
    const data = sample();
    data.movements[0].description = '=SUM(1,2) "test"';
    data.movements[0].amount = 123.45;
    const csv = movementsCsv(data);
    expect(csv).toContain('"\'=SUM(1,2) ""test"""');
    expect(csv).toContain('"123.45";"CAD"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
  it("exports effective manual values and omits deleted entries from CSV", () => {
    const data = sample();
    data.settings.entryOverrides["movement:salary"] = { amount: 250, description: "Corrected" };
    expect(movementsCsv(data)).toContain('"Corrected"');
    expect(movementsCsv(data)).toContain('"250.00"');
    data.settings.entryOverrides["movement:salary"] = { deleted: true };
    expect(movementsCsv(data)).not.toContain('"salary"');
  });
  it("blocks the same contribution ID assigned to different goals after merging", () => {
    const current = sample();
    const incoming = sample();
    incoming.goals[0].id = "another-goal";
    incoming.goals[0].contributions[0].incomeSourceId = "another-source";
    incoming.settings.incomeAllocations = { "another-source": 100 };
    expect(previewRestore(current, createBackup("owner", incoming)).conflicts).toContain("O mesmo aporte aparece em objetivos diferentes.");
  });
});
