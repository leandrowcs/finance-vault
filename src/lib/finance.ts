import { financePeriods, totalIncome } from "../data/financeSeed";
import type { Bill } from "../types/finance";

export const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const monthLabels = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthIndexes: Record<string, number> = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

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
