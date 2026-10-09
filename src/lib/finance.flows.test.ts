import { describe, expect, it } from "vitest";
import type { SeedPayPeriod } from "../data/financeSeed";
import type { BillTemplate, Goal, Movement } from "../types/finance";
import {
  calculateFinanceLedger,
  findPlannedIncomeMatches,
  generateBillOccurrences,
  resolveFinancialEntries,
  toggleBillOccurrencePayment,
  type FinanceOverrides,
} from "./finance";

const date = "2026-10-01";
function plannedPeriod(): SeedPayPeriod {
  return {
    date, label: "October payment",
    income: { leandro: 1000, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
    bills: [],
  };
}

describe("FinanceVault domain flows", () => {
  it("receives a partial payment, replaces the remaining plan, then restores it on deletion", () => {
    const period = plannedPeriod();
    const initial = resolveFinancialEntries([], {}, [period]);
    expect(initial).toHaveLength(1);
    expect(calculateFinanceLedger(initial, [], date).get("2026-10")?.availableByOwner["Você"]).toBe(0);

    period.receivedIncome = { leandro: [{ id: "partial", actualAmount: 400, receivedAt: date }] };
    const partial = resolveFinancialEntries([], {}, [period]);
    expect(partial.filter((entry) => !entry.received).map((entry) => entry.amount)).toEqual([600]);
    expect(calculateFinanceLedger(partial, [], date).get("2026-10")?.receivedByOwner["Você"]).toBe(400);

    const movement: Movement = {
      id: "remainder", type: "income", amount: 600, date,
      description: "Remaining salary", category: "Salário", owner: "Você",
    };
    const matches = findPlannedIncomeMatches(movement, partial);
    expect(matches).toHaveLength(1);
    const overrides: FinanceOverrides = {
      [matches[0].key]: { deleted: true, replacedByMovementId: movement.id },
    };
    const replaced = calculateFinanceLedger(resolveFinancialEntries([movement], overrides, [period])).get("2026-10");
    expect(replaced?.incomeTotal).toBe(1000);
    expect(replaced?.receivedByOwner["Você"]).toBe(1000);

    const additional = calculateFinanceLedger(resolveFinancialEntries([movement], {}, [period])).get("2026-10");
    expect(additional?.incomeTotal).toBe(1600);
    expect(additional?.receivedByOwner["Você"]).toBe(1000);

    delete overrides[matches[0].key];
    const restored = calculateFinanceLedger(resolveFinancialEntries([], overrides, [period])).get("2026-10");
    expect(restored?.incomeTotal).toBe(1000);
    expect(restored?.receivedByOwner["Você"]).toBe(400);
  });

  it("generates a bill, pays it and reopens it without releasing its reserved money", () => {
    const template: BillTemplate = {
      id: "rent", name: "Rent", owner: "Você", amount: 600,
      category: "Casa", dueDay: 10, recurrence: "monthly", startDate: date, active: true,
    };
    const occurrences = generateBillOccurrences(template, "2026-11-30");
    expect(occurrences.map((item) => item.dueDate)).toEqual(["2026-10-10", "2026-11-10"]);
    const original = occurrences[0];
    expect(original.status).toBe("planned");
    expect(original.history).toEqual([]);
    const paid = toggleBillOccurrencePayment(original, "paid-event", "2026-10-10");
    expect(paid.paidAmount).toBe(600);
    const reopened = toggleBillOccurrencePayment(paid, "reopen-event", "2026-10-11");
    expect(reopened.status).toBe("planned");
    expect(reopened.paidAmount).toBe(0);
    expect(reopened.paidAt).toBeUndefined();
    expect(reopened.history.map((event) => event.action)).toEqual(["paid", "reopened"]);
    expect(original.history).toEqual([]);

    for (const occurrence of [original, paid, reopened]) {
      const period = plannedPeriod();
      period.receivedIncome = { leandro: [{ id: "salary", actualAmount: 1000, receivedAt: date }] };
      period.bills = [{
        id: occurrence.billId, name: occurrence.name, amount: occurrence.amount,
        owner: occurrence.owner, category: occurrence.category, due: "10 out",
        dueDate: occurrence.dueDate, paid: occurrence.status === "paid",
        paidAmount: occurrence.paidAmount, occurrenceHistory: occurrence.history,
      }];
      const month = calculateFinanceLedger(resolveFinancialEntries([], {}, [period])).get("2026-10");
      expect(month?.expenseTotal).toBe(600);
      expect(month?.availableByOwner["Você"]).toBe(400);
    }
  });

  it("keeps future bills available for goal transfers and releases contributions when a goal is removed", () => {
    const period = plannedPeriod();
    period.receivedIncome = { leandro: [{ id: "salary", actualAmount: 1000, receivedAt: date }] };
    period.bills = [
      { id: "rent", name: "Rent", amount: 600, owner: "Você", category: "Casa", due: "10 out", paid: false },
      { id: "future", name: "Future bill", amount: 200, owner: "Você", category: "Casa", due: "10 nov", paid: false },
    ];
    const entries = resolveFinancialEntries([], {}, [period]);
    const goals: Goal[] = [{ id: "trip", name: "Trip", target: 200, saved: 0, contributions: [] }];
    const month = () => calculateFinanceLedger(entries, goals.flatMap((goal) => goal.contributions), date).get("2026-10");
    expect(month()?.availableByOwner["Você"]).toBe(1000);
    expect(goals[0].saved).toBe(0);

    goals[0].contributions.push({
      id: "transfer", amount: 50, date, incomeSourceDate: date,
      incomeSourceId: "income-balance:Você:2026-10", incomeSourceOwner: "Você",
    });
    goals[0].saved = 50;
    expect(month()?.availableByOwner["Você"]).toBe(950);
    expect(month()?.goalContributionsTotal).toBe(50);
    expect(month()?.incomeTotal).toBe(1000);
    expect(month()?.expenseTotal).toBe(600);

    goals.splice(0, 1);
    expect(month()?.availableByOwner["Você"]).toBe(1000);
    expect(month()?.goalContributionsTotal).toBe(0);
    expect(month()?.incomeTotal).toBe(1000);
  });
});
