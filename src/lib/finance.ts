import { financePeriods, totalIncome, type SeedPayPeriod } from "../data/financeSeed";
import type { Bill, GoalContribution, Movement, Owner } from "../types/finance";

export const currency = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "code" });
export const monthLabels = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthIndexes: Record<string, number> = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

export type FinanceOverrides = Record<string, Partial<Movement> & { deleted?: boolean; replacedByMovementId?: string }>;
export type FinancialEntry = {
  id: string;
  key: string;
  type: Movement["type"];
  kind: "manual" | "planned";
  date: string;
  amount: number;
  owner: Owner;
  title: string;
  category: string;
  toggleKey: string;
  movement: Movement;
};
export type FinanceOwner = Exclude<Owner, "Compartilhado">;
export type MonthlyFinanceBalance = {
  incomeByOwner: Record<FinanceOwner, number>;
  receivedByOwner: Record<FinanceOwner, number>;
  expenseByOwner: Record<FinanceOwner, number>;
  goalContributionsByOwner: Record<FinanceOwner, number>;
  availableByOwner: Record<FinanceOwner, number>;
  unfundedExpensesByOwner: Record<FinanceOwner, number>;
  incomeTotal: number;
  expenseTotal: number;
  goalContributionsTotal: number;
  balance: number;
};

export function sumPaymentBalances(payments: readonly { balance: number }[]) {
  const totalCents = payments.reduce((total, payment) => total + amountInCents(payment.balance), 0);
  return totalCents / 100;
}

const owners: FinanceOwner[] = ["Você", "Esposa"];

