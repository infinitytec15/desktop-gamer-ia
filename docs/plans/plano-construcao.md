# Plano de construção — GameForge AI

Data: 17/11/2026.

Base: `SDD — GameForge AI Otimizador de PC, OBS, Discord e Jogos com Claude.md`, presente na raiz do projeto. Este plano transforma o SDD em entregas executáveis; decisões propostas abaixo devem ser registradas no SDD/ADRs antes de sua implementação.

## 1. Resultado e estratégia

Construir um aplicativo desktop que diagnostica o computador, apresenta mudanças compreensíveis, aplica apenas ações conhecidas e permite desfazer. A mesma infraestrutura sustentará sistema, jogos, OBS, Discord e os planos gerados pelo Claude.

A pasta atual contém somente a especificação. Portanto, o trabalho começa pela fundação do repositório, sem migração de código existente.

Manter as fases 0 a 10 do SDD, com três marcos de produto:

| Marco | Fases | Resultado demonstrável |
| --- | --- | --- |
| A — MVP local | 0–3 | Diagnosticar → revisar preset offline → aplicar → verificar → desfazer, com recuperação pela CLI |
| B — Beta funcional | 4–8 | IA em build beta, três jogos iniciais, OBS, Discord, rede e fluxo Pronto para Live |
| C — v1.0 comercial | 9–10 | Site, contas, assinatura, proxy de IA, distribuição e atualizações assinadas |

Prioridade de validação manual: Windows, por ser o ambiente disponível. Isso não elimina o macOS do SDD: build, adaptadores e aceite em hardware Mac continuam obrigatórios para declarar suporte às duas plataformas. Sem equipamento/runner Mac, registrar o aceite pendente em vez de declarar a fase multiplataforma concluída.

## 2. Decisões que precisam ficar explícitas

| Tema | Encaminhamento proposto | Quando resolver |
| --- | --- | --- |
| Reversibilidade de limpeza | Não habilitar exclusão definitiva no MVP. Para `clean_paths`, projetar quarentena com manifesto, retenção e restauração; purga definitiva será uma operação separada com aviso de perda de reversibilidade. Limpeza de lixeira fica fora do MVP. | Antes da fase 2 |
| Ponto de Restauração | Verificar disponibilidade e criação antes do lote de sistema. Se falhar, bloquear esse lote e explicar o motivo; snapshot interno continua obrigatório. Definir política específica para macOS. | Fase 2 |
| Cancelamento da assinatura | Adotar os estados detalhados da seção 14.3: cancelamento comum mantém acesso até o fim do período pago. Corrigir a frase da abertura da seção 14 que promete perda imediata. | Antes da fase 9 |
| Pro offline e revogação | Assumir janela de acesso offline de até sete dias, conforme SDD. Revogação no servidor bloqueia IA; revogação local depende de nova validação ou expiração do token. Não prometer revogação instantânea offline. | Contratos na fase 4; implementação na 9 |
| Restauração após perder Pro | Desfazer alterações existentes permanece gratuito, offline e independente de login, cota ou assinatura. | Fase 2 |
| Compatibilidade dos adaptadores | Criar matriz por SO, versão do aplicativo, dispositivo e recurso: automático, guiado, indisponível ou ainda não validado. | Iniciar na fase 0; completar em cada integração |
| Tipos compartilhados | Usar contratos Rust como fonte da verdade e selecionar `specta` após uma prova de geração de tipos; evitar schemas independentes que possam divergir. | Fase 0 |
| Backend | Proposta inicial: API TypeScript em `services/api`, integrada ao deploy do Next.js, com Supabase Auth/Postgres. Escolher o mecanismo durável de fila antes de implementar webhooks; preservar a interface `PaymentProvider`. | ADR inicial; fechar na fase 9 |
| Escopo comercial | Asaas primeiro; Mercado Pago e Stripe como extensões posteriores. Códigos de resgate são opcionais no SDD e podem entrar depois do lançamento. | Fase 9 |
| Automação por tela | Deixar fora do MVP e do caminho obrigatório do beta. Manter cartões guiados para recursos sem integração validada. | Fase 7 |
| Assinatura de perfis exportados | Definir quem assina, como a confiança é estabelecida e como o arquivo é validado. Uma assinatura nunca dispensa revalidação do catálogo e dos parâmetros. | Antes de importação/exportação na fase 8 |

