import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  Menu,
  Plus,
  ReceiptText,
  Settings2,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import "./App.css";
import { activePeriod, financePeriods, totalIncome } from "./data/financeSeed";

type Owner = "Você" | "Esposa" | "Compartilhado";
type Bill = {
  id: string;
  name: string;
  owner: Owner;
  amount: number;
  due: string;
  category: string;
  paid: boolean;
};

const initialBills: Bill[] = activePeriod.bills;
const payments = financePeriods.map((period, index) => ({
  date: period.label,
  label: index === 0 ? "Pagamento recebido" : "Próximo pagamento",
  amount: totalIncome(period),
  status: index === 0 ? "upcoming" : "next",
}));
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const openedAt = new Date();
const monthLabels = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const monthIndexes: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};
const greeting =
  openedAt.getHours() < 12
    ? "Bom dia"
    : openedAt.getHours() < 18
      ? "Boa tarde"
      : "Boa noite";
const openedDateLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(openedAt);
const calendarMonth = new Date(
  openedAt.getFullYear(),
  openedAt.getMonth(),
  1,
);
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dueDate = (periodDate: string, due: string) => {
  const [day, month] = due.split(" ");
  const year = new Date(`${periodDate}T00:00:00`).getFullYear();
  return new Date(year, monthIndexes[month], Number(day));
};
const incomeDates = new Set(financePeriods.map((period) => period.date));
const billDates = new Set(
  financePeriods.flatMap((period) =>
    period.bills.map((bill) => dateKey(dueDate(period.date, bill.due))),
  ),
);
const calendarCells = Array.from(
  {
    length:
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() +
      calendarMonth.getDay(),
  },
  (_, index) =>
    index < calendarMonth.getDay()
      ? null
      : index - calendarMonth.getDay() + 1,
);
const reservedAmount = (bill: Bill) =>
  bill.owner === "Compartilhado" ? bill.amount / 2 : bill.amount;

