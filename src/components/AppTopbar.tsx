import { CalendarDays, ChevronRight, Menu } from "lucide-react";
import type { User } from "firebase/auth";
import { monthLabels } from "../lib/finance";

type AppTopbarProps = { user: User | null; calendarMonth: Date; onMenuOpen: () => void; onCalendarOpen: () => void; onProfileOpen: () => void; initials: string };

export function AppTopbar({ user, calendarMonth, onMenuOpen, onCalendarOpen, onProfileOpen, initials }: AppTopbarProps) {
  return <header className="topbar"><button className="icon-button menu-trigger" type="button" aria-label="Abrir menu" onClick={onMenuOpen}><Menu size={21} /></button><div className="crumbs">Finance<strong>Vault</strong></div><div className="top-actions"><button className="period-button" type="button" onClick={onCalendarOpen}><CalendarDays size={16} />{`${monthLabels[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`}<ChevronRight size={14} /></button><button className="profile-button" type="button" aria-label="Abrir perfil" onClick={onProfileOpen}>{user?.photoURL ? <img src={user.photoURL} alt="" /> : initials}</button></div></header>;
}
