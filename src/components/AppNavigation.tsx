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

export type NavigationView = "dashboard" | "payments";
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
            Pagamentos<span className="nav-count">26</span>
          </button>
          <a className="nav-link" href="#bills" onClick={onClose}>
            <ReceiptText size={17} />
            Contas<span className="nav-count">12</span>
          </a>
          <span className="nav-label spaced">Planejamento</span>
          <a className="nav-link" href="#income" onClick={onClose}>
            <ArrowUpRight size={17} />
            Receitas
          </a>
          <a className="nav-link" href="#goals" onClick={onClose}>
            <Sparkles size={17} />
            Objetivos
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-link" href="#members" onClick={onClose}>
            <Users size={17} />
            Membros
          </a>
          <a className="nav-link" href="#settings" onClick={onClose}>
            <Settings2 size={17} />
            Configurações
          </a>
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
