# Preços e créditos — proposta inicial, 17/11/2026

O catálogo inicial é uma decisão comercial editável pelo admin, não uma promessa de rentabilidade. O servidor usa os preços Standard pesquisados nas documentações oficiais:

| Modelo | US$/milhão entrada | US$/milhão saída | US$/milhão cache leitura |
| --- | ---: | ---: | ---: |
| `claude-opus-5-5` | 4,00 | 20,00 | 0,20 |
| `gpt-6.1-sol` | 2,00 | 10,00 | 0,10 |

Fontes: [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI](https://developers.openai.com/api/docs/pricing), [modelo Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol). O sistema não usa ferramentas cobradas, busca, cache explícito ou modos Fast. Se mudar modelo, modalidade ou adicionar ferramentas, atualize a tabela e o orçamento antes de habilitar; IDs diferentes dos homologados são recusados. Não conte reasoning duas vezes quando já incluído na saída.

**Unidade:** 1 crédito representa US$ 0,001 de consumo tabelado. Internamente um crédito tem 1.000.000 microcréditos. O preço por crédito vendido é maior que o custo de API convertido para reais, para remunerar a plataforma. 1.000 tokens de entrada + 1.000 de saída = 24 créditos Opus ou 12 créditos Sol. Não há equivalência fixa entre crédito e número de tokens, porque entrada, saída e modelos têm preços diferentes.

| Assinatura mensal | Preço | Créditos/ciclo | Computadores | Contribuição estimada* |
| --- | ---: | ---: | ---: | ---: |
| Core | R$49,90 | 1.000 | 1 | 70,97% |
| Creator | R$119,90 | 3.500 | 3 | 65,03% |
| Studio | R$249,90 | 9.000 | 5 | 60,59% |

| Recarga | Preço único | Desconto por crédito ante menor pacote | Contribuição estimada* |
| --- | ---: | ---: | ---: |
| 1.000 créditos | R$39,90 | — | 67,71% |
| 4.000 créditos | R$139,90 | 12,3% | 65,42% |
| 12.000 créditos | R$359,90 | 24,8% | 62,33% |

*Premissas: dólar operacional R$6,50, reserva de processamento 6% e de tributos/imprevistos 10%, com 100% dos créditos consumidos. Contribuição = preço menos custo máximo de IA e reservas, antes de Railway, suporte, aquisição, taxas específicas, impostos efetivos e demais despesas. Não equivale a lucro líquido nem garantia de lucro. [PTAX BCB de referência](https://ptax.bcb.gov.br/ptax_internet/consultarUltimaCotacaoDolar.do): venda R$5,7851/US$ em 17/11/2026. O câmbio operacional é uma premissa conservadora e editável; não é atualizado automaticamente.

O admin edita preço, crédito, computadores e disponibilidade dos planos, preços/saldos dos pacotes e premissas de margem. Alterações de preço/créditos abaixo de 55% de margem estimada são bloqueadas por padrão. A margem mínima também é editável. Atualizar premissas pode tornar preços antigos inadequados: revise todo catálogo ao alterar câmbio ou reservas. Contratos existentes preservam preço e créditos de contratação; o catálogo muda para novas compras. Site e painel recebem o mesmo catálogo da API, atualizado ao navegar, focar a página ou a cada 30 segundos.

Os 6% são reserva comercial, não uma tarifa confirmada para a conta do operador. As taxas reais dependem do contrato, do meio de pagamento e do prazo de recebimento. [Informação pública Mercado Pago](https://www.mercadopago.com.br/blog/conta-pj-do-mercado-pago). Ajuste as premissas ao custo efetivo e acompanhe faturas dos provedores.

## Consumo e proteção de saldo

Antes da chamada, o servidor reserva o teto de tokens de entrada e saída; se o usuário autorizar fallback, reserva também o teto do segundo provedor. A análise só começa com saldo suficiente. Ao concluir, usa `usage` informado para cobrar tokens realmente usados e devolve a diferença. Uma resposta paga que seja rejeitada na validação ainda pode ter consumido tokens. Aplicar, verificar e desfazer um plano já gerado não consome IA.

Erros antes do envio não cobram tokens. Falhas de transporte depois do envio podem ter sido faturadas: o teto daquele provedor fica consumido como inconclusivo, com possibilidade de ajuste auditado pelo admin depois de conferir a fatura. Reservas interrompidas por queda do processo são encerradas após 15 minutos com a mesma política, sem permitir uso gratuito indefinido por retries. Uma solicitação concluída com o mesmo ID retorna o resultado salvo sem nova chamada/cobrança.

Créditos de assinatura e recarga só entram depois do pagamento canônico aprovado. Concessões têm origem única para impedir saldo duplicado em reenvios. Estornos/contestações revertem a concessão original; se já houve consumo, a carteira pode ficar negativa, bloqueando novas análises até regularização. Os créditos acumulam sem expiração nesta oferta, mas usar IA requer licença vigente; uma recarga não estende a licença.

Créditos virtuais não são dinheiro sacável. Não exponha chaves dos provedores no desktop ou no navegador. Não prometa quantidade ilimitada de ações com uma assinatura de preço fixo.


## Roteamento 0.5 — 18/11/2026

A unidade comercial continua 1 crédito = US$ 0,001 de consumo Standard. Não existe tarifa fixa por ação. Novos modos escolhem modelos mais econômicos para tarefas focadas; modo e esforço aparecem antes de enviar, com estimativa e reserva máxima incluindo fallback autorizado.

| Modo padrão | Principal / fallback | Entrada / saída / cache em US$/milhão |
| --- | --- | --- |
| Econômico | GPT-6 Luna / Claude Haiku 5.5 | 0,10 / 0,50 / 0,01 em ambos, até os limites de contexto usados pelo app |
| Equilibrado | GPT-6.1 Terra / Claude Sonnet 5.5 | Terra 1 / 5 / 0,05; Sonnet 2 / 10 / 0,10 |
| Avançado | Claude Opus 5.5 / GPT-6.1 Sol | Opus 4 / 20 / 0,20; Sol 2 / 10 / 0,10 |

Esforço rápido/normal/profundo envia low/medium/high. Tetos de saída: rápido 4096 Anthropic ou 4000 OpenAI; normal 6500; profundo 10000. Pensamento/raciocínio conta na saída. Os tetos são limites de segurança, não tokens obrigatoriamente gastos. Mais esforço pode consumir mais e não garante melhor resultado. O admin edita rotas apenas entre modelos com preço homologado; custo crescente entre modos é validado. Dados, contrato, modelo e orçamento são vinculados ao hash da estimativa. Preço/modelo manipulado pelo cliente não é aceito.

Fontes oficiais: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [preços Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) e [esforço Claude](https://platform.claude.com/docs/en/build-with-claude/effort). Haiku tem tarifa maior acima de 100 mil tokens; o app limita payload/contexto abaixo desse patamar. Não usa modos Fast/Flex, ferramentas pagas externas ou cache explícito. Revalidar custos ao trocar os modelos ou a política de cache.
