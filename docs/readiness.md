# Batch 4 — Prontidão

## Decisão: backup e exportação

O Firestore continua sendo a fonte compartilhada dos dados autenticados. Cache do navegador e seed não são backup. Este batch documenta a estratégia; não ativa serviços pagos nem implementa download/importação.

- Formato escolhido para futura exportação: JSON versionado, com data da exportação, UID do orçamento, IDs originais e datas normalizadas. CSV poderá servir para consulta, mas não será formato de restauração.
- Escopo: movimentos, objetivos/aportes, ajustes e reservas em `users/{ownerUid}`, além de períodos, modelos e ocorrências de contas em `households/{ownerUid}`.
- Exportação financeira não incluirá credenciais, links/tokens de autenticação nem convites. Permissões e associações de membros precisam de recuperação administrativa separada; não serão recriadas por importação financeira.
- Restauração futura deverá validar versão, mostrar prévia, deduplicar por ID e exigir confirmação antes de gravar. Não apagar a origem nem importar automaticamente dados pessoais de membros.
- Backup operacional desejado: cópia diária, retenção de 30 dias e ensaio de restauração em ambiente isolado antes de depender dela. Isso é uma meta ainda não configurada/verificada. Custos, destino e acesso administrativo serão definidos na implantação desse recurso.

Até existir backup com restauração verificada, esta prontidão é limitada ao uso doméstico atual. Não há recuperação garantida após exclusão de dados ou limpeza do navegador no modo local.

## Decisão: suporte offline

O produto autenticado depende de conexão para operações financeiras e convites. Não prometer edição offline com sincronização posterior neste batch.

O que existe hoje:

- A PWA guarda recursos da interface após uma visita e pode reabrir o shell sem rede.
- Há cópias locais de parte dos dados e caminhos de recuperação/migração no app.
- Não há configuração de cache persistente do Firestore em `src/lib/firebase.ts`.
- Sem configuração Firebase, o app abre em modo local, com dados no navegador; esse modo não equivale a uma sessão compartilhada offline.

Limitações: a autenticação/verificação de associação pode exigir rede; nem todas as telas estarão disponíveis offline. Algumas alterações são otimistas e outras aguardam o servidor. Não existe bloqueio uniforme de edição, indicador global de sincronização nem resolução geral de conflitos. Portanto, cache disponível não confirma que uma gravação foi salva no servidor.

Próxima implementação escolhida para offline: consulta dos últimos dados confirmados, aviso de desconexão e bloqueio das mutações até reconectar. Edição offline fica fora de escopo até haver fila persistente, identificação de operações, conflitos, revogação de acesso e testes de reconexão.

## Validação dos fluxos

Os testes de domínio exercitam sequências de receitas, contas e objetivos com estado inicial explícito e verificações de saldo entre etapas. Os testes de Firestore exercitam persistência/permissões e o ciclo de convites no emulador com identidades fictícias. Nenhum e-mail real é enviado.

Esses testes não são testes de navegador: autenticação Google/Email Link, entrega de e-mail, formulários, instalação da PWA e reconexão real ainda exigem validação de interface. Um `npm test` sem emulador não comprova as regras de acesso: os testes correspondentes são ignorados nesse modo.

Antes de publicar, executar testes locais, testes com emulador, typecheck, lint e build. Depois conferir no ambiente de homologação os quatro fluxos pela interface, com usuários de teste e dados descartáveis.