As tecnologias e capacidades descritas no SDD são hipóteses de implementação até serem testadas. Este plano não representa uma auditoria atual das APIs de terceiros.

## 3. Arquitetura de execução

Fluxo principal:

```text
React → comandos Tauri tipados → gf-core
                                  ├─ diagnóstico e skills
                                  ├─ preset offline ou planejador Claude
                                  ├─ validação + revisão do usuário
                                  └─ snapshots → adaptadores → verificação
                                                    └─ restauração
```

Responsabilidades:

- `apps/desktop`: telas, assistentes, acessibilidade, estado visual e IPC. Não recebe permissões amplas de arquivo/shell.
- `gf-core`: contratos, validação, dependências dos passos, política de risco e orquestração.
- `gf-actions` e adaptadores: leitura, diff, pré-condições, aplicação, verificação e reversão por ação.
- `gf-snapshots` e `gf-store`: persistência durável dos valores anteriores, estados e auditoria.
- `gf-skills`: dados declarativos, limites, presets, compatibilidade e validação dos pacotes.
- `gf-ai`: transporte, ferramentas de leitura, contexto sanitizado, cache e validação do plano retornado.
- `gf-elevated-helper`: operações privilegiadas estritamente necessárias, com IPC autenticado e parâmetros revalidados.
- `apps/web` e `services/api`: aquisição, conta, cobrança, dispositivos, direitos de uso e proxy de IA.

Uma skill não amplia permissões do núcleo. Ações genéricas como `set_registry_value` e `obs_request` continuam restritas a listas permitidas e schemas específicos no Rust.

## 4. Fases, entregas e aceite

### Fase 0 — Fundação e redução de incerteza

Entregas:

1. Organizar a raiz atual como monorepo, sem criar uma pasta `gameforge/` adicional dentro dela.
2. Copiar o SDD para `docs/SDD.md`, preservando o arquivo original; definir a cópia como fonte de trabalho.
3. Criar regras do projeto em `AGENTS.md` e `CLAUDE.md`, plano específico `docs/plans/fase-0.md` e acompanhamento em `docs/progress.md`.
4. Preparar pnpm workspace e Cargo workspace com a árvore da seção 10. Módulos futuros recebem estrutura mínima, sem funcionalidade simulada apresentada como real.
5. Configurar Tauri 2, React/TypeScript estrito, Vite, Tailwind, componentes base, tokens, rotas e i18n pt-BR.
6. Implementar janela, barra lateral, foco por teclado e estados vazio/carregando/erro/offline/sem permissão.
7. Provar o caminho React → Rust → contrato gerado → React com um comando somente de leitura.
8. Configurar lint, formatação, testes básicos e build Windows/macOS no CI; registrar versões e lockfiles.
9. Abrir matriz de viabilidade para diagnóstico, helper, OBS, Discord, GPU, benchmarks e versões mínimas dos sistemas. Preparar acesso às máquinas de teste e às contas de assinatura/distribuição.

Aceite: app abre, todas as rotas navegam, comando IPC tipado funciona e checks de fundação passam em Windows e macOS. Uma tela estrutural vazia não conta como módulo funcional.

### Fase 1 — Diagnóstico real

Entregas:

- `SystemReport` versionado, com origem e disponibilidade de cada métrica.
- Coletores de CPU, memória, GPU, discos, monitores, SO, processos, aplicações e rede.
- Timeouts por coletor, cancelamento e resultados parciais: ausência de sensor vira “indisponível”, nunca zero inventado.
- Regras determinísticas para problemas e nota de saúde, com explicação da pontuação e cobertura da coleta.
- Dashboard com problemas priorizados e indicação do que foi efetivamente medido.
- Fixtures anonimizadas e testes de parsing.

