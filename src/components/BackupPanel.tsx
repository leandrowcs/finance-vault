import { useState } from "react";
import { createBackup, downloadFile, MAX_BACKUP_BYTES, movementsCsv, parseBackup, previewRestore, type FinanceBackup, type FinanceData } from "../lib/backup";

export type BackupActions = {
  ownerUid: string;
  canRestore: boolean;
  available: boolean;
  read: () => Promise<FinanceData>;
  readForRestore?: () => Promise<FinanceData>;
  restoreNotice?: string;
  restore: (backup: FinanceBackup) => Promise<void>;
};
export function BackupPanel({ actions }: { actions: BackupActions }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [backup, setBackup] = useState<FinanceBackup | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof previewRestore> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação."); }
    finally { setBusy(false); }
  };
  const exportData = (csv: boolean) => perform(async () => {
    const data = await actions.read();
    const file = createBackup(actions.ownerUid, data);
    const name = `financevault-${file.exportedAt.slice(0, 10)}`;
    downloadFile(`${name}.${csv ? "csv" : "json"}`, csv ? movementsCsv(data) : JSON.stringify(file, null, 2), csv ? "text/csv;charset=utf-8" : "application/json");
    setMessage("Arquivo preparado para download.");
  });
  const loadFile = (file: File) => perform(async () => {
    setBackup(null); setPreview(null); setConfirmed(false);
    if (file.size > MAX_BACKUP_BYTES) throw new Error("O arquivo ultrapassa 10 MB.");
    const parsed = parseBackup(await file.text());
    const current = await (actions.readForRestore ?? actions.read)();
    setBackup(parsed); setPreview(previewRestore(current, parsed));
  });
  const restore = () => perform(async () => {
    if (!backup || !confirmed || !actions.canRestore || !actions.available) return;
    const fresh = previewRestore(await (actions.readForRestore ?? actions.read)(), backup);
    setPreview(fresh);
    if (fresh.conflicts.length) throw new Error("Há conflitos com os dados atuais. Nenhum dado foi alterado.");
    await actions.restore(backup);
    setBackup(null); setPreview(null); setConfirmed(false);
    setMessage("Restauração concluída. Registros existentes foram preservados.");
  });
  const records = backup ? backup.data.movements.length + backup.data.goals.length + backup.data.periods.length + backup.data.bills.length + backup.data.occurrences.length : 0;
  const tooLarge = actions.ownerUid !== "local" && records > 450;
  return <section className="backup-panel" aria-labelledby="backup-title">
    <h2 id="backup-title">Exportação e restauração</h2>
    <p>O JSON inclui lançamentos, objetivos e aportes, períodos, contas, vencimentos, ajustes e reservas. Convites e permissões ficam de fora.</p>
    <div className="backup-actions">
      <button className="outline-button" disabled={busy || !actions.available} onClick={() => void exportData(false)}>Exportar backup JSON</button>
      <button className="outline-button" disabled={busy || !actions.available} onClick={() => void exportData(true)}>Exportar lançamentos CSV</button>
    </div>
    <p>CSV contém apenas lançamentos manuais para consulta. Para recuperar todos os dados, use JSON. Guarde o arquivo financeiro em um local privado.</p>
    {actions.canRestore ? <label className="backup-file">Selecionar backup JSON
      <input type="file" accept=".json,application/json" disabled={busy || !actions.available} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void loadFile(file); }} />
    </label> : <p>Apenas o proprietário pode restaurar dados.</p>}
    {!actions.available && <p> Aguarde a confirmação dos dados e a conexão para exportar ou restaurar.</p>}
    {backup && preview && <div className="backup-preview">
      <h3>Prévia da restauração</h3>
      {actions.restoreNotice && <p>{actions.restoreNotice}</p>}
      <p>Exportado em {new Date(backup.exportedAt).toLocaleString("pt-BR")} · CAD</p>
      <p>Origem: {backup.ownerUid} · Destino: {actions.ownerUid}</p>
      {backup.ownerUid !== actions.ownerUid && <p>Este arquivo pertence a outro orçamento. A confirmação copiará os registros para o orçamento atual, mantendo a origem.</p>}
      <ul>
        <li>{backup.data.movements.length} lançamentos · {backup.data.goals.length} objetivos</li>
        <li>{backup.data.periods.length} períodos · {backup.data.bills.length} contas · {backup.data.occurrences.length} vencimentos</li>
        <li>{preview.added} registros/ajustes novos · {preview.identical} já existentes · {preview.conflicts.length} conflitos</li>
      </ul>
      <p>A restauração adiciona registros ausentes e preserva os existentes. Qualquer ID com conteúdo diferente bloqueia a operação inteira.</p>
      {preview.conflicts.length > 0 && <details><summary>Ver conflitos</summary><ul>{preview.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul></details>}
      {tooLarge && <p>O arquivo excede o limite de 450 registros da restauração online em uma única operação.</p>}
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmo a restauração neste orçamento.</label>
      <div className="backup-actions"><button className="solid-button" disabled={busy || !actions.available || !actions.canRestore || !confirmed || preview.conflicts.length > 0 || tooLarge} onClick={() => void restore()}>Confirmar restauração</button>
        <button className="outline-button" disabled={busy} onClick={() => { setBackup(null); setPreview(null); setConfirmed(false); }}>Cancelar</button></div>
    </div>}
    <p role="status" aria-live="polite">{busy ? "Processando…" : message}</p>
  </section>;
}
