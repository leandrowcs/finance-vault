import { ArrowUpRight, CalendarDays, ChevronRight, Circle, CircleCheck, ReceiptText, Users } from "lucide-react";
import { FloatingActionButton } from "../components/FloatingActionButton";
import { currency, currentMonthPeriods, dueDate, monthLabels } from "../lib/finance";
import type { Bill, Movement } from "../types/finance";

type Person = "Leandro" | "Ketlin";
type ExpenseEntry = { bill: Bill; incomeLabel: string; expenseDate: Date };
type DashboardPageProps = {
  bills: Bill[];
  movements: Movement[];
  greeting: string;
  openedDateLabel: string;
  daysUntilNextPayment: number;
  onToggleBill: (id: string) => void;
  onOpenCalendar: () => void;
  onOpenMovement: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const people: Person[] = ["Leandro", "Ketlin"];

function monthLabel(date: Date) {
  return `${monthLabels[date.getMonth()]} ${date.getFullYear()}`;
}

function belongsTo(owner: Bill["owner"], person: Person) {
  return owner === "Compartilhado" || (person === "Leandro" ? owner === "Você" : owner === "Esposa");
}

function allocatedAmount(amount: number, owner: Bill["owner"]) {
  return owner === "Compartilhado" ? amount / 2 : amount;
}

function movementBill(movement: Movement): Bill {
  return { id: movement.id, name: movement.description, owner: movement.owner, amount: movement.amount, due: movement.date, category: movement.category, paid: false };
}

export function DashboardPage({ bills, movements, greeting, openedDateLabel, daysUntilNextPayment, onToggleBill, onOpenCalendar, onOpenMovement }: DashboardPageProps) {
  const periods = currentMonthPeriods();
  const monthDate = periods[0] ? new Date(`${periods[0].date}T12:00:00`) : new Date();
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
  const monthMovements = movements.filter((movement) => movement.date.startsWith(monthKey));
  const incomeMovements = monthMovements.filter((movement) => movement.type === "income");
  const expenseMovements = monthMovements.filter((movement) => movement.type === "expense");
  const seedBills = periods.flatMap((period) => period.bills.map((bill) => bills.find((currentBill) => currentBill.id === bill.id) ?? bill));
  const monthBills = [...seedBills, ...expenseMovements.map(movementBill)];
  const incomeTotal = periods.reduce((total, period) => total + period.income.leandro + period.income.ketlin, 0) + incomeMovements.reduce((total, movement) => total + movement.amount, 0);
  const expenseTotal = monthBills.reduce((total, bill) => total + bill.amount, 0);
  const incomeByPerson: Record<Person, number> = {
    Leandro: periods.reduce((total, period) => total + period.income.leandro, 0),
    Ketlin: periods.reduce((total, period) => total + period.income.ketlin, 0),
  };
  for (const movement of incomeMovements) {
    if (belongsTo(movement.owner, "Leandro")) incomeByPerson.Leandro += allocatedAmount(movement.amount, movement.owner);
    if (belongsTo(movement.owner, "Ketlin")) incomeByPerson.Ketlin += allocatedAmount(movement.amount, movement.owner);
  }
  const billsByPerson = people.map((person) => {
    const seeded: ExpenseEntry[] = periods.flatMap((period) => period.bills.filter((bill) => belongsTo(bill.owner, person)).map((bill) => ({ bill: bills.find((currentBill) => currentBill.id === bill.id) ?? bill, incomeLabel: period.label, expenseDate: dueDate(period.date, bill.due) })));
    const added: ExpenseEntry[] = expenseMovements.filter((movement) => belongsTo(movement.owner, person)).map((movement) => ({ bill: movementBill(movement), incomeLabel: "Receita registrada", expenseDate: new Date(`${movement.date}T12:00:00`) }));
    return { person, bills: [...seeded, ...added] };
  });
  const personTotals = billsByPerson.reduce<Record<Person, number>>((totals, group) => {
    totals[group.person] = group.bills.reduce((total, item) => total + allocatedAmount(item.bill.amount, item.bill.owner), 0);
    return totals;
  }, { Leandro: 0, Ketlin: 0 });
  const hasIncome = periods.length > 0 || incomeMovements.length > 0;
  const hasExpenses = monthBills.length > 0;

  return <div className="page-wrap" id="dashboard">
    <div className="page-heading"><div><p className="eyebrow">{openedDateLabel.toUpperCase()}</p><h1>{greeting}, Leandro.</h1><p className="heading-copy">Visão completa das receitas e despesas de {monthLabel(monthDate)}.</p></div></div>
    <section className="month-section" aria-labelledby="income-title">
      <div className="section-heading"><div><p className="eyebrow">{monthLabel(monthDate).toUpperCase()}</p><h2 id="income-title">Receitas do mês</h2></div><span className="section-caption">{periods.length + incomeMovements.length} {periods.length + incomeMovements.length === 1 ? "receita registrada" : "receitas registradas"}</span></div>
      <article className="month-total-card income-total-card"><div><span>Total acumulado</span><strong>{currency.format(incomeTotal)}</strong><small>Leandro + Ketlin</small></div><div className="total-icon"><ArrowUpRight size={21} /></div></article>
      <div className="person-grid">{people.map((person) => { const personIncomeMovements = incomeMovements.filter((movement) => belongsTo(movement.owner, person)); return <section className="person-column" key={person}><div className="column-heading"><div className={`person-avatar ${person.toLowerCase()}`}>{person[0]}</div><div><h3>{person}</h3><span>{currency.format(incomeByPerson[person])} no mês</span></div></div>{!hasIncome || (periods.length === 0 && personIncomeMovements.length === 0) ? <div className="empty-state">Nenhuma receita neste mês.</div> : <>{periods.map((period) => <article className="income-card" key={`${person}-${period.date}`}><div><strong>{currency.format(person === "Leandro" ? period.income.leandro : period.income.ketlin)}</strong><span>Receita recebida</span></div><time dateTime={period.date}><CalendarDays size={14} />{period.label}</time></article>)}{personIncomeMovements.map((movement) => <article className="income-card" key={`${person}-${movement.id}`}><div><strong>{currency.format(allocatedAmount(movement.amount, movement.owner))}</strong><span>{movement.description}</span></div><time dateTime={movement.date}><CalendarDays size={14} />{dateFormatter.format(new Date(`${movement.date}T12:00:00`))}</time></article>)}</>}</section>; })}</div>
    </section>
    <section className="month-section expenses-section" aria-labelledby="expenses-title">
      <div className="section-heading"><div><p className="eyebrow">COMPROMISSOS FINANCEIROS</p><h2 id="expenses-title">Despesas do mês</h2></div><button className="text-button" onClick={onOpenCalendar}>Ver calendário <ChevronRight size={15} /></button></div>
      <div className="expense-summary-grid"><article className="month-total-card expense-total-card"><div><span>Total das despesas</span><strong>{currency.format(expenseTotal)}</strong><small>{monthBills.length} contas no mês</small></div><ReceiptText size={21} /></article>{periods.map((period) => <article className="related-income-card" key={period.date}><span>Despesas da receita</span><strong>{currency.format(period.bills.reduce((sum, bill) => sum + bill.amount, 0))}</strong><small><CalendarDays size={13} />{period.label}</small></article>)}{expenseMovements.map((movement) => <article className="related-income-card" key={movement.id}><span>Despesa registrada</span><strong>{currency.format(movement.amount)}</strong><small><CalendarDays size={13} />{dateFormatter.format(new Date(`${movement.date}T12:00:00`))}</small></article>)}</div>
      {!hasExpenses ? <div className="empty-state wide">Nenhuma despesa neste mês.</div> : <div className="person-grid expense-columns">{billsByPerson.map(({ person, bills: personBills }) => <section className="person-column expense-column" key={person}><div className="column-heading"><div className={`person-avatar ${person.toLowerCase()}`}>{person[0]}</div><div><h3>Despesas de {person}</h3><span>{currency.format(personTotals[person])} atribuídos</span></div></div>{personBills.map(({ bill, incomeLabel, expenseDate }) => <article className="expense-card" key={`${person}-${bill.id}`}><div className="expense-card-main"><div className="expense-category"><ReceiptText size={15} /><div><strong>{bill.name}</strong><span>{bill.category}{bill.owner === "Compartilhado" && " · Compartilhada"}</span></div></div><strong className={bill.paid ? "expense-amount paid-amount" : "expense-amount"}>{currency.format(allocatedAmount(bill.amount, bill.owner))}</strong></div><div className="expense-card-meta"><span><CalendarDays size={13} />Vence em {dateFormatter.format(expenseDate)}</span><span><ArrowUpRight size={13} />Receita: {incomeLabel}</span><button className={bill.paid ? "check-control checked" : "check-control"} type="button" aria-label={bill.paid ? `Desmarcar ${bill.name}` : `Marcar ${bill.name} como paga`} onClick={() => onToggleBill(bill.id)}>{bill.paid ? <CircleCheck size={18} /> : <Circle size={18} />}</button></div></article>)}</section>)}</div>}
    </section>
    <section className="dashboard-footer-card"><Users size={17} /><span>Despesas compartilhadas aparecem nas duas colunas e são divididas igualmente entre Leandro e Ketlin.</span><span className="next-payment-note">Próximo pagamento: {daysUntilNextPayment === 0 ? "hoje" : `em ${daysUntilNextPayment} dias`}</span></section>
    <footer className="app-footer"><span>FinanceVault</span><span>Seu dinheiro, no mesmo plano.</span><span>Última sincronização: agora</span></footer>
    <FloatingActionButton onClick={onOpenMovement} />
  </div>;
}
