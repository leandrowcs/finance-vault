import { ChevronDown, Check, LogOut, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { financePeriods } from "../data/financeSeed";
import { currency, dateKey, dueDate } from "../lib/finance";
import type { Goal, GoalIncomeSource, HouseholdInvite, HouseholdMember, MemberAccessLevel, Movement } from "../types/finance";

type EntryOverride = Partial<Movement> & { deleted?: boolean };
type EntryOverrides = Record<string, EntryOverride>;

type PlanningPageProps = {
  movements: Movement[];
  user: User | null;
  displayName: string;
  initials: string;
  storageKey: string;
  onSignOut?: () => void;
  onToggleBill: (key: string) => void;
  isBillPaid: (key: string) => boolean;
  sharedEntryOverrides?: EntryOverrides;
  goals?: Goal[];
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

function BillsList({ items, onToggleBill, isBillPaid, canEditData = true }: { items: BillListItem[]; onToggleBill: (key: string) => void; isBillPaid: (key: string) => boolean; canEditData?: boolean }) {
  if (items.length === 0) return <EmptySection message="Nenhuma conta nesta seção." />;

  return (
    <div className="utility-list">
      {items.map((item) => {
        const paid = isBillPaid(item.toggleKey) || item.paid;
        return (
          <article className="utility-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <small>
                {item.category} · {item.owner} · {item.kind === "manual" ? "registrada" : "planejada"} · {item.dateLabel}
              </small>
            </div>
            <strong>{currency.format(item.amount)}</strong>
            <button
              className={paid ? "check-control checked" : "check-control"}
              type="button"
              disabled={!canEditData}
              aria-label={paid ? `Desmarcar ${item.title}` : `Marcar ${item.title} como paga`}
              onClick={() => onToggleBill(item.toggleKey)}
            >
              {paid ? <Check size={17} /> : <span />}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function IncomeList({ items }: { items: IncomeListItem[] }) {
  if (items.length === 0) return <EmptySection message="Nenhuma receita nesta seção." />;

  return (
    <div className="utility-list">
      {items.map((item) => (
        <article className="utility-row" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <small>
              {item.category} · {item.owner} · {item.kind === "manual" ? "manual" : "planejada"} · {item.dateLabel}
            </small>
          </div>
          <strong className="positive">{currency.format(item.amount)}</strong>
        </article>
      ))}
    </div>
  );
}

export function BillsPage({ movements, onToggleBill, isBillPaid, sharedEntryOverrides = {}, canEditData = true }: PlanningPageProps) {
  const monthGroups = useMemo(() => {
    const plannedItems: BillListItem[] = financePeriods.flatMap((period) =>
      period.bills.flatMap((bill) => {
        const override = sharedEntryOverrides[`period-expense:${period.date}:${bill.id}`];
        if (override?.deleted) return [];
        const date = override?.date ?? dateKey(dueDate(period.date, bill.due));
        return [{
          id: `period:${period.date}:${bill.id}`,
          kind: "planned" as const,
          title: override?.description ?? bill.name,
          amount: override?.amount ?? bill.amount,
          category: override?.category ?? bill.category,
          owner: override?.owner ?? bill.owner,
          date,
          dateLabel: `vence em ${formatDate(date)}`,
          toggleKey: `period:${period.date}:${bill.id}`,
          paid: isBillPaid(`period:${period.date}:${bill.id}`),
        }];
      }),
    );
    const manualItems: BillListItem[] = movements
      .map((movement) => ({
        ...movement,
        ...sharedEntryOverrides[`movement:${movement.id}`],
      }))
      .filter((movement) => !movement.deleted && movement.type === "expense")
      .map((movement) => ({
        id: movement.id,
        kind: "manual" as const,
        title: movement.description || "Despesa sem descrição",
        amount: movement.amount,
        category: movement.category,
        owner: movement.owner,
        date: movement.date,
        dateLabel: `lançada em ${formatDate(movement.date)}`,
        toggleKey: `movement:${movement.id}`,
        paid: isBillPaid(`movement:${movement.id}`),
      }));

    return groupItemsByMonth([...plannedItems, ...manualItems]);
  }, [movements, isBillPaid, sharedEntryOverrides]);

  const { expandedKey, setExpandedKey } = useExpandedMonth(monthGroups);

  return (
    <PageFrame
      eyebrow="Visão geral"
      title="Contas e despesas"
      copy="No lançamento manual, selecione Despesa no campo Tipo. Contas previstas nos períodos financeiros aparecem como planejadas. Marque qualquer item como pago."
    >
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
                <BillsList items={manualItems} onToggleBill={onToggleBill} isBillPaid={isBillPaid} canEditData={canEditData} />
              </SectionBlock>
              <SectionBlock
                title="Contas planejadas"
                copy="Contas cadastradas nos períodos financeiros; o vencimento define a data."
                count={plannedItems.length}
              >
                <BillsList items={plannedItems} onToggleBill={onToggleBill} isBillPaid={isBillPaid} canEditData={canEditData} />
              </SectionBlock>
            </MonthAccordion>
          );
        })
      )}
    </PageFrame>
  );
}

export function IncomePage({ movements, sharedEntryOverrides = {} }: PlanningPageProps) {
  const monthGroups = useMemo(() => {
    const plannedItems: IncomeListItem[] = financePeriods.flatMap((period) => {
      const leandroOverride = sharedEntryOverrides[`period-income:${period.date}:leandro`];
      const ketlinOverride = sharedEntryOverrides[`period-income:${period.date}:ketlin`];
      const items: IncomeListItem[] = [];
      if (!leandroOverride?.deleted) {
        const date = leandroOverride?.date ?? period.date;
        items.push({
          id: `period-income:${period.date}:leandro`,
          kind: "planned",
          title: leandroOverride?.description ?? "Pagamento planejado · Você",
          amount: leandroOverride?.amount ?? period.income.leandro,
          category: leandroOverride?.category ?? "Salário",
          owner: leandroOverride?.owner ?? "Você",
          date,
          dateLabel: formatDate(date),
        });
      }
      if (!ketlinOverride?.deleted) {
        const date = ketlinOverride?.date ?? period.date;
        items.push({
          id: `period-income:${period.date}:ketlin`,
          kind: "planned",
          title: ketlinOverride?.description ?? "Pagamento planejado · Esposa",
          amount: ketlinOverride?.amount ?? period.income.ketlin,
          category: ketlinOverride?.category ?? "Salário",
          owner: ketlinOverride?.owner ?? "Esposa",
          date,
          dateLabel: formatDate(date),
        });
      }
      return items;
    });
    const manualItems: IncomeListItem[] = movements
      .map((movement) => ({
        ...movement,
        ...sharedEntryOverrides[`movement:${movement.id}`],
      }))
      .filter((movement) => !movement.deleted && movement.type === "income")
      .map((movement) => ({
        id: movement.id,
        kind: "manual" as const,
        title: movement.description || "Receita sem descrição",
        amount: movement.amount,
        category: movement.category,
        owner: movement.owner,
        date: movement.date,
        dateLabel: formatDate(movement.date),
      }));

    return groupItemsByMonth([...plannedItems, ...manualItems]);
  }, [movements, sharedEntryOverrides]);

  const { expandedKey, setExpandedKey } = useExpandedMonth(monthGroups);

  return (
    <PageFrame
      eyebrow="Planejamento"
      title="Receitas"
      copy="As entradas manuais vêm dos lançamentos salvos nesta conta. Os pagamentos planejados mostram as receitas previstas de Você e Esposa."
    >
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
                <IncomeList items={plannedItems} />
              </SectionBlock>
            </MonthAccordion>
          );
        })
      )}
    </PageFrame>
  );
}

