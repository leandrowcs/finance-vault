import { X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Movement } from "../types/finance";

type MovementModalProps = { onClose: () => void; onSubmit: (movement: Movement) => void };

type FormState = Omit<Movement, "id">;

const today = new Date().toISOString().slice(0, 10);
const initialForm: FormState = { amount: 0, date: today, type: "expense", description: "", category: "Casa", owner: "Você" };

export function MovementModal({ onClose, onSubmit }: MovementModalProps) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.amount || form.amount <= 0) { setError("Informe um valor maior que zero."); return; }
    if (!form.description.trim()) { setError("Informe uma descrição."); return; }
    onSubmit({ ...form, id: crypto.randomUUID(), description: form.description.trim(), amount: Number(form.amount) });
  };
  return <div className="movement-modal-layer"><button className="profile-modal-backdrop" type="button" aria-label="Fechar movimento" onClick={onClose} /><section className="movement-modal" role="dialog" aria-modal="true" aria-labelledby="movement-title"><button className="icon-button profile-modal-close" type="button" aria-label="Fechar movimento" onClick={onClose}><X size={18} /></button><p className="eyebrow">NOVO MOVIMENTO</p><h2 id="movement-title">Adicionar receita ou despesa</h2><form onSubmit={handleSubmit}><div className="movement-type-toggle" aria-label="Tipo do movimento"><label className={form.type === "income" ? "selected income" : ""}><input type="radio" name="type" value="income" checked={form.type === "income"} onChange={() => update("type", "income")} />Receita</label><label className={form.type === "expense" ? "selected expense" : ""}><input type="radio" name="type" value="expense" checked={form.type === "expense"} onChange={() => update("type", "expense")} />Despesa</label></div><label className="movement-field"><span>Valor</span><input type="number" min="0.01" step="0.01" value={form.amount || ""} onChange={(event) => update("amount", Number(event.target.value))} placeholder="0,00" required /></label><div className="movement-fields-row"><label className="movement-field"><span>Data</span><input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} required /></label><label className="movement-field"><span>Categoria</span><select value={form.category} onChange={(event) => update("category", event.target.value)}><option>Casa</option><option>Transporte</option><option>Alimentação</option><option>Assinaturas</option><option>Família</option><option>Pets</option><option>Outros</option></select></label></div><label className="movement-field"><span>Descrição</span><input value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Ex.: Mercado" required /></label><label className="movement-field"><span>{form.type === "income" ? "Quem recebe" : "Quem paga"}</span><select value={form.owner} onChange={(event) => update("owner", event.target.value as Movement["owner"])}><option value="Você">Leandro</option><option value="Esposa">Ketlin</option><option value="Compartilhado">Compartilhado</option></select></label>{error && <p className="movement-error">{error}</p>}<button className="primary-button movement-submit" type="submit">Salvar movimento</button></form></section></div>;
}
