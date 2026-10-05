import { createBackup, type FinanceData } from "./backup";
export const localBackupKey = "financevault:local-data:v1";
export function persistLocalFinance(storage: Pick<Storage, "setItem">, data: FinanceData) {
  const backup = createBackup("local", data);
  try { storage.setItem(localBackupKey, JSON.stringify(backup)); }
  catch { throw new Error("Não foi possível salvar neste navegador. Nenhuma alteração foi aplicada. Libere espaço ou exporte os dados."); }
  return backup.data;
}
