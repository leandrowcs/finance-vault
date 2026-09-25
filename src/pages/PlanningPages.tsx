import { Check, LogOut, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { financePeriods } from "../data/financeSeed";
import { currency } from "../lib/finance";
import type { Movement } from "../types/finance";

type PlanningPageProps = {
  movements: Movement[];
  user: User | null;
  displayName: string;
  initials: string;
  storageKey: string;
  onSignOut?: () => void;
  onToggleBill: (key: string) => void;
  isBillPaid: (key: string) => boolean;
};

type Goal = { id: string; name: string; target: number; saved: number };

function PageFrame({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children: React.ReactNode }) {
  return <div className="page-wrap utility-page"><div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="heading-copy">{copy}</p></div></div>{children}</div>;
}

export function BillsPage({ movements, onToggleBill, isBillPaid }: PlanningPageProps) {
  const manualBills = movements.filter((movement) => movement.type === "expense");
  return <PageFrame eyebrow="CONTAS" title="Contas e despesas" copy="Acompanhe compromissos recorrentes e lançamentos avulsos."><section className="utility-section"><div className="utility-section-heading"><h2>Despesas registradas</h2><span>{manualBills.length} lançamentos</span></div><div className="utility-list">{manualBills.length === 0 ? <div className="empty-state wide">Nenhuma despesa registrada.</div> : manualBills.map((movement) => <article className="utility-row" key={movement.id}><div><strong>{movement.description || "Despesa sem descrição"}</strong><small>{movement.category} · {movement.date}</small></div><strong>{currency.format(movement.amount)}</strong><button className={isBillPaid(`movement:${movement.id}`) ? "check-control checked" : "check-control"} type="button" aria-label={isBillPaid(`movement:${movement.id}`) ? `Desmarcar ${movement.description}` : `Marcar ${movement.description} como paga`} onClick={() => onToggleBill(`movement:${movement.id}`)}>{isBillPaid(`movement:${movement.id}`) ? <Check size={17} /> : <span />}</button></article>)}</div></section><section className="utility-section"><div className="utility-section-heading"><h2>Contas planejadas</h2><span>{financePeriods.reduce((total, period) => total + period.bills.length, 0)} registros</span></div><div className="utility-list">{financePeriods.flatMap((period) => period.bills.map((bill) => ({ period, bill }))).slice(0, 12).map(({ period, bill }) => { const key = `period:${period.date}:${bill.id}`; return <article className="utility-row" key={key}><div><strong>{bill.name}</strong><small>{bill.category} · vence {bill.due}</small></div><strong>{currency.format(bill.amount)}</strong><button className={isBillPaid(key) ? "check-control checked" : "check-control"} type="button" aria-label={isBillPaid(key) ? `Desmarcar ${bill.name}` : `Marcar ${bill.name} como paga`} onClick={() => onToggleBill(key)}>{isBillPaid(key) ? <Check size={17} /> : <span />}</button></article>; })}</div></section></PageFrame>;
}

export function IncomePage({ movements }: PlanningPageProps) {
  const manualIncome = movements.filter((movement) => movement.type === "income");
  return <PageFrame eyebrow="RECEITAS" title="Receitas" copy="Veja entradas manuais e pagamentos planejados."><section className="utility-section"><div className="utility-section-heading"><h2>Entradas manuais</h2><span>{manualIncome.length} lançamentos</span></div><div className="utility-list">{manualIncome.length === 0 ? <div className="empty-state wide">Nenhuma receita registrada.</div> : manualIncome.map((movement) => <article className="utility-row" key={movement.id}><div><strong>{movement.description || "Receita sem descrição"}</strong><small>{movement.category} · {movement.date}</small></div><strong className="positive">{currency.format(movement.amount)}</strong></article>)}</div></section><section className="utility-section"><div className="utility-section-heading"><h2>Pagamentos planejados</h2><span>{financePeriods.length} períodos</span></div><div className="utility-list">{financePeriods.map((period) => <article className="utility-row" key={period.date}><div><strong>{period.label}</strong><small>Receita do período</small></div><strong className="positive">{currency.format(period.income.leandro + period.income.ketlin)}</strong></article>)}</div></section></PageFrame>;
}

function goalsStorageKey(storageKey: string) { return `financevault:goals:${storageKey}`; }

export function GoalsPage({ storageKey }: PlanningPageProps) {
  const [goals, setGoals] = useState<Goal[]>(() => { try { return JSON.parse(localStorage.getItem(goalsStorageKey(storageKey)) ?? "[]") as Goal[]; } catch { return []; } });
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  useEffect(() => { localStorage.setItem(goalsStorageKey(storageKey), JSON.stringify(goals)); }, [goals, storageKey]);
  const addGoal = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const amount = Number(target); if (!name.trim() || !amount || amount <= 0) return; setGoals((current) => [...current, { id: crypto.randomUUID(), name: name.trim(), target: amount, saved: 0 }]); setName(""); setTarget(""); };
  return <PageFrame eyebrow="PLANEJAMENTO" title="Objetivos" copy="Transforme planos em metas acompanháveis."><form className="goal-form" onSubmit={addGoal}><label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Reserva de emergência" required /></label><label><span>Valor-alvo</span><input type="number" min="1" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="0,00" required /></label><button className="solid-button" type="submit"><Plus size={16} />Adicionar objetivo</button></form><div className="goal-grid">{goals.length === 0 ? <div className="empty-state wide">Nenhum objetivo criado.</div> : goals.map((goal) => { const progress = Math.min(100, goal.saved / goal.target * 100); return <article className="goal-card" key={goal.id}><div className="goal-card-heading"><div><strong>{goal.name}</strong><small>{currency.format(goal.saved)} de {currency.format(goal.target)}</small></div><button className="icon-button" type="button" aria-label={`Excluir objetivo ${goal.name}`} onClick={() => setGoals((current) => current.filter((item) => item.id !== goal.id))}><Trash2 size={16} /></button></div><div className="goal-progress"><span style={{ width: `${progress}%` }} /></div><small>{Math.round(progress)}% concluído</small></article>; })}</div></PageFrame>;
}

export function MembersPage({ user, displayName, initials }: PlanningPageProps) {
  return <PageFrame eyebrow="COLABORAÇÃO" title="Membros" copy="Controle quem participa deste espaço financeiro."><section className="member-card"><div className="person-avatar leandro">{initials.slice(0, 1)}</div><div><strong>{displayName}</strong><small>{user?.email ?? "Sessão local"}</small></div><span className="member-status">Administrador</span></section><div className="empty-state wide">Convites e permissões de membros serão adicionados nesta área.</div></PageFrame>;
}

export function SettingsPage({ user, displayName, onSignOut }: PlanningPageProps) {
  return <PageFrame eyebrow="PREFERÊNCIAS" title="Configurações" copy="Gerencie seu perfil e a sessão atual."><section className="settings-list"><article className="settings-row"><div className="person-avatar leandro">{displayName.slice(0, 1).toUpperCase()}</div><div><strong>{displayName}</strong><small>{user?.email ?? "Sessão local"}</small></div></article><article className="settings-row"><Target size={18} /><div><strong>Sincronização</strong><small>Dados compartilhados pelo Firestore.</small></div><span className="member-status">Ativa</span></article>{onSignOut && <button className="outline-button settings-signout" type="button" onClick={onSignOut}><LogOut size={16} />Sair da conta</button>}</section></PageFrame>;
}
