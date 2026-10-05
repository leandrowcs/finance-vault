import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { resolveSyncStatus, type SyncSource } from "./sync";

export function useFinanceSync(ownerUid: string | null, enabled: boolean) {
  const remote = Boolean(db && ownerUid);
  const [online, setOnline] = useState(navigator.onLine);
  const [sources, setSources] = useState<Record<string, SyncSource>>({});
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const writing = useRef(false);
  const scope = useRef(ownerUid);
  useEffect(() => { scope.current = ownerUid; }, [ownerUid]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    setSources({});
    setError("");
    if (!db || !ownerUid || !enabled) return;
    let active = true;
    const paths = [
      ["users", ownerUid, "movements"], ["users", ownerUid, "goals"],
      ["households", ownerUid, "payPeriods"], ["households", ownerUid, "bills"],
      ["households", ownerUid, "billOccurrences"],
    ];
    const keys = [...paths.map((path) => path.join("/")), "shared"];
    setSources(Object.fromEntries(keys.map((key) => [key, { confirmed: false, pending: false, failed: false }])));
    const update = (key: string, metadata: { fromCache: boolean; hasPendingWrites: boolean }) => {
      if (active) setSources((current) => ({ ...current, [key]: { confirmed: !metadata.fromCache, pending: metadata.hasPendingWrites, failed: false } }));
    };
    const fail = (key: string) => { if (active) setSources((current) => ({ ...current, [key]: { confirmed: false, pending: false, failed: true } })); };
    const stops = paths.map(([root, owner, name]) => {
      const key = `${root}/${owner}/${name}`;
      return onSnapshot(collection(db!, root, owner, name), { includeMetadataChanges: true }, (snapshot) => update(key, snapshot.metadata), () => fail(key));
    });
    stops.push(onSnapshot(doc(db, "users", ownerUid, "settings", "shared"), { includeMetadataChanges: true }, (snapshot) => update("shared", snapshot.metadata), () => fail("shared")));
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [enabled, ownerUid, revision]);
  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    const owner = scope.current;
    if (remote && !navigator.onLine) throw new Error("Sem conexão. Reconecte para salvar.");
    if (writing.current) throw new Error("Aguarde a operação em andamento.");
    writing.current = true;
    setPending((count) => count + 1);
    try {
      const result = await operation();
      if (owner === scope.current) setError("");
      return result;
    } catch (failure) {
      if (owner === scope.current) setError("Não foi possível concluir a gravação. Confira os dados e tente novamente.");
      throw failure;
    } finally { writing.current = false; setPending((count) => Math.max(0, count - 1)); }
  }, [remote]);
  const currentSources = enabled && sources[`users/${ownerUid}/movements`] ? Object.values(sources) : [];
  return { online, pending, error, run, status: resolveSyncStatus(remote, online, currentSources, pending, Boolean(error)), retry: () => { setError(""); setRevision((value) => value + 1); } };
}
