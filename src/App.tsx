import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { financePeriods, totalIncome } from "./data/financeSeed";
import { AppNavigation } from "./components/AppNavigation";
import { AppTopbar } from "./components/AppTopbar";
import { ProfileModal } from "./components/ProfileModal";
import { MovementModal } from "./components/MovementModal";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { dateKey, dueDate, nextPaymentPeriod } from "./lib/finance";
import { db } from "./lib/firebase";
import type { CalendarItem, Movement } from "./types/finance";
import "./App.css";

type AppProps = { user?: User | null; onSignOut?: () => Promise<void> };

const openedAt = new Date();
const greeting = openedAt.getHours() < 12 ? "Bom dia" : openedAt.getHours() < 18 ? "Boa tarde" : "Boa noite";
const openedDateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(openedAt);

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

export default function App({ user = null, onSignOut }: AppProps = {}) {
  const [billPaidState, setBillPaidState] = useState<Record<string, boolean>>(() => ({ ...Object.fromEntries(financePeriods.flatMap((period) => period.bills.map((bill) => [periodBillKey(period.date, bill.id), bill.paid]))), ...readStoredBillState(user) }));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date(openedAt.getFullYear(), openedAt.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementsLoaded, setMovementsLoaded] = useState(false);
  useEffect(() => {
    setMovementsLoaded(false);
    const storedMovements = readStoredMovements(user);
    setMovements(storedMovements);
    if (user && db) {
      return onSnapshot(collection(db, "users", user.uid, "movements"), (snapshot) => {
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
    }
    setMovementsLoaded(true);
  }, [user]);
  const saveMovement = async (movement: Movement) => {
    const nextMovements = [...movements.filter((item) => item.id !== movement.id), movement];
    setMovements(nextMovements);
    localStorage.setItem(movementsStorageKey(user), JSON.stringify(nextMovements));
    if (user && db) {
      try {
        await setDoc(doc(db, "users", user.uid, "movements", movement.id), movement);
      } catch { return; }
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
    return nextState;
  });
  const isBillPaid = (key: string) => Boolean(billPaidState[key]);
  const handleSignOut = async () => { if (!onSignOut) return; setIsSigningOut(true); setSignOutError(""); try { await onSignOut(); } catch { setSignOutError("Não foi possível sair agora."); setIsSigningOut(false); } };

  if (!movementsLoaded) return null;
  return <main className="app-shell"><AppNavigation isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} /><section className="content"><AppTopbar user={user} calendarMonth={calendarMonth} initials={initials} onMenuOpen={() => setIsMenuOpen(true)} onCalendarOpen={() => setIsCalendarOpen(true)} onProfileOpen={() => setIsProfileOpen(true)} />{isCalendarOpen ? <CalendarPage calendarMonth={calendarMonth} calendarItems={calendarItems} selectedDay={selectedDay} onChangeMonth={changeCalendarMonth} onSelectDay={setSelectedDay} onClose={() => setIsCalendarOpen(false)} /> : <DashboardPage movements={movements} greeting={greeting} openedDateLabel={openedDateLabel} daysUntilNextPayment={daysUntilNextPayment} onToggleBill={toggleBill} isBillPaid={isBillPaid} onDeleteMovement={(movementId) => { void deleteMovement(movementId); }} onSaveMovement={(movement) => { void saveMovement(movement); }} onOpenCalendar={() => setIsCalendarOpen(true)} onOpenMovement={() => setIsMovementModalOpen(true)} storageKey={user?.uid ?? "local"} />}{isProfileOpen && <ProfileModal user={user} displayName={displayName} initials={initials} signOutError={signOutError} isSigningOut={isSigningOut} onClose={() => setIsProfileOpen(false)} onSignOut={onSignOut ? () => void handleSignOut() : undefined} />}{isMovementModalOpen && <MovementModal onClose={() => setIsMovementModalOpen(false)} onSubmit={(movement) => { void saveMovement(movement); setBillPaidState((current) => ({ ...current, [movementBillKey(movement.id)]: false })); setIsMovementModalOpen(false); }} />}</section></main>;
}
