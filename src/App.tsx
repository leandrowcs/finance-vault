import { useEffect, useMemo, useState } from "react";
import { sendSignInLinkToEmail, type User } from "firebase/auth";
import { arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, writeBatch } from "firebase/firestore";
import { financePeriods } from "./data/financeSeed";
import { AppNavigation, type NavigationView } from "./components/AppNavigation";
import { AppTopbar } from "./components/AppTopbar";
import { ProfileModal } from "./components/ProfileModal";
import { MovementModal } from "./components/MovementModal";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BillsPage, GoalsPage, IncomePage, MembersPage, SettingsPage } from "./pages/PlanningPages";
import { buildSeedPlanningMigration, dateKey, findPlannedIncomeMatches, generateBillOccurrences, nextPaymentFromPeriods, resolveFinancialEntries, toggleBillOccurrencePayment, type FinancialEntry, type FinanceOverrides } from "./lib/finance";
import { auth, db } from "./lib/firebase";
import { allocationTotals, emptyFinanceData, parseBackup, previewRestore, type FinanceBackup, type FinanceData } from "./lib/backup";
import { readFinanceData, restoreFinanceData } from "./lib/backupFirestore";
import { useFinanceSync } from "./lib/useFinanceSync";
import { syncLabels } from "./lib/sync";
import { localBackupKey, persistLocalFinance } from "./lib/localFinance";
import { LocalDataRecovery } from "./components/LocalDataRecovery";
import type { BillOccurrence, BillTemplate, CalendarItem, EditablePayPeriod, Goal, GoalContribution, GoalIncomeSource, HouseholdInvite, HouseholdMember, IncomeRecipient, InviteDeliveryMode, MemberAccessLevel, Movement, ReceivedPayment } from "./types/finance";
import "./App.css";

type AppProps = { user?: User | null; onSignOut?: () => Promise<void> };
type EntryOverrides = FinanceOverrides;
type DataUser = Pick<User, "uid"> | null;
function readLocalBackup() {
  const stored = localStorage.getItem(localBackupKey);
  return stored ? parseBackup(stored) : null;
}

type IncomeConflict = { movement: Movement; matches: FinancialEntry[] };

function IncomeConflictDialog({
  conflict,
  selectedKey,
  error,
  onSelect,
  onReplace,
  onAddExtra,
  onCancel,
}: {
  conflict: IncomeConflict;
  selectedKey: string;
  error: string;
  onSelect: (key: string) => void;
  onReplace: () => void;
  onAddExtra: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="income-conflict-layer">
      <button className="profile-modal-backdrop" type="button" aria-label="Voltar ao lançamento" onClick={onCancel} />
      <section className="movement-modal income-conflict-modal" role="dialog" aria-modal="true" aria-labelledby="income-conflict-title">
        <p className="eyebrow">RECEITA SEMELHANTE</p>
        <h2 id="income-conflict-title">Pagamento previsto nesta data</h2>
        <p className="heading-copy">Este valor já aparece como previsto. Substitua um pagamento ou registre como receita extra.</p>
        <div className="income-conflict-options" role="radiogroup" aria-label="Pagamento previsto para substituir">
          {conflict.matches.map((match) => (
            <label key={match.key}>
              <input type="radio" name="planned-income-match" value={match.key} checked={selectedKey === match.key} onChange={() => onSelect(match.key)} />
              <span>{match.title} · {match.owner} · {conflictDateFormatter.format(new Date(`${match.date}T12:00:00`))}</span>
            </label>
          ))}
        </div>
        {error && <p className="movement-error" role="alert">{error}</p>}
        <div className="income-conflict-actions">
          <button className="outline-button" type="button" onClick={onCancel}>Voltar</button>
          <button className="outline-button" type="button" onClick={onAddExtra}>Registrar como extra</button>
          <button className="solid-button" type="button" disabled={!selectedKey} onClick={onReplace}>Substituir previsto</button>
        </div>
      </section>
    </div>
  );
}

const openedAt = new Date();
const greeting = openedAt.getHours() < 12 ? "Bom dia" : openedAt.getHours() < 18 ? "Boa tarde" : "Boa noite";
const openedDateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(openedAt);
const conflictDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function viewFromHash(): NavigationView {
  const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "dashboard";
  return ["dashboard", "payments", "bills", "income", "goals", "members", "settings"].includes(hash) ? hash as NavigationView : "dashboard";
}

function periodBillKey(periodDate: string, billId: string) {
  return `period:${periodDate}:${billId}`;
}

function movementsStorageKey(user: DataUser) {
  return user ? `financevault:movements:${user.uid}` : "financevault:movements";
}

function billsStorageKey(user: DataUser) {
  return user ? `financevault:bills:${user.uid}` : "financevault:bills";
}

function entryOverridesStorageKey(user: DataUser) {
  return `financevault:entry-overrides:${user?.uid ?? "local"}`;
}

function goalsStorageKey(storageKey: string) {
  return `financevault:goals:${storageKey}`;
}

function normalizeGoal(id: string, data: Record<string, unknown>): Goal {
  const contributions = Array.isArray(data.contributions)
    ? data.contributions.filter((item): item is GoalContribution =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as GoalContribution).id === "string" &&
        Number.isFinite((item as GoalContribution).amount) &&
        typeof (item as GoalContribution).date === "string",
      )
    : [];
  const saved = contributions.reduce((total, item) => total + item.amount, 0);
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Objetivo",
    target: Number.isFinite(data.target) && Number(data.target) > 0 ? Number(data.target) : 1,
    saved: contributions.length > 0 ? saved : Number.isFinite(data.saved) ? Number(data.saved) : 0,
    contributions,
  };
}

function materializePlanningPeriods(
  periods: EditablePayPeriod[],
  billTemplates: BillTemplate[],
  billOccurrences: BillOccurrence[],
) {
  const templatesById = new Map(billTemplates.map((bill) => [bill.id, bill]));
  const knownPeriodDates = new Set(periods.map((period) => period.date));
  const syntheticPeriods = [...new Set(billOccurrences
    .map((occurrence) => occurrence.periodDate)
    .filter((periodDate) => !knownPeriodDates.has(periodDate)))].map((date): EditablePayPeriod => ({
      date,
      label: date,
      income: { ketlin: 0, leandro: 0, extras: 0, leiaUniversitySavings: 0 },
    }));
  return [...periods, ...syntheticPeriods].map((period) => ({
    ...period,
    bills: billOccurrences
      .filter((occurrence) => occurrence.periodDate === period.date)
      .map((occurrence) => ({
        id: occurrence.billId,
        name: occurrence.name,
        owner: occurrence.owner,
        amount: occurrence.amount,
        due: occurrence.dueDate,
        dueDate: occurrence.dueDate,
        category: occurrence.category,
        paid: occurrence.status === "paid",
        recurrence: templatesById.get(occurrence.billId)?.recurrence,
        occurrenceHistory: occurrence.history,
        paidAmount: occurrence.paidAmount ?? 0,
      })),
  })).sort((left, right) => left.date.localeCompare(right.date));
}

function readStoredGoals(storageKey: string) {
  try {
    const stored = localStorage.getItem(goalsStorageKey(storageKey));
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Goal => Boolean(item) && typeof item === "object" && typeof (item as Goal).id === "string")
          .map((item) => normalizeGoal(item.id, item as unknown as Record<string, unknown>))
      : [];
  } catch {
    return [];
  }
}

function normalizeEntryOverrides(overrides: EntryOverrides) {
  return Object.entries(overrides).reduce<EntryOverrides>((normalized, [key, value]) => {
    const normalizedKey = key.startsWith("movement:period-income:") || key.startsWith("movement:period-expense:")
      ? key.replace("movement:", "")
      : key;
    normalized[normalizedKey] = value;
    return normalized;
  }, {});
}

