import { useState } from "react";
import { downloadFile, MAX_BACKUP_BYTES, parseBackup, type FinanceBackup } from "../lib/backup";
import { localBackupKey, persistLocalFinance } from "../lib/localFinance";

export function LocalDataRecovery() {
  const [backup, setBackup] = useState<FinanceBackup | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectFile = async (file: File) => {
    setBusy(true); setBackup(null); setConfirmed(false); setError("");
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("O arquivo ultrapassa 10 MB.");
      setBackup(parseBackup(await file.text()));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Arquivo inválido."); }
    finally { setBusy(false); }
  };
  return <main className="app-loading"><section className="backup-panel">
    <h1>Recuperar dados locais</h1>
    <p>Não foi possível ler os dados deste navegador. O conteúdo original foi preservado e nenhuma alteração será feita sem sua confirmação.</p>
    <button className="outline-button" onClick={() => {
      try { downloadFile("financevault-dados-locais-original.json", localStorage.getItem(localBackupKey) ?? "", "application/json"); }
      catch { setError("O navegador bloqueou o acesso ao armazenamento local."); }
    }}>Baixar conteúdo original</button>
    <p>Guarde o original antes de recuperar um backup válido.</p>
    <label className="backup-file">Selecionar backup JSON
      <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void selectFile(file); }} />
    </label>
    {backup && <div className="backup-preview">
      <p>Backup de {new Date(backup.exportedAt).toLocaleString("pt-BR")}: {backup.data.movements.length} lançamentos, {backup.data.goals.length} objetivos, {backup.data.periods.length} períodos, {backup.data.bills.length} contas e {backup.data.occurrences.length} vencimentos.</p>
      <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Guardei o original e confirmo a substituição dos dados locais por este backup.</label>
      <button className="solid-button" disabled={!confirmed || busy} onClick={() => {
        try { persistLocalFinance(localStorage, backup.data); window.location.reload(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível recuperar os dados."); }
      }}>Recuperar backup</button>
    </div>}
    <p role="alert">{error}</p>
  </section></main>;
}
