import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  Pencil,
  ReceiptText,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FloatingActionButton } from "../components/FloatingActionButton";
import { MovementModal } from "../components/MovementModal";
import type { SeedPayPeriod } from "../data/financeSeed";
import { calculateFinanceLedger, cgiPaymentDate, cgiPaymentLabel, currency, dateKey, monthLabels, resolveFinancialEntries, splitOwnerAmount, sumPaymentBalances } from "../lib/finance";
import type { Bill, Goal, Movement } from "../types/finance";
import { summarizeIncome } from "../lib/balanceSummary";

type Person = "Leandro" | "Ketlin";
type ExpenseEntry = {
  bill: Bill;
  incomeLabel: string;
  expenseDate: Date;
  toggleKey: string;
  editKey: string;
  occurrenceId?: string;
  history?: Bill["occurrenceHistory"];
};
type IncomeEntry = {
  id: string;
  label: string;
  date: string;
  amount: number;
  movement: Movement;
};
type EntryOverride = Partial<Movement> & { deleted?: boolean };
type EntryOverrides = Record<string, EntryOverride>;
type PaymentBalance = {
  id: string;
  label: string;
  date: string;
  income: number;
  expense: number;
  savings: number;
  balance: number;
};
type MonthSummary = {
  receivedTotal: number;
  expectedTotal: number;
  key: string;
  label: string;
  incomeTotal: number;
  expenseTotal: number;
  savingsTotal: number;
  balance: number;
  incomeByPerson: Record<Person, number>;
  expenseByPerson: Record<Person, number>;
  incomeEntriesByPerson: Record<Person, IncomeEntry[]>;
  billsByPerson: { person: Person; bills: ExpenseEntry[] }[];
  relatedExpenseCards: {
    id: string;
    label: string;
    amount: number;
    date: string;
    isMovement?: boolean;
  }[];
  paymentBalances: PaymentBalance[];
};
type DashboardPageProps = {
  movements: Movement[];
  periods: SeedPayPeriod[];
  goals: Goal[];
  canEditData: boolean;
  canDeleteData: boolean;
  greeting: string;
  openedDateLabel: string;
  daysUntilNextPayment: number;
  onToggleBill: (key: string) => void;
  onToggleBillOccurrence?: (occurrenceId: string) => Promise<void>;
  isBillPaid: (key: string) => boolean;
  onDeleteMovement: (movementId: string) => void;
  onSaveMovement: (movement: Movement) => void;
  sharedEntryOverrides?: EntryOverrides;
  onEntryOverridesChange?: (overrides: EntryOverrides) => void;
  onOpenCalendar: () => void;
  onOpenMovement: () => void;
  storageKey?: string;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
});
const people: Person[] = ["Leandro", "Ketlin"];

function monthLabel(date: Date) {
  return `${monthLabels[date.getMonth()]} ${date.getFullYear()}`;
}

function belongsTo(owner: Bill["owner"], person: Person) {
  return (
    owner === "Compartilhado" ||
    (person === "Leandro" ? owner === "Você" : owner === "Esposa")
  );
}

function allocatedAmount(amount: number, owner: Bill["owner"], person: Person) {
  const financeOwner = person === "Leandro" ? "Você" : "Esposa";
  return splitOwnerAmount(amount, owner)[financeOwner];
}

function entryOverridesStorageKey(storageKey: string) {
  return `financevault:entry-overrides:${storageKey}`;
}

function readEntryOverrides(storageKey: string): Record<string, EntryOverride> {
  try {
    const stored = localStorage.getItem(entryOverridesStorageKey(storageKey));
    return stored ? JSON.parse(stored) as Record<string, EntryOverride> : {};
  } catch {
    return {};
  }
}

