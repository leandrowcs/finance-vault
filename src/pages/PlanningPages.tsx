import { ChevronDown, Check, LogOut, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { financePeriods } from "../data/financeSeed";
import { currency, dateKey, dueDate } from "../lib/finance";
import type { Movement } from "../types/finance";

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
};

type Goal = { id: string; name: string; target: number; saved: number };
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
type MonthlyGroup<T extends { id: string; amount: number; date: string; kind: ItemKind }> = {
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

function groupItemsByMonth<T extends { id: string; amount: number; date: string; kind: ItemKind }>(items: T[]) {
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

function MonthAccordion<T extends { id: string; amount: number; date: string; kind: ItemKind }>({
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

function BillsList({ items, onToggleBill, isBillPaid }: { items: BillListItem[]; onToggleBill: (key: string) => void; isBillPaid: (key: string) => boolean }) {
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

export function BillsPage({ movements, onToggleBill, isBillPaid, sharedEntryOverrides = {} }: PlanningPageProps) {
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
      eyebrow="CONTAS"
      title="Contas e despesas"
      copy="Veja todas as despesas registradas manualmente e as contas planejadas, organizadas por mês e ordenadas pela data."
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
                title="Despesas registradas"
                copy="Lançamentos criados manualmente nesta conta."
                count={manualItems.length}
              >
                <BillsList items={manualItems} onToggleBill={onToggleBill} isBillPaid={isBillPaid} />
              </SectionBlock>
              <SectionBlock
                title="Contas planejadas"
                copy="Contas previstas no calendário financeiro, incluindo meses futuros."
                count={plannedItems.length}
              >
                <BillsList items={plannedItems} onToggleBill={onToggleBill} isBillPaid={isBillPaid} />
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
      return [
        !leandroOverride?.deleted
          ? {
              id: `period-income:${period.date}:leandro`,
              kind: "planned" as const,
              title: leandroOverride?.description ?? "Pagamento planejado · Você",
              amount: leandroOverride?.amount ?? period.income.leandro,
              category: leandroOverride?.category ?? "Salário",
              owner: leandroOverride?.owner ?? "Você",
              date: leandroOverride?.date ?? period.date,
              dateLabel: formatDate(leandroOverride?.date ?? period.date),
            }
          : null,
        !ketlinOverride?.deleted
          ? {
              id: `period-income:${period.date}:ketlin`,
              kind: "planned" as const,
              title: ketlinOverride?.description ?? "Pagamento planejado · Esposa",
              amount: ketlinOverride?.amount ?? period.income.ketlin,
              category: ketlinOverride?.category ?? "Salário",
              owner: ketlinOverride?.owner ?? "Esposa",
              date: ketlinOverride?.date ?? period.date,
              dateLabel: formatDate(ketlinOverride?.date ?? period.date),
            }
          : null,
      ].filter((item): item is IncomeListItem => Boolean(item));
    });
    const manualItems: IncomeListItem[] = movements
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
      eyebrow="RECEITAS"
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

function goalsStorageKey(storageKey: string) {
  return `financevault:goals:${storageKey}`;
}

export function GoalsPage({ storageKey }: PlanningPageProps) {
  const [goals, setGoals] = useState<Goal[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(goalsStorageKey(storageKey)) ?? "[]") as Goal[];
    } catch {
      return [];
    }
  });
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    localStorage.setItem(goalsStorageKey(storageKey), JSON.stringify(goals));
  }, [goals, storageKey]);

  const addGoal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(target);
    if (!name.trim() || !amount || amount <= 0) return;
    setGoals((current) => [
      ...current,
      { id: crypto.randomUUID(), name: name.trim(), target: amount, saved: 0 },
    ]);
    setName("");
    setTarget("");
  };

  return (
    <PageFrame eyebrow="PLANEJAMENTO" title="Objetivos" copy="Transforme planos em metas acompanháveis.">
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
        <button className="solid-button" type="submit">
          <Plus size={16} />
          Adicionar objetivo
        </button>
      </form>
      <div className="goal-grid">
        {goals.length === 0 ? (
          <div className="empty-state wide">Nenhum objetivo criado.</div>
        ) : (
          goals.map((goal) => {
            const progress = Math.min(100, (goal.saved / goal.target) * 100);
            return (
              <article className="goal-card" key={goal.id}>
                <div className="goal-card-heading">
                  <div>
                    <strong>{goal.name}</strong>
                    <small>
                      {currency.format(goal.saved)} de {currency.format(goal.target)}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Excluir objetivo ${goal.name}`}
                    onClick={() => setGoals((current) => current.filter((item) => item.id !== goal.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="goal-progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>{Math.round(progress)}% concluído</small>
              </article>
            );
          })
        )}
      </div>
    </PageFrame>
  );
}

export function MembersPage({ user, displayName, initials }: PlanningPageProps) {
  return (
    <PageFrame eyebrow="COLABORAÇÃO" title="Membros" copy="Controle quem participa deste espaço financeiro.">
      <section className="member-card">
        <div className="person-avatar leandro">{initials.slice(0, 1)}</div>
        <div>
          <strong>{displayName}</strong>
          <small>{user?.email ?? "Sessão local"}</small>
        </div>
        <span className="member-status">Administrador</span>
      </section>
      <div className="empty-state wide">Convites e permissões de membros serão adicionados nesta área.</div>
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
