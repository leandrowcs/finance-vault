import type { SeedBill } from "../data/financeSeed";

export type Owner = "Você" | "Esposa" | "Compartilhado";
export type Bill = SeedBill;

export type CalendarItem = {
  type: "income" | "bill";
  title: string;
  detail: string;
  amount: number;
};
