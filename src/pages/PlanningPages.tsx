import { ChevronDown, Check, LogOut, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { financePeriods, type SeedPayPeriod } from "../data/financeSeed";
import { calculateFinanceLedger, currency, dateKey, resolveFinancialEntries } from "../lib/finance";
import type { BillOccurrence, BillTemplate, EditablePayPeriod, Goal, GoalIncomeSource, HouseholdInvite, HouseholdMember, IncomeRecipient, MemberAccessLevel, Movement, ReceivedPayment } from "../types/finance";

type EntryOverride = Partial<Movement> & { deleted?: boolean };
type EntryOverrides = Record<string, EntryOverride>;

type PlanningPageProps = {
  movements: Movement[];
  periods?: SeedPayPeriod[];
  user: User | null;
  displayName: string;
  initials: string;
  storageKey: string;
  onSignOut?: () => void;
  onToggleBill: (key: string) => void;
  isBillPaid: (key: string) => boolean;
  sharedEntryOverrides?: EntryOverrides;
  goals?: Goal[];
  billOccurrences?: BillOccurrence[];
  billTemplates?: BillTemplate[];
  planningError?: string;
  onCreatePayPeriod?: (period: EditablePayPeriod, previousDate?: string) => Promise<void>;
  onReceiveIncome?: (periodDate: string, recipient: IncomeRecipient, payment: ReceivedPayment) => Promise<void>;
  onCreateBillTemplate?: (bill: BillTemplate) => Promise<void>;
  onToggleBillOccurrence?: (occurrenceId: string) => Promise<void>;
  canEditData?: boolean;
  canDeleteData?: boolean;
  goalsSyncError?: string;
  onCreateGoal?: (goal: Goal) => Promise<void>;
  onDeleteGoal?: (goalId: string) => Promise<void>;
  onContributeGoal?: (goalId: string, amount: number, source: GoalIncomeSource) => Promise<void>;
  householdId?: string;
  householdError?: string;
  accessLevel?: MemberAccessLevel;
  members?: HouseholdMember[];
  invites?: HouseholdInvite[];
  onCreateInvite?: (email: string, accessLevel: Exclude<MemberAccessLevel, "owner">) => Promise<string>;
  onUpdateMemberAccess?: (memberId: string, accessLevel: Exclude<MemberAccessLevel, "owner">) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  onRevokeInvite?: (inviteId: string) => Promise<void>;
};

type ItemKind = "manual" | "planned";
type BillListItem = {
  id: string;
  kind: ItemKind;
  title: string;
  amount: number;
  category: string;
  owner: Movement["owner"];
  date: string;
  dateLabel: string;
  toggleKey: string;
  paid: boolean;
  occurrenceId?: string;
  paidAmount?: number;
  history?: BillOccurrence["history"];
};
type IncomeListItem = {
  id: string;
  kind: ItemKind;
  title: string;
  amount: number;
  category: string;
  owner: Movement["owner"];
  date: string;
  dateLabel: string;
  received: boolean;
  periodDate?: string;
  recipient?: IncomeRecipient;
};
type MonthlyGroup<T extends { id: string; amount: number; date: string; kind: ItemKind; title: string }> = {
  key: string;
  label: string;
  items: T[];
  total: number;
  manualCount: number;
  plannedCount: number;
};

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function PageFrame({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children: React.ReactNode }) {
  return (
    <div className="page-wrap utility-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="heading-copy">{copy}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function itemDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatDate(date: string) {
  return dateFormatter.format(itemDate(date));
}

function sortItems<T extends { date: string; kind: ItemKind; title: string }>(items: T[]) {
  return [...items].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.kind.localeCompare(right.kind) ||
      left.title.localeCompare(right.title),
  );
}

function groupItemsByMonth<T extends { id: string; amount: number; date: string; kind: ItemKind; title: string }>(items: T[]) {
  const groups = new Map<string, MonthlyGroup<T>>();
  sortItems(items).forEach((item) => {
    const date = itemDate(item.date);
    const key = item.date.slice(0, 7);
    const current = groups.get(key);
    if (current) {
      current.items.push(item);
      current.total += item.amount;
      if (item.kind === "manual") current.manualCount += 1;
      if (item.kind === "planned") current.plannedCount += 1;
      return;
    }
    groups.set(key, {
      key,
      label: monthFormatter.format(date),
      items: [item],
      total: item.amount,
      manualCount: item.kind === "manual" ? 1 : 0,
      plannedCount: item.kind === "planned" ? 1 : 0,
    });
  });
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function useExpandedMonth(groups: { key: string }[]) {
  const [expandedKey, setExpandedKey] = useState<string | null>(
    groups.at(-1)?.key ?? null,
  );

  useEffect(() => {
    setExpandedKey((current) => {
      if (current && groups.some((group) => group.key === current)) return current;
      return groups.at(-1)?.key ?? null;
    });
  }, [groups]);

  return { expandedKey, setExpandedKey };
}

function MonthAccordion<T extends { id: string; amount: number; date: string; kind: ItemKind; title: string }>({
  group,
  isOpen,
  onToggle,
  children,
}: {
  group: MonthlyGroup<T>;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="utility-section utility-accordion-group">
      <button
        className="utility-accordion-trigger"
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <div>
          <h2>{group.label}</h2>
          <small>
            {group.items.length} itens · {group.manualCount} manuais · {group.plannedCount} planejados
          </small>
        </div>
        <div className="utility-accordion-summary">
          <strong>{currency.format(group.total)}</strong>
          <ChevronDown size={18} className={isOpen ? "utility-chevron open" : "utility-chevron"} />
        </div>
      </button>
      {isOpen && <div className="utility-accordion-content">{children}</div>}
    </section>
  );
}

function SectionBlock({ title, copy, count, children }: { title: string; copy: string; count: number; children: React.ReactNode }) {
  return (
    <div className="utility-subsection">
      <div className="utility-subsection-heading">
        <div>
          <h3>{title}</h3>
          <p>{copy}</p>
        </div>
        <span>{count} itens</span>
      </div>
      {children}
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return <div className="empty-state wide">{message}</div>;
}

function BillsList({ items, onToggleBill, onToggleBillOccurrence, canEditData = true }: { items: BillListItem[]; onToggleBill: (key: string) => void; onToggleBillOccurrence?: (occurrenceId: string) => Promise<void>; canEditData?: boolean }) {
  if (items.length === 0) return <EmptySection message="Nenhuma conta nesta seção." />;

  return (
    <div className="utility-list">
      {items.map((item) => {
        const paid = item.paid;
        const isOverdue = !paid && item.kind === "planned" && item.date < dateKey(new Date());
        return (
          <article className="utility-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <small>
                {item.category} · {item.owner} · {item.kind === "manual" ? "registrada" : isOverdue ? "atrasada" : "planejada"} · {item.dateLabel}
              </small>
              {item.history && item.history.length > 0 && <small>{item.history.slice(-3).map((event) => `${event.action === "paid" ? "Pago" : "Reaberto"} ${formatDate(event.date)} · ${currency.format(event.amount)}`).join(" | ")}</small>}
            </div>
            <strong>{currency.format(item.amount)}</strong>
            <button
              className={paid ? "check-control checked" : "check-control"}
              type="button"
              disabled={!canEditData}
              aria-label={paid ? `Desmarcar ${item.title}` : `Marcar ${item.title} como paga`}
              onClick={() => item.occurrenceId && onToggleBillOccurrence
                ? void onToggleBillOccurrence(item.occurrenceId)
                : onToggleBill(item.toggleKey)}
            >
              {paid ? <Check size={17} /> : <span />}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function BillTemplateForm({
  template,
  onSave,
}: {
  template?: BillTemplate;
  onSave: (bill: BillTemplate) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const startDate = String(values.get("startDate") ?? "");
    const amount = Number(values.get("amount"));
    const dueDateValue = new Date(`${startDate}T12:00:00`);
    const bill: BillTemplate = {
      id: template?.id ?? crypto.randomUUID(),
      name: String(values.get("name") ?? "").trim(),
      owner: String(values.get("owner") ?? "Você") as Movement["owner"],
      amount,
      category: String(values.get("category") ?? "Outros").trim(),
      dueDay: dueDateValue.getDate(),
      recurrence: String(values.get("recurrence") ?? "monthly") as BillTemplate["recurrence"],
      startDate,
      active: values.get("active") === "on",
    };
    if (!bill.name || !bill.category || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(dueDateValue.getTime())) return;
    try {
      await onSave(bill);
      setError("");
    } catch {
      setError("Não foi possível salvar a conta recorrente.");
    }
  };
  return (
    <form className="bill-template-form" onSubmit={(event) => void submit(event)}>
      <label><span>Conta</span><input aria-label="Nome da conta" name="name" defaultValue={template?.name ?? ""} required /></label>
      <label><span>Valor</span><input aria-label="Valor da conta" name="amount" type="number" min="0.01" step="0.01" defaultValue={template?.amount ?? ""} required /></label>
      <label><span>Vencimento inicial</span><input aria-label="Vencimento inicial" name="startDate" type="date" defaultValue={template?.startDate ?? dateKey(new Date())} required /></label>
      <label><span>Responsável</span><select name="owner" defaultValue={template?.owner ?? "Você"}><option value="Você">Você</option><option value="Esposa">Esposa</option><option value="Compartilhado">Compartilhado</option></select></label>
      <label><span>Categoria</span><input aria-label="Categoria da conta" name="category" defaultValue={template?.category ?? "Casa"} required /></label>
      <label><span>Recorrência</span><select name="recurrence" defaultValue={template?.recurrence ?? "monthly"}><option value="once">Uma vez</option><option value="biweekly">A cada duas semanas</option><option value="monthly">Mensal</option><option value="yearly">Anual</option></select></label>
      <label className="bill-template-active"><input name="active" type="checkbox" defaultChecked={template?.active ?? true} /> Gerar próximos vencimentos</label>
      <button className="outline-button" type="submit">{template ? "Salvar conta" : "Adicionar conta"}</button>
      {error && <p className="movement-error" role="alert">{error}</p>}
    </form>
  );
}

function IncomeList({ items, onReceiveIncome }: { items: IncomeListItem[]; onReceiveIncome?: PlanningPageProps["onReceiveIncome"] }) {
  const [receiptErrors, setReceiptErrors] = useState<Record<string, string>>({});
  if (items.length === 0) return <EmptySection message="Nenhuma receita nesta seção." />;

  return (
    <div className="utility-list">
      {items.map((item) => (
        <article className="utility-row income-planning-row" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <small>{item.category} · {item.owner} · {item.received ? "recebida" : "prevista"} · {item.dateLabel}</small>
          </div>
          <strong className="positive">{currency.format(item.amount)}</strong>
          {item.kind === "planned" && !item.received && item.periodDate && item.recipient && onReceiveIncome && (
            <form className="income-receipt-form" onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const actualAmount = Number(formData.get("actualAmount"));
              const receivedAt = String(formData.get("receivedAt") ?? "");
              if (!Number.isFinite(actualAmount) || actualAmount <= 0 || !receivedAt) return;
              void onReceiveIncome(item.periodDate!, item.recipient!, { actualAmount, receivedAt })
                .then(() => setReceiptErrors((current) => ({ ...current, [item.id]: "" })))
                .catch(() => setReceiptErrors((current) => ({ ...current, [item.id]: "Recebimento acima do previsto ou falha de sincronização." })));
            }}>
              <input aria-label={`Valor recebido de ${item.title}`} name="actualAmount" type="number" min="0.01" max={item.amount} step="0.01" defaultValue={item.amount} required />
              <input aria-label={`Data recebida de ${item.title}`} name="receivedAt" type="date" defaultValue={dateKey(new Date())} required />
              <button className="outline-button" type="submit">Registrar recebimento</button>
              {receiptErrors[item.id] && <small className="movement-error" role="alert">{receiptErrors[item.id]}</small>}
            </form>
          )}
        </article>
      ))}
    </div>
  );
}

function PayPeriodForm({
  period,
  onSave,
}: {
  period?: EditablePayPeriod;
  onSave: (period: EditablePayPeriod, previousDate?: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const date = String(values.get("date") ?? "");
    const leandro = Number(values.get("leandro"));
    const ketlin = Number(values.get("ketlin"));
    if (!date || !Number.isFinite(leandro) || leandro < 0 || !Number.isFinite(ketlin) || ketlin < 0) return;
    try {
      await onSave({
        date,
        label: new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`)),
        income: { ...period?.income, leandro, ketlin, extras: period?.income.extras ?? 0, leiaUniversitySavings: period?.income.leiaUniversitySavings ?? 0 },
        receivedIncome: period?.receivedIncome ?? {},
      }, period?.date);
      setError("");
    } catch {
      setError("Não foi possível salvar o período.");
    }
  };
  return (
    <form className="income-period-form" onSubmit={(event) => void submit(event)}>
      <label><span>Data do pagamento</span><input aria-label="Data do pagamento" name="date" type="date" defaultValue={period?.date ?? dateKey(new Date())} required /></label>
      <label><span>Previsto · Leandro</span><input aria-label="Pagamento previsto de Leandro" name="leandro" type="number" min="0" step="0.01" defaultValue={period?.income.leandro ?? 0} required /></label>
      <label><span>Previsto · Ketlin</span><input aria-label="Pagamento previsto de Ketlin" name="ketlin" type="number" min="0" step="0.01" defaultValue={period?.income.ketlin ?? 0} required /></label>
      <button className="outline-button" type="submit">{period ? "Salvar período" : "Adicionar período"}</button>
      {error && <p className="movement-error" role="alert">{error}</p>}
    </form>
  );
}

export function BillsPage({ movements, periods = financePeriods, billTemplates = [], billOccurrences = [], onToggleBill, onCreateBillTemplate, onToggleBillOccurrence, isBillPaid, sharedEntryOverrides = {}, canEditData = true, planningError = "" }: PlanningPageProps) {
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const monthGroups = useMemo(() => {
    const entries = resolveFinancialEntries(movements, sharedEntryOverrides, periods);
    const occurrencesById = new Map(billOccurrences.map((occurrence) => [occurrence.id, occurrence]));
    const items: BillListItem[] = entries.filter((entry) => entry.type === "expense").map((entry) => {
      const occurrence = entry.occurrenceId ? occurrencesById.get(entry.occurrenceId) : undefined;
      return {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      amount: entry.amount,
      category: entry.category,
      owner: entry.owner,
      date: entry.date,
      dateLabel: `${entry.kind === "planned" ? "vence em" : "lançada em"} ${formatDate(entry.date)}`,
      toggleKey: entry.toggleKey,
      paid: occurrence ? occurrence.status === "paid" : isBillPaid(entry.toggleKey),
      occurrenceId: occurrence?.id,
      paidAmount: occurrence?.paidAmount,
      history: occurrence?.history,
    }; });
    return groupItemsByMonth(items);
  }, [billOccurrences, movements, periods, isBillPaid, sharedEntryOverrides]);

  const { expandedKey, setExpandedKey } = useExpandedMonth(monthGroups);

  return (
    <PageFrame
      eyebrow="Visão geral"
      title="Contas e despesas"
      copy="No lançamento manual, selecione Despesa no campo Tipo. Contas previstas nos períodos financeiros aparecem como planejadas. Marque qualquer item como pago."
    >
      {planningError && <p className="movement-error" role="alert">{planningError}</p>}
      {onCreateBillTemplate && <BillTemplateForm onSave={onCreateBillTemplate} />}
      {billTemplates.map((template) => (
        <section className="bill-template-row" key={template.id}>
          <div><strong>{template.name}</strong><small>{currency.format(template.amount)} · {template.owner} · {template.recurrence}</small></div>
          {onCreateBillTemplate && <button className="outline-button" type="button" onClick={() => setEditingBillId((current) => current === template.id ? null : template.id)}>{editingBillId === template.id ? "Fechar" : "Editar"}</button>}
          {editingBillId === template.id && onCreateBillTemplate && <BillTemplateForm key={`${template.id}-${template.name}-${template.amount}-${template.startDate}-${template.active}`} template={template} onSave={onCreateBillTemplate} />}
        </section>
      ))}
      {monthGroups.length === 0 ? (
        <div className="empty-state wide">Nenhuma conta ou despesa disponível.</div>
      ) : (
        monthGroups.map((group) => {
          const manualItems = group.items.filter((item) => item.kind === "manual");
          const plannedItems = group.items.filter((item) => item.kind === "planned");
          const isOpen = expandedKey === group.key;
          return (
            <MonthAccordion
              key={group.key}
              group={group}
              isOpen={isOpen}
              onToggle={() => setExpandedKey((current) => (current === group.key ? null : group.key))}
            >
              <SectionBlock
                title="Despesas lançadas"
                copy="Movimentos manuais com tipo Despesa."
                count={manualItems.length}
              >
                <BillsList items={manualItems} onToggleBill={onToggleBill} onToggleBillOccurrence={onToggleBillOccurrence} canEditData={canEditData} />
              </SectionBlock>
              <SectionBlock
                title="Contas planejadas"
                copy="Contas cadastradas nos períodos financeiros; o vencimento define a data."
                count={plannedItems.length}
              >
                <BillsList items={plannedItems} onToggleBill={onToggleBill} onToggleBillOccurrence={onToggleBillOccurrence} canEditData={canEditData} />
              </SectionBlock>
            </MonthAccordion>
          );
        })
      )}
    </PageFrame>
  );
}

export function IncomePage({ movements, periods = financePeriods, sharedEntryOverrides = {}, onCreatePayPeriod, onReceiveIncome, planningError = "" }: PlanningPageProps) {
  const monthGroups = useMemo(() => {
    const entries = resolveFinancialEntries(movements, sharedEntryOverrides, periods);
    const items: IncomeListItem[] = entries.filter((entry) => entry.type === "income").map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      amount: entry.amount,
      category: entry.category,
      owner: entry.owner,
      date: entry.date,
      dateLabel: formatDate(entry.date),
        received: entry.received,
        periodDate: entry.periodDate,
        recipient: entry.incomeRecipient,
    }));
    return groupItemsByMonth(items);
  }, [movements, periods, sharedEntryOverrides]);

  const { expandedKey, setExpandedKey } = useExpandedMonth(monthGroups);

  return (
    <PageFrame
      eyebrow="Planejamento"
      title="Receitas"
      copy="Registre períodos, previsões e recebimentos reais. O valor previsto diminui conforme cada recebimento é lançado."
    >
      {planningError && <p className="movement-error" role="alert">{planningError}</p>}
      {onCreatePayPeriod && <PayPeriodForm onSave={onCreatePayPeriod} />}
      {monthGroups.length === 0 ? (
        <div className="empty-state wide">Nenhuma receita disponível.</div>
      ) : (
        monthGroups.map((group) => {
          const manualItems = group.items.filter((item) => item.kind === "manual");
          const plannedItems = group.items.filter((item) => item.kind === "planned");
          const isOpen = expandedKey === group.key;
          return (
            <MonthAccordion
              key={group.key}
              group={group}
              isOpen={isOpen}
              onToggle={() => setExpandedKey((current) => (current === group.key ? null : group.key))}
            >
              {onCreatePayPeriod && periods.filter((period) => period.date.startsWith(group.key)).map((period) => (
                <PayPeriodForm key={period.date} period={period} onSave={onCreatePayPeriod} />
              ))}
              <SectionBlock
                title="Entradas manuais"
                copy="Receitas adicionadas manualmente e identificadas pelo responsável do lançamento."
                count={manualItems.length}
              >
                <IncomeList items={manualItems} />
              </SectionBlock>
              <SectionBlock
                title="Pagamentos planejados"
                copy="Receitas previstas no calendário financeiro, separadas por pessoa."
                count={plannedItems.length}
              >
                <IncomeList items={plannedItems} onReceiveIncome={onReceiveIncome} />
              </SectionBlock>
            </MonthAccordion>
          );
        })
      )}
    </PageFrame>
  );
}

export function GoalsPage({ movements, periods = financePeriods, user, displayName, sharedEntryOverrides = {}, goals = [], goalsSyncError = "", onCreateGoal, onDeleteGoal, onContributeGoal }: PlanningPageProps) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [contributionAmounts, setContributionAmounts] = useState<Record<string, string>>({});
  const [contributionOwners, setContributionOwners] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const currentDateKey = dateKey(new Date());
  const currentMonthKey = currentDateKey.slice(0, 7);
  const currentMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());
  const ownerLabels = useMemo(() => {
    const wifeIsLoggedIn = `${user?.email ?? ""} ${user?.displayName ?? ""}`.toLowerCase().includes("ketlin");
    return {
      "Você": wifeIsLoggedIn ? "Leandro" : displayName,
      "Esposa": wifeIsLoggedIn ? displayName : "Ketlin",
    };
  }, [displayName, user?.displayName, user?.email]);
  const financialEntries = useMemo(
    () => resolveFinancialEntries(movements, sharedEntryOverrides, periods),
    [movements, periods, sharedEntryOverrides],
  );
  const contributions = goals.flatMap((goal) => goal.contributions);
  const ledger = calculateFinanceLedger(financialEntries, contributions, currentDateKey);
  const currentMonth = ledger.get(currentMonthKey);
  const hasUnassignedContributions = contributions.some((contribution) =>
    !contribution.incomeSourceId && (contribution.incomeSourceDate ?? contribution.date).startsWith(currentMonthKey),
  );
  const monthlyBalances = ( ["Você", "Esposa"] as const).map((owner) => {
    const id = `income-balance:${owner}:${currentMonthKey}`;
    const ownerContributions = contributions.filter((contribution) =>
      (contribution.incomeSourceOwner === owner || (!contribution.incomeSourceOwner && !contribution.incomeSourceId)) &&
      (contribution.incomeSourceDate ?? contribution.date).startsWith(currentMonthKey),
    );
    const currentAllocations = ownerContributions
      .filter((contribution) => contribution.incomeSourceId === id)
      .reduce((total, contribution) => total + contribution.amount, 0);
    const available = currentMonth?.availableByOwner[owner] ?? 0;
    const allocated = currentMonth?.goalContributionsByOwner[owner] ?? 0;
    return {
      id,
      label: `${ownerLabels[owner]} · saldo de ${currentMonthLabel}`,
      amount: available + allocated,
      date: currentDateKey,
      owner,
      receivedAmount: currentMonth?.receivedByOwner[owner] ?? 0,
      expenseAmount: currentMonth?.expenseByOwner[owner] ?? 0,
      allocatedAmount: allocated,
      legacyReserved: Math.max(0, allocated - currentAllocations),
      available,
    };
  });

  const addGoal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(target);
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0 || !onCreateGoal) return;
    setError("");
    try {
      await onCreateGoal({ id: crypto.randomUUID(), name: name.trim(), target: amount, saved: 0, contributions: [] });
      setName("");
      setTarget("");
    } catch {
      setError("Objetivo salvo localmente; sincronização falhou.");
    }
  };

  const addContribution = async (event: React.FormEvent<HTMLFormElement>, goal: Goal) => {
    event.preventDefault();
    const amount = Number(contributionAmounts[goal.id]);
    const source = monthlyBalances.find((item) => item.owner === contributionOwners[goal.id]);
    if (!Number.isFinite(amount) || amount <= 0 || !source || !onContributeGoal) return;
    if (amount > source.available + 0.005) {
      setError("Aporte maior que o saldo livre deste mês.");
      return;
    }
    setError("");
    try {
      await onContributeGoal(goal.id, amount, source);
      setContributionAmounts((current) => ({ ...current, [goal.id]: "" }));
    } catch {
      setError("Aporte não registrado; confira a origem, o saldo ou a sincronização.");
    }
  };

  const removeGoal = async (goalId: string) => {
    if (!onDeleteGoal) return;
    setError("");
    try {
      await onDeleteGoal(goalId);
    } catch {
      setError("Não foi possível excluir o objetivo sincronizado.");
    }
  };

  return (
    <PageFrame eyebrow="PLANEJAMENTO" title="Objetivos" copy="O saldo mensal considera receitas já recebidas menos despesas registradas e contas previstas.">
      <form className="goal-form" onSubmit={addGoal}>
        <label>
          <span>Nome</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Reserva de emergência"
            required
          />
        </label>
        <label>
          <span>Valor-alvo</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="0,00"
            required
          />
        </label>
        <button className="solid-button objective-button" type="submit" disabled={!onCreateGoal}>
          <Plus size={18} />
          Adicionar objetivo
        </button>
      </form>
      {(goalsSyncError || error) && <p className="movement-error" role="status">{error || goalsSyncError}</p>}
      {hasUnassignedContributions && <p className="goal-source-notice">Aportes antigos sem origem reservam saldo das receitas mais antigas.</p>}
      <div className="goal-grid">
        {goals.length === 0 ? (
          <div className="empty-state wide">Nenhum objetivo criado.</div>
        ) : (
          goals.map((goal) => {
            const progress = Math.min(100, (goal.saved / goal.target) * 100);
            const selectedOwner = contributionOwners[goal.id];
            const monthlyBalance = monthlyBalances.find((balance) => balance.owner === selectedOwner);
            return (
              <article className="goal-card" key={goal.id}>
                <div className="goal-card-heading">
                  <div>
                    <strong>{goal.name}</strong>
                    <small>
                      {currency.format(goal.saved)} de {currency.format(goal.target)}
                    </small>
                  </div>
                  {onDeleteGoal && <button
                    className="icon-button"
                    type="button"
                    aria-label={`Excluir objetivo ${goal.name}`}
                    onClick={() => void removeGoal(goal.id)}
                  >
                    <Trash2 size={16} />
                  </button>}
                </div>
                <div className="goal-progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>{Math.round(progress)}% concluído</small>
                <form className="goal-contribution-form" onSubmit={(event) => void addContribution(event, goal)}>
                  <label>
                    <span>Quem faz o aporte?</span>
                    <select
                      aria-label={`Titular do aporte para ${goal.name}`}
                      value={contributionOwners[goal.id] ?? ""}
                      onChange={(event) => {
                        setContributionOwners((current) => ({ ...current, [goal.id]: event.target.value as Movement["owner"] | "" }));
                        setContributionAmounts((current) => ({ ...current, [goal.id]: "" }));
                      }}
                      required
                    >
                      <option value="">Selecione a pessoa</option>
                      <option value="Você">{ownerLabels["Você"]}</option>
                      <option value="Esposa">{ownerLabels.Esposa}</option>
                    </select>
                  </label>
                  {monthlyBalance && (
                    <div className="goal-month-balance" aria-live="polite">
                      <p><span>Recebido no mês</span><strong>{currency.format(monthlyBalance.receivedAmount ?? 0)}</strong></p>
                      <p><span>Despesas e contas</span><strong>{currency.format(monthlyBalance.expenseAmount ?? 0)}</strong></p>
                      <p><span>Já destinado</span><strong>{currency.format(monthlyBalance.allocatedAmount ?? 0)}</strong></p>
                      <p><span>Disponível para objetivos</span><strong>{currency.format(monthlyBalance.available)}</strong></p>
                    </div>
                  )}
                  {selectedOwner && monthlyBalance?.receivedAmount === 0 && (
                    <p className="goal-source-notice">Nenhuma receita recebida por {ownerLabels[selectedOwner as "Você" | "Esposa"]} neste mês.</p>
                  )}
                  <label>
                    <span>Aporte</span>
                    <input
                      aria-label={`Valor do aporte para ${goal.name}`}
                      type="number"
                      min="0.01"
                      max={monthlyBalance?.available ?? undefined}
                      step="0.01"
                      value={contributionAmounts[goal.id] ?? ""}
                      onChange={(event) => setContributionAmounts((current) => ({ ...current, [goal.id]: event.target.value }))}
                      placeholder="0,00"
                      required
                    />
                  </label>
                  <button className="outline-button" type="submit" disabled={!onContributeGoal || !monthlyBalance || monthlyBalance.available <= 0}>Registrar aporte</button>
                </form>
                {goal.contributions.length > 0 && (
                  <div className="goal-contribution-history">
                    {goal.contributions.slice(-3).reverse().map((contribution) => (
                      <small key={contribution.id}>
                        {currency.format(contribution.amount)} · {contribution.incomeSourceOwner ?? "Origem antiga"} · {contribution.incomeSourceLabel ?? "Receita sem origem"} · receita {formatDate(contribution.incomeSourceDate ?? contribution.date)} · aporte {formatDate(contribution.date)}
                      </small>
                    ))}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </PageFrame>
  );
}

export function MembersPage({
  user,
  displayName,
  initials,
  householdId,
  householdError = "",
  accessLevel = "owner",
  members = [],
  invites = [],
  onCreateInvite,
  onUpdateMemberAccess,
  onRemoveMember,
  onRevokeInvite,
}: PlanningPageProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccess, setInviteAccess] = useState<Exclude<MemberAccessLevel, "owner">>("read");
  const [error, setError] = useState("");
  const isOwner = accessLevel === "owner";
  const sendInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onCreateInvite) return;
    setError("");
    try {
      const inviteUrl = await onCreateInvite(inviteEmail.trim().toLowerCase(), inviteAccess);
      const accessLabel = inviteAccess === "read" ? "Leitura" : inviteAccess === "edit" ? "Edição" : "Edição e exclusão";
      const subject = encodeURIComponent("Convite para o FinanceVault");
      const body = encodeURIComponent(`${displayName} convidou você para compartilhar o FinanceVault (${accessLabel}).\n\nAceite o convite: ${inviteUrl}`);
      window.location.href = `mailto:${encodeURIComponent(inviteEmail.trim())}?subject=${subject}&body=${body}`;
      setInviteEmail("");
    } catch {
      setError("Não foi possível criar o convite.");
    }
  };
  const updateAccess = async (memberId: string, level: Exclude<MemberAccessLevel, "owner">) => {
    if (!onUpdateMemberAccess) return;
    setError("");
    try {
      await onUpdateMemberAccess(memberId, level);
    } catch {
      setError("Não foi possível atualizar o acesso.");
    }
  };
  const removeAccess = async (memberId: string) => {
    if (!onRemoveMember) return;
    setError("");
    try {
      await onRemoveMember(memberId);
    } catch {
      setError("Não foi possível remover o membro.");
    }
  };
  const cancelInvite = async (inviteId: string) => {
    if (!onRevokeInvite) return;
    setError("");
    try {
      await onRevokeInvite(inviteId);
    } catch {
      setError("Não foi possível revogar o convite.");
    }
  };

  return (
    <PageFrame eyebrow="COLABORAÇÃO" title="Membros" copy="Convide pessoas e controle o acesso aos dados deste orçamento.">
      {isOwner && (
        <form className="member-invite-form" onSubmit={(event) => void sendInvite(event)}>
          <label>
            <span>E-mail da pessoa</span>
            <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
          </label>
          <label>
            <span>Acesso</span>
            <select value={inviteAccess} onChange={(event) => setInviteAccess(event.target.value as Exclude<MemberAccessLevel, "owner">)}>
              <option value="read">Ler</option>
              <option value="edit">Ler e editar</option>
              <option value="delete">Ler, editar e deletar</option>
            </select>
          </label>
          <button className="solid-button" type="submit" disabled={!householdId || !onCreateInvite}>Enviar convite</button>
        </form>
      )}
      {(error || householdError) && <p className="movement-error" role="alert">{error || householdError}</p>}
      <div className="member-list">
        {members.length === 0 && user && isOwner && (
          <section className="member-card">
            <div className="person-avatar leandro">{initials.slice(0, 1)}</div>
            <div><strong>{displayName}</strong><small>{user.email ?? "Sessão local"}</small></div>
            <span className="member-status">Proprietário</span>
          </section>
        )}
        {members.map((member) => (
          <section className="member-card" key={member.uid}>
            <div className="person-avatar leandro">{(member.displayName || member.email).slice(0, 1).toUpperCase()}</div>
            <div><strong>{member.displayName || member.email}</strong><small>{member.email}</small></div>
            {member.accessLevel === "owner" ? <span className="member-status">Proprietário</span> : isOwner ? (
              <div className="member-controls">
                <select aria-label={`Nível de acesso de ${member.displayName || member.email}`} value={member.accessLevel} onChange={(event) => void updateAccess(member.uid, event.target.value as Exclude<MemberAccessLevel, "owner">)}>
                  <option value="read">Ler</option>
                  <option value="edit">Ler e editar</option>
                  <option value="delete">Ler, editar e deletar</option>
                </select>
                <button className="entry-delete-button" type="button" aria-label={`Remover ${member.displayName || member.email}`} onClick={() => void removeAccess(member.uid)}><Trash2 size={15} /></button>
              </div>
            ) : <span className="member-status">{member.accessLevel === "read" ? "Leitura" : member.accessLevel === "edit" ? "Edição" : "Edição e exclusão"}</span>}
          </section>
        ))}
      </div>
      {isOwner && invites.filter((invite) => invite.status === "pending").map((invite) => (
        <section className="member-card pending-invite" key={invite.id}>
          <div><strong>{invite.email}</strong><small>Convite pendente · {invite.accessLevel === "read" ? "Leitura" : invite.accessLevel === "edit" ? "Edição" : "Edição e exclusão"}</small></div>
          <button className="entry-delete-button" type="button" aria-label={`Revogar convite para ${invite.email}`} onClick={() => void cancelInvite(invite.id)}><Trash2 size={15} /></button>
        </section>
      ))}
    </PageFrame>
  );
}

export function SettingsPage({ user, displayName, onSignOut }: PlanningPageProps) {
  return (
    <PageFrame eyebrow="PREFERÊNCIAS" title="Configurações" copy="Gerencie seu perfil e a sessão atual.">
      <section className="settings-list">
        <article className="settings-row">
          <div className="person-avatar leandro">{displayName.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{displayName}</strong>
            <small>{user?.email ?? "Sessão local"}</small>
          </div>
        </article>
        <article className="settings-row">
          <Target size={18} />
          <div>
            <strong>Sincronização</strong>
            <small>Dados compartilhados pelo Firestore.</small>
          </div>
          <span className="member-status">Ativa</span>
        </article>
        {onSignOut && (
          <button className="outline-button settings-signout" type="button" onClick={onSignOut}>
            <LogOut size={16} />
            Sair da conta
          </button>
        )}
      </section>
    </PageFrame>
  );
}