Aceite: diagnóstico em até 15 segundos na matriz de referência, com critérios documentados para rede e sensores opcionais; nenhuma coleta bloqueia indefinidamente. Verificar permissões e desempenho em máquina real.

### Fase 2 — Ações, snapshots e recuperação

Entregas:

- Migrações SQLite, trilha de auditoria e contratos `Plan`, `PlanStep`, `Snapshot` e `ActionResult`.
- Máquina de estados persistida por execução e por item, incluindo falhas de aplicação e de restauração.
- Helper mínimo, catálogo fechado e listas permitidas no núcleo e no helper.
- Seis operações iniciais propostas para Windows: plano de energia, Game Mode, Game DVR, item de inicialização, taxa de atualização e HAGS. As operações via registro continuam dentro de `set_registry_value` com chaves permitidas; nenhuma mudança fica habilitada antes da prova real de reversão.
- Adaptadores equivalentes no Mac onde houver suporte; funcionalidades sem equivalência ficam explicitamente indisponíveis.
- Snapshot durável antes de qualquer escrita e recuperação `gameforge --restore-last` sem interface ou rede.
- Detecção de alterações externas entre revisão e aplicação, e entre aplicação e restauração.

Fluxo obrigatório: pré-condições → diff → snapshot persistido → aplicação sequencial conforme dependências → leitura de verificação → conclusão. Falha crítica dispara compensação em ordem inversa, com registro de qualquer item que não pôde ser restaurado.

Aceite: testes `read → apply → read → revert → read`, falha intermediária, UAC negado, snapshot indisponível, interrupção do processo e reinício. Nenhum lote de sistema prossegue se o Ponto de Restauração exigido falhar. Alteração de vídeo precisa de confirmação e retorno automático validado. Cobertura mínima do SDD para ações e snapshots.

### Fase 3 — Quick Boost offline: primeiro produto utilizável

Entregas:

- `WizardShell`, `ScanTimeline`, `PlanItem`, `ApplyProgress` e resultado.
- Presets locais que passam pelo mesmo validador e executor usado futuramente pela IA.
- Revisão com valor atual/novo, motivo, risco, dependências e necessidade de reiniciar.
- Seleção por item com revalidação de dependências após desmarcar passos.
- Histórico mínimo, restauração total/parcial e resumo do que foi verificado.

Aceite: usuário completa diagnóstico → preset → revisão → aplicação → verificação → desfazer sem internet e sem comandos manuais. Playwright valida o fluxo com núcleo simulado; aplicação e restauração são repetidas com adaptador real em ambiente de teste.

Marco A concluído somente quando a recuperação funcionar após encerramento inesperado do app.

### Fase 4 — Planejamento com Claude

Entregas:

- Interface de planejador que permita preset, Claude direto no beta e proxy no produto público.
- BYOK protegido por configuração de build, com chave no keychain; nenhuma chave embutida.
- Ferramentas de leitura, limite de oito chamadas e até duas correções de plano conforme SDD.
- `submit_plan` validado por catálogo, parâmetros, compatibilidade, risco e skill.
- Sanitização de relatórios, caminhos e retornos de ferramentas; conteúdo de arquivos/logs tratado como dado não confiável.
- Tela com o conteúdo sanitizado realmente enviado em cada chamada, sem expor credenciais de transporte.
- Cache por hardware, SO/driver relevantes, versão de skill/catálogo, objetivo e configuração atual pertinente. Revalidar pré-condições mesmo em cache hit.
- Timeout, cancelamento, limite de custo e fallback offline explícito.

Aceite: 30 cenários gravados produzem planos aceitos ou rejeições/fallbacks corretos; nenhum plano inválido chega ao executor. Testar respostas malformadas, ação desconhecida, prompt injection em logs, indisponibilidade da API e ausência de segredo nos logs.