function App() {
  const [bills, setBills] = useState(initialBills);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const totals = useMemo(() => {
    const reserved = bills.reduce(
      (total, bill) => total + reservedAmount(bill),
      0,
    );
    return { reserved, liquid: totalIncome(activePeriod) - reserved };
  }, [bills]);
  const periodIncome = totalIncome(activePeriod);
  const commitmentPercent = Math.round((totals.reserved / periodIncome) * 100);
  const toggleBill = (id: string) =>
    setBills((current) =>
      current.map((bill) =>
        bill.id === id ? { ...bill, paid: !bill.paid } : bill,
      ),
    );

  return (
    <main className="app-shell">
      <aside className={isMenuOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark">
            <img src="/icons/finance-vault-logo.svg" alt="" width="28" height="28" />
          </div>
          <span>Finance Vault</span>
          <button
            className="icon-button mobile-close"
            type="button"
            aria-label="Fechar menu"
            onClick={() => setIsMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          <span className="nav-label">Visão geral</span>
          <a className="nav-link active" href="#dashboard">
            <WalletCards size={17} />
            Dashboard
          </a>
          <a className="nav-link" href="#payments">
            <CalendarDays size={17} />
            Pagamentos<span className="nav-count">26</span>
          </a>
          <a className="nav-link" href="#bills">
            <ReceiptText size={17} />
            Contas<span className="nav-count">12</span>
          </a>
          <span className="nav-label spaced">Planejamento</span>
          <a className="nav-link" href="#income">
            <ArrowUpRight size={17} />
            Receitas
          </a>
          <a className="nav-link" href="#goals">
            <Sparkles size={17} />
            Objetivos
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-link" href="#members">
            <Users size={17} />
            Membros
          </a>
          <a className="nav-link" href="#settings">
            <Settings2 size={17} />
            Configurações
          </a>
          <div className="secure-note">
            <span>
              <Check size={13} />
            </span>
            <p>
              <strong>Seus dados estão seguros</strong>
              <small>Sincronizado agora</small>
            </p>
          </div>
        </div>
      </aside>
      {isMenuOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Fechar menu"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <section className="content" id="dashboard">
        <header className="topbar">
          <button
            className="icon-button menu-trigger"
            type="button"
            aria-label="Abrir menu"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="crumbs">
            <ChevronRight size={14} />
            <strong>Dashboard</strong>
          </div>
          <div className="top-actions">
            <button
              className="period-button"
              type="button"
              onClick={() => setIsCalendarOpen(true)}
            >
              <CalendarDays size={16} />
                {`${monthLabels[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`}
              <ChevronRight size={14} />
            </button>
            <button className="profile-button" aria-label="Abrir perfil">
              LC
            </button>
          </div>
        </header>
        {isCalendarOpen && (
          <section className="calendar-page" aria-label="Calendário financeiro">
            <div className="page-heading calendar-heading">
              <div>
                <p className="eyebrow">CALENDÁRIO FINANCEIRO</p>
                <h1>
                  {monthLabels[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                </h1>
                <p className="heading-copy">
                  Receitas e contas organizadas por data.
                </p>
              </div>
              <button
                className="outline-button"
                type="button"
                onClick={() => setIsCalendarOpen(false)}
              >
                <ChevronRight size={16} />
                Voltar ao dashboard
              </button>
            </div>
            <div className="calendar-legend" aria-label="Legenda do calendário">
              <span><i className="calendar-dot income" /> Receita</span>
              <span><i className="calendar-dot bill" /> Conta a pagar</span>
            </div>
            <div className="calendar-grid">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                <span className="calendar-weekday" key={day}>{day}</span>
              ))}
              {calendarCells.map((day, index) => {
                if (!day) return <span className="calendar-day empty" key={`empty-${index}`} />;
                const currentDate = new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth(),
                  day,
                );
                const key = dateKey(currentDate);
                const hasIncome = incomeDates.has(key);
                const hasBill = billDates.has(key);
                return (
                  <span
                    className={`calendar-day${hasIncome ? " income-day" : ""}${hasBill ? " bill-day" : ""}`}
                    key={key}
                  >
                    <strong>{day}</strong>
                    {(hasIncome || hasBill) && (
                      <span className="calendar-markers">
                        {hasIncome && <i className="calendar-dot income" />}
                        {hasBill && <i className="calendar-dot bill" />}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </section>
        )}
        <div className={isCalendarOpen ? "page-wrap dashboard-hidden" : "page-wrap"}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{openedDateLabel.toUpperCase()}</p>
              <h1>{greeting}, Leandro.</h1>
              <p className="heading-copy">
                Aqui está o pulso financeiro das suas contas para o próximo pagamento.
              </p>
            </div>
            <button className="primary-button">
              <Plus size={17} />
              Adicionar movimento
            </button>
          </div>
          <section className="stats-grid" aria-label="Resumo financeiro">
            <article className="stat-card accent-card">
              <div className="stat-head">
                <span>Próximo pagamento</span>
                <span className="status-pill">Em 3 dias</span>
              </div>
              <strong>{currency.format(periodIncome)}</strong>
              <p>
                {activePeriod.label} <span>•</span> receita do período
              </p>
              <div className="progress-track">
                <span style={{ width: `${commitmentPercent}%` }} />
              </div>
              <small>{commitmentPercent}% já comprometido</small>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                <span>Contas reservadas</span>
                <ReceiptText size={18} />
              </div>
              <strong>{currency.format(totals.reserved)}</strong>
              <p>de {currency.format(periodIncome)} recebidos</p>
              <div className="stat-footer">
                <span className="mini-dot peach" />
                {bills.length} contas previstas
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                <span>Saldo líquido</span>
                <ArrowUpRight size={18} />
              </div>
              <strong className="positive">
                {currency.format(totals.liquid)}
              </strong>
              <p>disponível após compromissos</p>
              <div className="stat-footer">
                <span className="mini-dot mint" />
                +12,4% vs. pagamento anterior
              </div>
            </article>
          </section>
          <div className="content-grid">
            <section className="panel payments-panel" id="payments">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">FLUXO DE CAIXA</p>
                  <h2>Próximos pagamentos</h2>
                </div>
                <button className="text-button">
                  Ver calendário <ChevronRight size={15} />
                </button>
              </div>
              <div className="payment-list">
                {payments.map((payment) => (
                  <div
                    className={
                      payment.status === "next"
                        ? "payment-row next-payment"
                        : "payment-row"
                    }
                    key={payment.date}
                  >
                    <div className="date-block">
                      <strong>{payment.date.split(" ")[0]}</strong>
                      <span>SET/OUT</span>
                    </div>
                    <div className="payment-info">
                      <strong>{payment.label}</strong>
                      <span>
                        {payment.status === "next"
                          ? "Receita do período"
                          : "Salários + recorrentes"}
                      </span>
                    </div>
                    <strong className="payment-amount">
                      {currency.format(payment.amount)}
                    </strong>
                    <ChevronRight size={17} />
                  </div>
                ))}
              </div>
              <button className="add-payment">
                <Plus size={16} />
                Planejar outro pagamento
              </button>
            </section>
            <section className="panel goal-panel" id="goals">
              <div className="goal-orbit">
                <Sparkles size={20} />
              </div>
              <p className="eyebrow">OBJETIVO DO MÊS</p>
              <h2>Reserva de emergência</h2>
              <p className="goal-copy">
                Cada pagamento deixa suas contas um pouco mais tranquilas.
              </p>
              <div className="goal-value">
                <strong>{currency.format(780)}</strong>
                <span>de {currency.format(2000)}</span>
              </div>
              <div className="goal-track">
                <span style={{ width: "39%" }} />
              </div>
              <div className="goal-footer">
                <span>39% concluído</span>
                <ArrowUpRight size={16} />
              </div>
            </section>
          </div>
          <section className="panel bills-panel" id="bills">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{activePeriod.label.toUpperCase()}</p>
                <h2>Contas deste pagamento</h2>
              </div>
              <button className="outline-button">
                <Plus size={16} />
                Nova conta
              </button>
            </div>
            <div className="bill-table">
              <div className="table-head">
                <span>Conta</span>
                <span>Responsável</span>
                <span>Vencimento</span>
                <span>Valor</span>
                <span>Status</span>
              </div>
              {bills.map((bill) => (
                <div className="bill-row" key={bill.id}>
                  <div className="bill-name">
                    <button
                      className={
                        bill.paid ? "check-control checked" : "check-control"
                      }
                      type="button"
                      aria-label={
                        bill.paid
                          ? `Desmarcar ${bill.name}`
                          : `Marcar ${bill.name} como paga`
                      }
                      onClick={() => toggleBill(bill.id)}
                    >
                      {bill.paid ? (
                        <CircleCheck size={20} />
                      ) : (
                        <Circle size={20} />
                      )}
                    </button>
                    <div>
                      <strong>{bill.name}</strong>
                      <small>{bill.category}</small>
                    </div>
                  </div>
                  <span className="owner-label">{bill.owner}</span>
                  <span className="due-label">{bill.due}</span>
                  <strong
                    className={bill.paid ? "bill-amount muted" : "bill-amount"}
                  >
                    {currency.format(bill.amount)}
                  </strong>
                  <span
                    className={bill.paid ? "bill-status paid" : "bill-status"}
                  >
                    {bill.paid ? "Paga" : "Pendente"}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <footer className="app-footer">
            <span>FinanceVault</span>
            <span>Seu dinheiro, no mesmo plano.</span>
            <span>Última sincronização: agora</span>
          </footer>
        </div>
      </section>
    </main>
  );
}

export default App;
