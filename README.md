# Finance Vault

App web para planejamento financeiro doméstico por pagamento quinzenal.

## Local

```bash
npm install
npm run dev
```

## Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
2. Ative Authentication > Sign-in method > Google.
3. Crie o Firestore Database em modo de produção.
4. Cadastre um app Web e copie a configuração para `.env.local` usando `.env.example`.
5. Adicione os domínios `localhost` e o domínio da Vercel em Authentication > Settings > Authorized domains.
6. Substitua os dois placeholders de e-mail em `firestore.rules`.
7. Substitua `YOUR_PROJECT_ID` pelo ID do projeto em `.firebaserc`.
8. Instale o Firebase CLI e publique as regras:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

As variáveis `VITE_*` não são segredos de servidor, mas devem ser configuradas também no ambiente de produção da Vercel.

## Vercel

1. Importe o repositório em [Vercel](https://vercel.com/new).
2. Framework preset: `Vite`.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Adicione todas as variáveis de `.env.example` em Project Settings > Environment Variables para Preview e Production.
6. Adicione o domínio final da Vercel aos domínios autorizados do Firebase.

O `vercel.json` mantém o fallback das rotas SPA para `index.html`.

## Validação

```bash
npm run typecheck
npm run lint
npm run build
```