### Fase 5 — Jogos e benchmark inicial

Entregas:

- Loader de skills e schema, fixtures, versionamento e detecção de lojas por etapas.
- Valorant, CS2 e Fortnite como primeiras três skills, somente após validar caminhos/chaves reais. O YAML do SDD é ilustrativo.
- Leitura e escrita que preservem opções desconhecidas, encoding, estrutura e permissões necessárias.
- Bloqueio com jogo aberto, resolução segura de caminhos e proteção contra links/redirecionamentos para fora do escopo autorizado.
- Integração de benchmark Windows e investigação de uma abordagem viável para métricas de jogos no Mac. Validar a adequação das tecnologias citadas no SDD antes de adotá-las.
- Protocolo antes/depois com cenário, resolução, duração e condições comparáveis; não atribuir ganho causal a uma única execução.

Aceite: otimizar e restaurar cada jogo suportado em máquina real; fixtures demonstram preservação das configurações. Nunca escrever em executáveis, memória ou anti-cheat. FPS e 1% low só aparecem quando realmente medidos.

### Fase 6 — OBS Studio

Entregas:

- Prova de conexão/autenticação e matriz de capacidades por versão do OBS e encoder.
- Validar quais ajustes usam WebSocket e quais exigem arquivo/perfil com OBS fechado ou etapa guiada; não assumir cobertura integral da API.
- Backup e criação de perfil/coleção próprios, sem sobrescrever os existentes.
- Configuração de saída, áudio e cenas conforme suporte real; identificação dos dispositivos de captura.
- Credenciais no keychain e chave de transmissão inserida diretamente pelo usuário, sem passar pelo Claude.
- Teste de 30 segundos, métricas e número limitado de tentativas de ajuste.

Aceite: perfil Twitch 1080p60 no hardware de referência compatível, cenas e áudio funcionando e perda dentro do limite de 1% do SDD. Em hardware/rede incompatível, oferecer alternativa e explicar a limitação. Validar também restauração de perfil ativo, fontes criadas e estado anterior. Testes de streaming real somente com destino de teste explicitamente configurado.

### Fase 7 — Discord

Entregas:

- Verificar por versão quais preferências locais podem ser alteradas e persistem após reabrir o cliente.
- Editar somente chaves comprovadas, com cliente fechado e backup integral.
- Cartões guiados para voz, overlay e demais preferências sem integração suportada.
- Integração de áudio com OBS conforme capacidades disponíveis.
- Bot oficial opcional, com convite e permissões mínimas; modelos de canais, cargos e permissões.
- Inventário dos recursos criados pelo bot, execução idempotente e reversão limitada aos recursos que ele criou e consegue remover com segurança.

Aceite: ajustes locais suportados são restauráveis; servidor de teste recebe modelo sem duplicação em nova tentativa. Preservar recursos preexistentes e registrar ações remotas não revertidas. Etapa guiada é marcada como confirmada pelo usuário, sem alegar verificação automática.

### Fase 8 — Integração completa e acabamento

Entregas:

- Pronto para Live usando os mesmos planos, snapshots e adaptadores, com dependências entre módulos.
- Rede: medições com timeout, upload, comparação de DNS e restauração da configuração anterior, incluindo DHCP quando aplicável.
- Monitor com frequência de coleta e retenção limitadas; histórico completo, perfis e importação/exportação validadas.
- Assistente lateral usando o mesmo motor de planos revisáveis.
- Completar en/es, acessibilidade, redução de movimento e todos os estados de interface.
- Expandir de três para os dez jogos propostos no SDD, condicionado à validação de cada skill. Jogo não testado permanece sem suporte anunciado.
- Consolidar a matriz de compatibilidade de macOS, GPU, áudio, lojas e monitoramento; recursos sem API validada recebem orientação guiada ou indisponibilidade explícita.

