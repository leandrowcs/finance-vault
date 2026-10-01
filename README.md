# Finance Vault

App web para planejamento financeiro doméstico por pagamento quinzenal.

Receitas previstas e recebidas, contas recorrentes com histórico de pagamento, objetivos com aportes e orçamento compartilhado por convite. Moeda: CAD.

- [Regras do saldo, exemplos e limites](docs/balance-rules.md)
- [Batch 4: decisões de backup/exportação, offline e validação](docs/readiness.md)
- [Histórico de decisões do produto](docs/product-decisions.md)

## Local

```bash
npm ci
npm run dev
```

Use uma versão de Node compatível com o Vite instalado (Node 22.12+). Sem as variáveis Firebase, o app funciona em modo local no navegador. Para usar autenticação e dados compartilhados, copie `.env.example` para `.env.local` e preencha os valores. Não versione arquivos de credenciais ou cópias financeiras.

## Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
2. Ative Authentication > Sign-in method > Google e Email/Password > Email link (passwordless sign-in).
3. Crie o Firestore Database em modo de produção.
4. Cadastre um app Web e copie a configuração para `.env.local` usando `.env.example`.
5. Configure `VITE_ALLOWED_EMAILS` com os e-mails autorizados para acesso direto, separados por vírgula. Membros convidados usam o aceite do convite.
6. Adicione os domínios `localhost` e o domínio da Vercel em Authentication > Settings > Authorized domains.
7. Instale o Firebase CLI, selecione o projeto e publique as regras:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

As variáveis `VITE_*` não são segredos de servidor, mas devem ser configuradas também no ambiente de produção da Vercel.

O planejamento doméstico fica em `households/{ownerUid}`: `payPeriods` guarda previsões e recebimentos parciais, `bills` guarda modelos recorrentes e `billOccurrences` guarda vencimentos, estado de pagamento e histórico. Recorrências geram ocorrências até 12 meses à frente. A migração do seed usa `planningMigrationVersion` e IDs determinísticos para não duplicar registros. Pagamentos feitos no app são totais; reabrir uma conta registra evento sem apagar o histórico.

Convites podem abrir um rascunho manual ou enviar automaticamente um link de autenticação por e-mail do Firebase. O modo automático exige Email Link ativado e o domínio de continuação autorizado.

Ao aceitar convite, dados pessoais existentes do membro permanecem sob o UID original. Não há importação automática para o orçamento compartilhado.

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
npm test
npm run test:flows
npm run test:rules
npm run typecheck
npm run lint
npm run build
```

`test:flows` executa os fluxos de domínio. `test:rules` requer Firebase CLI e Java instalados e inicia um emulador isolado no projeto `demo-financevault`; inclui os fluxos de persistência e convites. Sem emulador, `npm test` ignora a suíte Firestore. Os testes não enviam convites reais nem acessam dados de produção.

O saldo do mês soma os cartões de pagamento e pode incluir previsões. O disponível para objetivos considera recebimentos e reserva contas futuras antes de liberar aportes. Veja as [regras detalhadas](docs/balance-rules.md).

A PWA e o cache local não garantem edição offline nem recuperação de dados. Exportação/restauração e backup automático ainda não estão implementados/configurados; a estratégia e os limites estão em [Prontidão](docs/readiness.md).
