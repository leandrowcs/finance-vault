import { LogOut, X } from "lucide-react";
import type { User } from "firebase/auth";

type ProfileModalProps = {
  user: User | null;
  displayName: string;
  initials: string;
  signOutError: string;
  isSigningOut: boolean;
  onClose: () => void;
  onSignOut?: () => void;
};

export function ProfileModal({ user, displayName, initials, signOutError, isSigningOut, onClose, onSignOut }: ProfileModalProps) {
  return <div className="profile-modal-layer">
    <button className="profile-modal-backdrop" type="button" aria-label="Fechar perfil" onClick={onClose} />
    <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <button className="icon-button profile-modal-close" type="button" aria-label="Fechar perfil" onClick={onClose}><X size={18} /></button>
      <div className="profile-modal-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : initials}</div>
      <p className="eyebrow">PERFIL</p>
      <h2 id="profile-title">{displayName}</h2>
      <p className="profile-email">{user?.email ?? "Conta local"}</p>
      {signOutError && <p className="profile-error">{signOutError}</p>}
      {onSignOut && <button className="access-button profile-signout" type="button" onClick={onSignOut} disabled={isSigningOut}><LogOut size={16} />{isSigningOut ? "Saindo..." : "Sair da conta"}</button>}
    </section>
  </div>;
}