function MonthDetailsModal({
  month,
  onClose,
  onToggleBill,
  onToggleBillOccurrence,
  onEdit,
  canEditData,
}: {
  month: MonthSummary;
  onClose: () => void;
  onToggleBill: (key: string) => void;
  onToggleBillOccurrence?: (occurrenceId: string) => Promise<void>;
  onEdit: (movement: Movement) => void;
  canEditData: boolean;
}) {
  const hasIncome = month.incomeTotal > 0;
  const hasExpenses = month.expenseTotal > 0;
  const [expandedSections, setExpandedSections] = useState({
    income: false,
    expenses: false,
    balance: false,
  });

  return (
    <div className="movement-modal-layer">
      <button
        className="profile-modal-backdrop"
        type="button"
        aria-label="Fechar detalhes do mês"
        onClick={onClose}
      />
      <section
        className="movement-modal month-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="month-details-title"
      >
        <header className="month-details-modal-header">
          <button
            className="icon-button profile-modal-close"
            type="button"
            aria-label="Fechar detalhes do mês"
            onClick={onClose}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">DETALHES COMPLETOS</p>
          <h2 id="month-details-title">{month.label}</h2>
        </header>
        <div className="month-details-modal-content">
          <section className="month-section month-details-section" aria-labelledby="income-title">
            <div className="section-heading month-details-section-heading">
              <button
                className="section-collapse-trigger month-details-collapse-trigger"
                type="button"
                aria-expanded={expandedSections.income}
                onClick={() =>
                  setExpandedSections((current) => ({
                    ...current,
                    income: !current.income,
                  }))
                }
              >
                <h2 id="income-title">Receitas do mês</h2>
                {expandedSections.income ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              <span className="section-caption month-details-section-caption">
                {month.incomeEntriesByPerson.Leandro.length +
                  month.incomeEntriesByPerson.Ketlin.length}{" "}
                registros
              </span>
            </div>
            <article className="month-details-total-card month-details-income-total-card">
              <div>
                <span>Receitas recebidas + previstas</span>
                <strong>{currency.format(month.incomeTotal)}</strong>
                <small>Recebido até hoje: {currency.format(month.receivedTotal)} · A receber: {currency.format(month.expectedTotal)}</small>
              </div>
              <div className="total-icon">
                <ArrowUpRight size={21} />
              </div>
            </article>
            {expandedSections.income && (
            <div className="month-details-person-grid">
              {people.map((person) => (
                <section className="month-details-person-column" key={person}>
                  <div className="column-heading">
                    <div className={`person-avatar ${person.toLowerCase()}`}>
                      {person[0]}
                    </div>
                    <div>
                      <h3>{person}</h3>
                      <span>
                        {currency.format(month.incomeByPerson[person])} no mês
                      </span>
                    </div>
                  </div>
                  {!hasIncome ||
                  month.incomeEntriesByPerson[person].length === 0 ? (
                    <div className="empty-state">
                      Nenhuma receita neste mês.
                    </div>
                  ) : (
                    month.incomeEntriesByPerson[person].map((income) => (
                      <article
                        className="month-details-income-card"
                        key={`${person}-${income.id}`}
                      >
                        <div>
                          <strong>{currency.format(income.amount)}</strong>
                          <span>{income.label}</span>
                        </div>
                        <time dateTime={income.date}>
                          <CalendarDays size={14} />
                          {dateFormatter.format(
                            new Date(`${income.date}T12:00:00`),
                          )}
                        </time>
                        {canEditData && (
                          <button
                            className="entry-edit-button"
                            type="button"
                            aria-label={`Editar receita ${income.label}`}
                            onClick={() => onEdit(income.movement)}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </article>
                    ))
                  )}
                </section>
              ))}
            </div>
            )}
          </section>
          <section
            className="month-section month-details-section month-details-expenses-section"
            aria-labelledby="expenses-title"
          >
            <div className="section-heading month-details-section-heading">
              <button
                className="section-collapse-trigger month-details-collapse-trigger"
                type="button"
                aria-expanded={expandedSections.expenses}
                onClick={() =>
                  setExpandedSections((current) => ({
                    ...current,
                    expenses: !current.expenses,
                  }))
                }
              >
                <h2 id="expenses-title">Despesas do mês</h2>
                {expandedSections.expenses ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              <span className="section-caption month-details-section-caption">
                {new Set(month.billsByPerson.flatMap((group) => group.bills.map((entry) => entry.editKey))).size}{" "}
                despesas
              </span>
            </div>
            <div className="month-details-expense-summary">
            <article className="month-details-total-card month-details-expense-total-card">
                <div>
                  <span>Total das despesas</span>
                  <strong>{currency.format(month.expenseTotal)}</strong>
                  <small>
                    {month.billsByPerson.reduce(
                      (total, group) => total + group.bills.length,
                      0,
                    )}{" "}
                    contas no mês
                  </small>
                </div>
              </article>
            </div>
            {expandedSections.expenses &&
              (!hasExpenses ? (
                <div className="empty-state wide">Nenhuma despesa neste mês.</div>
              ) : (
                <>
                  <div className="month-details-expense-summary month-details-expense-details">
                    {month.relatedExpenseCards.map((card) => (
                      <article className="month-details-related-card" key={card.id}>
                        <span>
                          {card.isMovement
                            ? "Despesa registrada"
                            : "Despesas da receita"}
                        </span>
                        <strong>{currency.format(card.amount)}</strong>
                        <small>
                          <CalendarDays size={13} />
                          {card.label}
                        </small>
                      </article>
                    ))}
                  </div>
                  <div className="month-details-person-grid month-details-expense-columns">
                    {month.billsByPerson.map(({ person, bills }) => (
                      <section
                        className="month-details-person-column month-details-expense-column"
                        key={person}
                      >
                        <div className="column-heading">
                          <div className={`person-avatar ${person.toLowerCase()}`}>
                            {person[0]}
                          </div>
                          <div>
                            <h3>{person}</h3>
                            <span>
                              {currency.format(month.expenseByPerson[person])}{" "}
                              atribuídos
                            </span>
                          </div>
                        </div>
                        {bills.map(
                          ({
                            bill,
                            incomeLabel,
                            expenseDate,
                            toggleKey,
                            editKey,
                            occurrenceId,
                            history,
                          }) => (
                            <article
                              className="month-details-expense-card"
                              key={`${person}-${toggleKey}`}
                            >
                              <div className="month-details-expense-card-main">
                                <div className="expense-category">
                                  <ReceiptText size={15} />
                                  <div>
                                    <strong>{bill.name}</strong>
                                    <span>
                                      {bill.category}
                                      {bill.owner === "Compartilhado" &&
                                        " · Compartilhada"}
                                    </span>
                                  </div>
                                </div>
                                <strong
                                  className={
                                    bill.paid
                                      ? "expense-amount paid-amount"
                                      : "expense-amount"
                                  }
                                >
                                  {currency.format(
                                    allocatedAmount(bill.amount, bill.owner, person),
                                  )}
                                </strong>
                              </div>
                              <div className="month-details-expense-card-meta">
                                <div className="month-details-expense-card-meta-info">
                                  <span>
                                    <CalendarDays size={13} />
                                    Vence em {dateFormatter.format(expenseDate)}
                                  </span>
                                  <span>
                                    <ArrowUpRight size={13} />
                                    Receita: {incomeLabel}
                                  </span>
                                  {history?.slice(-2).map((event) => (
                                    <span key={event.id}>{event.action === "paid" ? "Pago" : "Reaberto"}: {dateFormatter.format(new Date(`${event.date}T12:00:00`))} · {currency.format(event.amount)}</span>
                                  ))}
                                </div>
                                <div className="month-details-expense-card-actions">
                                  {canEditData && (
                                    <button
                                      className="entry-edit-button"
                                      type="button"
                                      aria-label={`Editar despesa ${bill.name}`}
                                      onClick={() =>
                                        onEdit({
                                          id: editKey,
                                          type: "expense",
                                          amount: bill.amount,
                                          date: `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, "0")}-${String(expenseDate.getDate()).padStart(2, "0")}`,
                                          description: bill.name,
                                          category: bill.category,
                                          owner: bill.owner,
                                        })
                                      }
                                    >
                                      <Pencil size={14} />
                                    </button>
                                  )}
                                  <button
                                    className={
                                      bill.paid
                                        ? "check-control checked"
                                        : "check-control"
                                    }
                                    type="button"
                                    disabled={!canEditData}
                                    aria-label={
                                      bill.paid
                                        ? `Desmarcar ${bill.name}`
                                        : `Marcar ${bill.name} como paga`
                                    }
                                    onClick={() => occurrenceId && onToggleBillOccurrence
                                      ? void onToggleBillOccurrence(occurrenceId)
                                      : onToggleBill(toggleKey)}
                                  >
                                    {bill.paid ? (
                                      <CircleCheck size={18} />
                                    ) : (
                                      <Circle size={18} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </article>
                          ),
                        )}
                      </section>
                    ))}
                  </div>
                </>
              ))}
          </section>
          <section className="month-section month-details-section month-details-balance-section" aria-labelledby="balance-title">
            <div className="section-heading month-details-section-heading">
              <button
                className="section-collapse-trigger month-details-collapse-trigger"
                type="button"
                aria-expanded={expandedSections.balance}
                onClick={() =>
                  setExpandedSections((current) => ({
                    ...current,
                    balance: !current.balance,
                  }))
                }
              >
                <h2 id="balance-title">Saldo projetado do mês</h2>
                {expandedSections.balance ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              <span className="section-caption month-details-section-caption">
                {month.paymentBalances.length} pagamentos
              </span>
            </div>
            <article className="month-details-total-card month-details-balance-total-card">
              <div>
                <span>Saldo projetado · inclui previsões</span>
                <strong className={month.balance >= 0 ? "positive" : "negative"}>
                  {currency.format(month.balance)}
                </strong>
                <small>Receitas recebidas e previstas menos despesas e aportes. Não representa saldo bancário.</small>
              </div>
            </article>
            {expandedSections.balance &&
              (month.paymentBalances.length === 0 ? (
                <div className="empty-state wide">Nenhum saldo por pagamento neste mês.</div>
              ) : (
                <div className="month-details-payment-balance-grid">
                  {month.paymentBalances.map((payment) => (
                    <article className="month-details-payment-balance-card" key={payment.id}>
                      <header>
                        <strong>{payment.label}</strong>
                        <small>
                          <CalendarDays size={13} />
                          {dateFormatter.format(new Date(`${payment.date}T12:00:00`))}
                        </small>
                      </header>
                      <p>
                        <span>Receitas</span>
                        <strong>{currency.format(payment.income)}</strong>
                      </p>
                      <p>
                        <span>Despesas</span>
                        <strong>{currency.format(payment.expense)}</strong>
                      </p>
                      <p>
                        <span>Aportes</span>
                        <strong>{currency.format(payment.savings)}</strong>
                      </p>
                      <p>
                        <span>Saldo projetado</span>
                        <strong className={payment.balance >= 0 ? "positive" : "negative"}>
                          {currency.format(payment.balance)}
                        </strong>
                      </p>
                    </article>
                  ))}
                </div>
              ))}
          </section>
        </div>
      </section>
    </div>
  );
}

export function DashboardPage({
  movements,
  periods,
  goals,
  canEditData,
  canDeleteData,
  greeting,
  openedDateLabel,
  daysUntilNextPayment,
  onToggleBill,
  onToggleBillOccurrence,
  isBillPaid,
  onDeleteMovement,
  onSaveMovement,
  sharedEntryOverrides,
  onEntryOverridesChange,
  onOpenCalendar,
  onOpenMovement,
  storageKey = "local",
}: DashboardPageProps) {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [entryOverrides, setEntryOverrides] = useState<
    Record<string, EntryOverride>
  >(() => readEntryOverrides(storageKey));
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const currentYear = new Date().getFullYear();
  useEffect(() => {
    if (sharedEntryOverrides === undefined) return;
    setEntryOverrides(sharedEntryOverrides);
  }, [sharedEntryOverrides, storageKey]);
  const updateEntryOverrides = (update: (current: Record<string, EntryOverride>) => Record<string, EntryOverride>) => {
    const next = update(entryOverrides);
    if (onEntryOverridesChange) { onEntryOverridesChange(next); return; }
    localStorage.setItem(entryOverridesStorageKey(storageKey), JSON.stringify(next));
    setEntryOverrides(next);
  };

  const financialEntries = useMemo(
    () => resolveFinancialEntries(movements, entryOverrides, periods),
    [movements, entryOverrides, periods],
  );
  const contributions = useMemo(() => goals.flatMap((goal) => goal.contributions), [goals]);
  const ledger = useMemo(() => calculateFinanceLedger(financialEntries, contributions), [financialEntries, contributions]);
  const today = dateKey(new Date());
  const currentMonthKey = today.slice(0, 7);
  const currentIncome = summarizeIncome(financialEntries, currentMonthKey, today);
  const currentLedger = calculateFinanceLedger(financialEntries, contributions, today).get(currentMonthKey);
  const goalAvailable = (currentLedger?.availableByOwner["Você"] ?? 0) + (currentLedger?.availableByOwner.Esposa ?? 0);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const date = new Date(currentYear, monthIndex, 1);
      const key = `${date.getFullYear()}-${String(monthIndex + 1).padStart(2, "0")}`;
      const monthEntries = financialEntries.filter((entry) => entry.date.startsWith(key));
      const incomeSummary = summarizeIncome(financialEntries, key, today);
      const incomeEntries = monthEntries.filter((entry) => entry.type === "income");

      const incomeEntriesByPerson: Record<Person, IncomeEntry[]> = {
        Leandro: [],
        Ketlin: [],
      };
      for (const entry of incomeEntries) {
        if (belongsTo(entry.owner, "Leandro")) {
          incomeEntriesByPerson.Leandro.push({
            id: entry.id,
            label: entry.title,
            date: entry.date,
            amount: allocatedAmount(entry.amount, entry.owner, "Leandro"),
            movement: entry.movement,
          });
        }
        if (belongsTo(entry.owner, "Ketlin")) {
          incomeEntriesByPerson.Ketlin.push({
            id: entry.id,
            label: entry.title,
            date: entry.date,
            amount: allocatedAmount(entry.amount, entry.owner, "Ketlin"),
            movement: entry.movement,
          });
        }
      }
      incomeEntriesByPerson.Leandro.sort((left, right) =>
        left.date.localeCompare(right.date),
      );
      incomeEntriesByPerson.Ketlin.sort((left, right) =>
        left.date.localeCompare(right.date),
      );

      const incomeByPerson: Record<Person, number> = {
        Leandro: incomeEntriesByPerson.Leandro.reduce(
          (total, entry) => total + entry.amount,
          0,
        ),
        Ketlin: incomeEntriesByPerson.Ketlin.reduce(
          (total, entry) => total + entry.amount,
          0,
        ),
      };

      const billsByPerson = people.map((person) => ({
        person,
        bills: monthEntries
          .filter((entry) => entry.type === "expense" && belongsTo(entry.owner, person))
          .map((entry) => {
            const expenseDate = new Date(`${entry.date}T12:00:00`);
            return {
              bill: {
                id: entry.id,
                name: entry.title,
                owner: entry.owner,
                amount: entry.amount,
                due: entry.date,
                category: entry.category,
                                    paid: entry.occurrenceId ? entry.paid : isBillPaid(entry.toggleKey),
              },
              incomeLabel: cgiPaymentLabel(expenseDate),
              expenseDate,
              toggleKey: entry.toggleKey,
              editKey: entry.key,
              occurrenceId: entry.occurrenceId,
              history: entry.paymentHistory,
            };
          })
          .sort((left, right) => left.expenseDate.getTime() - right.expenseDate.getTime()),
      }));

      const expenseByPerson = billsByPerson.reduce<Record<Person, number>>(
        (totals, group) => {
          totals[group.person] = group.bills.reduce(
            (total, item) =>
              total + allocatedAmount(item.bill.amount, item.bill.owner, group.person),
            0,
          );
          return totals;
        },
        { Leandro: 0, Ketlin: 0 },
      );

      const expenseTotal = billsByPerson.reduce(
        (total, group) =>
          total +
          group.bills.reduce(
            (sum, item) =>
              sum + allocatedAmount(item.bill.amount, item.bill.owner, group.person),
            0,
          ),
        0,
      );
      const incomeTotal = incomeByPerson.Leandro + incomeByPerson.Ketlin;
      const allocation = ledger.get(key);
      const savingsTotal = allocation?.goalContributionsTotal ?? 0;
      const label = monthLabel(date);
      const relatedExpensesByIncome = new Map<string, { amount: number; date: string }>();
      billsByPerson.forEach(({ person, bills }) => {
        bills.forEach(({ bill, incomeLabel, expenseDate }) => {
          const current = relatedExpensesByIncome.get(incomeLabel);
          relatedExpensesByIncome.set(incomeLabel, {
            amount: (current?.amount ?? 0) + allocatedAmount(bill.amount, bill.owner, person),
            date: current?.date ?? dateKey(expenseDate),
          });
        });
      });
      const relatedExpenseCards = [...relatedExpensesByIncome.entries()].map(
        ([incomeLabel, relatedExpense]) => ({
          id: `income-${key}-${incomeLabel}`,
          label: incomeLabel,
          amount: relatedExpense.amount,
          date: relatedExpense.date,
        }),
      );
      const paymentBalancesByLabel = new Map<
        string,
        { income: number; expense: number; savings: number; date: string }
      >();
      people.forEach((person) => {
        incomeEntriesByPerson[person].forEach((entry) => {
          const paymentDate = new Date(`${entry.date}T12:00:00`);
          const normalizedPaymentDate = cgiPaymentDate(paymentDate);
          const paymentLabel = cgiPaymentLabel(normalizedPaymentDate);
          const current = paymentBalancesByLabel.get(paymentLabel);
          paymentBalancesByLabel.set(paymentLabel, {
            income: (current?.income ?? 0) + entry.amount,
            expense: current?.expense ?? 0,
            savings: current?.savings ?? 0,
            date: current?.date ?? dateKey(normalizedPaymentDate),
          });
        });
      });
      billsByPerson.forEach(({ person, bills }) => {
        bills.forEach(({ bill, incomeLabel, expenseDate }) => {
          const current = paymentBalancesByLabel.get(incomeLabel);
          const normalizedPaymentDate = cgiPaymentDate(expenseDate);
          paymentBalancesByLabel.set(incomeLabel, {
            income: current?.income ?? 0,
            expense:
              (current?.expense ?? 0) +
              allocatedAmount(bill.amount, bill.owner, person),
            savings: current?.savings ?? 0,
            date: current?.date ?? dateKey(normalizedPaymentDate),
          });
        });
      });
      const savingsByPayment = contributions
        .filter((contribution) => (contribution.incomeSourceDate ?? contribution.date).startsWith(key))
        .reduce((totals, contribution) => {
          const paymentDate = cgiPaymentDate(contribution.incomeSourceDate ?? contribution.date);
          const label = cgiPaymentLabel(paymentDate);
          const current = totals.get(label);
          totals.set(label, { amount: (current?.amount ?? 0) + contribution.amount, date: current?.date ?? dateKey(paymentDate) });
          return totals;
        }, new Map<string, { amount: number; date: string }>());
      savingsByPayment.forEach(({ amount, date }, paymentLabel) => {
        const current = paymentBalancesByLabel.get(paymentLabel);
        paymentBalancesByLabel.set(paymentLabel, {
          income: current?.income ?? 0,
          expense: current?.expense ?? 0,
          savings: amount,
          date: current?.date ?? date,
        });
      });
      const paymentBalances: PaymentBalance[] = [...paymentBalancesByLabel.entries()]
        .map(([paymentLabel, values]) => ({
          id: `${key}-${paymentLabel}`,
          label: paymentLabel,
          date: values.date,
          income: values.income,
          expense: values.expense,
          savings: values.savings,
          balance: values.income - values.expense - values.savings,
        }))
        .sort((left, right) => left.date.localeCompare(right.date));

      return {
        key,
        label,
        receivedTotal: incomeSummary.received,
        expectedTotal: incomeSummary.expected,
        incomeTotal,
        expenseTotal,
        savingsTotal,
        balance: sumPaymentBalances(paymentBalances),
        incomeByPerson,
        expenseByPerson,
        incomeEntriesByPerson,
        billsByPerson,
        relatedExpenseCards,
        paymentBalances,
      };
    });
  }, [contributions, currentYear, financialEntries, isBillPaid, ledger, today]);

  const selectedMonth =
    months.find((month) => month.key === selectedMonthKey) ?? null;
  const yearSummary = useMemo(() => {
    const incomeByPerson: Record<Person, number> = {
      Leandro: months.reduce(
        (total, month) => total + month.incomeByPerson.Leandro,
        0,
      ),
      Ketlin: months.reduce(
        (total, month) => total + month.incomeByPerson.Ketlin,
        0,
      ),
    };
    const expenseByPerson: Record<Person, number> = {
      Leandro: months.reduce(
        (total, month) => total + month.expenseByPerson.Leandro,
        0,
      ),
      Ketlin: months.reduce(
        (total, month) => total + month.expenseByPerson.Ketlin,
        0,
      ),
    };
    const incomeTotal = incomeByPerson.Leandro + incomeByPerson.Ketlin;
    const expenseTotal = expenseByPerson.Leandro + expenseByPerson.Ketlin;
    const savingsTotal = months.reduce((total, month) => total + month.savingsTotal, 0);

    return {
      incomeTotal,
      expenseTotal,
      savingsTotal,
      balance: months.reduce((total, month) => total + month.balance, 0),
      incomeByPerson,
      expenseByPerson,
      activeMonths: months.filter(
        (month) => month.incomeTotal > 0 || month.expenseTotal > 0 || month.savingsTotal > 0,
      ).length,
    };
  }, [months]);

  return (
    <div className="page-wrap" id="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{openedDateLabel.toUpperCase()}</p>
          <h1>{greeting}, Leandro.</h1>
          <p className="heading-copy">
            Visão geral de receitas e despesas de {currentYear}.
          </p>
        </div>
      </div>
      <details className="balance-explanation">
        <summary><h2 id="balance-explanation-title">Entenda os saldos</h2></summary>
        <p><strong>Saldo projetado</strong> inclui receitas ainda não recebidas, desconta despesas cadastradas e aportes. Não é saldo bancário nem um valor liberado para gastar.</p>
        <div className="balance-facts">
          <article><span>Recebido neste mês até hoje</span><strong>{currency.format(currentIncome.received)}</strong></article>
          <article><span>A receber neste mês</span><strong>{currency.format(currentIncome.expected)}</strong></article>
          <article><span>Disponível para objetivos neste mês</span><strong>{currency.format(goalAvailable)}</strong></article>
          <article>
            <span>Saldo dos objetivos</span>
            {goals.length === 0 ? (
              <strong>{currency.format(0)}</strong>
            ) : (
              <ul className="balance-goal-list">
                {goals.map((goal) => (
                  <li key={goal.id}><span>{goal.name}</span><strong>{currency.format(goal.saved)}</strong></li>
                ))}
              </ul>
            )}
          </article>
        </div>
        <details><summary>Como funciona o disponível para objetivos?</summary>
          <p>Considera receitas recebidas até hoje, reserva despesas cadastradas com vencimento a partir de cada recebimento, incluindo meses futuros, e desconta aportes. É o mesmo cálculo usado em Objetivos.</p>
          <p>Contas anteriores ao recebimento não são cobertas retroativamente. Confira também contas atrasadas; este valor não representa dinheiro livre para consumo.</p>
          <p>Leandro: {currency.format(currentLedger?.availableByOwner["Você"] ?? 0)} · Ketlin: {currency.format(currentLedger?.availableByOwner.Esposa ?? 0)}. A disponibilidade não é transferida automaticamente entre responsáveis.</p>
        </details>
      </details>
      <section
        className="year-summary-section"
        aria-labelledby="year-summary-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">RESUMO DO ANO</p>
            <h2 id="year-summary-title">Balanço anual de {currentYear}</h2>
          </div>
          <span className="section-caption">
            {yearSummary.activeMonths} meses com movimentação
          </span>
        </div>
        <div className="year-summary-grid">
          <article className="year-summary-card income">
            <span>Receitas recebidas + previstas no ano</span>
            <strong>{currency.format(yearSummary.incomeTotal)}</strong>
            <small>Leandro + Ketlin</small>
          </article>
          <article className="year-summary-card expense">
            <span>Despesas no ano</span>
            <strong>{currency.format(yearSummary.expenseTotal)}</strong>
            <small>Contas e lançamentos</small>
          </article>
          <article className="year-summary-card savings">
            <span>Aportes no ano</span>
            <strong>{currency.format(yearSummary.savingsTotal)}</strong>
            <small>Transferências para objetivos</small>
          </article>
          <article className="year-summary-card balance">
            <span>Saldo projetado do ano</span>
            <strong
              className={yearSummary.balance >= 0 ? "positive" : "negative"}
            >
              {currency.format(yearSummary.balance)}
            </strong>
            <small>Receitas menos despesas e aportes</small>
          </article>
        </div>
        <div className="year-people-summary">
          {people.map((person) => (
            <article key={person}>
              <div className={`person-avatar ${person.toLowerCase()}`}>
                {person[0]}
              </div>
              <div>
                <h3>{person}</h3>
                <p>
                  <span>Receitas</span>
                  <strong>
                    {currency.format(yearSummary.incomeByPerson[person])}
                  </strong>
                </p>
                <p>
                  <span>Despesas</span>
                  <strong>
                    {currency.format(yearSummary.expenseByPerson[person])}
                  </strong>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="month-section" aria-labelledby="year-overview-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ANO VIGENTE</p>
            <h2 id="year-overview-title">Planejamento mensal</h2>
          </div>
          <button className="text-button" onClick={onOpenCalendar}>
            Ver calendário <ChevronRight size={15} />
          </button>
        </div>
        <div className="month-accordion-list">
          {months.map((month) => {
            const isExpanded = Boolean(expandedMonths[month.key]);
            return (
              <article className="month-accordion-card" key={month.key}>
                <button
                  className="month-accordion-trigger"
                  type="button"
                  onClick={() =>
                    setExpandedMonths((current) => ({
                      ...current,
                      [month.key]: !current[month.key],
                    }))
                  }
                  aria-expanded={isExpanded}
                >
                  <div>
                    <strong>{month.label}</strong>
                    <small>
                      {month.incomeTotal > 0 || month.expenseTotal > 0 || month.savingsTotal > 0
                        ? `${currency.format(month.incomeTotal)} receitas · ${currency.format(month.expenseTotal)} despesas · ${currency.format(month.savingsTotal)} aportes`
                        : "Sem movimentações"}
                    </small>
                  </div>
                  <div className="month-accordion-values">
                    <span
                      className={month.balance >= 0 ? "positive" : "negative"}
                    >
                      <small>Projetado</small> {currency.format(month.balance)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="month-accordion-content">
                    <div className="month-quick-summary">
                      <article className="month-quick-card income">
                        <span>Receitas recebidas + previstas</span>
                        <strong>{currency.format(month.incomeTotal)}</strong>
                      </article>
                      <article className="month-quick-card expense">
                        <span>Despesas totais</span>
                        <strong>{currency.format(month.expenseTotal)}</strong>
                      </article>
                      <article className="month-quick-card savings">
                        <span>Aportes a objetivos</span>
                        <strong>{currency.format(month.savingsTotal)}</strong>
                      </article>
                      <article className="month-quick-card balance">
                        <span>Saldo projetado</span>
                        <strong
                          className={
                            month.balance >= 0 ? "positive" : "negative"
                          }
                        >
                          {currency.format(month.balance)}
                        </strong>
                      </article>
                    </div>
                    <p className="balance-month-note">Recebido até hoje: {currency.format(month.receivedTotal)} · A receber: {currency.format(month.expectedTotal)}. Saldo projetado inclui previsões.</p>
                    <div className="month-person-summary">
                      {people.map((person) => (
                        <article key={`${month.key}-${person}`}>
                          <h3>{person}</h3>
                          <p>
                            Receitas:{" "}
                            <strong>
                              {currency.format(month.incomeByPerson[person])}
                            </strong>
                          </p>
                          <p>
                            Despesas:{" "}
                            <strong>
                              {currency.format(month.expenseByPerson[person])}
                            </strong>
                          </p>
                        </article>
                      ))}
                    </div>
                    <button
                      className="outline-button month-details-button"
                      type="button"
                      onClick={() => setSelectedMonthKey(month.key)}
                    >
                      Ver todos os detalhes do mês
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className="dashboard-footer-card">
        <Users size={17} />
        <span>
          Despesas compartilhadas aparecem nas duas colunas e são divididas
          igualmente entre Leandro e Ketlin.
        </span>
        <span className="next-payment-note">
          Próximo pagamento:{" "}
          {daysUntilNextPayment === 0
            ? "hoje"
            : `em ${daysUntilNextPayment} dias`}
        </span>
      </section>
      <footer className="app-footer">
        <span>FinanceVault</span>
        <span>Seu dinheiro, no mesmo plano.</span>
        <span>Última sincronização: agora</span>
      </footer>
      {canEditData && <FloatingActionButton onClick={onOpenMovement} />}
      {selectedMonth && (
        <MonthDetailsModal
          month={selectedMonth}
          onClose={() => setSelectedMonthKey(null)}
          onToggleBill={onToggleBill}
          onToggleBillOccurrence={onToggleBillOccurrence}
          onEdit={setEditingMovement}
          canEditData={canEditData}
        />
      )}
      {canEditData && editingMovement && (
        <MovementModal
          initialMovement={editingMovement}
          onClose={() => setEditingMovement(null)}
          onDelete={canDeleteData ? () => {
            const movementId = editingMovement.id;
            if (movementId.startsWith("period-income:") || movementId.startsWith("period-expense:")) {
              updateEntryOverrides((current) => ({ ...current, [movementId]: { deleted: true } }));
              setEditingMovement(null);
              return;
            }
            const resolvedMovementId = movementId.startsWith("movement:") ? movementId.replace("movement:", "") : movementId;
            onDeleteMovement(resolvedMovementId);
            setEditingMovement(null);
          } : undefined}
          onSubmit={(movement) => {
            const resolvedMovementId = movement.id.startsWith("movement:") ? movement.id.replace("movement:", "") : movement.id;
            const overrideKey = movement.id.startsWith("period-income:") || movement.id.startsWith("period-expense:")
              ? movement.id
              : `movement:${resolvedMovementId}`;
            const persistedMovement = { ...movement, id: resolvedMovementId };
            if (movements.some((entry) => entry.id === resolvedMovementId)) {
              onSaveMovement(persistedMovement);
              setEditingMovement(null);
              return;
            }
            updateEntryOverrides((current) => {
              const next = { ...current, [overrideKey]: { ...persistedMovement, deleted: false } };
              if (movement.id !== resolvedMovementId && overrideKey !== movement.id) delete next[movement.id];
              return next;
            });
            setEditingMovement(null);
          }}
        />
      )}
    </div>
  );
}
