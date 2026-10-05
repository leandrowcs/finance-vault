import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, type Firestore } from "firebase/firestore";
import { createBackup, previewRestore, validateBackup, type FinanceBackup, type FinanceData } from "./backup";

export async function readFinanceData(firestore: Firestore, ownerUid: string): Promise<FinanceData> {
  const [movements, goals, periods, bills, occurrences, shared] = await Promise.all([
    getDocsFromServer(collection(firestore, "users", ownerUid, "movements")),
    getDocsFromServer(collection(firestore, "users", ownerUid, "goals")),
    getDocsFromServer(collection(firestore, "households", ownerUid, "payPeriods")),
    getDocsFromServer(collection(firestore, "households", ownerUid, "bills")),
    getDocsFromServer(collection(firestore, "households", ownerUid, "billOccurrences")),
    getDocFromServer(doc(firestore, "users", ownerUid, "settings", "shared")),
  ]);
  const settings = shared.data();
  return createBackup(ownerUid, {
    movements: movements.docs.map((item) => ({ ...item.data(), id: item.id })) as FinanceData["movements"],
    goals: goals.docs.map((item) => ({ ...item.data(), id: item.id })) as FinanceData["goals"],
    periods: periods.docs.map((item) => ({ ...item.data(), date: item.id })) as FinanceData["periods"],
    bills: bills.docs.map((item) => ({ ...item.data(), id: item.id })) as FinanceData["bills"],
    occurrences: occurrences.docs.map((item) => ({ ...item.data(), id: item.id })) as FinanceData["occurrences"],
    settings: { billPaidState: settings?.billPaidState ?? {}, entryOverrides: settings?.entryOverrides ?? {}, incomeAllocations: settings?.incomeAllocations ?? {} },
  }).data;
}

export async function restoreFinanceData(firestore: Firestore, ownerUid: string, input: FinanceBackup) {
  const backup = validateBackup(input);
  const records = [
    ...backup.data.movements.map((value) => ({ group: "movements" as const, value, ref: doc(firestore, "users", ownerUid, "movements", value.id) })),
    ...backup.data.goals.map((value) => ({ group: "goals" as const, value, ref: doc(firestore, "users", ownerUid, "goals", value.id) })),
    ...backup.data.periods.map((value) => ({ group: "periods" as const, value, ref: doc(firestore, "households", ownerUid, "payPeriods", value.date) })),
    ...backup.data.bills.map((value) => ({ group: "bills" as const, value, ref: doc(firestore, "households", ownerUid, "bills", value.id) })),
    ...backup.data.occurrences.map((value) => ({ group: "occurrences" as const, value, ref: doc(firestore, "households", ownerUid, "billOccurrences", value.id) })),
  ];
  if (records.length > 450) throw new Error("Esta restauração aceita até 450 registros por arquivo para garantir uma gravação única. Nenhum dado foi alterado.");
  const sharedRef = doc(firestore, "users", ownerUid, "settings", "shared");
  const existingGoals = await getDocsFromServer(collection(firestore, "users", ownerUid, "goals"));
  const importedGoals = new Set(backup.data.goals.map((goal) => goal.id));
  const otherGoals = existingGoals.docs.filter((goal) => !importedGoals.has(goal.id));
  await runTransaction(firestore, async (transaction) => {
    const [shared, ...allSnapshots] = await Promise.all([transaction.get(sharedRef), ...records.map((item) => transaction.get(item.ref)), ...otherGoals.map((goal) => transaction.get(goal.ref))]);
    const snapshots = allSnapshots.slice(0, records.length);
    const settings = shared.data();
    const current: FinanceData = { movements: [], goals: [], periods: [], bills: [], occurrences: [], settings: { billPaidState: settings?.billPaidState ?? {}, entryOverrides: settings?.entryOverrides ?? {}, incomeAllocations: settings?.incomeAllocations ?? {} } };
    snapshots.forEach((snapshot, index) => { if (snapshot.exists()) (current[records[index].group] as unknown[]).push(snapshot.data()); });
    allSnapshots.slice(records.length).forEach((snapshot) => { if (snapshot.exists()) current.goals.push({ ...snapshot.data(), id: snapshot.id } as FinanceData["goals"][number]); });
    const preview = previewRestore(current, backup);
    if (preview.conflicts.length) throw new Error("Os dados atuais conflitam com o arquivo. Atualize a prévia; nada foi restaurado.");
    records.forEach((record, index) => { if (!snapshots[index].exists()) transaction.set(record.ref, record.value); });
    transaction.set(sharedRef, preview.data.settings, { merge: true });
  });
}
