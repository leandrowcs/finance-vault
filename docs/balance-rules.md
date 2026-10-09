# Regras do saldo

## Valores e responsáveis

Todos os valores são em CAD. Despesas compartilhadas são divididas entre Você e Esposa; quando sobra um centavo, ele fica na parcela de Esposa. Os valores individuais não transferem automaticamente capacidade de um responsável para o outro.

## Receitas

- Receita planejada é previsão, não dinheiro disponível para aportar.
- Cada recebimento parcial usa seu valor real e sua data real. A previsão restante é `máximo(0, previsto − recebimentos)`.
- Receita manual é considerada recebida. Uma data futura ainda impede seu uso em objetivos hoje.
- Ao adicionar receita manual com a mesma data e valor em centavos de uma previsão pendente, o usuário escolhe substituir ou adicionar. A comparação atual não filtra pelo responsável: se houver várias correspondências, é necessário escolher a previsão.
- Substituir oculta a previsão pendente vinculada, preservando recebimentos parciais anteriores; adicionar mantém ambas. Excluir a receita substituta restaura a previsão vinculada.

## Saldo projetado no dashboard

Cada cartão de pagamento calcula `receitas − despesas associadas − aportes`. O saldo do mês soma esses cartões, arredondando cada saldo a centavos. Os agrupamentos usam o calendário de pagamentos de 14 dias ancorado em 03/09/2026.

A interface usa o nome **Saldo projetado**, mostra o recebido até hoje e o que ainda falta receber, e explica separadamente a disponibilidade para objetivos. A receita manual com data futura permanece em “a receber” até essa data. Esse é um resumo de planejamento: pode incluir receitas ainda previstas. Não é saldo bancário nem autorização para gastar/aportar. Exemplo: cartões de −530,08 e 853,93 resultam em **323,85 CAD**.

## Disponível para objetivos

`resolveFinancialEntries` resolve receitas, contas e ajustes; `calculateFinanceLedger` calcula a reserva por responsável:

1. Ordena receitas recebidas por data e, quando há uma data de referência, considera apenas receitas recebidas até essa data.
2. Despesas do mesmo responsável só reduzem essa disponibilidade quando sua data é igual ou anterior à data de referência. Vencimentos futuros não bloqueiam aportes de receitas já recebidas.
3. Contas anteriores ao recebimento não são cobertas retroativamente por ele.
4. Subtrai os aportes já registrados. Aportes antigos sem origem são reservados uma única vez, conforme a capacidade disponível.
5. A tela de objetivos oferece receitas recebidas até hoje e saldo do mês atual, descontadas as despesas até hoje. Valores negativos não viram capacidade de aporte.

Exemplo: até hoje, uma receita recebida de 1.000 e uma despesa de 600 deixam 400 CAD disponíveis. Uma conta com vencimento futuro não reduz esse valor até sua data.

O saldo interno do ledger é `disponível dos responsáveis − despesas sem cobertura`. Ele pode diferir do saldo do dashboard, que usa agrupamentos de pagamentos e inclui previsões. Não usar esses indicadores como sinônimos.

## Contas

Marcar uma conta como paga registra pagamento total e histórico. Reabrir remove o estado de pagamento e acrescenta um evento; não apaga o histórico. A despesa continua no cálculo em ambos os estados: pagar não libera novamente o dinheiro já comprometido.

Contas recorrentes geram ocorrências com IDs determinísticos e horizonte de 12 meses. Meses curtos usam o último dia disponível. O cálculo não prevê despesas fora do horizonte carregado.

## Objetivos

Aporte é transferência para um objetivo, não nova receita ou despesa. A gravação autenticada usa transação para atualizar o objetivo e a reserva da origem, recusando aporte acima da capacidade informada menos reservas existentes. Excluir o objetivo libera suas reservas; isso não registra uma receita.

Atingir o valor alvo não representa consumo do dinheiro. O modelo atual não registra gasto de objetivo nem devolução de sobra ao mês atual; essas funcionalidades continuam pendentes. As regras Firestore controlam acesso, mas não recalculam o saldo financeiro no servidor.

## Limites conhecidos

O saldo disponível depende das contas cadastradas, das datas e dos recebimentos informados. O limite transacional de aporte usa a capacidade calculada pelo cliente; não é uma conciliação bancária nem proteção completa contra alterações concorrentes de receitas/contas. Cálculos intermediários usam números JavaScript; rateio e soma dos cartões têm tratamento explícito de centavos.
