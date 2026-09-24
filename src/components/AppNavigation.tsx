import { ArrowUpRight, CalendarDays, Check, ReceiptText, Settings2, Sparkles, Users, WalletCards, X } from "lucide-react";

type AppNavigationProps = { isOpen: boolean; onClose: () => void };

export function AppNavigation({ isOpen, onClose }: AppNavigationProps) {
  return <>
    <aside className={isOpen ? "sidebar sidebar-open" : "sidebar"}>
      <div className="brand-row"><div className="brand-mark"><img src="/icons/finance-vault-logo.svg" alt="" width="28" height="28" /></div><span>Finance <strong>Vault</strong></span><button className="icon-button mobile-close" type="button" aria-label="Fechar menu" onClick={onClose}><X size={18} /></button></div>
      <nav className="main-nav" aria-label="Navegação principal">
        <span className="nav-label">Visão geral</span><a className="nav-link active" href="#dashboard" onClick={onClose}><WalletCards size={17} />Dashboard</a>
        <a className="nav-link" href="#payments" onClick={onClose}><CalendarDays size={17} />Pagamentos<span className="nav-count">26</span></a>
        <a className="nav-link" href="#bills" onClick={onClose}><ReceiptText size={17} />Contas<span className="nav-count">12</span></a>
        <span className="nav-label spaced">Planejamento</span><a className="nav-link" href="#income" onClick={onClose}><ArrowUpRight size={17} />Receitas</a><a className="nav-link" href="#goals" onClick={onClose}><Sparkles size={17} />Objetivos</a>
      </nav>
      <div className="sidebar-bottom"><a className="nav-link" href="#members" onClick={onClose}><Users size={17} />Membros</a><a className="nav-link" href="#settings" onClick={onClose}><Settings2 size={17} />Configurações</a><div className="secure-note"><span><Check size={13} /></span><p><strong>Seus dados estão seguros</strong><small>Sincronizado agora</small></p></div></div>
    </aside>
    {isOpen && <button className="sidebar-backdrop" type="button" aria-label="Fechar menu" onClick={onClose} />}
  </>;
}
