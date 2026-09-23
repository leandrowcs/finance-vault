export type SeedOwner = "Você" | "Esposa" | "Compartilhado";

export type SeedBill = {
  id: string;
  name: string;
  owner: SeedOwner;
  amount: number;
  due: string;
  category: string;
  paid: boolean;
};

export type SeedPayPeriod = {
  date: string;
  label: string;
  income: {
    ketlin: number;
    leandro: number;
    extras: number;
    leiaUniversitySavings: number;
  };
  bills: SeedBill[];
};

export const financePeriods: SeedPayPeriod[] = [
  {
    date: "2026-09-17",
    label: "17 de setembro",
    income: { ketlin: 2059.89, leandro: 2692.62, extras: 0, leiaUniversitySavings: 0 },
    bills: [
      { id: "home", name: "Hipoteca da casa", owner: "Compartilhado", amount: 1135.25, due: "17 set", category: "Casa", paid: false },
      { id: "home-extra", name: "Extra da hipoteca", owner: "Compartilhado", amount: 200, due: "17 set", category: "Casa", paid: false },
      { id: "car-loan", name: "Financiamento do carro", owner: "Compartilhado", amount: 396, due: "17 set", category: "Transporte", paid: false },
      { id: "phone", name: "Telefone", owner: "Você", amount: 104.72, due: "17 set", category: "Casa", paid: false },
      { id: "internet", name: "Internet", owner: "Você", amount: 72.43, due: "24 set", category: "Casa", paid: false },
      { id: "car-insurance", name: "Seguro do carro", owner: "Esposa", amount: 116.39, due: "28 set", category: "Transporte", paid: false },
      { id: "home-insurance", name: "Seguro da casa", owner: "Esposa", amount: 93.13, due: "28 set", category: "Casa", paid: false },
      { id: "la-tribune", name: "La Tribune", owner: "Você", amount: 145.38, due: "17 set", category: "Assinaturas", paid: false },
      { id: "leandro-card", name: "Cartão Leandro", owner: "Compartilhado", amount: 1000, due: "28 set", category: "Cartões", paid: false },
    ],
  },
  {
    date: "2026-10-01",
    label: "1 de outubro",
    income: { ketlin: 2059.89, leandro: 2690, extras: 0, leiaUniversitySavings: 101.75 },
    bills: [
      { id: "home", name: "Hipoteca da casa", owner: "Compartilhado", amount: 1135.25, due: "01 out", category: "Casa", paid: false },
      { id: "home-extra", name: "Extra da hipoteca", owner: "Compartilhado", amount: 200, due: "01 out", category: "Casa", paid: false },
      { id: "car-loan", name: "Financiamento do carro", owner: "Compartilhado", amount: 396, due: "01 out", category: "Transporte", paid: false },
      { id: "cat-plan", name: "Plano dos gatos", owner: "Você", amount: 96.82, due: "01 out", category: "Pets", paid: false },
      { id: "cat-supplies", name: "Ração e areia dos gatos", owner: "Você", amount: 150, due: "01 out", category: "Pets", paid: false },
      { id: "spotify", name: "Spotify", owner: "Você", amount: 20.68, due: "10 out", category: "Assinaturas", paid: false },
      { id: "netflix", name: "Netflix", owner: "Você", amount: 17, due: "13 out", category: "Assinaturas", paid: false },
      { id: "daycare", name: "Garderie da Leia", owner: "Compartilhado", amount: 241.25, due: "10 out", category: "Família", paid: false },
      { id: "ikea", name: "Parcelamento IKEA", owner: "Você", amount: 94.87, due: "05 out", category: "Casa", paid: false },
    ],
  },
];

export const activePeriod = financePeriods[1];

export function totalIncome(period: SeedPayPeriod): number {
  return period.income.ketlin + period.income.leandro + period.income.extras;
}

export function totalBills(bills: SeedBill[]): number {
  return bills.reduce((total, bill) => total + bill.amount, 0);
}

export function paidByOwner(bills: SeedBill[], owner: Exclude<SeedOwner, "Compartilhado">): number {
  return bills.reduce(
    (total, bill) =>
      total + (bill.owner === "Compartilhado" ? bill.amount / 2 : bill.owner === owner ? bill.amount : 0),
    0,
  );
}
