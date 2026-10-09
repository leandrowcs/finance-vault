import { financePeriods, totalIncome, type SeedPayPeriod } from "../data/financeSeed";
import type { Bill, BillOccurrence, BillPaymentEvent, BillTemplate, EditablePayPeriod, GoalContribution, Movement, Owner } from "../types/finance";

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
  received: boolean;
  paid: boolean;
  periodDate?: string;
  incomeRecipient?: "leandro" | "ketlin";
  paidAmount?: number;
  paymentHistory?: BillPaymentEvent[];
  occurrenceId?: string;
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
export type PlanningMigration = {
  periods: EditablePayPeriod[];
  bills: BillTemplate[];
  occurrences: BillOccurrence[];
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
      if (override?.deleted && !override.replacedByMovementId) return [];
      const receipts = period.receivedIncome?.[person] ?? [];
      const plannedAmount = override?.amount ?? amount;
      const title = override?.description ?? "Pagamento planejado";
      const category = override?.category ?? "Salário";
      const recipient = override?.owner ?? owner;
      const actualEntries: FinancialEntry[] = receipts.flatMap((receipt) => {
        if (!Number.isFinite(receipt.actualAmount) || receipt.actualAmount <= 0) return [];
        const movement: Movement = {
          id: `${key}:receipt:${receipt.id}`,
          type: "income",
          amount: receipt.actualAmount,
          date: receipt.receivedAt,
          description: `${title} · recebido`,
          category,
          owner: recipient,
        };
        return [{
          id: movement.id,
          key: movement.id,
          type: "income",
          kind: "planned" as const,
          date: movement.date,
          amount: movement.amount,
          owner: movement.owner,
          title: movement.description,
          category: movement.category,
          toggleKey: movement.id,
          received: true,
          paid: false,
          periodDate: period.date,
          incomeRecipient: person,
          movement,
        }];
      });
      const remainingAmount = Math.max(0, plannedAmount - receipts.reduce((total, receipt) => total + receipt.actualAmount, 0));
      const plannedEntry: FinancialEntry[] = !override?.deleted && remainingAmount > 0 ? [{
        id: key,
        key,
        type: "income",
        kind: "planned",
        date: override?.date ?? period.date,
        amount: remainingAmount,
        owner: recipient,
        title,
        category,
        toggleKey: key,
        received: false,
        paid: false,
        periodDate: period.date,
        incomeRecipient: person,
        movement: {
          id: key,
          type: "income",
          amount: remainingAmount,
          date: override?.date ?? period.date,
          description: title,
          category,
          owner: recipient,
        },
      }] : [];
      return [...actualEntries, ...plannedEntry];
    });
    const expenses: FinancialEntry[] = period.bills.flatMap((bill) => {
      const key = `period-expense:${period.date}:${bill.id}`;
      const override = overrides[key];
      if (override?.deleted) return [];
      const defaultDate = bill.dueDate ?? dateKey(dueDate(period.date, bill.due));
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
        received: false,
        paid: bill.paid,
        paidAmount: bill.paidAmount ?? (bill.paid ? movement.amount : 0),
        paymentHistory: bill.occurrenceHistory ?? [],
        occurrenceId: billOccurrenceId(bill.id, defaultDate),
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
      received: resolved.type === "income",
      paid: false,
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
    !entry.received &&
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
      if (!entry.received) return;
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
      .filter((obligation) =>
        obligation.owner === lot.owner &&
        obligation.date >= lot.date &&
        (!asOfDate || obligation.date <= asOfDate) &&
        obligation.remaining > 0,
      )
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

export function billOccurrenceId(billId: string, dueDate: string) {
  return `${billId}__${dueDate}`;
}

function dateAtDay(year: number, month: number, day: number) {
  const finalDay = new Date(year, month + 1, 0).getDate();
  return dateKey(new Date(year, month, Math.min(day, finalDay), 12));
}

export function generateBillOccurrences(
  bill: BillTemplate,
  horizonEnd = dateKey(new Date(new Date(`${bill.startDate}T12:00:00`).setFullYear(new Date(`${bill.startDate}T12:00:00`).getFullYear() + 1))),
): BillOccurrence[] {
  if (!bill.active) return [];
  const firstDate = new Date(`${bill.startDate}T12:00:00`);
  const endDate = new Date(`${horizonEnd}T12:00:00`);
  const dates: string[] = [];
  if (bill.recurrence === "once") {
    dates.push(bill.startDate);
  } else if (bill.recurrence === "biweekly") {
    const current = new Date(firstDate);
    while (current <= endDate) {
      dates.push(dateKey(current));
      current.setDate(current.getDate() + 14);
    }
  } else if (bill.recurrence === "monthly") {
    const currentMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1, 12);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1, 12);
    while (currentMonth <= endMonth) {
      const occurrenceDate = dateAtDay(currentMonth.getFullYear(), currentMonth.getMonth(), bill.dueDay);
      if (occurrenceDate >= bill.startDate && occurrenceDate <= horizonEnd) dates.push(occurrenceDate);
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
  } else {
    for (let year = firstDate.getFullYear(); year <= endDate.getFullYear(); year += 1) {
      const occurrenceDate = dateAtDay(year, firstDate.getMonth(), bill.dueDay);
      if (occurrenceDate >= bill.startDate && occurrenceDate <= horizonEnd) dates.push(occurrenceDate);
    }
  }
  return dates.map((date): BillOccurrence => ({
    id: billOccurrenceId(bill.id, date),
    billId: bill.id,
    periodDate: date,
    dueDate: date,
    name: bill.name,
    owner: bill.owner,
    amount: bill.amount,
    category: bill.category,
    status: "planned",
    paidAmount: 0,
    history: [],
  }));
}

export function toggleBillOccurrencePayment(occurrence: BillOccurrence, eventId: string, date: string): BillOccurrence {
  const wasPaid = occurrence.status === "paid";
  const event: BillPaymentEvent = {
    id: eventId,
    date,
    amount: wasPaid ? (occurrence.paidAmount ?? occurrence.amount) : occurrence.amount,
    action: wasPaid ? "reopened" : "paid",
  };
  return {
    ...occurrence,
    status: wasPaid ? "planned" : "paid",
    paidAmount: wasPaid ? 0 : occurrence.amount,
    paidAt: wasPaid ? undefined : date,
    history: [...occurrence.history, event],
  };
}

function billRecurrence(dates: string[]): BillTemplate["recurrence"] {
  if (dates.length < 2) return "once";
  const gaps = dates.slice(1).map((date, index) =>
    Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${dates[index]}T12:00:00`).getTime()) / dayMilliseconds),
  );
  if (gaps.every((gap) => gap >= 13 && gap <= 15)) return "biweekly";
  if (gaps.every((gap) => gap >= 28 && gap <= 31)) return "monthly";
  if (gaps.every((gap) => gap >= 364 && gap <= 366)) return "yearly";
  return "once";
}

export function buildSeedPlanningMigration(
  periods: SeedPayPeriod[] = financePeriods,
  paidState: Record<string, boolean> = {},
  migrationDate = dateKey(new Date()),
): PlanningMigration {
  const occurrences = periods.flatMap((period) => period.bills.map((bill): BillOccurrence => {
    const due = bill.dueDate ?? dateKey(dueDate(period.date, bill.due));
    const id = billOccurrenceId(bill.id, due);
    const isPaid = paidState[`period:${period.date}:${bill.id}`] ?? bill.paid;
    return {
      id,
      billId: bill.id,
      periodDate: period.date,
      dueDate: due,
      name: bill.name,
      owner: bill.owner,
      amount: bill.amount,
      category: bill.category,
      status: isPaid ? "paid" : "planned",
      paidAmount: isPaid ? bill.amount : 0,
      history: [],
    };
  }));
  const occurrencesByBill = new Map<string, BillOccurrence[]>();
  occurrences.forEach((occurrence) => occurrencesByBill.set(
    occurrence.billId,
    [...(occurrencesByBill.get(occurrence.billId) ?? []), occurrence],
  ));
  const bills = [...occurrencesByBill.entries()].map(([id, entries]): BillTemplate => {
    const first = [...entries].sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
    return {
      id,
      name: first.name,
      owner: first.owner,
      amount: first.amount,
      category: first.category,
      dueDay: Number(first.dueDate.slice(8, 10)),
      recurrence: billRecurrence(entries.map((entry) => entry.dueDate).sort()),
      startDate: first.dueDate,
      active: true,
    };
  });
  const occurrenceById = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
  bills.forEach((bill) => {
    generateBillOccurrences(bill, dateKey(new Date(new Date(`${migrationDate}T12:00:00`).setFullYear(new Date(`${migrationDate}T12:00:00`).getFullYear() + 1))))
      .forEach((occurrence) => {
        if (!occurrenceById.has(occurrence.id)) occurrenceById.set(occurrence.id, occurrence);
      });
  });
  const editablePeriods = periods.map(({ bills: _bills, ...period }): EditablePayPeriod => ({
    ...period,
    receivedIncome: period.receivedIncome ?? {
      ...(period.date <= migrationDate && period.income.leandro > 0
        ? { leandro: [{ id: `seed-receipt:${period.date}:leandro`, actualAmount: period.income.leandro, receivedAt: period.date }] }
        : {}),
      ...(period.date <= migrationDate && period.income.ketlin > 0
        ? { ketlin: [{ id: `seed-receipt:${period.date}:ketlin`, actualAmount: period.income.ketlin, receivedAt: period.date }] }
        : {}),
    },
  }));
  return { periods: editablePeriods, bills, occurrences: [...occurrenceById.values()] };
}

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

export function nextPaymentFromPeriods(periods: readonly SeedPayPeriod[], today = new Date()) {
  const todayKey = dateKey(today);
  const next = [...periods]
    .filter((period) => period.date >= todayKey && period.income.leandro + period.income.ketlin + period.income.extras > 0)
    .sort((left, right) => left.date.localeCompare(right.date))[0];
  return next ? { date: next.date, label: next.label } : nextCgiPayment();
}

export const nextPaymentPeriod = nextPaymentFromPeriods(financePeriods);
export const payments = financePeriods.map((period, index) => ({ date: period.label, label: index === 0 ? "Pagamento recebido" : "Próximo pagamento", amount: totalIncome(period), status: index === 0 ? "upcoming" : "next" }));
