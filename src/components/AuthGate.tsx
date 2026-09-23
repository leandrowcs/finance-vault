import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import type { ReactNode } from 'react'
import { auth, googleProvider, isFirebaseConfigured } from '../lib/firebase'
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
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  if (!isFirebaseConfigured) {
    return <App />
  }

  if (loading) return <AccessMessage title="Abrindo suas contas" detail="Verificando sua sessão segura..." />
  if (!user) return <AccessMessage title="Acesse suas contas" detail={error || 'Use sua conta Google autorizada para acessar o Finance Vault.'} action={<button className="access-button" type="button" onClick={() => { setError(''); if (auth) void signInWithPopup(auth, googleProvider).catch(() => setError('Não foi possível concluir o login.')) }}>Entrar com Google</button>} />

  const email = user.email?.toLowerCase() ?? ''
  if (!allowedEmails.includes(email)) return <AccessMessage title="Acesso não autorizado" detail="Esta conta Google não está autorizada neste orçamento." action={<button className="access-button secondary" type="button" onClick={() => { if (auth) void signOut(auth) }}>Sair</button>} />
  return <App />
}
