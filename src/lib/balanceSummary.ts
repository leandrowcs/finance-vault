import type { FinancialEntry } from "./finance";

export function summarizeIncome(entries: FinancialEntry[], month: string, today: string) {
  let received = 0;
  let expected = 0;
  entries.filter((entry) => entry.type === "income" && entry.date.startsWith(month)).forEach((entry) => {
    const cents = Math.round(entry.amount * 100);
    if (entry.received && entry.date <= today) received += cents;
    else expected += cents;
  });
  return { received: received / 100, expected: expected / 100 };
}
