import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
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
import type { CalendarItem, Goal, GoalContribution, GoalIncomeSource, HouseholdInvite, HouseholdMember, MemberAccessLevel, Movement } from "./types/finance";
import "./App.css";

type AppProps = { user?: User | null; onSignOut?: () => Promise<void> };
type EntryOverrides = Record<string, Partial<Movement> & { deleted?: boolean }>;
type DataUser = Pick<User, "uid"> | null;

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

function movementsStorageKey(user: DataUser) {
  return user ? `financevault:movements:${user.uid}` : "financevault:movements";
}

function billsStorageKey(user: DataUser) {
  return user ? `financevault:bills:${user.uid}` : "financevault:bills";
}

function deletedMovementsStorageKey(user: DataUser) {
  return user ? `financevault:deleted-movements:${user.uid}` : "financevault:deleted-movements";
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

function readDeletedMovementIds(user: DataUser) {
  try {
    const stored = localStorage.getItem(deletedMovementsStorageKey(user));
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
  } catch {
    return new Set<string>();
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
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [goalsSyncError, setGoalsSyncError] = useState("");
  const [dataOwnerUid, setDataOwnerUid] = useState<string | null>(user?.uid ?? null);
  const [householdLoaded, setHouseholdLoaded] = useState(!user || !db);
  const [householdError, setHouseholdError] = useState("");
  const [accessLevel, setAccessLevel] = useState<MemberAccessLevel>("owner");
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [householdInvites, setHouseholdInvites] = useState<HouseholdInvite[]>([]);
  const dataUser: DataUser = dataOwnerUid ? { uid: dataOwnerUid } : null;
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
        status: item.data().status as HouseholdInvite["status"],
      })));
    }, () => setHouseholdError("Não foi possível carregar os convites."));
    return () => {
      unsubscribeMembers();
      unsubscribeInvites();
    };
  }, [accessLevel, dataOwnerUid, householdLoaded, user]);
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
    if (!householdLoaded) return;
    const activeDataUser: DataUser = dataOwnerUid ? { uid: dataOwnerUid } : null;
    setMovementsLoaded(false);
    const storedEntryOverrides = readStoredEntryOverrides(activeDataUser);
    setEntryOverrides(storedEntryOverrides);
    localStorage.setItem(entryOverridesStorageKey(activeDataUser), JSON.stringify(storedEntryOverrides));
    const storedMovements = readStoredMovements(activeDataUser);
    setMovements(storedMovements);
    setBillPaidState({ ...Object.fromEntries(financePeriods.flatMap((period) => period.bills.map((bill) => [periodBillKey(period.date, bill.id), bill.paid]))), ...readStoredBillState(activeDataUser) });
    if (activeDataUser && db) {
      const ownerUid = activeDataUser.uid;
      const unsubscribeMovements = onSnapshot(collection(db, "users", ownerUid, "movements"), (snapshot) => {
        const deletedMovementIds = readDeletedMovementIds(activeDataUser);
        const remoteMovements = snapshot.docs
          .map((item) => item.data() as Movement)
          .filter((movement) => !deletedMovementIds.has(movement.id));
        const movementsById = new Map(remoteMovements.map((item) => [item.id, item]));
        const remoteIds = new Set(movementsById.keys());
        readStoredMovements(activeDataUser)
          .filter((movement) => !remoteIds.has(movement.id))
          .forEach((movement) => movementsById.set(movement.id, movement));
        setMovements([...movementsById.values()]);
        setMovementsLoaded(true);
      }, () => setMovementsLoaded(true));
      const sharedRef = sharedStateRef(activeDataUser);
      const unsubscribeSharedState = onSnapshot(sharedRef, (snapshot) => {
        const sharedState = snapshot.data() as { billPaidState?: Record<string, boolean>; entryOverrides?: EntryOverrides } | undefined;
        if (sharedState?.billPaidState) {
          setBillPaidState((current) => ({ ...current, ...sharedState.billPaidState }));
          localStorage.setItem(billsStorageKey(activeDataUser), JSON.stringify(sharedState.billPaidState));
        }
        if (sharedState?.entryOverrides !== undefined) {
          const nextEntryOverrides = normalizeEntryOverrides(sharedState.entryOverrides);
          setEntryOverrides(nextEntryOverrides);
          localStorage.setItem(entryOverridesStorageKey(activeDataUser), JSON.stringify(nextEntryOverrides));
          if (JSON.stringify(nextEntryOverrides) !== JSON.stringify(sharedState.entryOverrides)) {
            void updateDoc(sharedRef, { entryOverrides: nextEntryOverrides }).catch(() =>
              setDoc(sharedRef, { entryOverrides: nextEntryOverrides }, { merge: true }),
            );
          }
        } else if (snapshot.exists()) {
          setEntryOverrides({});
          localStorage.setItem(entryOverridesStorageKey(activeDataUser), JSON.stringify({}));
        }
      });
      return () => {
        unsubscribeMovements();
        unsubscribeSharedState();
      };
    }
    setMovementsLoaded(true);
  }, [dataOwnerUid, householdLoaded]);
  useEffect(() => {
    if (!householdLoaded) return;
    const activeDataUser: DataUser = dataOwnerUid ? { uid: dataOwnerUid } : null;
    const storageKey = dataOwnerUid ?? "local";
    const localGoals = readStoredGoals(storageKey);
    setGoals(localGoals);
    setGoalsLoaded(false);
    setGoalsSyncError("");
    if (!activeDataUser || !db) {
      setGoalsLoaded(true);
      return;
    }
    let initialSnapshot = true;
    let active = true;
    const ownerUid = activeDataUser.uid;
    const goalsRef = collection(db, "users", ownerUid, "goals");
    const unsubscribe = onSnapshot(goalsRef, (snapshot) => {
      const remoteGoals = snapshot.docs.map((item) => normalizeGoal(item.id, item.data()));
      if (initialSnapshot) {
        initialSnapshot = false;
        const remoteById = new Map(remoteGoals.map((goal) => [goal.id, goal]));
        localGoals.forEach((localGoal) => {
          const remoteGoal = remoteById.get(localGoal.id);
          const goalRef = doc(db!, "users", ownerUid, "goals", localGoal.id);
          if (!remoteGoal) {
            remoteById.set(localGoal.id, localGoal);
            void setDoc(goalRef, localGoal).catch(() => {
              if (active) setGoalsSyncError("Sincronização indisponível; objetivos mantidos neste dispositivo.");
            });
            return;
          }
          const remoteContributionIds = new Set(remoteGoal.contributions.map((item) => item.id));
          const missingContributions = localGoal.contributions.filter((item) => !remoteContributionIds.has(item.id));
          if (missingContributions.length > 0) {
            const mergedContributions = [...remoteGoal.contributions, ...missingContributions];
            remoteById.set(localGoal.id, {
              ...remoteGoal,
              contributions: mergedContributions,
              saved: mergedContributions.reduce((total, item) => total + item.amount, 0),
            });
            void updateDoc(goalRef, {
              contributions: arrayUnion(...missingContributions),
              saved: increment(missingContributions.reduce((total, item) => total + item.amount, 0)),
            }).catch(() => {
              if (active) setGoalsSyncError("Sincronização indisponível; aportes mantidos neste dispositivo.");
            });
          }
        });
        const mergedGoals = [...remoteById.values()];
        setGoals(mergedGoals);
        localStorage.setItem(goalsStorageKey(storageKey), JSON.stringify(mergedGoals));
        setGoalsLoaded(true);
        return;
      }
      setGoals(remoteGoals);
      localStorage.setItem(goalsStorageKey(storageKey), JSON.stringify(remoteGoals));
      setGoalsLoaded(true);
    }, () => {
      setGoals(localGoals);
      setGoalsLoaded(true);
      setGoalsSyncError("Sincronização indisponível; objetivos mantidos neste dispositivo.");
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [dataOwnerUid, householdLoaded]);
  const canEditData = accessLevel !== "read";
  const canDeleteData = accessLevel === "delete" || accessLevel === "owner";
  const saveMovement = async (movement: Movement) => {
    if (!canEditData) return;
    const savedMovements = expandRecurringMovement(movement);
    const savedIds = new Set(savedMovements.map((item) => item.id));
    const nextMovements = [...movements.filter((item) => !savedIds.has(item.id) && item.id !== movement.id), ...savedMovements];
    setMovements(nextMovements);
    localStorage.setItem(movementsStorageKey(dataUser), JSON.stringify(nextMovements));
    if (dataUser && db) {
      try { await Promise.all(savedMovements.map((savedMovement) => setDoc(doc(db!, "users", dataUser.uid, "movements", savedMovement.id), savedMovement))); } catch { return; }
      return;
    }
  };
  const deleteMovement = async (movementId: string) => {
    if (!canDeleteData) return;
    const deletedMovementIds = readDeletedMovementIds(dataUser);
    deletedMovementIds.add(movementId);
    localStorage.setItem(deletedMovementsStorageKey(dataUser), JSON.stringify([...deletedMovementIds]));
    const nextMovements = movements.filter((movement) => movement.id !== movementId);
    setMovements(nextMovements);
    localStorage.setItem(movementsStorageKey(dataUser), JSON.stringify(nextMovements));
    if (dataUser && db) {
      try { await deleteDoc(doc(db, "users", dataUser.uid, "movements", movementId)); } catch { return; }
    }
  };
  const saveEntryOverrides = async (nextEntryOverrides: EntryOverrides) => {
    if (!canEditData) return;
    const normalizedEntryOverrides = normalizeEntryOverrides(nextEntryOverrides);
    setEntryOverrides(normalizedEntryOverrides);
    localStorage.setItem(entryOverridesStorageKey(dataUser), JSON.stringify(normalizedEntryOverrides));
    if (dataUser && db) {
      try {
        await updateDoc(sharedStateRef(dataUser), { entryOverrides: normalizedEntryOverrides });
      } catch {
        try { await setDoc(sharedStateRef(dataUser), { entryOverrides: normalizedEntryOverrides }, { merge: true }); } catch { return; }
      }
    }
  };
  const saveGoal = async (goal: Goal) => {
    if (!canEditData) throw new Error("Read-only membership");
    const nextGoals = [...goals.filter((item) => item.id !== goal.id), goal];
    setGoals(nextGoals);
    localStorage.setItem(goalsStorageKey(dataUser?.uid ?? "local"), JSON.stringify(nextGoals));
    if (dataUser && db) {
      try {
        await setDoc(doc(db, "users", dataUser.uid, "goals", goal.id), goal);
        setGoalsSyncError("");
      } catch {
        setGoalsSyncError("Sincronização indisponível; objetivo mantido neste dispositivo.");
        throw new Error("Goal sync failed");
      }
    }
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
    setGoals(nextGoals);
    localStorage.setItem(goalsStorageKey(dataUser?.uid ?? "local"), JSON.stringify(nextGoals));
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
      setGoals(nextGoals);
      localStorage.setItem(goalsStorageKey(dataUser?.uid ?? "local"), JSON.stringify(nextGoals));
      setGoalsSyncError("");
    } catch {
      setGoalsSyncError("Aporte não registrado; confira o saldo ou a sincronização.");
      throw new Error("Goal contribution failed");
    }
  };
  const createInvite = async (email: string, inviteAccess: Exclude<MemberAccessLevel, "owner">) => {
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
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
    });
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("inviteHousehold", dataOwnerUid);
    inviteUrl.searchParams.set("inviteId", inviteId);
    inviteUrl.hash = "members";
    return inviteUrl.toString();
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
    if (!canEditData) return current;
    const nextState = { ...current, [key]: !current[key] };
    localStorage.setItem(billsStorageKey(dataUser), JSON.stringify(nextState));
    if (dataUser && db) void setDoc(sharedStateRef(dataUser), { billPaidState: nextState }, { merge: true });
    return nextState;
  });
  const isBillPaid = (key: string) => Boolean(billPaidState[key]);
  const handleSignOut = async () => { if (!onSignOut) return; setIsSigningOut(true); setSignOutError(""); try { await onSignOut(); } catch { setSignOutError("Não foi possível sair agora."); setIsSigningOut(false); } };
  const planningPageProps = {
    movements,
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
    onCreateGoal: canEditData ? saveGoal : undefined,
    onDeleteGoal: canDeleteData ? deleteGoal : undefined,
    onContributeGoal: canEditData ? contributeToGoal : undefined,
    householdId: dataOwnerUid ?? undefined,
    householdError,
    accessLevel,
    members: householdMembers,
    invites: householdInvites,
    onCreateInvite: accessLevel === "owner" ? createInvite : undefined,
    onUpdateMemberAccess: accessLevel === "owner" ? updateMemberAccess : undefined,
    onRemoveMember: accessLevel === "owner" ? removeMember : undefined,
    onRevokeInvite: accessLevel === "owner" ? revokeInvite : undefined,
  };
  const pageContent = activeView === "payments"
    ? <CalendarPage calendarMonth={calendarMonth} calendarItems={calendarItems} selectedDay={selectedDay} onChangeMonth={changeCalendarMonth} onSelectDay={setSelectedDay} />
    : activeView === "dashboard"
      ? <DashboardPage movements={movements} goals={goals} canEditData={canEditData} canDeleteData={canDeleteData} greeting={greeting} openedDateLabel={openedDateLabel} daysUntilNextPayment={daysUntilNextPayment} onToggleBill={toggleBill} isBillPaid={isBillPaid} onDeleteMovement={(movementId) => { void deleteMovement(movementId); }} onSaveMovement={(movement) => { void saveMovement(movement); }} sharedEntryOverrides={entryOverrides} onEntryOverridesChange={(overrides) => { void saveEntryOverrides(overrides); }} onOpenCalendar={() => changeView("payments")} onOpenMovement={() => { if (canEditData) setIsMovementModalOpen(true); }} storageKey={dataOwnerUid ?? "local"} />
      : activeView === "bills" ? <BillsPage {...planningPageProps} />
        : activeView === "income" ? <IncomePage {...planningPageProps} />
          : activeView === "goals" ? <GoalsPage {...planningPageProps} />
            : activeView === "members" ? <MembersPage {...planningPageProps} />
              : <SettingsPage {...planningPageProps} />;

  if (!householdLoaded || !movementsLoaded || !goalsLoaded) return null;
  return <main className="app-shell"><AppNavigation isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} activeView={activeView} onNavigate={changeView} /><section className="content"><AppTopbar user={user} calendarMonth={calendarMonth} isCalendarView={activeView === "payments"} initials={initials} onMenuOpen={() => setIsMenuOpen(true)} onCalendarOpen={() => changeView("payments")} onDashboard={() => changeView("dashboard")} onProfileOpen={() => setIsProfileOpen(true)} />{pageContent}{isProfileOpen && <ProfileModal user={user} displayName={displayName} initials={initials} signOutError={signOutError} isSigningOut={isSigningOut} onClose={() => setIsProfileOpen(false)} onSignOut={onSignOut ? () => void handleSignOut() : undefined} />}{isMovementModalOpen && <MovementModal onClose={() => setIsMovementModalOpen(false)} onSubmit={(movement) => { void saveMovement(movement); setBillPaidState((current) => ({ ...current, [movementBillKey(movement.id)]: false })); setIsMovementModalOpen(false); }} />}</section></main>;
}