function sharedStateRef(user: Pick<User, "uid">) {
  return doc(db!, "users", user.uid, "settings", "shared");
}

function readStoredMovements(user: DataUser) {
  try {
    const stored = localStorage.getItem(movementsStorageKey(user));
    return stored ? JSON.parse(stored) as Movement[] : [];
  } catch {
    return [];
  }
}

function readStoredBillState(user: DataUser) {
  try {
    const stored = localStorage.getItem(billsStorageKey(user));
    return stored ? JSON.parse(stored) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function readStoredEntryOverrides(user: DataUser) {
  try {
    const stored = localStorage.getItem(entryOverridesStorageKey(user));
    return stored ? normalizeEntryOverrides(JSON.parse(stored) as EntryOverrides) : {};
  } catch {
    return {};
  }
}

function addRecurrenceDate(date: string, recurrence: NonNullable<Movement["recurrence"]>, index: number) {
  const nextDate = new Date(`${date}T12:00:00`);
  if (recurrence === "biweekly") nextDate.setDate(nextDate.getDate() + index * 14);
  if (recurrence === "monthly" || recurrence === "yearly") {
    const originalDay = nextDate.getDate();
    const targetMonth = nextDate.getMonth() + (recurrence === "monthly" ? index : index * 12);
    nextDate.setDate(1);
    nextDate.setMonth(targetMonth);
    const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(originalDay, lastDay));
  }
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
}

function expandRecurringMovement(movement: Movement) {
  const recurrence = movement.recurrence ?? "none";
  const count = recurrence === "none" ? 1 : Math.min(120, Math.max(1, movement.recurrenceCount ?? 1));
  const recurrenceId = movement.recurrenceId ?? movement.id;
  const movementData = { ...movement };
  delete movementData.recurrenceId;
  delete movementData.recurrenceIndex;
  return Array.from({ length: count }, (_, index) => ({
    ...movementData,
    id: index === 0 ? movement.id : `${recurrenceId}:${index}`,
    date: recurrence === "none" ? movement.date : addRecurrenceDate(movement.date, recurrence, index),
    recurrence,
    recurrenceCount: count,
    ...(recurrence === "none" ? {} : { recurrenceId, recurrenceIndex: index }),
  }));
}

export default function App({ user = null, onSignOut }: AppProps = {}) {
  const [localLoad] = useState(() => {
    try { return { backup: !user && !db ? readLocalBackup() : null, error: "" }; }
    catch { return { backup: null, error: "Não foi possível ler os dados locais. O conteúdo original foi preservado." }; }
  });
  const localBackup = localLoad.backup;
  const [localHasData, setLocalHasData] = useState(() => Boolean(localBackup) || readStoredMovements(null).length > 0 || readStoredGoals("local").length > 0 || Object.keys(readStoredBillState(null)).length > 0 || Object.keys(readStoredEntryOverrides(null)).length > 0);
  const [initialPlanning] = useState(() => localBackup ? { periods: localBackup.data.periods, bills: localBackup.data.bills, occurrences: localBackup.data.occurrences } : buildSeedPlanningMigration(financePeriods, readStoredBillState(user)));
  const [billPaidState, setBillPaidState] = useState<Record<string, boolean>>(() => ({ ...Object.fromEntries(financePeriods.flatMap((period) => period.bills.map((bill) => [periodBillKey(period.date, bill.id), bill.paid]))), ...readStoredBillState(user) }));
  const [entryOverrides, setEntryOverrides] = useState<EntryOverrides | undefined>();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<NavigationView>(viewFromHash);
  const [calendarMonth, setCalendarMonth] = useState(new Date(openedAt.getFullYear(), openedAt.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [incomeConflict, setIncomeConflict] = useState<IncomeConflict | null>(null);
  const [selectedPlannedIncomeKey, setSelectedPlannedIncomeKey] = useState("");
  const [incomeConflictError, setIncomeConflictError] = useState("");
  const [movementSaveError, setMovementSaveError] = useState("");
  const [movementsLoaded, setMovementsLoaded] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [goalsSyncError, setGoalsSyncError] = useState("");
  const [planningPeriods, setPlanningPeriods] = useState<EditablePayPeriod[]>(initialPlanning.periods);
  const [billTemplates, setBillTemplates] = useState<BillTemplate[]>(initialPlanning.bills);
  const [billOccurrences, setBillOccurrences] = useState<BillOccurrence[]>(initialPlanning.occurrences);
  const [planningLoaded, setPlanningLoaded] = useState(!user || !db);
  const [planningError, setPlanningError] = useState("");
  const [dataOwnerUid, setDataOwnerUid] = useState<string | null>(user?.uid ?? null);
  const [householdLoaded, setHouseholdLoaded] = useState(!user || !db);
  const [householdError, setHouseholdError] = useState("");
  const [accessLevel, setAccessLevel] = useState<MemberAccessLevel>("owner");
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [householdInvites, setHouseholdInvites] = useState<HouseholdInvite[]>([]);
  const dataUser: DataUser = dataOwnerUid ? { uid: dataOwnerUid } : null;
  const sync = useFinanceSync(dataOwnerUid, householdLoaded);
  const [operationError, setOperationError] = useState("");
  const mutationsAllowed = !localLoad.error && !sync.pending && ((!dataOwnerUid || !db) || (sync.online && sync.status === "synced" && !planningError && !householdError));
  const canEditData = accessLevel !== "read" && mutationsAllowed;
  const canDeleteData = (accessLevel === "delete" || accessLevel === "owner") && mutationsAllowed;
  const syncError = localLoad.error || operationError || sync.error || planningError || goalsSyncError || householdError;
  const syncStatus = sync.status === "offline" ? "offline" as const : syncError ? "error" as const : sync.status;
  const dataReady = householdLoaded && movementsLoaded && goalsLoaded && planningLoaded;
  const [showSyncedBanner, setShowSyncedBanner] = useState(false);
  useEffect(() => {
    if (syncStatus !== "synced" || !dataReady) {
      setShowSyncedBanner(false);
      return;
    }
    setShowSyncedBanner(true);
    const timeout = window.setTimeout(() => setShowSyncedBanner(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [dataReady, syncStatus]);
  const reportOperation = async <T,>(operation: () => Promise<T>): Promise<T> => {
    setOperationError("");
    try { return await sync.run(operation); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível salvar a alteração."); throw error; }
  };
  const financialData: FinanceData = { movements, goals, periods: planningPeriods, bills: billTemplates, occurrences: billOccurrences, settings: { billPaidState, entryOverrides: entryOverrides ?? {}, incomeAllocations: allocationTotals(goals) } };
  const commitLocalData = (patch: Partial<FinanceData>) => {
    const data = { ...financialData, ...patch };
    data.settings = { ...data.settings, incomeAllocations: allocationTotals(data.goals) };
    persistLocalFinance(localStorage, data);
    setLocalHasData(true);
    setMovements(data.movements); setGoals(data.goals); setPlanningPeriods(data.periods);
    setBillTemplates(data.bills); setBillOccurrences(data.occurrences);
    setBillPaidState(data.settings.billPaidState); setEntryOverrides(data.settings.entryOverrides);
  };
  const readBackupData = async () => {
    if (dataOwnerUid && db) {
      if (syncStatus !== "synced") throw new Error("Aguarde a confirmação dos dados no servidor.");
      return readFinanceData(db, dataOwnerUid);
    }
    return financialData;
  };
  const restoreBackup = async (backup: FinanceBackup) => {
    if (accessLevel !== "owner" || !mutationsAllowed) throw new Error("Restauração indisponível para esta sessão.");
    await reportOperation(async () => {
      if (dataOwnerUid && db) { await restoreFinanceData(db, dataOwnerUid, backup); return; }
      const preview = previewRestore(localHasData ? financialData : emptyFinanceData(), backup);
      if (preview.conflicts.length) throw new Error("Há conflitos. Nenhum dado foi alterado.");
      commitLocalData(preview.data);
    });
  };
  const changeView = (view: NavigationView) => {
    setActiveView(view);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${view}`);
  };
  useEffect(() => {
    const handleHashChange = () => setActiveView(viewFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  useEffect(() => {
    if (!user || !db) return;
    let active = true;
    const firestore = db;
    const resolveHousehold = async () => {
      const inviteParams = new URLSearchParams(window.location.search);
      const householdId = inviteParams.get("inviteHousehold");
      const inviteId = inviteParams.get("inviteId");
      try {
        if (householdId && inviteId) {
          const inviteRef = doc(firestore, "households", householdId, "invites", inviteId);
          const inviteSnapshot = await getDoc(inviteRef);
          if (!inviteSnapshot.exists()) throw new Error("Invitation not found");
          const invite = inviteSnapshot.data();
          const email = user.email?.trim().toLowerCase();
          const invitedEmail = typeof invite.email === "string" ? invite.email.trim().toLowerCase() : "";
          const expiresAt = invite.expiresAt?.toDate?.() as Date | undefined;
          if (!email || email !== invitedEmail) throw new Error("Invitation email mismatch");
          if (invite.status === "accepted" && invite.acceptedBy === user.uid) {
            const memberSnapshot = await getDoc(doc(firestore, "households", householdId, "members", user.uid));
            if (!memberSnapshot.exists()) throw new Error("Membership revoked");
            setAccessLevel(memberSnapshot.data().accessLevel as MemberAccessLevel);
          } else {
            if (invite.status !== "pending" || !expiresAt || expiresAt <= new Date()) {
              throw new Error("Invitation expired");
            }
            const access = invite.accessLevel as Exclude<MemberAccessLevel, "owner">;
            const batch = writeBatch(firestore);
            batch.update(inviteRef, { status: "accepted", acceptedBy: user.uid, acceptedAt: serverTimestamp() });
            batch.set(doc(firestore, "households", householdId, "members", user.uid), {
              uid: user.uid,
              email,
              displayName: user.displayName ?? email,
              accessLevel: access,
              inviteId,
              joinedAt: serverTimestamp(),
            });
            batch.set(doc(firestore, "users", user.uid, "memberships", householdId), {
              ownerUid: householdId,
              accessLevel: access,
            });
            await batch.commit();
            setAccessLevel(access);
          }
          setDataOwnerUid(householdId);
          setActiveView("members");
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("inviteHousehold");
          cleanUrl.searchParams.delete("inviteId");
          window.history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}#members`);
        } else {
          const memberships = await getDocs(collection(firestore, "users", user.uid, "memberships"));
          const membership = memberships.docs.find((item) => item.data().ownerUid !== user.uid) ?? memberships.docs[0];
          if (membership) {
            const data = membership.data();
            setDataOwnerUid(typeof data.ownerUid === "string" ? data.ownerUid : membership.id);
            setAccessLevel(data.accessLevel as MemberAccessLevel);
          } else {
            const batch = writeBatch(firestore);
            batch.set(doc(firestore, "households", user.uid), {
              ownerUid: user.uid,
              createdAt: serverTimestamp(),
            }, { merge: true });
            batch.set(doc(firestore, "households", user.uid, "members", user.uid), {
              uid: user.uid,
              email: user.email ?? "",
              displayName: user.displayName ?? user.email ?? "Proprietário",
              accessLevel: "owner",
              joinedAt: serverTimestamp(),
            }, { merge: true });
            batch.set(doc(firestore, "users", user.uid, "memberships", user.uid), {
              ownerUid: user.uid,
              accessLevel: "owner",
            }, { merge: true });
            await batch.commit();
            setDataOwnerUid(user.uid);
            setAccessLevel("owner");
          }
        }
      } catch {
        if (!active) return;
        setDataOwnerUid(user.uid);
        setAccessLevel("read");
        setHouseholdError("Não foi possível validar o convite ou carregar os membros. Publique as regras do Firestore e tente novamente.");
        if (householdId && inviteId) setActiveView("members");
      } finally {
        if (active) setHouseholdLoaded(true);
      }
    };
    void resolveHousehold();
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    if (!user || !db || !householdLoaded || !dataOwnerUid) return;
    const firestore = db;
    const membersRef = collection(firestore, "households", dataOwnerUid, "members");
    const unsubscribeMembers = onSnapshot(membersRef, (snapshot) => {
      setHouseholdMembers(snapshot.docs.map((item) => ({
        uid: item.id,
        email: String(item.data().email ?? ""),
        displayName: String(item.data().displayName ?? item.data().email ?? "Membro"),
        accessLevel: item.data().accessLevel as MemberAccessLevel,
      })));
    }, () => setHouseholdError("Não foi possível carregar os membros."));
    if (accessLevel !== "owner") return unsubscribeMembers;
    const unsubscribeInvites = onSnapshot(collection(firestore, "households", dataOwnerUid, "invites"), (snapshot) => {
      setHouseholdInvites(snapshot.docs.map((item) => ({
        id: item.id,
        email: String(item.data().email ?? ""),
        accessLevel: item.data().accessLevel as Exclude<MemberAccessLevel, "owner">,
        status: item.data().status === "accepted"
          ? "accepted"
          : item.data().expiresAt?.toDate?.() instanceof Date && item.data().expiresAt.toDate() <= new Date()
            ? "expired"
            : "pending",
        expiresAt: item.data().expiresAt?.toDate?.()?.toISOString?.() ?? "",
        delivery: item.data().delivery === "automatic" ? "automatic" : "manual",
      })));
    }, () => setHouseholdError("Não foi possível carregar os convites."));
    return () => {
      unsubscribeMembers();
      unsubscribeInvites();
    };
  }, [accessLevel, dataOwnerUid, householdLoaded, user]);
  useEffect(() => {
    if (!db || !dataOwnerUid || !canEditData || !planningLoaded || billTemplates.length === 0) return;
    const horizonEnd = new Date(`${dateKey(new Date())}T12:00:00`);
    horizonEnd.setFullYear(horizonEnd.getFullYear() + 1);
    const today = dateKey(new Date());
    const existingIds = new Set(billOccurrences.map((occurrence) => occurrence.id));
    const missing = billTemplates.flatMap((bill) => generateBillOccurrences(bill, dateKey(horizonEnd)))
      .filter((occurrence) => occurrence.dueDate >= today && !existingIds.has(occurrence.id));
    if (missing.length === 0) return;
    let active = true;
    const firestore = db;
    void (async () => {
      for (let offset = 0; offset < missing.length; offset += 450) {
        const batch = writeBatch(firestore);
        missing.slice(offset, offset + 450).forEach((occurrence) => {
          batch.set(doc(firestore, "households", dataOwnerUid, "billOccurrences", occurrence.id), occurrence);
        });
        await batch.commit();
      }
    })().catch(() => {
      if (active) setPlanningError("Não foi possível gerar os próximos vencimentos recorrentes.");
    });
    return () => { active = false; };
  }, [billOccurrences, billTemplates, canEditData, dataOwnerUid, planningLoaded]);
  useEffect(() => {
    if (!user || !db || !householdLoaded || !dataOwnerUid || dataOwnerUid === user.uid) return;
    const firestore = db;
    const membershipRef = doc(firestore, "users", user.uid, "memberships", dataOwnerUid);
    const revokeAccess = () => {
      setDataOwnerUid(user.uid);
      setAccessLevel("read");
      setHouseholdMembers([]);
      setHouseholdInvites([]);
      setMovements([]);
      setGoals([]);
      setHouseholdError("Seu acesso a este orçamento foi removido.");
      setActiveView("members");
    };
    return onSnapshot(membershipRef, (snapshot) => {
      if (!snapshot.exists()) {
        revokeAccess();
        return;
      }
      setAccessLevel(snapshot.data().accessLevel as MemberAccessLevel);
    }, revokeAccess);
  }, [dataOwnerUid, householdLoaded, user]);
  useEffect(() => {
    if (!householdLoaded || !dataOwnerUid) return;
    const firestore = db;
    if (!firestore) {
      setPlanningLoaded(true);
      return;
    }
    let active = true;
    let unsubscribe: (() => void)[] = [];
    setPlanningLoaded(false);
    setPlanningError("");
    const initializePlanning = async () => {
      try {
        const householdRef = doc(firestore, "households", dataOwnerUid);
        const stateRef = sharedStateRef({ uid: dataOwnerUid });
        await runTransaction(firestore, async (transaction) => {
          const [householdSnapshot, stateSnapshot] = await Promise.all([
            transaction.get(householdRef),
            transaction.get(stateRef),
          ]);
          if (householdSnapshot.data()?.planningMigrationVersion === 1) return;
          if (accessLevel !== "owner") throw new Error("Owner must initialize household planning");
          const sharedState = stateSnapshot.data() as { billPaidState?: Record<string, boolean> } | undefined;
          const migration = buildSeedPlanningMigration(
            financePeriods,
            { ...readStoredBillState({ uid: dataOwnerUid }), ...sharedState?.billPaidState },
          );
          migration.periods.forEach((period) => {
            transaction.set(doc(firestore, "households", dataOwnerUid, "payPeriods", period.date), period);
          });
          migration.bills.forEach((bill) => {
            transaction.set(doc(firestore, "households", dataOwnerUid, "bills", bill.id), bill);
          });
          migration.occurrences.forEach((occurrence) => {
            transaction.set(doc(firestore, "households", dataOwnerUid, "billOccurrences", occurrence.id), occurrence);
          });
          transaction.set(householdRef, { planningMigrationVersion: 1, planningMigratedAt: serverTimestamp() }, { merge: true });
        });
        if (!active) return;
        let periodsSnapshot: EditablePayPeriod[] | null = null;
        let billsSnapshot: BillTemplate[] | null = null;
        let occurrencesSnapshot: BillOccurrence[] | null = null;
        const publish = () => {
          if (!active || !periodsSnapshot || !billsSnapshot || !occurrencesSnapshot) return;
          setPlanningPeriods(periodsSnapshot);
          setBillTemplates(billsSnapshot);
          setBillOccurrences(occurrencesSnapshot);
          setPlanningLoaded(true);
        };
        unsubscribe = [
          onSnapshot(collection(firestore, "households", dataOwnerUid, "payPeriods"), (snapshot) => {
            periodsSnapshot = snapshot.docs.map((item) => ({ ...item.data(), date: item.id }) as EditablePayPeriod);
            publish();
          }, () => { setPlanningError("Não foi possível carregar os períodos."); setPlanningLoaded(true); }),
          onSnapshot(collection(firestore, "households", dataOwnerUid, "bills"), (snapshot) => {
            billsSnapshot = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as BillTemplate);
            publish();
          }, () => { setPlanningError("Não foi possível carregar as contas recorrentes."); setPlanningLoaded(true); }),
          onSnapshot(collection(firestore, "households", dataOwnerUid, "billOccurrences"), (snapshot) => {
            occurrencesSnapshot = snapshot.docs.map((item) => ({ ...item.data(), id: item.id, history: Array.isArray(item.data().history) ? item.data().history : [] }) as BillOccurrence);
            publish();
          }, () => { setPlanningError("Não foi possível carregar o histórico de contas."); setPlanningLoaded(true); }),
        ];
      } catch {
        if (!active) return;
        setPlanningError("Não foi possível migrar ou carregar o planejamento do Firestore.");
        setPlanningLoaded(true);
      }
    };
    void initializePlanning();
    return () => {
      active = false;
      unsubscribe.forEach((stop) => stop());
    };
  }, [accessLevel, dataOwnerUid, householdLoaded]);
  const activePlanningPeriods = useMemo(
    () => materializePlanningPeriods(planningPeriods, billTemplates, billOccurrences),
    [billOccurrences, billTemplates, planningPeriods],
  );
  useEffect(() => {
    if (!householdLoaded) return;
    const activeDataUser: DataUser = dataOwnerUid ? { uid: dataOwnerUid } : null;
    setMovementsLoaded(false);
    const storedEntryOverrides = !activeDataUser && localBackup ? localBackup.data.settings.entryOverrides : readStoredEntryOverrides(activeDataUser);
    setEntryOverrides(storedEntryOverrides);
    const storedMovements = !activeDataUser && localBackup ? localBackup.data.movements : readStoredMovements(activeDataUser);
    setMovements(storedMovements);
    setBillPaidState(!activeDataUser && localBackup ? localBackup.data.settings.billPaidState : { ...Object.fromEntries(financePeriods.flatMap((period) => period.bills.map((bill) => [periodBillKey(period.date, bill.id), bill.paid]))), ...readStoredBillState(activeDataUser) });
    if (activeDataUser && db) {
      const ownerUid = activeDataUser.uid;
      const unsubscribeMovements = onSnapshot(collection(db, "users", ownerUid, "movements"), (snapshot) => {
        const remoteMovements = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Movement);
        setMovements(remoteMovements);
        setMovementsLoaded(true);
      }, () => { setMovementsLoaded(true); setOperationError("Não foi possível carregar os lançamentos."); });
      const sharedRef = sharedStateRef(activeDataUser);
      const unsubscribeSharedState = onSnapshot(sharedRef, (snapshot) => {
        const sharedState = snapshot.data() as { billPaidState?: Record<string, boolean>; entryOverrides?: EntryOverrides } | undefined;
        if (sharedState?.billPaidState) {
          setBillPaidState(sharedState.billPaidState);
        }
        if (sharedState?.entryOverrides !== undefined) {
          const nextEntryOverrides = normalizeEntryOverrides(sharedState.entryOverrides);
          setEntryOverrides(nextEntryOverrides);
        } else if (snapshot.exists()) {
          setEntryOverrides({});
        }
      }, () => setOperationError("Não foi possível carregar os ajustes financeiros."));
      return () => {
        unsubscribeMovements();
        unsubscribeSharedState();
      };
    }
    setMovementsLoaded(true);
  }, [dataOwnerUid, householdLoaded, localBackup]);
  useEffect(() => {
    if (!householdLoaded) return;
    const activeDataUser: DataUser = dataOwnerUid ? { uid: dataOwnerUid } : null;
    const storageKey = dataOwnerUid ?? "local";
    const localGoals = !activeDataUser && localBackup ? localBackup.data.goals : readStoredGoals(storageKey);
    setGoals(localGoals);
    setGoalsLoaded(false);
    setGoalsSyncError("");
    if (!activeDataUser || !db) {
      setGoalsLoaded(true);
      return;
    }
    const ownerUid = activeDataUser.uid;
    const goalsRef = collection(db, "users", ownerUid, "goals");
    const unsubscribe = onSnapshot(goalsRef, (snapshot) => {
      const remoteGoals = snapshot.docs.map((item) => normalizeGoal(item.id, item.data()));
      setGoals(remoteGoals);
      setGoalsLoaded(true);
    }, () => {
      setGoals(localGoals);
      setGoalsLoaded(true);
      setGoalsSyncError("Sincronização indisponível; objetivos mantidos neste dispositivo.");
    });
    return unsubscribe;
  }, [dataOwnerUid, householdLoaded, localBackup]);
  const saveMovement = async (movement: Movement, replacedPlannedIncomeKeys: string[] = []) => {
    if (!canEditData) throw new Error("Alterações indisponíveis.");
    const savedMovements = expandRecurringMovement(movement);
    const savedIds = new Set(savedMovements.map((item) => item.id));
    const nextMovements = [...movements.filter((item) => !savedIds.has(item.id) && item.id !== movement.id), ...savedMovements];
    const nextEntryOverrides = { ...(entryOverrides ?? {}) };
    replacedPlannedIncomeKeys.forEach((key) => {
      nextEntryOverrides[key] = {
        ...nextEntryOverrides[key],
        deleted: true,
        replacedByMovementId: movement.id,
      };
    });
    const normalizedOverrides = normalizeEntryOverrides(nextEntryOverrides);
    if (dataUser && db) {
      try {
        const batch = writeBatch(db);
        savedMovements.forEach((savedMovement) => {
          batch.set(doc(db!, "users", dataUser.uid, "movements", savedMovement.id), savedMovement);
        });
        if (replacedPlannedIncomeKeys.length > 0) {
          batch.set(sharedStateRef(dataUser), { entryOverrides: normalizedOverrides }, { mergeFields: ["entryOverrides"] });
        }
        await batch.commit();
      } catch {
        throw new Error("Não foi possível salvar o lançamento.");
      }
    }
    if (!dataUser || !db) commitLocalData({ movements: nextMovements, settings: { ...financialData.settings, entryOverrides: normalizedOverrides } });
    return true;
  };
  const submitMovement = (movement: Movement) => {
    setMovementSaveError("");
    const matches = findPlannedIncomeMatches(
      movement,
      resolveFinancialEntries(movements, entryOverrides ?? {}, activePlanningPeriods),
    );
    if (matches.length > 0) {
      setIncomeConflict({ movement, matches });
      setSelectedPlannedIncomeKey(matches.length === 1 ? matches[0].key : "");
      setIncomeConflictError("");
      return;
    }
    void reportOperation(() => saveMovement(movement)).then((saved) => {
      if (!saved) {
        setMovementSaveError("Não foi possível salvar. Verifique a sincronização e tente novamente.");
        return;
      }
      setIsMovementModalOpen(false);
    }).catch(() => setMovementSaveError("Não foi possível salvar. Confira a conexão e tente novamente."));
  };
  const finishIncomeConflict = (replacePlanned: boolean) => {
    if (!incomeConflict) return;
    const replacedKeys = replacePlanned ? [selectedPlannedIncomeKey] : [];
    if (replacePlanned && !selectedPlannedIncomeKey) return;
    void reportOperation(() => saveMovement(incomeConflict.movement, replacedKeys)).then((saved) => {
      if (!saved) {
        setIncomeConflictError("Não foi possível salvar. Verifique a sincronização e tente novamente.");
        return;
      }
      setIncomeConflict(null);
      setIsMovementModalOpen(false);
    }).catch(() => setIncomeConflictError("Não foi possível salvar. Confira a conexão e tente novamente."));
  };
  const deleteMovement = async (movementId: string) => {
    if (!canDeleteData) throw new Error("Exclusão indisponível.");
    const replacedKeys = Object.entries(entryOverrides ?? {})
      .filter(([, override]) => override.replacedByMovementId === movementId)
      .map(([key]) => key);
    const nextEntryOverrides = { ...(entryOverrides ?? {}) };
    delete nextEntryOverrides[`movement:${movementId}`];
    delete nextEntryOverrides[movementId];
    replacedKeys.forEach((key) => { delete nextEntryOverrides[key]; });
    const normalizedOverrides = normalizeEntryOverrides(nextEntryOverrides);
    const overridesChanged = JSON.stringify(normalizedOverrides) !== JSON.stringify(entryOverrides ?? {});
    if (dataUser && db) {
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", dataUser.uid, "movements", movementId));
      if (overridesChanged) {
        batch.set(sharedStateRef(dataUser), { entryOverrides: normalizedOverrides }, { mergeFields: ["entryOverrides"] });
      }
      try {
        await batch.commit();
      } catch {
        throw new Error("Não foi possível excluir o lançamento.");
      }
    }
    if (!dataUser || !db) commitLocalData({ movements: movements.filter((movement) => movement.id !== movementId), settings: { ...financialData.settings, entryOverrides: normalizedOverrides } });
  };
  const saveEntryOverrides = async (nextEntryOverrides: EntryOverrides) => {
    if (!canEditData) throw new Error("Alterações indisponíveis.");
    const normalizedEntryOverrides = normalizeEntryOverrides(nextEntryOverrides);
    if (dataUser && db) await setDoc(sharedStateRef(dataUser), { entryOverrides: normalizedEntryOverrides }, { mergeFields: ["entryOverrides"] });
    if (!dataUser || !db) commitLocalData({ settings: { ...financialData.settings, entryOverrides: normalizedEntryOverrides } });
  };
  const saveGoal = async (goal: Goal) => {
    if (!canEditData) throw new Error("Alterações indisponíveis.");
    if (dataUser && db) await setDoc(doc(db, "users", dataUser.uid, "goals", goal.id), goal);
    const nextGoals = [...goals.filter((item) => item.id !== goal.id), goal];
    if (!dataUser || !db) commitLocalData({ goals: nextGoals });
    setGoalsSyncError("");
  };
  const savePayPeriod = async (period: EditablePayPeriod, previousDate?: string) => {
    if (!canEditData) throw new Error("Edit permission required");
    const existingPeriod = previousDate ? planningPeriods.find((item) => item.date === previousDate) : undefined;
    if (planningPeriods.some((item) => item.date === period.date && item.date !== previousDate)) {
      throw new Error("A pay period already exists on that date");
    }
    const actualLeandro = period.receivedIncome?.leandro?.reduce((total, item) => total + item.actualAmount, 0) ?? 0;
    const actualKetlin = period.receivedIncome?.ketlin?.reduce((total, item) => total + item.actualAmount, 0) ?? 0;
    if (
      !Number.isFinite(period.income.leandro) || period.income.leandro < actualLeandro ||
      !Number.isFinite(period.income.ketlin) || period.income.ketlin < actualKetlin ||
      period.income.extras < 0 || period.income.leiaUniversitySavings < 0
    ) throw new Error("Planned income cannot be less than already received income");
    if (dataUser && db) {
      const firestore = db;
      const batch = writeBatch(firestore);
      const periodRef = doc(firestore, "households", dataUser.uid, "payPeriods", period.date);
      const existingRef = doc(firestore, "households", dataUser.uid, "payPeriods", previousDate ?? period.date);
      const existingReceipts = existingPeriod?.receivedIncome ?? {};
      const receivedIncome = { ...existingReceipts, ...period.receivedIncome };
      for (const recipient of ["leandro", "ketlin"] as const) {
        const received = receivedIncome[recipient]?.reduce((total, payment) => total + payment.actualAmount, 0) ?? 0;
        if (received > period.income[recipient] + 0.005) throw new Error("Planned income cannot be less than received income");
      }
      batch.set(periodRef, { ...period, receivedIncome });
      if (previousDate && previousDate !== period.date) {
        batch.delete(existingRef);
        billOccurrences.filter((occurrence) => occurrence.periodDate === previousDate).forEach((occurrence) => {
          batch.update(doc(firestore, "households", dataUser.uid, "billOccurrences", occurrence.id), { periodDate: period.date });
        });
      }
      await batch.commit();
      return;
    }
    const merged = { ...period, receivedIncome: { ...existingPeriod?.receivedIncome, ...period.receivedIncome } };
    commitLocalData({
      periods: [...planningPeriods.filter((item) => item.date !== previousDate && item.date !== period.date), merged].sort((a, b) => a.date.localeCompare(b.date)),
      occurrences: previousDate && previousDate !== period.date ? billOccurrences.map((item) => item.periodDate === previousDate ? { ...item, periodDate: period.date } : item) : billOccurrences,
    });
  };
  const saveBillTemplate = async (bill: BillTemplate) => {
    if (!canEditData) throw new Error("Edit permission required");
    const firestore = db;
    const endDate = new Date(`${dateKey(new Date())}T12:00:00`);
    endDate.setFullYear(endDate.getFullYear() + 1);
    const occurrences = generateBillOccurrences(bill, dateKey(endDate));
    const occurrencesById = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
    const existingBillOccurrences = billOccurrences.filter((occurrence) => occurrence.billId === bill.id);
    if (dataUser && firestore) {
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, "households", dataUser.uid, "bills", bill.id), bill);
      occurrences.forEach((occurrence) => {
        const current = existingBillOccurrences.find((item) => item.id === occurrence.id);
        if (current?.status === "paid") return;
        batch.set(doc(firestore, "households", dataUser.uid, "billOccurrences", occurrence.id), {
          ...occurrence,
          history: current?.history ?? [],
          status: current?.status ?? occurrence.status,
          paidAmount: current?.paidAmount ?? occurrence.paidAmount,
        });
      });
      existingBillOccurrences
        .filter((occurrence) => occurrence.status === "planned" && occurrence.dueDate >= dateKey(new Date()) && !occurrencesById.has(occurrence.id))
        .forEach((occurrence) => batch.delete(doc(firestore, "households", dataUser.uid, "billOccurrences", occurrence.id)));
      await batch.commit();
      return;
    }
    const kept = billOccurrences.filter((item) => item.billId !== bill.id || item.status === "paid" || (!occurrencesById.has(item.id) && item.dueDate < dateKey(new Date())));
    const keptIds = new Set(kept.map((item) => item.id));
    commitLocalData({ bills: [...billTemplates.filter((item) => item.id !== bill.id), bill], occurrences: [...kept, ...occurrences.filter((item) => !keptIds.has(item.id)).map((item) => {
      const old = existingBillOccurrences.find((existing) => existing.id === item.id);
      return { ...item, history: old?.history ?? [], paidAmount: old?.paidAmount ?? 0 };
    })] });
  };
  const receiveIncome = async (periodDate: string, recipient: IncomeRecipient, payment: ReceivedPayment) => {
    if (!canEditData) throw new Error("Edit permission required");
    const today = dateKey(new Date());
    const receiptDate = new Date(`${payment.receivedAt}T12:00:00`);
    if (
      !Number.isFinite(payment.actualAmount) ||
      payment.actualAmount <= 0 ||
      dateKey(receiptDate) !== payment.receivedAt ||
      payment.receivedAt > today
    ) {
      throw new Error("Invalid receipt");
    }
    const receipt = { ...payment, id: crypto.randomUUID() };
    if (dataUser && db) {
      const periodRef = doc(db, "households", dataUser.uid, "payPeriods", periodDate);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(periodRef);
        if (!snapshot.exists()) throw new Error("Pay period not found");
        const period = snapshot.data() as EditablePayPeriod;
        const received = period.receivedIncome?.[recipient] ?? [];
        const receivedTotal = received.reduce((total, item) => total + item.actualAmount, 0);
        const plannedAmount = period.income[recipient];
        if (receivedTotal + payment.actualAmount > plannedAmount + 0.005) {
          throw new Error("Receipt exceeds planned income");
        }
        transaction.update(periodRef, { [`receivedIncome.${recipient}`]: arrayUnion(receipt) });
      });
      return;
    }
    const period = planningPeriods.find((item) => item.date === periodDate);
    if (!period) throw new Error("Período não encontrado.");
    const received = period.receivedIncome?.[recipient] ?? [];
    if (received.reduce((sum, item) => sum + item.actualAmount, 0) + receipt.actualAmount > period.income[recipient] + 0.005) throw new Error("Recebimento maior que a previsão.");
    commitLocalData({ periods: planningPeriods.map((item) => item.date === periodDate ? { ...item, receivedIncome: { ...item.receivedIncome, [recipient]: [...received, receipt] } } : item) });
  };
  const toggleBillOccurrence = async (occurrenceId: string) => {
    if (!canEditData) throw new Error("Edit permission required");
    const occurrence = billOccurrences.find((item) => item.id === occurrenceId);
    if (!occurrence) throw new Error("Bill occurrence not found");
    const eventId = crypto.randomUUID();
    const eventDate = dateKey(new Date());
    if (dataUser && db) {
      const occurrenceRef = doc(db, "households", dataUser.uid, "billOccurrences", occurrenceId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(occurrenceRef);
        if (!snapshot.exists()) throw new Error("Bill occurrence not found");
        const current = snapshot.data() as BillOccurrence;
        const next = toggleBillOccurrencePayment(current, eventId, eventDate);
        transaction.update(occurrenceRef, {
          status: next.status,
          paidAmount: next.paidAmount,
          paidAt: next.paidAt ?? deleteField(),
          history: arrayUnion(next.history.at(-1)),
        });
      });
      return;
    }
    commitLocalData({ occurrences: billOccurrences.map((item) => item.id === occurrenceId ? toggleBillOccurrencePayment(item, eventId, eventDate) : item) });
  };
  const deleteGoal = async (goalId: string) => {
    if (!canDeleteData) throw new Error("Delete permission required");
    if (dataUser && db) {
      try {
        await runTransaction(db, async (transaction) => {
          const goalRef = doc(db!, "users", dataUser.uid, "goals", goalId);
          const allocationRef = sharedStateRef(dataUser);
          const [goalSnapshot, allocationSnapshot] = await Promise.all([
            transaction.get(goalRef),
            transaction.get(allocationRef),
          ]);
          if (!goalSnapshot.exists()) return;
          const goal = normalizeGoal(goalId, goalSnapshot.data());
          const allocationData = allocationSnapshot.data() as { incomeAllocations?: Record<string, number> } | undefined;
          const incomeAllocations = { ...(allocationData?.incomeAllocations ?? {}) };
          goal.contributions.forEach((contribution) => {
            if (!contribution.incomeSourceId) return;
            incomeAllocations[contribution.incomeSourceId] = Math.max(
              0,
              (incomeAllocations[contribution.incomeSourceId] ?? 0) - contribution.amount,
            );
          });
          transaction.set(allocationRef, { incomeAllocations }, { merge: true });
          transaction.delete(goalRef);
        });
      } catch {
        setGoalsSyncError("Sincronização indisponível; objetivo não excluído.");
        throw new Error("Goal deletion failed");
      }
    }
    const nextGoals = goals.filter((goal) => goal.id !== goalId);
    if (!dataUser || !db) commitLocalData({ goals: nextGoals });
    setGoalsSyncError("");
  };
  const contributeToGoal = async (goalId: string, amount: number, source: GoalIncomeSource) => {
    if (!canEditData) throw new Error("Edit permission required");
    const currentDateKey = dateKey(new Date());
    const currentMonthKey = currentDateKey.slice(0, 7);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !source.date.startsWith(currentMonthKey) ||
      source.date > currentDateKey
    ) {
      throw new Error("Invalid contribution source");
    }
    const contribution: GoalContribution = {
      id: crypto.randomUUID(),
      amount,
      date: dateKey(new Date()),
      incomeSourceId: source.id,
      incomeSourceLabel: source.label,
      incomeSourceDate: source.date,
      incomeSourceOwner: source.owner,
    };
    try {
      if (dataUser && db) {
        await runTransaction(db, async (transaction) => {
          const goalRef = doc(db!, "users", dataUser.uid, "goals", goalId);
          const allocationRef = sharedStateRef(dataUser);
          const [goalSnapshot, allocationSnapshot] = await Promise.all([
            transaction.get(goalRef),
            transaction.get(allocationRef),
          ]);
          if (!goalSnapshot.exists()) throw new Error("Goal not found");
          const allocationData = allocationSnapshot.data() as { incomeAllocations?: Record<string, number> } | undefined;
          const incomeAllocations = allocationData?.incomeAllocations ?? {};
          const allocated = incomeAllocations[source.id] ?? 0;
          if (amount > source.amount - (source.legacyReserved ?? 0) - allocated + 0.005) {
            throw new Error("Income source balance exceeded");
          }
          transaction.set(allocationRef, {
            incomeAllocations: { ...incomeAllocations, [source.id]: allocated + amount },
          }, { merge: true });
          transaction.update(goalRef, {
            contributions: arrayUnion(contribution),
            saved: increment(amount),
          });
        });
      } else {
        const allocated = goals.reduce((total, goal) => total + goal.contributions
          .filter((item) => item.incomeSourceId === source.id)
          .reduce((sum, item) => sum + item.amount, 0), 0);
        if (amount > source.amount - (source.legacyReserved ?? 0) - allocated + 0.005) {
          throw new Error("Income source balance exceeded");
        }
      }
      const nextGoals = goals.map((goal) => goal.id === goalId
        ? { ...goal, saved: goal.saved + amount, contributions: [...goal.contributions, contribution] }
        : goal);
      if (!dataUser || !db) commitLocalData({ goals: nextGoals });
      setGoalsSyncError("");
    } catch {
      setGoalsSyncError("Aporte não registrado; confira o saldo ou a sincronização.");
      throw new Error("Goal contribution failed");
    }
  };
  const createInvite = async (email: string, inviteAccess: Exclude<MemberAccessLevel, "owner">, delivery: InviteDeliveryMode) => {
    if (!user || !db || accessLevel !== "owner" || !dataOwnerUid) throw new Error("Only owner can invite members");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail === user.email?.trim().toLowerCase()) throw new Error("Invalid invite email");
    if (
      householdMembers.some((member) => member.email.trim().toLowerCase() === normalizedEmail) ||
      householdInvites.some((invite) => invite.status === "pending" && invite.email.trim().toLowerCase() === normalizedEmail)
    ) {
      throw new Error("Member or pending invitation already exists");
    }
    const inviteId = crypto.randomUUID();
    const inviteRef = doc(db, "households", dataOwnerUid, "invites", inviteId);
    await setDoc(inviteRef, {
      email: normalizedEmail,
      accessLevel: inviteAccess,
      status: "pending",
      delivery,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
    });
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("inviteHousehold", dataOwnerUid);
    inviteUrl.searchParams.set("inviteId", inviteId);
    inviteUrl.hash = "members";
    const url = inviteUrl.toString();
    if (delivery === "automatic") {
      if (!auth) throw new Error("Firebase Auth is unavailable");
      try {
        await sendSignInLinkToEmail(auth, normalizedEmail, { url, handleCodeInApp: true });
      } catch (error) {
        await deleteDoc(inviteRef);
        throw error;
      }
    }
    return url;
  };
  const resendInvite = async (inviteId: string) => {
    if (!user || !db || accessLevel !== "owner" || !dataOwnerUid) throw new Error("Owner permission required");
    const oldInviteRef = doc(db, "households", dataOwnerUid, "invites", inviteId);
    const oldInviteSnapshot = await getDoc(oldInviteRef);
    if (!oldInviteSnapshot.exists()) throw new Error("Invite not found");
    const oldInvite = oldInviteSnapshot.data();
    const nextInviteId = crypto.randomUUID();
    const nextInviteRef = doc(db, "households", dataOwnerUid, "invites", nextInviteId);
    const email = String(oldInvite.email).trim().toLowerCase();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    const delivery = oldInvite.delivery === "automatic" ? "automatic" : "manual";
    await setDoc(nextInviteRef, {
      email,
      accessLevel: oldInvite.accessLevel,
      delivery,
      status: "pending",
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      expiresAt,
    });
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("inviteHousehold", dataOwnerUid);
    inviteUrl.searchParams.set("inviteId", nextInviteId);
    inviteUrl.hash = "members";
    const url = inviteUrl.toString();
    if (delivery === "automatic") {
      if (!auth) throw new Error("Firebase Auth is unavailable");
      try {
        await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
      } catch (error) {
        await deleteDoc(nextInviteRef);
        throw error;
      }
    }
    await deleteDoc(oldInviteRef);
    return url;
  };
  const updateMemberAccess = async (memberId: string, nextAccess: Exclude<MemberAccessLevel, "owner">) => {
    if (!user || !db || accessLevel !== "owner" || !dataOwnerUid || memberId === dataOwnerUid) {
      throw new Error("Owner permission required");
    }
    const batch = writeBatch(db);
    batch.update(doc(db, "households", dataOwnerUid, "members", memberId), { accessLevel: nextAccess });
    batch.update(doc(db, "users", memberId, "memberships", dataOwnerUid), { accessLevel: nextAccess });
    await batch.commit();
  };
  const removeMember = async (memberId: string) => {
    if (!user || !db || accessLevel !== "owner" || !dataOwnerUid || memberId === dataOwnerUid) {
      throw new Error("Owner permission required");
    }
    const batch = writeBatch(db);
    batch.delete(doc(db, "households", dataOwnerUid, "members", memberId));
    batch.delete(doc(db, "users", memberId, "memberships", dataOwnerUid));
    await batch.commit();
  };
  const revokeInvite = async (inviteId: string) => {
    if (!user || !db || accessLevel !== "owner" || !dataOwnerUid) throw new Error("Owner permission required");
    await deleteDoc(doc(db, "households", dataOwnerUid, "invites", inviteId));
  };
  const calendarItems = useMemo(() => {
    const items = new Map<string, CalendarItem[]>();
    const addItem = (date: string, item: CalendarItem) => items.set(date, [...(items.get(date) ?? []), item]);
    resolveFinancialEntries(movements, entryOverrides ?? {}, activePlanningPeriods).forEach((entry) => {
      addItem(entry.date, {
        type: entry.type === "income" ? "income" : "bill",
        title: entry.title,
        detail: `${entry.category} · ${entry.owner}`,
        amount: entry.amount,
      });
    });
    return items;
  }, [activePlanningPeriods, entryOverrides, movements]);
  const displayName = user?.displayName || user?.email || "Usuário";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const upcomingPayment = nextPaymentFromPeriods(activePlanningPeriods, openedAt);
  const nextPaymentDate = new Date(`${upcomingPayment.date}T12:00:00`);
  const daysUntilNextPayment = Math.max(0, Math.ceil((nextPaymentDate.getTime() - openedAt.getTime()) / 86400000));
  const changeCalendarMonth = (offset: number) => { setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)); setSelectedDay(null); };
  const toggleBill = (key: string) => {
    if (!canEditData) return;
    void reportOperation(async () => {
      const nextState = { ...billPaidState, [key]: !billPaidState[key] };
      if (dataUser && db) await setDoc(sharedStateRef(dataUser), { billPaidState: nextState }, { merge: true });
      if (!dataUser || !db) commitLocalData({ settings: { ...financialData.settings, billPaidState: nextState } });
    }).catch(() => {});
  };
  const isBillPaid = (key: string) => Boolean(billPaidState[key]);
  const handleSignOut = async () => { if (!onSignOut) return; setIsSigningOut(true); setSignOutError(""); try { await onSignOut(); } catch { setSignOutError("Não foi possível sair agora."); setIsSigningOut(false); } };
  const planningPageProps = {
    movements,
    periods: activePlanningPeriods,
    billTemplates,
    billOccurrences,
    planningError,
    user,
    displayName,
    initials,
    storageKey: dataOwnerUid ?? "local",
    onSignOut: onSignOut ? () => void handleSignOut() : undefined,
    onToggleBill: toggleBill,
    isBillPaid,
    sharedEntryOverrides: entryOverrides,
    goals,
    canEditData,
    canDeleteData,
    goalsSyncError,
    onCreateGoal: canEditData ? (...args: Parameters<typeof saveGoal>) => reportOperation(() => saveGoal(...args)) : undefined,
    onDeleteGoal: canDeleteData ? (...args: Parameters<typeof deleteGoal>) => reportOperation(() => deleteGoal(...args)) : undefined,
    onContributeGoal: canEditData ? (...args: Parameters<typeof contributeToGoal>) => reportOperation(() => contributeToGoal(...args)) : undefined,
    onCreatePayPeriod: canEditData ? (...args: Parameters<typeof savePayPeriod>) => reportOperation(() => savePayPeriod(...args)) : undefined,
    onReceiveIncome: canEditData ? (...args: Parameters<typeof receiveIncome>) => reportOperation(() => receiveIncome(...args)) : undefined,
    onCreateBillTemplate: canEditData ? (...args: Parameters<typeof saveBillTemplate>) => reportOperation(() => saveBillTemplate(...args)) : undefined,
    onToggleBillOccurrence: canEditData ? (...args: Parameters<typeof toggleBillOccurrence>) => reportOperation(() => toggleBillOccurrence(...args)) : undefined,
    householdId: dataOwnerUid ?? undefined,
    householdError,
    accessLevel,
    members: householdMembers,
    invites: householdInvites,
    onCreateInvite: accessLevel === "owner" ? createInvite : undefined,
    onResendInvite: accessLevel === "owner" ? resendInvite : undefined,
    onUpdateMemberAccess: accessLevel === "owner" ? updateMemberAccess : undefined,
    onRemoveMember: accessLevel === "owner" ? removeMember : undefined,
    onRevokeInvite: accessLevel === "owner" ? revokeInvite : undefined,
    syncStatus,
    backupActions: {
      ownerUid: dataOwnerUid ?? "local", canRestore: accessLevel === "owner",
      available: !localLoad.error && !sync.pending && ((!dataOwnerUid || !db) || syncStatus === "synced"),
      read: readBackupData,
      readForRestore: !dataOwnerUid && !localHasData ? async () => emptyFinanceData() : readBackupData,
      restoreNotice: !dataOwnerUid && !localHasData ? "Este navegador ainda não tem dados salvos. Ao confirmar, os dados iniciais de exemplo serão substituídos pelo backup." : undefined,
      restore: restoreBackup,
    },
  };
  const pageContent = activeView === "payments"
    ? <CalendarPage calendarMonth={calendarMonth} calendarItems={calendarItems} selectedDay={selectedDay} onChangeMonth={changeCalendarMonth} onSelectDay={setSelectedDay} />
    : activeView === "dashboard"
      ? <DashboardPage movements={movements} periods={activePlanningPeriods} goals={goals} canEditData={canEditData} canDeleteData={canDeleteData} greeting={greeting} openedDateLabel={openedDateLabel} daysUntilNextPayment={daysUntilNextPayment} onToggleBill={toggleBill} onToggleBillOccurrence={canEditData ? (...args: Parameters<typeof toggleBillOccurrence>) => reportOperation(() => toggleBillOccurrence(...args)) : undefined} isBillPaid={isBillPaid} onDeleteMovement={(movementId) => { void reportOperation(() => deleteMovement(movementId)).catch(() => {}); }} onSaveMovement={submitMovement} sharedEntryOverrides={entryOverrides} onEntryOverridesChange={(overrides) => { void reportOperation(() => saveEntryOverrides(overrides)).catch(() => {}); }} onOpenCalendar={() => changeView("payments")} onOpenMovement={() => { if (canEditData) setIsMovementModalOpen(true); }} storageKey={dataOwnerUid ?? "local"} />
      : activeView === "bills" ? <BillsPage {...planningPageProps} />
        : activeView === "income" ? <IncomePage {...planningPageProps} />
          : activeView === "goals" ? <GoalsPage {...planningPageProps} />
            : activeView === "members" ? <MembersPage {...planningPageProps} />
              : <SettingsPage {...planningPageProps} />;

  if (localLoad.error) return <LocalDataRecovery />;
  if (!dataReady) return (
    <main className="access-screen app-loading" role="status" aria-live="polite">
      <section className="access-card">
        <img className="access-logo" src="/icons/finance-vault-logo.svg" alt="FinanceVault" />
        <p className="eyebrow">FINANCE VAULT</p>
        <h1>Confirmando seus dados</h1>
        <p>{syncLabels[syncStatus]}</p>
        <p>Carregando seu orçamento…</p>
        {syncStatus === "error" && <button className="access-button secondary" onClick={() => window.location.reload()}>Recarregar dados</button>}
      </section>
    </main>
  );
  return (
    <main className="app-shell">
      <AppNavigation syncStatus={syncStatus} isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} activeView={activeView} onNavigate={changeView} />
      <section className="content">
        <AppTopbar user={user} calendarMonth={calendarMonth} isCalendarView={activeView === "payments"} initials={initials} onMenuOpen={() => setIsMenuOpen(true)} onCalendarOpen={() => changeView("payments")} onDashboard={() => changeView("dashboard")} onProfileOpen={() => setIsProfileOpen(true)} />
        {(syncStatus !== "synced" || showSyncedBanner) && (
          <div className={`sync-banner sync-${syncStatus}`} role="status" aria-live="polite">
            <span>{syncLabels[syncStatus]}{syncError ? ` · ${syncError}` : ""}</span>
            {syncStatus === "error" && <button className="text-button" onClick={() => { setOperationError(""); setGoalsSyncError(""); sync.retry(); }}>Verificar novamente</button>}
          </div>
        )}
        {pageContent}
        {isProfileOpen && <ProfileModal user={user} displayName={displayName} initials={initials} signOutError={signOutError} isSigningOut={isSigningOut} onClose={() => setIsProfileOpen(false)} onSignOut={onSignOut ? () => void handleSignOut() : undefined} />}
        {isMovementModalOpen && <MovementModal
          onClose={() => { setIsMovementModalOpen(false); setIncomeConflict(null); setMovementSaveError(""); }}
          onSubmit={submitMovement}
          submissionError={movementSaveError}
        />}
        {incomeConflict && <IncomeConflictDialog
          conflict={incomeConflict}
          selectedKey={selectedPlannedIncomeKey}
          error={incomeConflictError}
          onSelect={setSelectedPlannedIncomeKey}
          onReplace={() => finishIncomeConflict(true)}
          onAddExtra={() => finishIncomeConflict(false)}
          onCancel={() => { setIncomeConflict(null); setIncomeConflictError(""); }}
        />}
      </section>
    </main>
  );
}
