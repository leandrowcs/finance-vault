import { X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Movement, Recurrence } from "../types/finance";

type FormState = Omit<Movement, "id">;

const todayDate = new Date();
const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
const expenseCategories = ["Casa", "Transporte", "Alimentação", "Assinaturas", "Família", "Pets", "Outros"];
const incomeCategories = ["Salário", "Freelance", "Investimentos", "Reembolso", "Outros"];
const expenseOwners: FormState["owner"][] = ["Você", "Esposa", "Compartilhado"];
const incomeOwners: FormState["owner"][] = ["Você", "Esposa"];
const initialForm: FormState = { amount: 0, date: today, type: "expense", description: "", category: expenseCategories[0], owner: "Você", recurrence: "none", recurrenceCount: 1 };

type MovementModalProps = {
  onClose: () => void;
  onSubmit: (movement: Movement) => void;
  initialMovement?: Movement;
  onDelete?: () => void;
};

export function MovementModal({ onClose, onSubmit, initialMovement, onDelete }: MovementModalProps) {
  const [form, setForm] = useState<FormState>(() => initialMovement ? { ...initialMovement, recurrence: "none", recurrenceCount: 1 } : initialForm);
  const [error, setError] = useState("");
  const categories = form.type === "income" ? incomeCategories : expenseCategories;
  const isEditing = Boolean(initialMovement);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateType = (type: Movement["type"]) => setForm((current) => {
    const nextCategories = type === "income" ? incomeCategories : expenseCategories;
    const nextOwner = type === "income" && current.owner === "Compartilhado" ? "Você" : current.owner;
    return { ...current, type, owner: nextOwner, category: nextCategories.includes(current.category) ? current.category : nextCategories[0] };
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.amount || form.amount <= 0) { setError("Informe um valor maior que zero."); return; }
    if (!Number.isInteger(form.recurrenceCount) || Number(form.recurrenceCount) < 1 || Number(form.recurrenceCount) > 120) { setError("Informe entre 1 e 120 ocorrências."); return; }
    onSubmit({ ...form, id: initialMovement?.id ?? crypto.randomUUID(), description: form.description.trim(), amount: Number(form.amount), recurrence: form.recurrence ?? "none", recurrenceCount: Number(form.recurrenceCount) });
  };
  const ownerOptions = form.type === "income" ? incomeOwners : expenseOwners;

  return (
    <div className="movement-modal-layer">
      <button className="profile-modal-backdrop" type="button" aria-label="Fechar movimento" onClick={onClose} />
      <section className="movement-modal" role="dialog" aria-modal="true" aria-labelledby="movement-title">
        <button className="icon-button profile-modal-close" type="button" aria-label="Fechar movimento" onClick={onClose}><X size={18} /></button>
        <p className="eyebrow">{isEditing ? "EDITAR MOVIMENTO" : "NOVO MOVIMENTO"}</p>
        <h2 id="movement-title">{isEditing ? "Editar receita ou despesa" : "Adicionar receita ou despesa"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="movement-type-toggle" aria-label="Tipo do movimento">
            <label className={form.type === "income" ? "selected income" : ""}><input type="radio" name="type" value="income" checked={form.type === "income"} onChange={() => updateType("income")} />Receita</label>
            <label className={form.type === "expense" ? "selected expense" : ""}><input type="radio" name="type" value="expense" checked={form.type === "expense"} onChange={() => updateType("expense")} />Despesa</label>
          </div>
          <label className="movement-field"><span>Valor</span><input type="number" min="0.01" step="0.01" value={form.amount || ""} onChange={(event) => update("amount", Number(event.target.value))} placeholder="0,00" required /></label>
          <div className="movement-fields-row">
            <label className="movement-field"><span>Data</span><input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} required /></label>
            <label className="movement-field"><span>Categoria</span><select value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          </div>
          <div className="movement-fields-row">
            <label className="movement-field"><span>Repetir</span><select value={form.recurrence ?? "none"} onChange={(event) => update("recurrence", event.target.value as Recurrence)} disabled={isEditing}><option value="none">Não repetir</option><option value="biweekly">A cada 2 semanas</option><option value="monthly">Mensalmente</option><option value="yearly">Anualmente</option></select></label>
            {form.recurrence !== "none" && <label className="movement-field"><span>Quantidade</span><input type="number" min="1" max="120" step="1" value={form.recurrenceCount || ""} onChange={(event) => update("recurrenceCount", Number(event.target.value))} disabled={isEditing} required /></label>}
          </div>
          <label className="movement-field"><span>Descrição</span><input value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Ex.: Mercado" /></label>
          <div className="movement-field">
            <span>{form.type === "income" ? "Quem recebe" : "Quem paga"}</span>
            <div className="movement-owner-toggle" role="radiogroup" aria-label={form.type === "income" ? "Quem recebe" : "Quem paga"}>
              {ownerOptions.map((owner) => (
                <label className={form.owner === owner ? "selected" : ""} key={owner}>
                  <input type="radio" name="owner" value={owner} checked={form.owner === owner} onChange={() => update("owner", owner)} />
                  {owner}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="movement-error">{error}</p>}
          <div className={onDelete && isEditing ? "movement-form-actions" : ""}><button className="solid-button movement-submit" type="submit">{isEditing ? "Salvar alterações" : "Adicionar movimento"}</button>{onDelete && isEditing && <button className="entry-delete-button movement-delete-button" type="button" onClick={onDelete}>Excluir lançamento</button>}</div>
        </form>
      </section>
    </div>
  );
}