Aceite: E2E de Pronto para Live, falha parcial entre módulos e desfazer em ordem inversa; navegação por teclado, contraste AA e orçamento de desempenho verificados. Recursos manuais e limitações ficam identificados no resultado.

Marco B: beta fechado com coleta consentida de problemas e custo de IA. Não distribuir builds BYOK como versão pública comercial.

### Fase 9 — Site, contas e monetização

Entregas:

- Site de vendas, download, preços, login/cadastro, checkout, conta, faturas, dispositivos, ajuda, páginas legais e painel interno.
- Supabase Auth/Postgres, políticas de acesso por usuário e autorização de administrador no servidor.
- Login desktop por navegador com PKCE, `state`, código de uso único, expiração e validação do callback.
- Dispositivos, direitos de uso assinados com Ed25519 e política de expiração/offline.
- Proxy de IA com autenticação, dispositivo ativo, cota, limites de tokens e frequência.
- Reserva e consolidação de cota de forma atômica; agrupar leituras e retries na mesma análise para evitar cobrança duplicada.
- Asaas sandbox via `PaymentProvider`; validar disponibilidade real de cada meio recorrente e da emissão fiscal antes de anunciá-los.
- Webhooks autenticados, idempotência, fila durável, reconciliação e tratamento de eventos fora de ordem.
- Estados trialing/active/past_due/canceled/expired, carência, cancelamento ao fim do período e política de estorno.
- E-mails transacionais e painel com uso, custos, receita e operações administrativas auditadas.
- Preço e cota baseados no custo medido no beta, incluindo taxas, infraestrutura e suporte. Revisão fiscal/jurídica das regras do SDD antes da venda.

Aceite: jornada de compra sandbox → evento confirmado → Pro no app em menos de um minuto nas condições de teste. Testar repetição de webhook, renovação, falha, carência, cancelamento, expiração, remoção de PC, concorrência de cota e indisponibilidade do gateway. A chave Claude permanece no servidor e é ausente dos artefatos públicos.

### Fase 10 — Distribuição e lançamento

Entregas:

- Builds de release, Authenticode, assinatura/notarização macOS e instaladores.
- Updater com canais beta/estável, verificação de assinatura e procedimento de recuperação de release defeituosa.
- Pacotes de skills assinados, manifesto com versão/compatibilidade e retorno à versão anterior.
- Artefatos de download publicados com notas de versão e requisitos reais.
- Matriz manual das seis máquinas do SDD, teste de instalação limpa, atualização e restauração de dados migrados.
- Procedimento de backup do backend, restauração e acompanhamento de erros com privacidade.

Aceite: instalação e atualização assinadas validadas nos sistemas suportados; preservação de snapshots/histórico; nenhum item crítico de recuperação em aberto. Metas de abertura, memória, CPU, instalador e tempo de IA medidas em release com ambiente documentado.

Marco C: v1.0 comercial somente após o aceite técnico e a preparação operacional de cobrança, suporte e distribuição.

## 5. Regras transversais de implementação

1. Cada fase tem plano próprio, entregas verificáveis e evidências em `docs/progress.md`; avançar após cumprir seu aceite.
2. Toda alteração de sistema exige revisão do usuário no produto. As confirmações de risco alto e permissões do sistema fazem parte do fluxo implementado.
3. Snapshot inclui ausência prévia da chave/arquivo, valor/tipo anterior, alvo, hash quando aplicável e versão do adaptador; restaurar não significa simplesmente gravar um JSON antigo por cima de mudanças externas.
4. Mudanças em arquivos usam escrita atômica quando possível; operações no SO e APIs remotas usam compensações. Não tratar um lote heterogêneo como uma transação ACID.
5. Após interrupção, reconciliar o diário com o estado real e oferecer recuperação. Cancelamento durante aplicação para em um limite seguro e preserva o que falta reverter.
6. Execução e restauração impedem dois lotes concorrentes sobre o mesmo alvo. Conflitos com alterações externas são mostrados antes de sobrescrever.
7. Logs e exportações são sanitizados; segredos ficam no cofre do SO. Comandos privilegiados revalidam ação, origem da chamada e parâmetros.
8. Não prometer ganho de FPS, temperatura disponível, segurança absoluta contra anti-cheat ou restauração universal sem evidência. A meta de 100% de reversão do SDD refere-se à matriz de testes do catálogo.
9. Migrations e versões de snapshots devem permitir restaurar alterações feitas por versões anteriores do app.
10. Metas de desempenho são critérios de medição; qualquer exceção exige registro e ajuste explícito de escopo, não valores simulados na UI.

