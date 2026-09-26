import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { financePeriods, totalIncome } from "./data/financeSeed";
import { AppNavigation, type NavigationView } from "./components/AppNavigation";
import { AppTopbar } from "./components/AppTopbar";
import { ProfileModal } from "./components/ProfileModal";
import { MovementModal } from "./components/MovementModal";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BillsPage, GoalsPage, IncomePage, MembersPage, SettingsPage } from "./pages/PlanningPages";
import { dateKey, dueDate, nextPaymentPeriod } from "./lib/finance";
import { db } from "./lib/firebase";
import type { CalendarItem, Movement } from "./types/finance";
import "./App.css";

type AppProps = { user?: User | null; onSignOut?: () => Promise<void> };
type EntryOverrides = Record<string, Partial<Movement> & { deleted?: boolean }>;

const openedAt = new Date();
const greeting = openedAt.getHours() < 12 ? "Bom dia" : openedAt.getHours() < 18 ? "Boa tarde" : "Boa noite";
const openedDateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(openedAt);

function viewFromHash(): NavigationView {
  const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "dashboard";
  return ["dashboard", "payments", "bills", "income", "goals", "members", "settings"].includes(hash) ? hash as NavigationView : "dashboard";
}

function periodBillKey(periodDate: string, billId: string) {
  return `period:${periodDate}:${billId}`;
}

function movementBillKey(movementId: string) {
  return `movement:${movementId}`;
}

function movementsStorageKey(user: User | null) {
  return user ? `financevault:movements:${user.uid}` : "financevault:movements";
}

function billsStorageKey(user: User | null) {
  return user ? `financevault:bills:${user.uid}` : "financevault:bills";
}

function deletedMovementsStorageKey(user: User | null) {
  return user ? `financevault:deleted-movements:${user.uid}` : "financevault:deleted-movements";
}