function amountInCents(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function splitOwnerAmount(amount: number, owner: Owner): Record<FinanceOwner, number> {
  if (owner === "Compartilhado") {
    const totalCents = amountInCents(amount);
    const youCents = Math.floor(totalCents / 2);
    return { "Você": youCents / 100, "Esposa": (totalCents - youCents) / 100 };
  }
  return { "Você": owner === "Você" ? amount : 0, "Esposa": owner === "Esposa" ? amount : 0 };
}

export function resolveFinancialEntries(
  movements: Movement[],
  overrides: FinanceOverrides = {},
  periods: SeedPayPeriod[] = financePeriods,
): FinancialEntry[] {
  const plannedEntries: FinancialEntry[] = periods.flatMap((period) => {
    const incomes: FinancialEntry[] = ([
      { person: "leandro", owner: "Você", amount: period.income.leandro },
      { person: "ketlin", owner: "Esposa", amount: period.income.ketlin },
    ] as const).flatMap(({ person, owner, amount }) => {
      const key = `period-income:${period.date}:${person}`;
      const override = overrides[key];
      if (override?.deleted) return [];
      const movement: Movement = {
        id: key,
        type: "income",
        amount: override?.amount ?? amount,
        date: override?.date ?? period.date,
        description: override?.description ?? "Receita recebida",
        category: override?.category ?? "Salário",
        owner: override?.owner ?? owner,
      };
      if (!Number.isFinite(movement.amount) || movement.amount <= 0) return [];
      return [{
        id: key,
        key,
        type: "income",
        kind: "planned" as const,
        date: movement.date,
        amount: movement.amount,
        owner: movement.owner,
        title: movement.description,
        category: movement.category,
        toggleKey: key,
        movement,
      }];
    });
    const expenses: FinancialEntry[] = period.bills.flatMap((bill) => {
      const key = `period-expense:${period.date}:${bill.id}`;
      const override = overrides[key];
      if (override?.deleted) return [];
      const defaultDate = dateKey(dueDate(period.date, bill.due));
      const movement: Movement = {
        id: key,
        type: "expense",
        amount: override?.amount ?? bill.amount,
        date: override?.date ?? defaultDate,
        description: override?.description ?? bill.name,
        category: override?.category ?? bill.category,
        owner: override?.owner ?? bill.owner,
      };
      if (!Number.isFinite(movement.amount) || movement.amount <= 0) return [];
      return [{
        id: `period:${period.date}:${bill.id}`,
        key,
        type: "expense",
        kind: "planned" as const,
        date: movement.date,
        amount: movement.amount,
        owner: movement.owner,
        title: movement.description,
        category: movement.category,
        toggleKey: `period:${period.date}:${bill.id}`,
        movement,
      }];
    });
    return [...incomes, ...expenses];
  });
  const manualEntries: FinancialEntry[] = movements.flatMap((movement) => {
    const key = `movement:${movement.id}`;
    const resolved = { ...movement, ...overrides[key], id: movement.id };
    if (resolved.deleted || !Number.isFinite(resolved.amount) || resolved.amount <= 0) return [];
    return [{
      id: resolved.id,
      key,
      type: resolved.type,
      kind: "manual" as const,
      date: resolved.date,
      amount: resolved.amount,
      owner: resolved.owner,
      title: resolved.description || (resolved.type === "income" ? "Receita sem descrição" : "Despesa sem descrição"),
      category: resolved.category,
      toggleKey: key,
      movement: resolved,
    }];
  });
  return [...plannedEntries, ...manualEntries].sort(
    (left, right) => left.date.localeCompare(right.date) || left.key.localeCompare(right.key),
  );
}

export function findPlannedIncomeMatches(movement: Movement, entries: FinancialEntry[]) {
  if (movement.type !== "income") return [];
  const amount = amountInCents(movement.amount);
  return entries.filter((entry) =>
    entry.kind === "planned" &&
    entry.type === "income" &&
    entry.date === movement.date &&
    amountInCents(entry.amount) === amount,
  );
}

export function calculateFinanceLedger(
  entries: FinancialEntry[],
  contributions: GoalContribution[] = [],
  asOfDate?: string,
): Map<string, MonthlyFinanceBalance> {
  type Lot = { id: string; date: string; owner: FinanceOwner; amount: number; remaining: number };
  type Obligation = { id: string; date: string; owner: FinanceOwner; amount: number; remaining: number };
  const incomeByMonth = new Map<string, Record<FinanceOwner, number>>();
  const receivedByMonth = new Map<string, Record<FinanceOwner, number>>();
  const expenseByMonth = new Map<string, Record<FinanceOwner, number>>();
  const incomeLots: Lot[] = [];
  const obligations: Obligation[] = [];
  const sourceOwners = new Map<string, FinanceOwner>();

  entries.forEach((entry) => {
    const month = entry.date.slice(0, 7);
    const totals = entry.type === "income" ? incomeByMonth : expenseByMonth;
    const monthly = totals.get(month) ?? { "Você": 0, "Esposa": 0 };
    const split = splitOwnerAmount(entry.amount, entry.owner);
    owners.forEach((owner) => { monthly[owner] += split[owner]; });
    totals.set(month, monthly);
    if (entry.type === "income") {
      owners.forEach((owner) => {
        if (split[owner] <= 0) return;
        incomeLots.push({ id: `${entry.id}:${owner}`, date: entry.date, owner, amount: split[owner], remaining: split[owner] });
        sourceOwners.set(entry.id, owner);
      });
      if (!asOfDate || entry.date <= asOfDate) {
        const received = receivedByMonth.get(month) ?? { "Você": 0, "Esposa": 0 };
        owners.forEach((owner) => { received[owner] += split[owner]; });
        receivedByMonth.set(month, received);
      }
    } else {
      owners.forEach((owner) => {
        if (split[owner] <= 0) return;
        obligations.push({ id: `${entry.id}:${owner}`, date: entry.date, owner, amount: split[owner], remaining: split[owner] });
      });
    }
  });

  incomeLots.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  obligations.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  incomeLots.forEach((lot) => {
    const candidates = obligations
      .filter((obligation) => obligation.owner === lot.owner && obligation.date >= lot.date && obligation.remaining > 0)
      .sort((left, right) => {
        const leftPriority = left.date.slice(0, 7) === lot.date.slice(0, 7) ? 0 : 1;
        const rightPriority = right.date.slice(0, 7) === lot.date.slice(0, 7) ? 0 : 1;
        return leftPriority - rightPriority || left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
      });
    candidates.forEach((obligation) => {
      const allocated = Math.min(lot.remaining, obligation.remaining);
      lot.remaining -= allocated;
      obligation.remaining -= allocated;
    });
  });

  const contributionByMonth = new Map<string, Record<FinanceOwner, number>>();
  const unassignedContributionsByMonth = new Map<string, number>();
  contributions.forEach((contribution) => {
    const month = (contribution.incomeSourceDate ?? contribution.date).slice(0, 7);
    const owner = contribution.incomeSourceOwner ?? sourceOwners.get(contribution.incomeSourceId ?? "");
    if (!owner) {
      unassignedContributionsByMonth.set(
        month,
        (unassignedContributionsByMonth.get(month) ?? 0) + contribution.amount,
      );
      return;
    }
    const monthly = contributionByMonth.get(month) ?? { "Você": 0, "Esposa": 0 };
    const split = splitOwnerAmount(contribution.amount, owner);
    owners.forEach((person) => { monthly[person] += split[person]; });
    contributionByMonth.set(month, monthly);
  });

  const months = new Set([
    ...incomeByMonth.keys(),
    ...receivedByMonth.keys(),
    ...expenseByMonth.keys(),
    ...contributionByMonth.keys(),
    ...unassignedContributionsByMonth.keys(),
  ]);
  const result = new Map<string, MonthlyFinanceBalance>();
  months.forEach((month) => {
    const income = incomeByMonth.get(month) ?? { "Você": 0, "Esposa": 0 };
    const received = receivedByMonth.get(month) ?? { "Você": 0, "Esposa": 0 };
    const expenses = expenseByMonth.get(month) ?? { "Você": 0, "Esposa": 0 };
    const goalContributions = contributionByMonth.get(month) ?? { "Você": 0, "Esposa": 0 };
    const available = { "Você": 0, "Esposa": 0 };
    incomeLots.filter((lot) => lot.date.startsWith(month) && (!asOfDate || lot.date <= asOfDate))
      .forEach((lot) => { available[lot.owner] += lot.remaining; });
    let unassigned = unassignedContributionsByMonth.get(month) ?? 0;
    const legacyCapacity = { ...available };
    const legacyOwnerOrder = owners.slice().sort((left, right) => {
      const leftDate = incomeLots.find((lot) => lot.owner === left && lot.date.startsWith(month))?.date ?? "9999-12-31";
      const rightDate = incomeLots.find((lot) => lot.owner === right && lot.date.startsWith(month))?.date ?? "9999-12-31";
      return leftDate.localeCompare(rightDate);
    });
    legacyOwnerOrder.forEach((owner) => {
      const reserved = Math.min(unassigned, legacyCapacity[owner]);
      goalContributions[owner] += reserved;
      legacyCapacity[owner] -= reserved;
      unassigned -= reserved;
    });
    const unfunded = { "Você": 0, "Esposa": 0 };
    obligations.filter((item) => item.date.startsWith(month))
      .forEach((item) => { unfunded[item.owner] += item.remaining; });
    owners.forEach((owner) => { available[owner] = Math.max(0, available[owner] - goalContributions[owner]); });
    const incomeTotal = income["Você"] + income.Esposa;
    const expenseTotal = expenses["Você"] + expenses.Esposa;
    const goalContributionsTotal = goalContributions["Você"] + goalContributions.Esposa;
    const balance = available["Você"] + available.Esposa - unfunded["Você"] - unfunded.Esposa;
    result.set(month, {
      incomeByOwner: income,
      receivedByOwner: received,
      expenseByOwner: expenses,
      goalContributionsByOwner: goalContributions,
      availableByOwner: available,
      unfundedExpensesByOwner: unfunded,
      incomeTotal,
      expenseTotal,
      goalContributionsTotal,
      balance,
    });
  });
  return result;
}

export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const cgiPaymentAnchor = new Date("2026-09-03T12:00:00");
const dayMilliseconds = 86400000;

export const cgiPaymentDate = (date: Date | string) => {
  const target = typeof date === "string" ? new Date(`${date}T12:00:00`) : new Date(date);
  const elapsedDays = Math.floor((target.getTime() - cgiPaymentAnchor.getTime()) / dayMilliseconds);
  const paymentDate = new Date(cgiPaymentAnchor);
  paymentDate.setDate(paymentDate.getDate() + Math.floor(elapsedDays / 14) * 14);
  return paymentDate;
};

export const cgiPaymentLabel = (date: Date | string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(cgiPaymentDate(date));

export const dueDate = (periodDate: string, due: string) => {
  const [day, month] = due.split(" ");
  const year = new Date(`${periodDate}T00:00:00`).getFullYear();
  return new Date(year, monthIndexes[month], Number(day));
};

export const reservedAmount = (bill: Bill) => bill.owner === "Compartilhado" ? bill.amount / 2 : bill.amount;

export const currentMonthPeriods = (date = new Date()) => financePeriods.filter((period) => {
  const periodDate = new Date(`${period.date}T12:00:00`);
  return periodDate.getFullYear() === date.getFullYear() && periodDate.getMonth() === date.getMonth();
});

const nextCgiPayment = () => {
  const today = new Date();
  const currentPayment = cgiPaymentDate(today);
  const nextPayment = currentPayment >= today ? currentPayment : new Date(currentPayment.getTime() + 14 * dayMilliseconds);
  return { date: dateKey(nextPayment), label: cgiPaymentLabel(nextPayment) };
};

export const nextPaymentPeriod = financePeriods.find((period) => new Date(`${period.date}T12:00:00`) >= new Date()) ?? nextCgiPayment();
export const payments = financePeriods.map((period, index) => ({ date: period.label, label: index === 0 ? "Pagamento recebido" : "Próximo pagamento", amount: totalIncome(period), status: index === 0 ? "upcoming" : "next" }));
