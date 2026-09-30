import { describe, expect, it } from "vitest";
import type { SeedPayPeriod } from "../data/financeSeed";
import type { GoalContribution, Movement } from "../types/finance";
import {
  calculateFinanceLedger,
  currency,
  findPlannedIncomeMatches,
  resolveFinancialEntries,
  splitOwnerAmount,
  sumPaymentBalances,
} from "./finance";

function period(date: string, overrides: Partial<SeedPayPeriod> = {}): SeedPayPeriod {
  return {
    date,
    label: date,
    income: { leandro: 0, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
    bills: [],
    ...overrides,
  };
}

describe("financial entry resolution", () => {
  it("formats amounts explicitly as Canadian dollars", () => {
    expect(currency.format(1234.56)).toContain("CAD");
  });

  it("groups edited planned income and bills by their effective dates", () => {
    const sourcePeriod = period("2026-09-17", {
      income: { leandro: 100, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
      bills: [{ id: "rent", name: "Rent", owner: "Você", amount: 60, due: "24 set", category: "Casa", paid: false }],
    });
    const entries = resolveFinancialEntries([], {
      "period-income:2026-09-17:leandro": { date: "2026-10-01" },
      "period-expense:2026-09-17:rent": { date: "2026-10-02" },
    }, [sourcePeriod]);

    expect(entries.find((entry) => entry.type === "income")?.date).toBe("2026-10-01");
    expect(entries.find((entry) => entry.type === "expense")?.date).toBe("2026-10-02");
  });

  it("matches planned income by effective date and cents", () => {
    const entries = resolveFinancialEntries([], {}, [period("2026-09-17", {
      income: { leandro: 100, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
    })]);
    const candidate: Movement = {
      id: "manual-income",
      type: "income",
      amount: 100,
      date: "2026-09-17",
      description: "Salary",
      category: "Salário",
      owner: "Você",
    };

    expect(findPlannedIncomeMatches(candidate, entries)).toHaveLength(1);
    expect(findPlannedIncomeMatches({ ...candidate, date: "2026-09-18" }, entries)).toHaveLength(0);
    expect(findPlannedIncomeMatches({ ...candidate, amount: 100.01 }, entries)).toHaveLength(0);
  });

  it("counts replacement once and keeps an extra income in addition to the plan", () => {
    const plan = period("2026-09-17", {
      income: { leandro: 100, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
    });
    const manualIncome: Movement = {
      id: "manual-income",
      type: "income",
      amount: 100,
      date: "2026-09-17",
      description: "Salary received",
      category: "Salário",
      owner: "Você",
    };
    const extraEntries = resolveFinancialEntries([manualIncome], {}, [plan]);
    const replacementEntries = resolveFinancialEntries([manualIncome], {
      "period-income:2026-09-17:leandro": {
        deleted: true,
        replacedByMovementId: manualIncome.id,
      },
    }, [plan]);

    expect(calculateFinanceLedger(extraEntries).get("2026-09")?.incomeTotal).toBe(200);
    expect(calculateFinanceLedger(replacementEntries).get("2026-09")?.incomeTotal).toBe(100);
  });
});

describe("monthly allocation", () => {
  it("matches the monthly summary to the displayed payment balances", () => {
    expect(sumPaymentBalances([
      { balance: -530.08 },
      { balance: 853.93 },
    ])).toBe(323.85);
  });

  it("allocates received income to same-month bills before later bills", () => {
    const entries = resolveFinancialEntries([], {}, [
      period("2026-09-01", {
        income: { leandro: 100, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
        bills: [{ id: "rent", name: "Rent", owner: "Você", amount: 60, due: "10 set", category: "Casa", paid: false }],
      }),
      period("2026-10-01", {
        bills: [{ id: "insurance", name: "Insurance", owner: "Você", amount: 20, due: "03 out", category: "Casa", paid: false }],
      }),
    ]);
    const contribution: GoalContribution = {
      id: "goal-contribution",
      amount: 5,
      date: "2026-09-02",
      incomeSourceId: "period-income:2026-09-01:leandro",
      incomeSourceDate: "2026-09-01",
      incomeSourceOwner: "Você",
    };
    const ledger = calculateFinanceLedger(entries, [contribution]);

    expect(ledger.get("2026-09")?.availableByOwner["Você"]).toBe(15);
    expect(ledger.get("2026-10")?.unfundedExpensesByOwner["Você"]).toBe(0);
  });

  it("covers same-month due bills before later-month obligations", () => {
    const entries = resolveFinancialEntries([], {}, [
      period("2026-09-01", {
        income: { leandro: 100, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
        bills: [
          { id: "rent", name: "Rent", owner: "Você", amount: 60, due: "10 set", category: "Casa", paid: false },
          { id: "insurance", name: "Insurance", owner: "Você", amount: 70, due: "03 out", category: "Casa", paid: false },
        ],
      }),
    ]);
    const ledger = calculateFinanceLedger(entries);

    expect(ledger.get("2026-09")?.unfundedExpensesByOwner["Você"]).toBe(0);
    expect(ledger.get("2026-09")?.availableByOwner["Você"]).toBe(0);
    expect(ledger.get("2026-10")?.unfundedExpensesByOwner["Você"]).toBe(30);
  });

  it("monthly balance equals the sum of the two September payment balances", () => {
    const movements: Movement[] = [
      { id: "sep-03-income", type: "income", amount: 4700.97, date: "2026-09-03", description: "Payment", category: "Salário", owner: "Você" },
      { id: "sep-03-expenses", type: "expense", amount: 5231.05, date: "2026-09-12", description: "Bills due before Sep 17", category: "Casa", owner: "Compartilhado" },
      { id: "sep-17-expenses", type: "expense", amount: 3398.58, date: "2026-09-20", description: "Bills due after Sep 17", category: "Casa", owner: "Compartilhado" },
    ];
    const september = period("2026-09-17", {
      income: { leandro: 2692.62, ketlin: 2059.89, extras: 0, leiaUniversitySavings: 0 },
    });
    const contribution: GoalContribution = {
      id: "sep-17-goal",
      amount: 500,
      date: "2026-09-17",
      incomeSourceId: "period-income:2026-09-17:leandro",
      incomeSourceDate: "2026-09-17",
      incomeSourceOwner: "Você",
    };
    const month = calculateFinanceLedger(resolveFinancialEntries(movements, {}, [september]), [contribution]).get("2026-09");

    expect(month?.incomeTotal).toBe(9453.48);
    expect(month?.expenseTotal).toBe(8629.63);
    expect(month?.goalContributionsTotal).toBe(500);
    expect(month?.balance).toBeCloseTo(323.85, 2);
  });

  it("splits shared expenses equally", () => {
    expect(splitOwnerAmount(101, "Compartilhado")).toEqual({ "Você": 50.5, "Esposa": 50.5 });
    expect(splitOwnerAmount(101.01, "Compartilhado")).toEqual({ "Você": 50.5, "Esposa": 50.51 });
  });

  it("splits shared income and expenses into each person's monthly balance", () => {
    const movements: Movement[] = [
      { id: "shared-income", type: "income", amount: 100, date: "2026-09-01", description: "Shared", category: "Outros", owner: "Compartilhado" },
      { id: "shared-expense", type: "expense", amount: 50, date: "2026-09-05", description: "Shared bill", category: "Casa", owner: "Compartilhado" },
    ];
    const ledger = calculateFinanceLedger(resolveFinancialEntries(movements, {}, []));
    const month = ledger.get("2026-09");

    expect(month?.receivedByOwner).toEqual({ "Você": 50, "Esposa": 50 });
    expect(month?.expenseByOwner).toEqual({ "Você": 25, "Esposa": 25 });
    expect(month?.availableByOwner).toEqual({ "Você": 25, "Esposa": 25 });
  });

  it("does not treat a future planned receipt as currently available", () => {
    const entries = resolveFinancialEntries([], {}, [period("2026-09-17", {
      income: { leandro: 100, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
      bills: [{ id: "rent", name: "Rent", owner: "Você", amount: 40, due: "10 set", category: "Casa", paid: false }],
    })]);
    const month = calculateFinanceLedger(entries, [], "2026-09-10").get("2026-09");

    expect(month?.receivedByOwner["Você"]).toBe(0);
    expect(month?.availableByOwner["Você"]).toBe(0);
    expect(month?.unfundedExpensesByOwner["Você"]).toBe(40);
  });

  it("reserves unassigned legacy contributions once", () => {
    const entries = resolveFinancialEntries([], {}, [period("2026-09-01", {
      income: { leandro: 100, ketlin: 0, extras: 0, leiaUniversitySavings: 0 },
      bills: [{ id: "rent", name: "Rent", owner: "Você", amount: 50, due: "10 set", category: "Casa", paid: false }],
    })]);
    const legacyContribution: GoalContribution = { id: "legacy", amount: 10, date: "2026-09-02" };

    expect(calculateFinanceLedger(entries, [legacyContribution]).get("2026-09")?.availableByOwner["Você"]).toBe(40);
  });
});