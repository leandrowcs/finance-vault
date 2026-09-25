import type { SeedBill } from "../data/financeSeed";

export type Owner = "Você" | "Esposa" | "Compartilhado";
export type Bill = SeedBill;
export type Recurrence = "none" | "biweekly" | "monthly" | "yearly";

export type Movement = {
  id: string;
  amount: number;
  date: string;
  type: "income" | "expense";
  description: string;
  category: string;
  owner: Owner;
  recurrence?: Recurrence;
  recurrenceCount?: number;
  recurrenceId?: string;
  recurrenceIndex?: number;
};

export type CalendarItem = {
  type: "income" | "bill";
  title: string;
  detail: string;
  amount: number;
};
