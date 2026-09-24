import type { SeedBill } from "../data/financeSeed";

export type Owner = "Você" | "Esposa" | "Compartilhado";
export type Bill = SeedBill;

export type Movement = {
  id: string;
  amount: number;
  date: string;
  type: "income" | "expense";
  description: string;
  category: string;
  owner: Owner;
};

export type CalendarItem = {
  type: "income" | "bill";
  title: string;
  detail: string;
  amount: number;
};
