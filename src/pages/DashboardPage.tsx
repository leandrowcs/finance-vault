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
import { useMemo, useState } from "react";
import { financePeriods, type SeedPayPeriod } from "../data/financeSeed";
import { FloatingActionButton } from "../components/FloatingActionButton";
import { MovementModal } from "../components/MovementModal";
import { cgiPaymentLabel, currency, dueDate, monthLabels } from "../lib/finance";
import type { Bill, Movement } from "../types/finance";

type Person = "Leandro" | "Ketlin";
type ExpenseEntry = {
  bill: Bill;
  incomeLabel: string;
  expenseDate: Date;
  toggleKey: string;
  editKey: string;
};
type IncomeEntry = {
  id: string;
  label: string;
  date: string;
  amount: number;
  movement: Movement;
};
type EntryOverride = Partial<Movement> & { deleted?: boolean };
type MonthSummary = {
  key: string;
  label: string;
  periods: SeedPayPeriod[];
  incomeTotal: number;
  expenseTotal: number;
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
};
type DashboardPageProps = {
  movements: Movement[];
  greeting: string;
  openedDateLabel: string;
  daysUntilNextPayment: number;
  onToggleBill: (key: string) => void;
  isBillPaid: (key: string) => boolean;
  onDeleteMovement: (movementId: string) => void;
  onOpenCalendar: () => void;
  onOpenMovement: () => void;
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

function allocatedAmount(amount: number, owner: Bill["owner"]) {
  return owner === "Compartilhado" ? amount / 2 : amount;
}

function billPeriodKey(periodDate: string, billId: string) {
  return `period:${periodDate}:${billId}`;
}

function billMovementKey(movementId: string) {
  return `movement:${movementId}`;
}

function movementBill(movement: Movement, paid: boolean): Bill {
  return {
    id: movement.id,
    name: movement.description,
    owner: movement.owner,
    amount: movement.amount,
    due: movement.date,
    category: movement.category,
    paid,
  };
}

function MonthDetailsModal({
  month,
  onClose,
  onToggleBill,
  onEdit,
}: {
  month: MonthSummary;
  onClose: () => void;
  onToggleBill: (key: string) => void;
  onEdit: (movement: Movement) => void;
}) {
  const hasIncome = month.incomeTotal > 0;
  const hasExpenses = month.expenseTotal > 0;

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
          <section className="month-section" aria-labelledby="income-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{month.label.toUpperCase()}</p>
                <h2 id="income-title">Receitas do mês</h2>
              </div>
              <span className="section-caption">
                {month.incomeEntriesByPerson.Leandro.length +
                  month.incomeEntriesByPerson.Ketlin.length}{" "}
                registros
              </span>
            </div>
            <article className="month-total-card income-total-card">
              <div>
                <span>Total acumulado</span>
                <strong>{currency.format(month.incomeTotal)}</strong>
                <small>Leandro + Ketlin</small>
              </div>
              <div className="total-icon">
                <ArrowUpRight size={21} />
              </div>
            </article>
            <div className="person-grid">
              {people.map((person) => (
                <section className="person-column" key={person}>
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
                        className="income-card"
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
                        <button
                          className="entry-edit-button"
                          type="button"
                          aria-label={`Editar receita ${income.label}`}
                          onClick={() => onEdit(income.movement)}
                        >
                          <Pencil size={14} />
                        </button>
                      </article>
                    ))
                  )}
                </section>
              ))}
            </div>
          </section>
          <section
            className="month-section expenses-section"
            aria-labelledby="expenses-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">COMPROMISSOS FINANCEIROS</p>
                <h2 id="expenses-title">Despesas do mês</h2>
              </div>
            </div>
            <div className="expense-summary-grid">
              <article className="month-total-card expense-total-card">
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
                <ReceiptText size={21} />
              </article>
              {month.relatedExpenseCards.map((card) => (
                <article className="related-income-card" key={card.id}>
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
            {!hasExpenses ? (
              <div className="empty-state wide">Nenhuma despesa neste mês.</div>
            ) : (
              <div className="person-grid expense-columns">
                {month.billsByPerson.map(({ person, bills }) => (
                  <section
                    className="person-column expense-column"
                    key={person}
                  >
                    <div className="column-heading">
                      <div className={`person-avatar ${person.toLowerCase()}`}>
                        {person[0]}
                      </div>
                      <div>
                        <h3>Despesas de {person}</h3>
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
                      }) => (
                        <article
                          className="expense-card"
                          key={`${person}-${toggleKey}`}
                        >
                          <div className="expense-card-main">
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
                                allocatedAmount(bill.amount, bill.owner),
                              )}
                            </strong>
                          </div>
                          <div className="expense-card-meta">
                            <span>
                              <CalendarDays size={13} />
                              Vence em {dateFormatter.format(expenseDate)}
                            </span>
                            <span>
                              <ArrowUpRight size={13} />
                              Receita: {incomeLabel}
                            </span>
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
                            <button
                              className={
                                bill.paid
                                  ? "check-control checked"
                                  : "check-control"
                              }
                              type="button"
                              aria-label={
                                bill.paid
                                  ? `Desmarcar ${bill.name}`
                                  : `Marcar ${bill.name} como paga`
                              }
                              onClick={() => onToggleBill(toggleKey)}
                            >
                              {bill.paid ? (
                                <CircleCheck size={18} />
                              ) : (
                                <Circle size={18} />
                              )}
                            </button>
                          </div>
                        </article>
                      ),
                    )}
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

export function DashboardPage({
  movements,
  greeting,
  openedDateLabel,
  daysUntilNextPayment,
  onToggleBill,
  isBillPaid,
  onDeleteMovement,
  onOpenCalendar,
  onOpenMovement,
}: DashboardPageProps) {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [entryOverrides, setEntryOverrides] = useState<
    Record<string, EntryOverride>
  >({});
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const currentYear = new Date().getFullYear();

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const date = new Date(currentYear, monthIndex, 1);
      const key = `${date.getFullYear()}-${String(monthIndex + 1).padStart(2, "0")}`;
      const periods = financePeriods.filter((period) =>
        period.date.startsWith(key),
      );
      const resolvedMovements = movements.map((movement) => ({
        ...movement,
        ...entryOverrides[`movement:${movement.id}`],
      }));
      const monthMovements = resolvedMovements.filter((movement) =>
        movement.date.startsWith(key),
      );
      const incomeMovements = monthMovements.filter(
        (movement) => movement.type === "income",
      );
      const expenseMovements = monthMovements.filter(
        (movement) => movement.type === "expense",
      );

      const incomeEntriesByPerson: Record<Person, IncomeEntry[]> = {
        Leandro: [],
        Ketlin: [],
      };
      for (const period of periods) {
        const leandroKey = `period-income:${period.date}:leandro`;
        const ketlinKey = `period-income:${period.date}:ketlin`;
        const leandroOverride = entryOverrides[leandroKey];
        const ketlinOverride = entryOverrides[ketlinKey];
        if (!leandroOverride?.deleted) {
          incomeEntriesByPerson.Leandro.push({
            id: `${period.date}-leandro`,
            label: leandroOverride?.description ?? "Receita recebida",
            date: leandroOverride?.date ?? period.date,
            amount: leandroOverride?.amount ?? period.income.leandro,
            movement: {
              id: leandroKey,
              type: "income",
              amount: leandroOverride?.amount ?? period.income.leandro,
              date: leandroOverride?.date ?? period.date,
              description: leandroOverride?.description ?? "Receita recebida",
              category: leandroOverride?.category ?? "Salário",
              owner: leandroOverride?.owner ?? "Você",
            },
          });
        }
        if (!ketlinOverride?.deleted) {
          incomeEntriesByPerson.Ketlin.push({
            id: `${period.date}-ketlin`,
            label: ketlinOverride?.description ?? "Receita recebida",
            date: ketlinOverride?.date ?? period.date,
            amount: ketlinOverride?.amount ?? period.income.ketlin,
            movement: {
              id: ketlinKey,
              type: "income",
              amount: ketlinOverride?.amount ?? period.income.ketlin,
              date: ketlinOverride?.date ?? period.date,
              description: ketlinOverride?.description ?? "Receita recebida",
              category: ketlinOverride?.category ?? "Salário",
              owner: ketlinOverride?.owner ?? "Esposa",
            },
          });
        }
      }
      for (const movement of incomeMovements) {
        if (belongsTo(movement.owner, "Leandro")) {
          incomeEntriesByPerson.Leandro.push({
            id: movement.id,
            label: movement.description,
            date: movement.date,
            amount: allocatedAmount(movement.amount, movement.owner),
            movement,
          });
        }
        if (belongsTo(movement.owner, "Ketlin")) {
          incomeEntriesByPerson.Ketlin.push({
            id: movement.id,
            label: movement.description,
            date: movement.date,
            amount: allocatedAmount(movement.amount, movement.owner),
            movement,
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

      const billsByPerson = people.map((person) => {
        const seeded: ExpenseEntry[] = periods.flatMap((period) =>
          period.bills.flatMap((bill) => {
            const editKey = `period-expense:${period.date}:${bill.id}`;
            const override = entryOverrides[editKey];
            if (override?.deleted) return [];
            const owner = override?.owner ?? bill.owner;
            if (!belongsTo(owner, person)) return [];
            const toggleKey = billPeriodKey(period.date, bill.id);
            const expenseDate = override?.date
              ? new Date(`${override.date}T12:00:00`)
              : dueDate(period.date, bill.due);
            return {
              bill: {
                ...bill,
                name: override?.description ?? bill.name,
                amount: override?.amount ?? bill.amount,
                category: override?.category ?? bill.category,
                owner,
                paid: isBillPaid(toggleKey),
              },
              incomeLabel: cgiPaymentLabel(expenseDate),
              expenseDate,
              toggleKey,
              editKey,
            };
          }),
        );

        const added: ExpenseEntry[] = expenseMovements
          .filter((movement) => belongsTo(movement.owner, person))
          .map((movement) => {
            const toggleKey = billMovementKey(movement.id);
            return {
              bill: movementBill(movement, isBillPaid(toggleKey)),
              incomeLabel: cgiPaymentLabel(new Date(`${movement.date}T12:00:00`)),
              expenseDate: new Date(`${movement.date}T12:00:00`),
              toggleKey,
              editKey: `movement:${movement.id}`,
            };
          });

        return {
          person,
          bills: [...seeded, ...added].sort(
            (left, right) =>
              left.expenseDate.getTime() - right.expenseDate.getTime(),
          ),
        };
      });

      const expenseByPerson = billsByPerson.reduce<Record<Person, number>>(
        (totals, group) => {
          totals[group.person] = group.bills.reduce(
            (total, item) =>
              total + allocatedAmount(item.bill.amount, item.bill.owner),
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
              sum + allocatedAmount(item.bill.amount, item.bill.owner),
            0,
          ),
        0,
      );
      const incomeTotal = incomeByPerson.Leandro + incomeByPerson.Ketlin;
      const label = monthLabel(date);
      const relatedExpenseCards = [
        ...periods.map((period) => ({
          id: `period-${period.date}`,
          label: period.label,
          amount: period.bills.reduce((sum, bill) => {
            const override = entryOverrides[`period-expense:${period.date}:${bill.id}`];
            if (override?.deleted) return sum;
            return sum + (override?.amount ?? bill.amount);
          }, 0),
          date: period.date,
        })),
        ...expenseMovements.map((movement) => ({
          id: `movement-${movement.id}`,
          label: dateFormatter.format(new Date(`${movement.date}T12:00:00`)),
          amount: movement.amount,
          date: movement.date,
          isMovement: true,
        })),
      ];

      return {
        key,
        label,
        periods,
        incomeTotal,
        expenseTotal,
        balance: incomeTotal - expenseTotal,
        incomeByPerson,
        expenseByPerson,
        incomeEntriesByPerson,
        billsByPerson,
        relatedExpenseCards,
      };
    });
  }, [currentYear, movements, isBillPaid, entryOverrides]);

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

    return {
      incomeTotal,
      expenseTotal,
      balance: incomeTotal - expenseTotal,
      incomeByPerson,
      expenseByPerson,
      activeMonths: months.filter(
        (month) => month.incomeTotal > 0 || month.expenseTotal > 0,
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
            <span>Receitas no ano</span>
            <strong>{currency.format(yearSummary.incomeTotal)}</strong>
            <small>Leandro + Ketlin</small>
          </article>
          <article className="year-summary-card expense">
            <span>Despesas no ano</span>
            <strong>{currency.format(yearSummary.expenseTotal)}</strong>
            <small>Contas e lançamentos</small>
          </article>
          <article className="year-summary-card balance">
            <span>Saldo acumulado</span>
            <strong
              className={yearSummary.balance >= 0 ? "positive" : "negative"}
            >
              {currency.format(yearSummary.balance)}
            </strong>
            <small>Receitas menos despesas</small>
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
            <h2 id="year-overview-title">Balanço mensal</h2>
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
                      {month.incomeTotal > 0 || month.expenseTotal > 0
                        ? `${currency.format(month.incomeTotal)} em receitas · ${currency.format(month.expenseTotal)} em despesas`
                        : "Sem movimentações"}
                    </small>
                  </div>
                  <div className="month-accordion-values">
                    <span
                      className={month.balance >= 0 ? "positive" : "negative"}
                    >
                      {currency.format(month.balance)}
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
                        <span>Receitas totais</span>
                        <strong>{currency.format(month.incomeTotal)}</strong>
                      </article>
                      <article className="month-quick-card expense">
                        <span>Despesas totais</span>
                        <strong>{currency.format(month.expenseTotal)}</strong>
                      </article>
                      <article className="month-quick-card balance">
                        <span>Balanço do mês</span>
                        <strong
                          className={
                            month.balance >= 0 ? "positive" : "negative"
                          }
                        >
                          {currency.format(month.balance)}
                        </strong>
                      </article>
                    </div>
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
      <FloatingActionButton onClick={onOpenMovement} />
      {selectedMonth && (
        <MonthDetailsModal
          month={selectedMonth}
          onClose={() => setSelectedMonthKey(null)}
          onToggleBill={onToggleBill}
          onEdit={setEditingMovement}
        />
      )}
      {editingMovement && (
        <MovementModal
          initialMovement={editingMovement}
          onClose={() => setEditingMovement(null)}
          onDelete={() => {
            const movementId = editingMovement.id;
            if (movementId.startsWith("period-income:") || movementId.startsWith("period-expense:")) {
              setEntryOverrides((current) => ({ ...current, [movementId]: { deleted: true } }));
              setEditingMovement(null);
              return;
            }
            const resolvedMovementId = movementId.startsWith("movement:") ? movementId.replace("movement:", "") : movementId;
            onDeleteMovement(resolvedMovementId);
            setEntryOverrides((current) => {
              const next = { ...current };
              delete next[movementId];
              delete next[`movement:${resolvedMovementId}`];
              return next;
            });
            setEditingMovement(null);
          }}
          onSubmit={(movement) => {
            setEntryOverrides((current) => {
              const next = { ...current, [movement.id]: { ...movement, deleted: false } };
              if (movement.id.startsWith("movement:")) return next;
              if (current[`movement:${movement.id}`] || movements.some((entry) => entry.id === movement.id)) {
                next[`movement:${movement.id}`] = { ...movement, deleted: false };
              }
              return next;
            });
            setEditingMovement(null);
          }}
        />
      )}
    </div>
  );
}
