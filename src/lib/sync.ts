export type SyncStatus = "local" | "offline" | "loading" | "saving" | "synced" | "error";
export type SyncSource = { confirmed: boolean; pending: boolean; failed: boolean };
export function resolveSyncStatus(remote: boolean, online: boolean, sources: SyncSource[], pending: number, error: boolean): SyncStatus {
  if (!remote) return error ? "error" : pending ? "saving" : "local";
  if (!online) return "offline";
  if (error || sources.some((source) => source.failed)) return "error";
  if (pending || sources.some((source) => source.pending)) return "saving";
  if (!sources.length || sources.some((source) => !source.confirmed)) return "loading";
  return "synced";
}
export const syncLabels: Record<SyncStatus, string> = {
  local: "Salvo neste navegador.",
  offline: "Sem conexão — alterações bloqueadas.",
  loading: "Aguardando confirmação do servidor...",
  saving: "Salvando alterações…",
  synced: "Dados financeiros confirmados no servidor.",
  error: "Falha de sincronização — confira os dados.",
};
