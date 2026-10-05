import { expect, it } from "vitest";
import { summarizeIncome } from "./balanceSummary";
import { resolveFinancialEntries } from "./finance";
it("separates actual receipts, remaining forecast and future manual income", () => {
  const entries = resolveFinancialEntries([
    { id: "future", amount: 200, date: "2026-10-20", type: "income", description: "Extra", category: "Outros", owner: "Você" },
    { id: "expense", amount: 50, date: "2026-10-01", type: "expense", description: "Expense", category: "Outros", owner: "Você" },
  ], {}, [{ date: "2026-10-01", label: "October", income: { leandro: 1000, ketlin: 0, extras: 0, leiaUniversitySavings: 0 }, receivedIncome: { leandro: [{ id: "partial", actualAmount: 400, receivedAt: "2026-10-02" }] }, bills: [] }]);
  expect(summarizeIncome(entries, "2026-10", "2026-10-02")).toEqual({ received: 400, expected: 800 });
  expect(summarizeIncome(entries, "2026-10", "2026-10-20")).toEqual({ received: 600, expected: 600 });
  expect(summarizeIncome(entries, "2026-11", "2026-10-20")).toEqual({ received: 0, expected: 0 });
});
