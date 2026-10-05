import { z } from "zod";
import { resolveFinancialEntries, type FinanceOverrides } from "./finance";
import type { BillOccurrence, BillTemplate, EditablePayPeriod, Goal, Movement } from "../types/finance";

const id = z.string().min(1).max(500).refine((value) => !value.includes("/") && ![".", "..", "__proto__", "constructor", "prototype"].includes(value), "ID inválido");
const text = z.string().max(2000);
const money = z.number().finite().nonnegative().max(1e12);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Data inválida");
const owner = z.enum(["Você", "Esposa", "Compartilhado"]);
const movement = z.object({ id, amount: money.positive(), date, type: z.enum(["income", "expense"]), description: text, category: text, owner,
  recurrence: z.enum(["none", "biweekly", "monthly", "yearly"]).optional(), recurrenceCount: z.number().int().min(1).max(120).optional(), recurrenceId: id.optional(), recurrenceIndex: z.number().int().min(0).max(119).optional() }).strict();
const contribution = z.object({ id, amount: money.positive(), date, incomeSourceId: id.optional(), incomeSourceLabel: text.optional(), incomeSourceDate: date.optional(), incomeSourceOwner: owner.optional() }).strict();
const goal = z.object({ id, name: text, target: money.positive(), saved: money, contributions: z.array(contribution).max(10000) }).strict();
const receipt = z.object({ id, actualAmount: money.positive(), receivedAt: date }).strict();
const period = z.object({ date, label: text, income: z.object({ ketlin: money, leandro: money, extras: money, leiaUniversitySavings: money }).strict(), receivedIncome: z.object({ leandro: z.array(receipt), ketlin: z.array(receipt) }).partial().strict().optional() }).strict();
const bill = z.object({ id, name: text, owner, amount: money.positive(), category: text, dueDay: z.number().int().min(1).max(31), recurrence: z.enum(["once", "biweekly", "monthly", "yearly"]), startDate: date, active: z.boolean() }).strict();
const occurrence = z.object({ id, billId: id, periodDate: date, dueDate: date, name: text, owner, amount: money.positive(), category: text, status: z.enum(["planned", "paid"]), paidAt: date.optional(), paidAmount: money.optional(), history: z.array(z.object({ id, date, amount: money, action: z.enum(["paid", "reopened"]) }).strict()) }).strict();
const override = movement.partial().extend({ deleted: z.boolean().optional(), replacedByMovementId: id.optional() }).strict();
const schema = z.object({ format: z.literal("financevault"), version: z.literal(1), currency: z.literal("CAD"), exportedAt: z.iso.datetime(), ownerUid: id,
  data: z.object({ movements: z.array(movement), goals: z.array(goal), periods: z.array(period), bills: z.array(bill), occurrences: z.array(occurrence),
    settings: z.object({ billPaidState: z.record(id, z.boolean()), entryOverrides: z.record(id, override), incomeAllocations: z.record(id, money) }).strict(),
  }).strict(),
}).strict();
export type FinanceData = {
  movements: Movement[]; goals: Goal[]; periods: EditablePayPeriod[]; bills: BillTemplate[]; occurrences: BillOccurrence[];
  settings: { billPaidState: Record<string, boolean>; entryOverrides: FinanceOverrides; incomeAllocations: Record<string, number> };
};
export type FinanceBackup = { format: "financevault"; version: 1; currency: "CAD"; exportedAt: string; ownerUid: string; data: FinanceData };
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function emptyFinanceData(): FinanceData {
  return { movements: [], goals: [], periods: [], bills: [], occurrences: [], settings: { billPaidState: {}, entryOverrides: {}, incomeAllocations: {} } };
}

