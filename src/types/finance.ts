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

export type GoalContribution = {
  id: string;
  amount: number;
  date: string;
  incomeSourceId?: string;
  incomeSourceLabel?: string;
  incomeSourceDate?: string;
  incomeSourceOwner?: Movement["owner"];
};

export type GoalIncomeSource = {
  id: string;
  label: string;
  amount: number;
  date: string;
  owner: Movement["owner"];
  legacyReserved?: number;
};

export type Goal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  contributions: GoalContribution[];
};

export type MemberAccessLevel = "read" | "edit" | "delete" | "owner";

export type HouseholdMember = {
  uid: string;
  email: string;
  displayName: string;
  accessLevel: MemberAccessLevel;
};

export type HouseholdInvite = {
  id: string;
  email: string;
  accessLevel: Exclude<MemberAccessLevel, "owner">;
  status: "pending" | "accepted";
};

export type CalendarItem = {
  type: "income" | "bill";
  title: string;
  detail: string;
  amount: number;
};
