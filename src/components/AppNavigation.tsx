import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ReceiptText,
  Settings2,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";

export type NavigationView = "dashboard" | "payments" | "bills" | "income" | "goals" | "members" | "settings";
type AppNavigationProps = {
  isOpen: boolean;
  onClose: () => void;
  activeView: NavigationView;
  onNavigate: (view: NavigationView) => void;
};

export function AppNavigation({
  isOpen,
  onClose,
  activeView,
  onNavigate,
}: AppNavigationProps) {
  return (
    <>
      <aside className={isOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark">
            <img
              src="/icons/finance-vault-logo.svg"
              alt=""
              width="28"
              height="28"
            />
          </div>
          <span>
            Finance<strong>Vault</strong>
          </span>
          <button
            className="icon-button mobile-close"
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          <span className="nav-label">Visão geral</span>
          <button
            className={`nav-link${activeView === "dashboard" ? " active" : ""}`}
            type="button"
            onClick={() => {
              onNavigate("dashboard");
              onClose();
            }}
          >
            <WalletCards size={17} />
            Dashboard
          </button>
          <button
            className={`nav-link${activeView === "payments" ? " active" : ""}`}
            type="button"
            onClick={() => {
              onNavigate("payments");
              onClose();
            }}
          >
            <CalendarDays size={17} />
            Calendário
          </button>
          <button className={`nav-link${activeView === "bills" ? " active" : ""}`} type="button" onClick={() => { onNavigate("bills"); onClose(); }}>
            <ReceiptText size={17} />
            Contas
          </button>
          <span className="nav-label spaced">Planejamento</span>
          <button className={`nav-link${activeView === "income" ? " active" : ""}`} type="button" onClick={() => { onNavigate("income"); onClose(); }}>
            <ArrowUpRight size={17} />
            Receitas
          </button>
          <button className={`nav-link${activeView === "goals" ? " active" : ""}`} type="button" onClick={() => { onNavigate("goals"); onClose(); }}>
            <Sparkles size={17} />
            Objetivos
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-link${activeView === "members" ? " active" : ""}`} type="button" onClick={() => { onNavigate("members"); onClose(); }}>
            <Users size={17} />
            Membros
          </button>
          <button className={`nav-link${activeView === "settings" ? " active" : ""}`} type="button" onClick={() => { onNavigate("settings"); onClose(); }}>
            <Settings2 size={17} />
            Configurações
          </button>
          <div className="secure-note">
            <span>
              <Check size={13} />
            </span>
            <p>
              <strong>Seus dados estão seguros</strong>
              <small>Sincronizado agora</small>
            </p>
          </div>
        </div>
      </aside>
      {isOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
        />
      )}
    </>
  );
}
