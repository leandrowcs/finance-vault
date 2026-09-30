import { useEffect, useState } from 'react'
import { isSignInWithEmailLink, onAuthStateChanged, signInWithEmailLink, signInWithPopup, signOut, type User } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { auth, db, googleProvider, isFirebaseConfigured } from '../lib/firebase'
import App from '../App'

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean)

function AccessMessage({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <main className="access-screen"><div className="access-card"><img className="access-logo" src="/icons/finance-vault-logo.svg" alt="FinanceVault" /><p className="eyebrow">FINANCE VAULT</p><h1>{title}</h1><p>{detail}</p>{action}</div></main>
}

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [membership, setMembership] = useState<{ uid: string; allowed: boolean } | null>(null)
  const [error, setError] = useState('')
  const [emailLinkAddress, setEmailLinkAddress] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user || !db) return
    const email = user.email?.toLowerCase() ?? ''
    const inviteParams = new URLSearchParams(window.location.search)
    if (allowedEmails.includes(email) || (inviteParams.has('inviteHousehold') && inviteParams.has('inviteId'))) return
    let active = true
    void getDocs(collection(db, 'users', user.uid, 'memberships'))
      .then((snapshot) => {
        if (active) setMembership({ uid: user.uid, allowed: !snapshot.empty })
      })
      .catch(() => {
        if (active) setMembership({ uid: user.uid, allowed: false })
      })
    return () => {
      active = false
    }
  }, [user])

  if (!isFirebaseConfigured) {
    return <App />
  }

  if (loading) return <AccessMessage title="Abrindo suas contas" detail="Verificando sua sessão segura..." />
  const emailLink = Boolean(auth && isSignInWithEmailLink(auth, window.location.href))
  if (!user && emailLink) return <AccessMessage title="Aceitar convite" detail={error || 'Informe o mesmo e-mail que recebeu o convite.'} action={<form onSubmit={(event) => {
    event.preventDefault()
    if (!auth || !emailLinkAddress.trim()) return
    setError('')
    setLoading(true)
    const continuationValue = new URLSearchParams(window.location.search).get('continueUrl')
    let inviteContinuation: URL | null = null
    try {
      const candidate = continuationValue ? new URL(continuationValue) : null
      if (
        candidate?.origin === window.location.origin &&
        candidate.searchParams.has('inviteHousehold') &&
        candidate.searchParams.has('inviteId')
      ) inviteContinuation = candidate
    } catch {
      inviteContinuation = null
    }
    void signInWithEmailLink(auth, emailLinkAddress.trim().toLowerCase(), window.location.href)
      .then(() => {
        if (!inviteContinuation) return
        window.history.replaceState(null, '', `${inviteContinuation.pathname}${inviteContinuation.search}${inviteContinuation.hash}`)
      })
      .catch(() => setError('Link expirado ou e-mail incorreto. Solicite novo convite.'))
      .finally(() => setLoading(false))
  }}><label className="movement-field"><span>E-mail convidado</span><input autoComplete="email" type="email" value={emailLinkAddress} onChange={(event) => setEmailLinkAddress(event.target.value)} required /></label><button className="access-button" type="submit">Aceitar convite</button></form>} />
  if (!user) return <AccessMessage title="Acesse suas contas" detail={error || 'Use sua conta Google autorizada para acessar o Finance Vault.'} action={<button className="access-button" type="button" onClick={() => { setError(''); if (auth) void signInWithPopup(auth, googleProvider).catch(() => setError('Não foi possível concluir o login.')) }}>Entrar com Google</button>} />

  const email = user.email?.toLowerCase() ?? ''
  const inviteParams = new URLSearchParams(window.location.search);
  const hasInvitation = Boolean(inviteParams.get("inviteHousehold") && inviteParams.get("inviteId"));
  const isAllowedEmail = allowedEmails.includes(email)
  const membershipLoading = Boolean(!isAllowedEmail && !hasInvitation && membership?.uid !== user.uid)
  const membershipAllowed = membership?.uid === user.uid && membership.allowed
  if (membershipLoading) return <AccessMessage title="Validando acesso" detail="Verificando seu convite e permissões..." />
  if (!isAllowedEmail && !membershipAllowed && !hasInvitation) return <AccessMessage title="Acesso não autorizado" detail="Esta conta Google não tem convite ativo para este orçamento." action={<button className="access-button secondary" type="button" onClick={() => { if (auth) void signOut(auth) }}>Sair</button>} />
  return <App key={user.uid} user={user} onSignOut={() => auth ? signOut(auth) : Promise.resolve()} />
}