export function validateBackup(value: unknown): FinanceBackup {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("Arquivo inválido: confira formato, versão, moeda, campos e datas.");
  const backup = result.data;
  const unique = (keys: string[]) => { if (new Set(keys).size !== keys.length) throw new Error("O arquivo contém IDs duplicados."); };
  for (const records of [backup.data.movements, backup.data.goals, backup.data.bills, backup.data.occurrences]) unique(records.map((item) => item.id));
  unique(backup.data.periods.map((item) => item.date));
  unique(backup.data.goals.flatMap((item) => item.contributions.map((entry) => entry.id)));
  const billIds = new Set(backup.data.bills.map((item) => item.id));
  const movementIds = new Set(backup.data.movements.map((item) => item.id));
  if (backup.data.occurrences.some((item) => !billIds.has(item.billId))) throw new Error("Há vencimentos sem conta recorrente correspondente.");
  if (Object.values(backup.data.settings.entryOverrides).some((item) => item.replacedByMovementId && !movementIds.has(item.replacedByMovementId))) throw new Error("Há substituições de receita sem lançamento correspondente.");
  for (const item of backup.data.goals) {
    if (item.contributions.length && Math.abs(item.saved - item.contributions.reduce((sum, entry) => sum + entry.amount, 0)) > 0.005) throw new Error("O saldo de um objetivo não corresponde aos aportes.");
  }
  for (const item of backup.data.periods) {
    for (const person of ["leandro", "ketlin"] as const) {
      const receipts = item.receivedIncome?.[person] ?? [];
      unique(receipts.map((entry) => entry.id));
      if (receipts.reduce((sum, entry) => sum + entry.actualAmount, 0) > item.income[person] + 0.005) throw new Error("Recebimentos excedem a previsão do período.");
    }
  }
  const required = allocationTotals(backup.data.goals);
  if (Object.entries(required).some(([key, amount]) => (backup.data.settings.incomeAllocations[key] ?? 0) + 0.005 < amount)) throw new Error("Reservas insuficientes para os aportes do arquivo.");
  return backup;
}
export function allocationTotals(goals: Goal[]) {
  const totals: Record<string, number> = {};
  goals.flatMap((item) => item.contributions).forEach((item) => { if (item.incomeSourceId) totals[item.incomeSourceId] = (totals[item.incomeSourceId] ?? 0) + item.amount; });
  return totals;
}
export function parseBackup(content: string) {
  if (new Blob([content]).size > MAX_BACKUP_BYTES) throw new Error("O arquivo ultrapassa 10 MB.");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Selecione um arquivo JSON válido."); }
  return validateBackup(parsed);
}
export function createBackup(ownerUid: string, data: FinanceData): FinanceBackup {
  return validateBackup(JSON.parse(JSON.stringify({ format: "financevault", version: 1, currency: "CAD", exportedAt: new Date().toISOString(), ownerUid, data })));
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function previewRestore(current: FinanceData, backup: FinanceBackup) {
  let added = 0; let identical = 0;
  const conflicts: string[] = [];
  const merge = <T,>(label: string, existing: T[], incoming: T[], key: (item: T) => string): T[] => {
    const map = new Map(existing.map((item) => [key(item), item]));
    incoming.forEach((item) => {
      const recordId = key(item);
      if (!map.has(recordId)) { map.set(recordId, item); added++; }
      else if (canonical(map.get(recordId)) === canonical(item)) identical++;
      else conflicts.push(`${label}: ${recordId}`);
    });
    return [...map.values()];
  };
  const mergeMap = <T,>(label: string, existing: Record<string, T>, incoming: Record<string, T>) => Object.fromEntries(merge(label, Object.entries(existing), Object.entries(incoming), ([key]) => key));
  const data: FinanceData = {
    movements: merge("Lançamento", current.movements, backup.data.movements, (item) => item.id),
    goals: merge("Objetivo", current.goals, backup.data.goals, (item) => item.id),
    periods: merge("Período", current.periods, backup.data.periods, (item) => item.date),
    bills: merge("Conta", current.bills, backup.data.bills, (item) => item.id),
    occurrences: merge("Vencimento", current.occurrences, backup.data.occurrences, (item) => item.id),
    settings: {
      billPaidState: mergeMap("Pagamento", current.settings.billPaidState, backup.data.settings.billPaidState),
      entryOverrides: mergeMap("Ajuste", current.settings.entryOverrides, backup.data.settings.entryOverrides),
      incomeAllocations: mergeMap("Reserva", current.settings.incomeAllocations, backup.data.settings.incomeAllocations),
    },
  };
  const reserved = allocationTotals(data.goals);
  Object.entries(reserved).forEach(([key, amount]) => {
    if ((data.settings.incomeAllocations[key] ?? 0) + 0.005 < amount) conflicts.push(`Reserva insuficiente para objetivos combinados: ${key}`);
  });
  const contributionIds = data.goals.flatMap((item) => item.contributions.map((entry) => entry.id));
  if (new Set(contributionIds).size !== contributionIds.length) conflicts.push("O mesmo aporte aparece em objetivos diferentes.");
  return { added, identical, conflicts, data };
}
export function movementsCsv(data: FinanceData) {
  const cell = (value: string | number) => {
    const raw = String(value);
    const safe = /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const entries = resolveFinancialEntries(data.movements, data.settings.entryOverrides, []);
  return "\uFEFF" + [["ID", "Data", "Tipo", "Descrição", "Categoria", "Responsável", "Valor", "Moeda"], ...entries.map((item) => [item.id, item.date, item.type, item.title, item.category, item.owner, item.amount.toFixed(2), "CAD"])].map((row) => row.map(cell).join(";")).join("\r\n");
}
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