export function GoalsPage({ movements, user, displayName, sharedEntryOverrides = {}, goals = [], goalsSyncError = "", onCreateGoal, onDeleteGoal, onContributeGoal }: PlanningPageProps) {
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
  const { monthlyBalances, hasUnassignedContributions } = useMemo(() => {
    const monthMovements = movements
      .map((movement) => ({ ...movement, ...sharedEntryOverrides[`movement:${movement.id}`] }))
      .filter((movement) => !movement.deleted && movement.date.startsWith(currentMonthKey));
    const manualReceivedSources = monthMovements
      .filter((movement) => movement.type === "income" && movement.date <= currentDateKey && movement.owner !== "Compartilhado")
      .map((movement) => ({
        id: movement.id,
        owner: movement.owner as "Você" | "Esposa",
        date: movement.date,
        amount: movement.amount,
      }));
    const plannedReceivedSources = financePeriods
      .filter((period) => period.date.startsWith(currentMonthKey))
      .flatMap((period) => ([
        {
          id: `period-income:${period.date}:leandro`,
          owner: "Você" as const,
          amount: sharedEntryOverrides[`period-income:${period.date}:leandro`]?.amount ?? period.income.leandro,
          date: sharedEntryOverrides[`period-income:${period.date}:leandro`]?.date ?? period.date,
          deleted: sharedEntryOverrides[`period-income:${period.date}:leandro`]?.deleted,
        },
        {
          id: `period-income:${period.date}:ketlin`,
          owner: "Esposa" as const,
          amount: sharedEntryOverrides[`period-income:${period.date}:ketlin`]?.amount ?? period.income.ketlin,
          date: sharedEntryOverrides[`period-income:${period.date}:ketlin`]?.date ?? period.date,
          deleted: sharedEntryOverrides[`period-income:${period.date}:ketlin`]?.deleted,
        },
      ]).filter((source) => !source.deleted && source.date.startsWith(currentMonthKey) && source.date <= currentDateKey)
        .map(({ deleted: _deleted, ...source }) => source));
    const receivedSources = [...plannedReceivedSources, ...manualReceivedSources];
    const receivedByOwner = receivedSources.reduce<Record<"Você" | "Esposa", number>>(
      (totals, source) => ({ ...totals, [source.owner]: totals[source.owner] + source.amount }),
      { "Você": 0, "Esposa": 0 },
    );
    const sharedIncome = monthMovements
      .filter((movement) => movement.type === "income" && movement.owner === "Compartilhado" && movement.date <= currentDateKey)
      .reduce((total, movement) => total + movement.amount / 2, 0);
    receivedByOwner["Você"] += sharedIncome;
    receivedByOwner.Esposa += sharedIncome;
    const addExpense = (totals: Record<"Você" | "Esposa", number>, owner: Movement["owner"], amount: number) => {
      if (owner === "Compartilhado") {
        return { "Você": totals["Você"] + amount / 2, "Esposa": totals.Esposa + amount / 2 };
      }
      return { ...totals, [owner]: totals[owner] + amount };
    };
    const movementExpenses = monthMovements
      .filter((movement) => movement.type === "expense")
      .reduce((totals, movement) => addExpense(totals, movement.owner, movement.amount), { "Você": 0, "Esposa": 0 });
    const plannedExpenses = financePeriods
      .filter((period) => period.date.startsWith(currentMonthKey))
      .flatMap((period) => period.bills.flatMap((bill) => {
        const override = sharedEntryOverrides[`period-expense:${period.date}:${bill.id}`];
        if (override?.deleted) return [];
        const date = override?.date ?? dateKey(dueDate(period.date, bill.due));
        if (!date.startsWith(currentMonthKey)) return [];
        return [{ owner: override?.owner ?? bill.owner, amount: override?.amount ?? bill.amount }];
      }));
    const expenseByOwner = plannedExpenses.reduce(
      (totals, expense) => addExpense(totals, expense.owner, expense.amount),
      movementExpenses,
    );
    const sourceOwnerById = new Map(receivedSources.map((source) => [source.id, source.owner]));
    const contributions = goals.flatMap((goal) => goal.contributions).filter((contribution) =>
      (contribution.incomeSourceDate ?? contribution.date).startsWith(currentMonthKey),
    );
    const ownerForContribution = (contribution: Goal["contributions"][number]) =>
      contribution.incomeSourceOwner ?? (contribution.incomeSourceId ? sourceOwnerById.get(contribution.incomeSourceId) : undefined);
    const unassignedContributions = contributions.filter((contribution) => !ownerForContribution(contribution));
    const ownerOrder = (["Você", "Esposa"] as const).slice().sort((left, right) => {
      const firstLeftIncome = receivedSources.find((source) => source.owner === left)?.date ?? "9999-12-31";
      const firstRightIncome = receivedSources.find((source) => source.owner === right)?.date ?? "9999-12-31";
      return firstLeftIncome.localeCompare(firstRightIncome);
    });
    const legacyReservations = ownerOrder.reduce<{
      remaining: number;
      byOwner: Record<"Você" | "Esposa", number>;
    }>((state, owner) => {
      const balance = Math.max(0, receivedByOwner[owner] - expenseByOwner[owner]);
      const reserved = Math.min(state.remaining, balance);
      return {
        remaining: state.remaining - reserved,
        byOwner: { ...state.byOwner, [owner]: reserved },
      };
    }, {
      remaining: unassignedContributions.reduce((total, contribution) => total + contribution.amount, 0),
      byOwner: { "Você": 0, "Esposa": 0 },
    });
    const monthlyBalances = (["Você", "Esposa"] as const).map((owner) => {
      const id = `income-balance:${owner}:${currentMonthKey}`;
      const ownerContributions = contributions.filter((contribution) => ownerForContribution(contribution) === owner);
      const currentBalanceAllocations = ownerContributions
        .filter((contribution) => contribution.incomeSourceId === id)
        .reduce((total, contribution) => total + contribution.amount, 0);
      const previousAllocations = ownerContributions
        .filter((contribution) => contribution.incomeSourceId !== id)
        .reduce((total, contribution) => total + contribution.amount, 0);
      const amount = Math.max(0, receivedByOwner[owner] - expenseByOwner[owner]);
      const legacyReserved = previousAllocations + legacyReservations.byOwner[owner];
      return {
        id,
        label: `${ownerLabels[owner]} · saldo de ${currentMonthLabel}`,
        amount,
        date: currentDateKey,
        owner,
        receivedAmount: receivedByOwner[owner],
        expenseAmount: expenseByOwner[owner],
        allocatedAmount: currentBalanceAllocations + previousAllocations + legacyReservations.byOwner[owner],
        legacyReserved,
        available: Math.max(0, amount - legacyReserved - currentBalanceAllocations),
      };
    });
    return { monthlyBalances, hasUnassignedContributions: unassignedContributions.length > 0 };
  }, [currentDateKey, currentMonthKey, currentMonthLabel, goals, movements, ownerLabels, sharedEntryOverrides]);

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
