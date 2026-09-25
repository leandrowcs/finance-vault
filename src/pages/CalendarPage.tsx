import { ChevronLeft, ChevronRight } from "lucide-react";
import { currency, dateKey, monthLabels } from "../lib/finance";
import type { CalendarItem } from "../types/finance";

type CalendarPageProps = { calendarMonth: Date; calendarItems: Map<string, CalendarItem[]>; selectedDay: string | null; onChangeMonth: (offset: number) => void; onSelectDay: (day: string) => void };

export function CalendarPage({ calendarMonth, calendarItems, selectedDay, onChangeMonth, onSelectDay }: CalendarPageProps) {
  const firstDay = calendarMonth.getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  const selectedItems = selectedDay ? calendarItems.get(selectedDay) ?? [] : [];
  return (
    <section className="calendar-page" aria-label="Calendário financeiro">
      <div className="page-heading calendar-heading">
        <div>
          <p className="eyebrow">CALENDÁRIO FINANCEIRO</p>
          <h1>{monthLabels[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</h1>
          <p className="heading-copy">Receitas e contas organizadas por data.</p>
        </div>
        <div className="calendar-actions">
          <div className="calendar-month-actions">
            <button className="icon-button calendar-nav-button" type="button" aria-label="Mês anterior" title="Mês anterior" onClick={() => onChangeMonth(-1)}><ChevronLeft size={18} /></button>
            <button className="icon-button calendar-nav-button" type="button" aria-label="Próximo mês" title="Próximo mês" onClick={() => onChangeMonth(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      <div className="calendar-legend"><span><i className="calendar-dot income" /> Receita</span><span><i className="calendar-dot bill" /> Conta a pagar</span></div>
      <div className="calendar-grid">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span className="calendar-day empty" key={`empty-${index}`} />;
          const key = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
          const items = calendarItems.get(key) ?? [];
          const hasIncome = items.some((item) => item.type === "income");
          const hasBill = items.some((item) => item.type === "bill");
          return <button type="button" className={`calendar-day${hasIncome ? " income-day" : ""}${hasBill ? " bill-day" : ""}`} key={key} onClick={() => onSelectDay(key)}><strong>{day}</strong>{items.length > 0 && <span className="calendar-markers">{hasIncome && <i className="calendar-dot income" />}{hasBill && <i className="calendar-dot bill" />}</span>}</button>;
        })}
      </div>
      {selectedItems.length > 0 && selectedDay && <div className="calendar-details"><div className="panel-heading"><div><p className="eyebrow">DETALHES DO DIA</p><h2>{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDay}T12:00:00`))}</h2></div></div><div className="calendar-detail-list">{selectedItems.map((item, index) => <div className="calendar-detail-row" key={`${item.title}-${index}`}><span className={`calendar-dot ${item.type}`} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><strong>{currency.format(item.amount)}</strong></div>)}</div></div>}
    </section>
  );
}