function entryOverridesStorageKey(user: User | null) {
  return `financevault:entry-overrides:${user?.uid ?? "local"}`;
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

function sharedStateRef(user: User) {
  return doc(db!, "users", user.uid, "settings", "shared");
}

function readStoredMovements(user: User | null) {
  try {
    const stored = localStorage.getItem(movementsStorageKey(user));
    return stored ? JSON.parse(stored) as Movement[] : [];
  } catch {
    return [];
  }
}

function readStoredBillState(user: User | null) {
  try {
    const stored = localStorage.getItem(billsStorageKey(user));
    return stored ? JSON.parse(stored) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function readDeletedMovementIds(user: User | null) {
  try {
    const stored = localStorage.getItem(deletedMovementsStorageKey(user));
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function readStoredEntryOverrides(user: User | null) {
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
  return Array.from({ length: count }, (_, index) => ({
    ...movement,
    id: index === 0 ? movement.id : `${recurrenceId}:${index}`,
    date: recurrence === "none" ? movement.date : addRecurrenceDate(movement.date, recurrence, index),
    recurrence,
    recurrenceCount: count,
    recurrenceId: recurrence === "none" ? undefined : recurrenceId,
    recurrenceIndex: recurrence === "none" ? undefined : index,
  }));
}

export default function App({ user = null, onSignOut }: AppProps = {}) {
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
  const [movementsLoaded, setMovementsLoaded] = useState(false);
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
    setMovementsLoaded(false);
    const storedEntryOverrides = readStoredEntryOverrides(user);
    setEntryOverrides(storedEntryOverrides);
    localStorage.setItem(entryOverridesStorageKey(user), JSON.stringify(storedEntryOverrides));
    const storedMovements = readStoredMovements(user);
    setMovements(storedMovements);
    if (user && db) {
      const unsubscribeMovements = onSnapshot(collection(db, "users", user.uid, "movements"), (snapshot) => {
        const deletedMovementIds = readDeletedMovementIds(user);
        const remoteMovements = snapshot.docs
          .map((item) => item.data() as Movement)
          .filter((movement) => !deletedMovementIds.has(movement.id));
        const movementsById = new Map(remoteMovements.map((movement) => [movement.id, movement]));
        const remoteIds = new Set(movementsById.keys());
        readStoredMovements(user)
          .filter((movement) => !remoteIds.has(movement.id))
          .forEach((movement) => movementsById.set(movement.id, movement));
        setMovements([...movementsById.values()]);
        setMovementsLoaded(true);
      }, () => setMovementsLoaded(true));
      const unsubscribeSharedState = onSnapshot(sharedStateRef(user), (snapshot) => {
        const sharedState = snapshot.data() as { billPaidState?: Record<string, boolean>; entryOverrides?: EntryOverrides } | undefined;
        if (sharedState?.billPaidState) {
          setBillPaidState((current) => ({ ...current, ...sharedState.billPaidState }));
          localStorage.setItem(billsStorageKey(user), JSON.stringify(sharedState.billPaidState));
        }
        if (sharedState?.entryOverrides !== undefined) {
          const nextEntryOverrides = normalizeEntryOverrides(sharedState.entryOverrides);
          setEntryOverrides(nextEntryOverrides);
          localStorage.setItem(entryOverridesStorageKey(user), JSON.stringify(nextEntryOverrides));
          if (JSON.stringify(nextEntryOverrides) !== JSON.stringify(sharedState.entryOverrides)) {
            void updateDoc(sharedStateRef(user), { entryOverrides: nextEntryOverrides }).catch(() =>
              setDoc(sharedStateRef(user), { entryOverrides: nextEntryOverrides }, { merge: true }),
            );
          }
        } else if (snapshot.exists()) {
          setEntryOverrides({});
          localStorage.setItem(entryOverridesStorageKey(user), JSON.stringify({}));
        }
      });
      return () => {
        unsubscribeMovements();
        unsubscribeSharedState();
      };
    }
    setMovementsLoaded(true);
  }, [user]);
  const saveMovement = async (movement: Movement) => {
    const savedMovements = expandRecurringMovement(movement);
    const savedIds = new Set(savedMovements.map((item) => item.id));
    const nextMovements = [...movements.filter((item) => !savedIds.has(item.id) && item.id !== movement.id), ...savedMovements];
    setMovements(nextMovements);
    localStorage.setItem(movementsStorageKey(user), JSON.stringify(nextMovements));
    if (user && db) {
      try { await Promise.all(savedMovements.map((savedMovement) => setDoc(doc(db!, "users", user.uid, "movements", savedMovement.id), savedMovement))); } catch { return; }
      return;
    }
  };
  const deleteMovement = async (movementId: string) => {
    const deletedMovementIds = readDeletedMovementIds(user);
    deletedMovementIds.add(movementId);
    localStorage.setItem(deletedMovementsStorageKey(user), JSON.stringify([...deletedMovementIds]));
    const nextMovements = movements.filter((movement) => movement.id !== movementId);
    setMovements(nextMovements);
    localStorage.setItem(movementsStorageKey(user), JSON.stringify(nextMovements));
    if (user && db) {
      try { await deleteDoc(doc(db, "users", user.uid, "movements", movementId)); } catch { return; }
    }
  };
  const saveEntryOverrides = async (nextEntryOverrides: EntryOverrides) => {
    const normalizedEntryOverrides = normalizeEntryOverrides(nextEntryOverrides);
    setEntryOverrides(normalizedEntryOverrides);
    localStorage.setItem(entryOverridesStorageKey(user), JSON.stringify(normalizedEntryOverrides));
    if (user && db) {
      try {
        await updateDoc(sharedStateRef(user), { entryOverrides: normalizedEntryOverrides });
      } catch {
        try { await setDoc(sharedStateRef(user), { entryOverrides: normalizedEntryOverrides }, { merge: true }); } catch { return; }
      }
    }
  };
  const calendarItems = useMemo(() => {
    const items = new Map<string, CalendarItem[]>();
    const addItem = (date: string, item: CalendarItem) => items.set(date, [...(items.get(date) ?? []), item]);
    financePeriods.forEach((period) => {
      addItem(period.date, { type: "income", title: "Receita do período", detail: period.label, amount: totalIncome(period) });
      period.bills.forEach((bill) => addItem(dateKey(dueDate(period.date, bill.due)), { type: "bill", title: bill.name, detail: `${bill.category} · ${bill.owner}`, amount: bill.amount }));
    });
    movements.forEach((movement) => addItem(dateKey(new Date(`${movement.date}T12:00:00`)), { type: movement.type === "income" ? "income" : "bill", title: movement.description, detail: `${movement.category} · ${movement.owner}`, amount: movement.amount }));
    return items;
  }, [movements]);
  const displayName = user?.displayName || user?.email || "Usuário";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const nextPaymentDate = new Date(`${nextPaymentPeriod.date}T12:00:00`);
  const daysUntilNextPayment = Math.max(0, Math.ceil((nextPaymentDate.getTime() - openedAt.getTime()) / 86400000));
  const changeCalendarMonth = (offset: number) => { setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)); setSelectedDay(null); };
  const toggleBill = (key: string) => setBillPaidState((current) => {
    const nextState = { ...current, [key]: !current[key] };
    localStorage.setItem(billsStorageKey(user), JSON.stringify(nextState));
    if (user && db) void setDoc(sharedStateRef(user), { billPaidState: nextState }, { merge: true });
    return nextState;
  });
  const isBillPaid = (key: string) => Boolean(billPaidState[key]);
  const handleSignOut = async () => { if (!onSignOut) return; setIsSigningOut(true); setSignOutError(""); try { await onSignOut(); } catch { setSignOutError("Não foi possível sair agora."); setIsSigningOut(false); } };
  const planningPageProps = { movements, user, displayName, initials, storageKey: user?.uid ?? "local", onSignOut: onSignOut ? () => void handleSignOut() : undefined, onToggleBill: toggleBill, isBillPaid, sharedEntryOverrides: entryOverrides };
  const pageContent = activeView === "payments" ? <CalendarPage calendarMonth={calendarMonth} calendarItems={calendarItems} selectedDay={selectedDay} onChangeMonth={changeCalendarMonth} onSelectDay={setSelectedDay} /> : activeView === "dashboard" ? <DashboardPage movements={movements} greeting={greeting} openedDateLabel={openedDateLabel} daysUntilNextPayment={daysUntilNextPayment} onToggleBill={toggleBill} isBillPaid={isBillPaid} onDeleteMovement={(movementId) => { void deleteMovement(movementId); }} onSaveMovement={(movement) => { void saveMovement(movement); }} sharedEntryOverrides={entryOverrides} onEntryOverridesChange={(overrides) => { void saveEntryOverrides(overrides); }} onOpenCalendar={() => changeView("payments")} onOpenMovement={() => setIsMovementModalOpen(true)} storageKey={user?.uid ?? "local"} /> : activeView === "bills" ? <BillsPage {...planningPageProps} /> : activeView === "income" ? <IncomePage {...planningPageProps} /> : activeView === "goals" ? <GoalsPage {...planningPageProps} /> : activeView === "members" ? <MembersPage {...planningPageProps} /> : <SettingsPage {...planningPageProps} />;

  if (!movementsLoaded) return null;
  return <main className="app-shell"><AppNavigation isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} activeView={activeView} onNavigate={changeView} /><section className="content"><AppTopbar user={user} calendarMonth={calendarMonth} isCalendarView={activeView === "payments"} initials={initials} onMenuOpen={() => setIsMenuOpen(true)} onCalendarOpen={() => changeView("payments")} onDashboard={() => changeView("dashboard")} onProfileOpen={() => setIsProfileOpen(true)} />{pageContent}{isProfileOpen && <ProfileModal user={user} displayName={displayName} initials={initials} signOutError={signOutError} isSigningOut={isSigningOut} onClose={() => setIsProfileOpen(false)} onSignOut={onSignOut ? () => void handleSignOut() : undefined} />}{isMovementModalOpen && <MovementModal onClose={() => setIsMovementModalOpen(false)} onSubmit={(movement) => { void saveMovement(movement); setBillPaidState((current) => ({ ...current, [movementBillKey(movement.id)]: false })); setIsMovementModalOpen(false); }} />}</section></main>;
}
