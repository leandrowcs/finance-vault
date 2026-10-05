# Prontidão — saldos, sincronização e cópias financeiras

Atualizado em 2026-10-05.

## Exportação e restauração disponíveis

Configurações oferece backup JSON v1 (CAD) e CSV dos lançamentos manuais. JSON inclui movimentos, objetivos/aportes, períodos, modelos e ocorrências de contas, pagamentos legados, ajustes e reservas. Inclui UID de origem, IDs originais e data UTC da exportação. Credenciais, autenticação, convites, membros e permissões não fazem parte do arquivo.

- A exportação autenticada lê os dados do servidor e exige conexão e confirmação das coleções financeiras. Não exporta cópias antigas do navegador como se fossem dados confirmados. Evite alterações de outros membros durante a exportação: a leitura de coleções não é um snapshot global transacional.
- CSV serve para consulta e não para restauração. Tem valores em CAD, cabeçalho, escape de aspas e proteção contra fórmulas em campos de texto.
- O JSON é validado antes de apresentar a prévia: versão, moeda, tipos, datas, IDs duplicados, referências de contas e substituições, valores de objetivos, recebimentos e reservas.
- A restauração é aditiva: registros ausentes são adicionados, iguais são ignorados e qualquer ID com conteúdo diferente bloqueia toda a operação. Nenhum registro existente é apagado ou substituído. A prévia mostra quantidades, origem, destino e conflitos e exige confirmação explícita.
- Apenas o proprietário recebe a ação de restauração na interface. O Firestore continua aplicando as permissões de leitura/escrita existentes; a importação não concede acesso nem altera membros.
- Na nuvem, uma transação relê os registros e as reservas antes de gravar. Conflitos concorrentes abortam a operação. Objetivos já existentes fora do arquivo também participam da validação de reservas. Arquivos online estão limitados a 450 registros financeiros para manter uma única operação; a interface informa o limite antes da confirmação. Arquivos JSON aceitos têm no máximo 10 MB.
- Em um navegador local novo, a prévia avisa que os dados iniciais de exemplo serão substituídos pelo backup confirmado; isso permite recuperar uma cópia após limpar o navegador.
- Em modo local, todos os dados são gravados em uma única chave versionada antes de atualizar a interface. Falhas de armazenamento preservam o estado anterior. Uma cópia local ilegível abre uma tela de recuperação que permite baixar o original e escolher um backup válido com confirmação.
- Cópias antigas por funcionalidade permanecem no navegador, mas não são enviadas automaticamente ao Firestore nem recriam registros excluídos. Elas não substituem os dados confirmados do servidor.

A restauração foi exercitada no emulador com identidades e dados fictícios: repetição sem duplicatas, conflito sem gravação parcial, reservas de objetivos e bloqueio de membros com leitura apenas.

Backup automático operacional continua fora desta implementação: cópia diária, retenção e recuperação administrativa de permissões ainda precisam de configuração. É necessário baixar e guardar o JSON para recuperar dados após limpeza do navegador. Um arquivo armazenado somente no mesmo dispositivo não protege contra perda desse dispositivo.

## Sincronização e desconexão

O indicador global e Configurações distinguem modo local, aguardando servidor, salvando, confirmado, sem conexão e falha. A confirmação usa metadados das coleções de movimentos, objetivos, períodos, contas e vencimentos, além do documento de ajustes/reservas. Dados vindos apenas do cache e gravações pendentes não são apresentados como confirmados.

Operações financeiras autenticadas ficam bloqueadas sem conexão ou antes da confirmação dos dados. Falhas são apresentadas e há uma ação para verificar a sincronização novamente. Uma gravação iniciada antes da queda da conexão pode permanecer pendente até reconectar; o app não informa sucesso antecipadamente. A confirmação abrange os dados financeiros, não a entrega de e-mails de convite.

A PWA mantém recursos da interface. Não há cache persistente do Firestore, fila própria de edição offline nem resolução geral de conflitos. Uma sessão já aberta pode consultar os dados em memória após desconectar; reabrir o app ainda pode exigir rede para autenticação e associação. O modo local sem Firebase é separado da sessão compartilhada.

## Validação

Executar `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run lint` e `npm run build`. Sem o emulador, a suíte de regras é ignorada; isso não valida permissões.

Os testes automatizados cobrem domínio, arquivos, persistência local e Firestore. Não substituem a conferência dos formulários, downloads, upload, autenticação e reconexão real pela interface em homologação. Nenhum convite real é enviado pelos testes.