## 6. Verificação por camada

| Camada | Evidência necessária |
| --- | --- |
| Contratos e skills | Schema, tipos gerados, fixtures e rejeição de entradas fora do catálogo |
| Executor e snapshots | Reversão, injeção de falhas, interrupção, retomada e conflitos |
| Adaptadores reais | Provas em máquina/VM apropriada e hardware real para GPU, vídeo, sensores e jogos |
| IA | 30 cenários gravados, ferramentas limitadas, sanitização e fallback; testes ao vivo opcionais e controlados |
| Interface | Testes dos fluxos de revisão, aplicação, erro e recuperação; Playwright com IPC simulado |
| Integrações | OBS/Discord em ambientes de teste, permissões negadas, timeout e repetição |
| Servidor | Isolamento de contas, webhooks repetidos/fora de ordem, cotas concorrentes e dispositivos |
| Release | Instalador, assinatura, atualização, migrações, restauração e matriz multiplataforma |

## 7. Dependências e planejamento de capacidade

Caminho principal: fundação → diagnóstico → ações/recuperação → Quick Boost → IA → jogos → OBS → Discord → integração → monetização → distribuição.

Dependências externas a providenciar cedo:

- Windows de teste e acesso a Macs Intel/Apple Silicon, além de hardware NVIDIA, AMD e Intel integrada.
- Jogos e configurações reais para fixtures anonimizadas.
- OBS e servidor Discord próprios para testes controlados.
- Conta de API Claude para beta, com teto de gasto.
- Repositório remoto/CI e credenciais de assinatura de release.
- Contas de hospedagem, Supabase, gateway sandbox, e-mail e armazenamento de distribuição.
- Dados comerciais, preço, suporte e revisão fiscal/jurídica antes da operação pública.

Esforço relativo: fases 0, 3 e 4 são médias; fases 1, 2, 5, 6, 7, 8, 9 e 10 são grandes. As maiores incertezas estão em recuperação real, diferenças Windows/macOS, métricas de jogos, capacidade das integrações e cobrança.

Não fixar data comercial somente pelo número de telas. Estimar calendário após a fase 0 e recalibrar após o MVP, com base na capacidade da equipe, disponibilidade da matriz de testes e resultados das provas técnicas.

## 8. Primeiro ciclo de execução

Backlog inicial, em ordem:

- [ ] Organizar `docs/SDD.md`, regras do projeto e `docs/progress.md`.
- [ ] Registrar os ADRs de contratos, permissões, recuperação e implantação do backend.
- [ ] Escrever `docs/plans/fase-0.md` com tarefas e comandos de validação.
- [ ] Confirmar toolchain Rust, Node/pnpm, compilação nativa Windows e acesso ao ambiente Mac.
- [ ] Criar os workspaces e o aplicativo Tauri mínimo.
- [ ] Configurar a geração dos tipos e um comando Rust somente de leitura.
- [ ] Implementar layout, rotas, tema, estados vazios e estrutura de tradução.
- [ ] Configurar CI e registrar evidências de execução nos dois sistemas.

Primeira demonstração: abrir o aplicativo, navegar pelas telas e consultar um dado real do núcleo pelo IPC tipado. A primeira otimização real acontece somente depois de snapshots e recuperação estarem validados nas fases 2 e 3.

Este documento é o plano de construção. Nenhuma implementação do aplicativo ou alteração do sistema foi realizada nesta etapa.
