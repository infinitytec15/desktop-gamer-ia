# SDD — GameForge AI: Otimizador de PC, OBS, Discord e Jogos com Claude

Nov 17, 2026 · @Gilberto jr

## 1. Visão geral

O GameForge AI é um app desktop (Windows 10/11 x64 e macOS 13+) que diagnostica o computador e aplica configurações completas de sistema, jogos, OBS Studio e Discord por meio de assistentes passo a passo com botões. A inteligência vem da API do Claude: ela lê o diagnóstico e um roteiro (skill) e devolve um plano estruturado, que o app executa com ferramentas locais seguras e reversíveis.

O usuário nunca precisa digitar comandos. Ele clica em "Otimizar", escolhe o objetivo (por exemplo, "Jogar Valorant com stream na Twitch"), revisa o plano e aplica. Tudo tem backup e um botão "Desfazer".

### 1.1 Objetivos

1. Configuração completa em menos de 10 minutos por cenário (jogo + OBS + Discord + sistema).
2. Zero comandos manuais: 100% das ações disparadas por botões na interface.
3. Toda alteração é reversível: snapshot antes de aplicar e restauração em 1 clique.
4. Planos personalizados ao hardware real, não presets genéricos.
5. Interface moderna, escura por padrão, animada e com feedback em tempo real.

### 1.2 Escopo (v1.0)

- Diagnóstico de hardware, software, drivers, temperatura e rede.
- Otimização do sistema operacional (energia, processos de inicialização, serviços, Game Mode, GPU scheduling, limpeza).
- Otimização por jogo via skills (arquivos de configuração do jogo + painel da GPU).
- Configuração completa do OBS Studio via obs-websocket v5: perfis, cenas, fontes, encoder, áudio, filtros.
- Configuração do Discord: ajustes do cliente, voz, overlay, aceleração de hardware e, opcionalmente, montagem de servidor via bot.
- Otimização de rede (DNS, teste de latência, QoS básico).
- Perfis salvos, histórico, backup e restauração.
- Assistente em chat como modo avançado (opcional).

### 1.3 Fora do escopo (v1.0)

- Overclock de CPU/GPU e alterações de BIOS/UEFI.
- Remoção de componentes do Windows (debloat agressivo), edição de anti-cheat ou modificação de arquivos protegidos de jogos.
- Automação de conta pessoal do Discord (self-bot), proibida pelos termos do Discord.
- Linux (planejado para v2).
- Controle por "computer use" (cliques na tela) como mecanismo principal: só como fallback experimental.

## 2. Personas e casos de uso

Três perfis de usuário guiam as decisões de interface: o jogador casual quer um botão, o streamer quer OBS e Discord prontos, e o entusiasta quer ver e ajustar cada detalhe.

| Persona | Quem é | O que quer | Modo da interface |
| --- | --- | --- | --- |
| Jogador casual | 14–35 anos, PC médio, pouco conhecimento técnico | "Mais FPS sem travar" com um clique | Assistente simples (Quick Boost) |
| Streamer iniciante | Começando na Twitch, YouTube ou Kick | OBS configurado, cenas prontas, áudio limpo, Discord sem eco | Assistente de Streaming |
| Entusiasta | Conhece hardware, quer controle | Ver cada mudança, editar o plano, comparar benchmarks | Modo Avançado + chat com IA |

### 2.1 Casos de uso principais

1. **UC-01 Quick Boost:** otimizar o sistema inteiro com um clique, com revisão do plano.
2. **UC-02 Otimizar jogo:** escolher um jogo detectado, escolher a meta (máximo FPS, equilíbrio, qualidade, bateria) e aplicar.
3. **UC-03 Configurar stream:** escolher plataforma (Twitch, YouTube, Kick), qualidade desejada e jogo; o app configura o OBS completo.
4. **UC-04 Configurar gravação:** perfil de gravação local (replay buffer, qualidade alta, faixas de áudio separadas).
5. **UC-05 Configurar Discord:** voz otimizada, supressão de ruído, overlay, aceleração de hardware e integração com o OBS.
6. **UC-06 Criar servidor Discord:** montar canais, cargos e permissões de um servidor de comunidade a partir de um modelo, via bot autorizado pelo usuário.
7. **UC-07 Setup completo:** combinar UC-02 + UC-03 + UC-05 + sistema em um único assistente "Pronto para Live".
8. **UC-08 Desfazer:** restaurar qualquer snapshot anterior, total ou por item.
9. **UC-09 Diagnóstico de problema:** "meu jogo está travando" → a IA analisa logs e métricas e propõe correções.
10. **UC-10 Benchmark antes/depois:** medir FPS médio, 1% low e latência antes e depois de aplicar.

## 3. Arquitetura e stack

O app usa Tauri 2: interface em React/TypeScript e um núcleo em Rust que é o único componente com acesso ao sistema, à API do Claude e aos segredos. A IA nunca executa comandos livres: ela devolve um plano com ações de um catálogo fechado e tipado, que o núcleo valida e executa.

&#91;embedded content: arquitetura · interface, núcleo, IA e adaptadores\]

A interface só conversa com o núcleo; o núcleo consulta o Claude, valida o plano e só então aciona os adaptadores.

### 3.1 Princípios

1. **IA planeja, o núcleo executa.** O Claude só escolhe ações do catálogo (seção 5.3) com parâmetros validados por schema.
2. **Snapshot antes de tudo.** Nenhuma ação roda sem o valor anterior salvo.
3. **Adaptadores isolados.** Cada alvo (Windows, macOS, OBS, Discord, jogo, GPU) é um módulo com a mesma interface `read / plan_diff / apply / revert`.
4. **Offline primeiro.** Diagnóstico, presets e restauração funcionam sem internet; só o planejamento com IA exige rede.
5. **Skills como dados.** Suporte a um jogo novo = um novo arquivo de skill, sem recompilar o app.

### 3.2 Stack tecnológica

| Camada | Tecnologia | Motivo |
| --- | --- | --- |
| Shell desktop | Tauri 2 | Instalador de 8–15 MB, baixo uso de RAM, Rust nativo |
| Interface | React 19 + TypeScript + Vite | Ecossistema maduro, tipagem forte |
| Estilo | Tailwind CSS v4 + shadcn/ui + Radix | Componentes acessíveis e customizáveis |
| Animação | Motion (Framer Motion) + Lottie | Transições de passo, microinterações |
| Gráficos | Recharts (ou visx) | Telemetria em tempo real e antes/depois |
| Estado | Zustand + TanStack Query | Estado de UI e cache de chamadas ao núcleo |
| Formulários | React Hook Form + Zod | Validação igual à do núcleo |
| Núcleo | Rust (tokio, serde, thiserror) | Segurança de memória, acesso nativo |
| Telemetria do sistema | sysinfo, nvml-wrapper (NVIDIA), AMD ADLX via FFI, IOKit (macOS) | CPU, GPU, RAM, temperaturas |
| Windows | windows-rs (registro, power plans, serviços) + scripts PowerShell assinados | APIs oficiais primeiro, script só quando necessário |
| macOS | pmset, defaults, launchctl via comandos permitidos | Ajustes nativos sem kext |
| OBS | obs-websocket v5 (porta 4455) via crate `obws` | Controle completo de perfis, cenas e fontes |
| Discord | Arquivo settings.json do cliente + Discord REST API (bot) | Ajustes locais seguros e montagem de servidor |
| IA | Claude API (Messages + tool use) via `reqwest` | Planejamento estruturado com ferramentas |
| Banco local | SQLite (`sqlx`) | Perfis, snapshots, histórico, cache |
| Segredos | Keychain do sistema (crate `keyring`) | Chave da API e token do bot nunca em texto puro |
| Atualização | Tauri updater + assinatura | Atualiza app e pacotes de skills |
| Testes | Vitest, Playwright, cargo test, insta | Unidade, E2E e snapshots |

### 3.3 Modos de acesso à IA

- **BYOK (traga sua chave):** só em builds de desenvolvimento e beta. O usuário cola a chave da API do Claude, que vai para o keychain, e as chamadas saem direto do núcleo.
- **GameForge Cloud (padrão na versão pública):** a API de contas da empresa guarda a chave do Claude e confere login, plano e cota de cada usuário antes de cada chamada (seção 14). O app fala com o proxy pelo mesmo contrato.

Modelos configuráveis em `config/models.toml`: um modelo forte (família Sonnet ou Opus) para gerar planos e um rápido (família Haiku) para classificar problemas e resumir logs.

## 4. Módulos funcionais

São dez módulos, cada um com tela própria e adaptador no núcleo. Todos seguem o mesmo ciclo: **Ler → Analisar (IA) → Revisar → Aplicar → Verificar → Desfazer se preciso**.

### 4.1 M01 Diagnóstico

Coleta em até 15 segundos um retrato completo da máquina e gera o `SystemReport` (JSON) que alimenta todos os outros módulos.

- Hardware: CPU (modelo, núcleos, clock, temperatura), GPU (modelo, VRAM, driver, temperatura), RAM (total, velocidade, XMP/EXPO detectado), discos (tipo SSD/HDD/NVMe, espaço livre, saúde SMART), monitores (resolução, taxa de atualização atual vs máxima, VRR).
- Software: versão do SO, plano de energia, Game Mode, HAGS, apps de inicialização, processos pesados em segundo plano, antivírus, overlays ativos.
- Apps detectados: jogos (Steam, Epic, Riot, Battle.net, EA, Ubisoft, Xbox), OBS e versão, Discord e variante (Stable, PTB, Canary).
- Rede: tipo de conexão, DNS atual, latência, perda de pacotes, upload disponível para stream.
- Saída: nota de saúde 0–100 por área e lista de problemas com severidade (crítico, atenção, dica).

Exemplo de problema típico detectado: monitor de 144 Hz rodando a 60 Hz; driver de GPU com mais de 6 meses; 12 apps na inicialização.

### 4.2 M02 Otimização do sistema

Ajustes seguros e reversíveis, agrupados em níveis (Seguro, Recomendado, Avançado). Nada do nível Avançado é aplicado sem confirmação explícita item a item.

| Ajuste | Windows | macOS | Nível |
| --- | --- | --- | --- |
| Plano de energia | Alto desempenho ou Desempenho máximo | Desativar Modo de Pouca Energia (pmset) | Seguro |
| Modo de Jogo | Ativar Game Mode | Confirmar Game Mode automático (macOS 14+) | Seguro |
| Taxa de atualização | Ajustar monitor para a taxa máxima suportada | Ajustar ProMotion ou taxa externa | Seguro |
| Gravação em segundo plano | Desativar Game DVR do Xbox Game Bar | — | Seguro |
| Aceleração do mouse | Desativar "Aprimorar precisão do ponteiro" | Ajustar curva de aceleração (defaults) | Recomendado |
| Agendamento de GPU | Ativar HAGS (exige reinício) | — | Recomendado |
| Otimizações de janela | Ativar "Otimizações para jogos em janela" (Win 11) | — | Recomendado |
| Apps de inicialização | Desativar os escolhidos pelo usuário | Remover itens de login escolhidos | Recomendado |
| Limpeza | Temp, cache de shaders antigo, lixeira (com tamanho mostrado) | Caches do usuário | Recomendado |
| Efeitos visuais | Reduzir animações e transparência | Reduzir movimento e transparência | Avançado |
| Serviços | Apenas lista curada (ex.: SysMain em HDD) | — | Avançado |
| Integridade de memória (VBS) | Só explicação e link: nunca desativa sozinho | — | Somente informativo |

Antes de mudanças de sistema no Windows, o app cria um Ponto de Restauração além do snapshot interno.

### 4.3 M03 Otimização de jogos

Cada jogo suportado tem uma skill (seção 5.2) que diz onde fica o arquivo de configuração, quais chaves existem, faixas válidas e recomendações por meta.

- **Detecção:** lê `libraryfolders.vdf` (Steam), manifestos do Epic, Riot Client, Battle.net, EA app e Xbox app.
- **Metas:** Máximo FPS (competitivo), Equilíbrio, Qualidade visual, Stream + jogo (reserva de GPU para o encoder), Bateria (notebook).
- **Escopo de alteração:** somente arquivos de configuração do usuário que o próprio jogo expõe (por exemplo, `GameUserSettings.ini`, `video.txt`, `options.txt`), opções de inicialização da loja e perfil do jogo no painel da GPU.
- **Proteções:** não altera com o jogo aberto; nunca toca executáveis, memória ou arquivos do anti-cheat; marca o arquivo como somente leitura apenas se a skill permitir e o usuário aceitar.
- **Painel da GPU:** NVIDIA (modo de baixa latência, gerenciamento de energia, V-Sync por app) e AMD (Anti-Lag, Chill), via APIs oficiais quando disponíveis; caso contrário, cartão guiado.

Catálogo inicial (v1.0): Valorant, CS2, Fortnite, League of Legends, Apex Legends, Minecraft (Java), GTA V, Warzone, Rocket League, Roblox. Mais jogos entram como pacotes de skills atualizáveis.

### 4.4 M04 OBS Studio

Configuração completa via obs-websocket v5, que já vem embutido no OBS 28 ou superior.

1. **Conexão:** detecta o OBS; se o WebSocket estiver desligado, o app (com o OBS fechado) grava `plugin_config/obs-websocket/config.json` com servidor ativo e senha gerada, guardada no keychain.
2. **Perfil:** cria o perfil "GameForge – \<plataforma> \<resolução>" sem apagar os existentes.
3. **Vídeo:** resolução base e de saída, FPS, filtro de redimensionamento.
4. **Saída:** escolha do encoder por hardware (NVENC na NVIDIA, AMF na AMD, QuickSync na Intel, VideoToolbox no Mac; x264 só como último recurso), controle de taxa CBR, bitrate pelo upload medido e pelos limites da plataforma, intervalo de keyframe de 2 s, preset por potência da GPU.
5. **Transmissão:** serviço (Twitch, YouTube, Kick, personalizado) e servidor mais próximo; a chave de transmissão é digitada pelo usuário e nunca enviada à IA.
6. **Gravação:** formato MKV com remux automático para MP4, qualidade alta, Replay Buffer com atalho.
7. **Áudio:** faixas separadas (1 tudo, 2 jogo, 3 microfone, 4 Discord, 5 música) com captura de áudio por aplicativo; filtros no microfone: supressão de ruído (RNNoise), noise gate, compressor e limitador.
8. **Coleção de cenas:** "Começando", "Jogo", "Conversa", "Pausa" e "Encerrando", com captura de jogo, webcam (se houver), alertas por URL (navegador) e chat.
9. **Verificação:** teste de 30 s com leitura de quadros perdidos por codificação e por rede; o app ajusta e repete se passar de 1%.

### 4.5 M05 Discord

O Discord guarda poucas preferências em arquivo local; o restante fica no app ou na conta. Por isso o módulo tem três camadas.

- **Camada automática (arquivo local):** com o Discord fechado, edita `settings.json` (aceleração de hardware, iniciar com o sistema, minimizar para a bandeja) e remove o Discord da inicialização se o usuário quiser.
- **Camada guiada (dentro do app):** cartões passo a passo com imagens para voz (dispositivo de entrada, sensibilidade automática, supressão de ruído, cancelamento de eco, QoS), overlay no jogo, Modo Streamer e ajustes de vídeo. O app abre a tela certa e confirma cada passo com o usuário.
- **Camada experimental:** fallback com controle de tela (computer use) para executar os passos guiados, sempre com permissão explícita.
- **Integração com OBS:** cria a fonte de captura de áudio do Discord na faixa 4 e o widget de voz (Streamkit) como fonte de navegador.
- **Montagem de servidor (UC-06):** o usuário adiciona o bot GameForge ao próprio servidor via convite OAuth2 (permissões Gerenciar Canais e Gerenciar Cargos). O app aplica um modelo: categorias, canais de texto e voz, cargos, permissões, canal de regras, mensagem de boas-vindas e regras de AutoMod. Alternativa sem bot: gerar um link de Modelo de Servidor do Discord.
- **Proibido:** automatizar a conta pessoal do usuário (self-bot) ou ler mensagens privadas.

### 4.6 M06 Rede

- Teste de latência, jitter e perda para servidores de jogo da região.
- Teste de upload sustentado para definir o bitrate do OBS.
- Comparação de DNS (atual, Cloudflare, Google, Quad9) e troca em 1 clique, com restauração.
- Avisos de bufferbloat e de Wi-Fi fraco, com recomendações em linguagem simples.

### 4.7 M07 Perfis, snapshots e restauração

- Snapshot automático antes de cada aplicação, com lista de todas as chaves alteradas e valores antigos.
- Restauração total ou item a item; linha do tempo visual do histórico.
- Perfis nomeados ("Competitivo", "Live", "Silencioso") que trocam várias configurações de uma vez.
- Exportar e importar perfis em arquivo `.gfprofile` (JSON assinado) para compartilhar com amigos.

### 4.8 M08 Benchmark e monitor

- Monitor em tempo real: uso e temperatura de CPU/GPU, RAM, VRAM, rede.
- Benchmark antes/depois com PresentMon (Windows) para FPS médio, 1% low e tempo de quadro; no macOS, MetricKit e métricas do sistema.
- Relatório comparativo com gráfico e ganho percentual.

### 4.9 M09 Assistente com IA (modo avançado)

Chat lateral onde o usuário descreve o problema em linguagem natural. A IA usa as mesmas ferramentas do catálogo e sempre devolve um plano para revisão, nunca executa direto.

### 4.10 M10 Configurações do app

Idioma (pt-BR, en, es), tema, conta e plano (entrar, sair, ver cota de IA, abrir a gestão da assinatura no site), modelos, nível de risco permitido, atualizações de skills, exportação de logs e privacidade.

## 5. Motor de IA

O motor combina três entradas (diagnóstico, skill e objetivo do usuário) e devolve um `Plan` validado por schema. O Claude é chamado com tool use; ele pode pedir leituras extras (por exemplo, ler o arquivo de configuração atual do jogo), mas a única saída aceita é a ferramenta `submit_plan`.

### 5.1 Ciclo do agente

1. O núcleo monta o contexto: `SystemReport` resumido, skill do alvo, objetivo e restrições do usuário (nível de risco, metas).
2. Chamada à API com o prompt de sistema, as ferramentas de leitura (`read_config`, `read_obs_state`, `measure_network`, `list_processes`) e `submit_plan`.
3. O Claude pode chamar ferramentas de leitura no máximo 8 vezes; o núcleo executa e devolve os resultados.
4. O Claude chama `submit_plan`. O núcleo valida: schema, ações do catálogo, faixas da skill, nível de risco.
5. Plano inválido volta para o Claude com o erro (até 2 tentativas); se falhar, o app usa o preset offline da skill.
6. A interface mostra o plano em linguagem simples, com o motivo de cada ação e o impacto esperado.
7. Após aplicar, o núcleo roda as verificações da skill e envia o resultado ao Claude para um resumo final de 3 a 5 frases.

Controle de custo: prompt caching no prompt de sistema e nas skills, `SystemReport` compactado (abaixo de 4 mil tokens), limite de tokens por plano e cache local de planos por hash de hardware + skill + objetivo.

### 5.2 Formato de skill (roteiro)

Cada skill é uma pasta em `skills/<categoria>/<id>/` com `SKILL.md` (instruções para a IA, em linguagem natural) e `skill.yaml` (dados estruturados validados pelo núcleo).

```yaml
id: game.valorant
version: 1.3.0
kind: game
platforms: [windows]
detect:
  riot_product: valorant
requires_closed: [VALORANT-Win64-Shipping.exe, RiotClientServices.exe]
config_files:
  - id: user_settings
    path: "%LOCALAPPDATA%/VALORANT/Saved/Config/{account}/Windows/GameUserSettings.ini"
    format: ini
settings:
  - key: user_settings:/Script/ShooterGame.ShooterGameUserSettings/FrameRateLimit
    type: float
    range: [0, 1000]
  - key: user_settings:ScalabilityGroups/sg.TextureQuality
    type: int
    range: [0, 3]
goals: [max_fps, balanced, quality, stream_and_play]
presets:
  max_fps: { FrameRateLimit: 0, sg.TextureQuality: 0 }
verify:
  - kind: file_contains
    file: user_settings
    key: sg.TextureQuality
risk: low
```

Os caminhos e chaves acima são ilustrativos: cada skill real é escrita e testada contra o jogo instalado. O `SKILL.md` explica à IA o que cada opção faz, quais trocas envolve (FPS vs nitidez) e regras como "em stream + jogo, limite o FPS a 1,5 vez a taxa do monitor para sobrar GPU ao encoder".

Categorias de skills: `system/` (Windows, macOS), `games/`, `obs/` (plataformas, cenas, áudio), `discord/` (cliente, modelos de servidor), `network/`, `scenarios/` (combinações como "Pronto para Live").

### 5.3 Catálogo de ações

A IA só pode usar estas ações. Cada uma tem schema Zod/serde, nível de risco e implementação de `revert`.

| Ação | Parâmetros principais | Plataforma | Risco |
| --- | --- | --- | --- |
| `set_power_plan` | plan | Win, Mac | Baixo |
| `set_registry_value` | chave da lista permitida, valor | Win | Médio |
| `set_macos_default` | domínio e chave da lista permitida, valor | Mac | Médio |
| `toggle_startup_item` | id, enabled | Win, Mac | Baixo |
| `set_display_refresh` | monitor, hz | Win, Mac | Baixo |
| `clean_paths` | grupos pré-definidos (temp, shader\_cache) | Win, Mac | Baixo |
| `set_game_config` | skill\_id, chave, valor | Win, Mac | Baixo |
| `set_launch_options` | loja, jogo, opções da lista da skill | Win, Mac | Baixo |
| `set_gpu_profile` | app, configuração, valor | Win | Médio |
| `obs_request` | requisição obs-websocket da lista permitida, dados | Win, Mac | Baixo |
| `obs_apply_template` | template de cenas/áudio | Win, Mac | Baixo |
| `discord_set_client_setting` | chave da lista permitida, valor | Win, Mac | Baixo |
| `discord_apply_server_template` | guild\_id, template | Web API | Médio |
| `set_dns` | adaptador, servidores | Win, Mac | Médio |
| `create_restore_point` | descrição | Win | Baixo |
| `guided_step` | cartão com texto, imagem, deep link | Todas | Nenhum |

Não existe ação de "rodar comando" livre. Novos tipos de ação exigem código no núcleo, revisão e testes.

### 5.4 Contrato do plano

```json
{
  "plan_id": "uuid",
  "target": "game.valorant",
  "goal": "stream_and_play",
  "summary": "Prioriza FPS estável e reserva GPU para o NVENC.",
  "requires_restart": false,
  "steps": [
    {
      "id": "s1",
      "action": "set_game_config",
      "params": { "skill_id": "game.valorant", "key": "sg.TextureQuality", "value": 1 },
      "reason": "Reduz uso de VRAM para 6 GB, perto do limite da sua GPU.",
      "impact": { "fps": "+5 a 10%", "visual": "leve" },
      "risk": "low"
    }
  ],
  "warnings": ["Feche o Valorant antes de aplicar."]
}
```

### 5.5 Prompt de sistema (resumo)

- Você é o planejador do GameForge. Use somente as ações do catálogo e as faixas da skill.
- Explique cada passo em português simples, com o ganho esperado e a troca envolvida.
- Nunca proponha desativar segurança (antivírus, VBS, firewall), alterar anti-cheat ou mexer em arquivos fora da skill.
- Se faltar informação, chame uma ferramenta de leitura; se ainda faltar, use o preset da skill e diga isso.
- Dados sensíveis (chave de stream, tokens, nomes de conta) chegam mascarados e nunca devem ser repetidos.

## 6. Fluxos de interface

Toda tarefa acontece num assistente (wizard) de 4 a 6 passos com barra de progresso, botão Voltar sempre disponível e nenhum campo de texto obrigatório além de chaves e senhas.

### 6.1 Mapa de telas

| Tela | Rota | Conteúdo principal |
| --- | --- | --- |
| Boas-vindas | `/onboarding` | Idioma, escolha do acesso à IA (chave ou conta), permissões, primeiro diagnóstico |
| Início | `/` | Nota de saúde geral (anel animado), cartões por área, problemas encontrados, atalhos para assistentes |
| Quick Boost | `/boost` | Assistente de otimização do sistema em 1 clique |
| Jogos | `/games` | Grade de capas dos jogos detectados, status "otimizado" e meta atual |
| Jogo | `/games/:id` | Assistente de otimização do jogo, antes/depois, benchmark |
| Streaming | `/obs` | Status do OBS, assistente de stream e de gravação, prévia de cenas |
| Discord | `/discord` | Ajustes do cliente, voz guiada, montagem de servidor |
| Pronto para Live | `/live` | Assistente combinado: jogo + OBS + Discord + sistema |
| Rede | `/network` | Testes, DNS, recomendações |
| Monitor | `/monitor` | Gráficos em tempo real e benchmarks |
| Histórico | `/history` | Linha do tempo de snapshots, restaurar |
| Assistente IA | painel lateral | Chat com planos revisáveis |
| Configurações | `/settings` | Conta, modelos, risco, idioma, tema, skills |

### 6.2 Padrão de assistente

1. **Escolher:** cartões grandes clicáveis (ex.: qual jogo, qual meta, qual plataforma).
2. **Analisar:** animação de varredura com etapas aparecendo em tempo real ("Lendo GPU…", "Lendo configuração do jogo…", "Consultando a IA…").
3. **Revisar plano:** lista de mudanças com chave liga/desliga por item, selo de risco, motivo e impacto esperado; diff "atual → novo".
4. **Aplicar:** progresso por item com ícones de estado (pendente, aplicando, ok, falhou, revertido).
5. **Verificar:** checagens automáticas e benchmark opcional.
6. **Resultado:** resumo da IA, ganho medido, botões "Desfazer tudo", "Salvar como perfil" e "Próximo passo sugerido".

### 6.3 Assistente "Pronto para Live" (exemplo completo)

1. Escolha o jogo (grade de capas).
2. Escolha a plataforma e a qualidade (Twitch 1080p60, YouTube 1440p60, Kick 1080p60 ou "decidir por mim").
3. Tem webcam? Microfone? Usa Discord na live? (três chaves sim/não, já pré-marcadas pelo diagnóstico).
4. Análise: diagnóstico + teste de upload + leitura do OBS e do jogo.
5. Revisão do plano em abas: Sistema, Jogo, OBS, Discord.
6. Aplicar, abrir o OBS no perfil novo e rodar o teste de 30 s.
7. Resultado com checklist final ("Cole sua chave de transmissão", "Teste o microfone") e botão "Iniciar live".

### 6.4 Estados obrigatórios por tela

Carregando (skeleton), vazio (ex.: OBS não instalado, com botão de download oficial), erro (mensagem simples + "Tentar de novo" + "Ver detalhes"), sem internet (modo preset offline) e sem permissão (explicação + botão para conceder).

## 7. Design system e front-end

O visual segue a linha "cockpit gamer premium": fundo escuro profundo, vidro fosco (glassmorphism discreto), um acento neon por módulo e muito movimento sutil. Tema claro existe, mas o escuro é o padrão.

### 7.1 Tokens

| Token | Escuro | Claro | Uso |
| --- | --- | --- | --- |
| `bg.base` | #0B0D12 | #F7F8FA | Fundo da janela |
| `bg.surface` | #12151C | #FFFFFF | Cartões |
| `bg.glass` | rgba(255,255,255,0.04) + blur 16 px | rgba(255,255,255,0.7) + blur 16 px | Painéis flutuantes |
| `border.subtle` | rgba(255,255,255,0.08) | rgba(0,0,0,0.08) | Bordas |
| `text.primary` | #F2F4F8 | #0B0D12 | Texto principal |
| `text.muted` | #8A93A6 | #5B6475 | Texto secundário |
| `accent.system` | #7C5CFF (violeta) | #6A4BFF | Sistema e Quick Boost |
| `accent.games` | #00E5A0 (verde neon) | #00B37E | Jogos |
| `accent.obs` | #FF4D6D (vermelho live) | #E63956 | Streaming |
| `accent.discord` | #5865F2 (azul) | #4752C4 | Discord |
| `accent.network` | #22D3EE (ciano) | #0891B2 | Rede |
| `state.success / warning / danger` | #22C55E / #F59E0B / #EF4444 | iguais | Estados |

Tipografia: Inter (texto) e JetBrains Mono (valores, diffs), escala 12/14/16/20/24/32/48. Raio: 8 px (controles), 16 px (cartões), 24 px (modais). Espaçamento em múltiplos de 4 px.

### 7.2 Layout

- Janela sem moldura nativa (Tauri `decorations: false`) com barra de título própria e botões de janela.
- Barra lateral recolhível de 72/240 px com ícones (Lucide) e o acento do módulo ativo.
- Área central com largura máxima de 1280 px; painel do Assistente IA desliza pela direita (400 px).
- Tamanho mínimo da janela: 1100 × 700 px; layout responsivo até 2560 px.

### 7.3 Componentes principais

- **HealthRing:** anel de progresso animado com a nota 0–100 e cor por faixa.
- **ModuleCard:** cartão de vidro com ícone, status, métrica principal e botão de ação; brilho do acento ao passar o mouse.
- **WizardShell:** stepper horizontal, transição deslizante entre passos, rodapé fixo com Voltar/Continuar.
- **ChoiceTile:** cartão grande selecionável (capa do jogo, logo da plataforma) com marcação animada.
- **ScanTimeline:** lista de etapas da análise aparecendo uma a uma com spinner e check.
- **PlanItem:** linha do plano com chave liga/desliga, selo de risco, diff atual → novo, motivo expansível.
- **ApplyProgress:** barra geral + estado por item, com log técnico recolhível.
- **BeforeAfterChart:** barras comparando FPS médio e 1% low.
- **LiveGraph:** gráfico de linha de 60 s para CPU, GPU, temperatura e rede.
- **GuidedStepCard:** passo guiado com imagem, texto curto, botão "Abrir no Discord" e "Feito".
- **AIChatPanel:** chat com mensagens em streaming e planos embutidos como cartões revisáveis.
- **Toast, Dialog de confirmação, Tooltip** (shadcn/ui).

### 7.4 Movimento e microinterações

- Transições de rota: fade + deslocamento de 8 px, 200 ms, easing `easeOut`.
- Passos do assistente: deslize horizontal de 24 px, 250 ms.
- Números (FPS, nota) contam até o valor final em 600 ms.
- Confete discreto ou pulso de brilho ao concluir um assistente.
- Respeitar "reduzir movimento" do sistema: animações viram fades simples.

### 7.5 Acessibilidade e idioma

- Contraste mínimo AA (4,5:1) em texto; foco visível em todos os controles; navegação total por teclado.
- i18n com `i18next`: pt-BR padrão, en e es na v1.0; nenhum texto fixo no código.
- Linguagem simples: sem jargão na primeira linha, detalhe técnico só em "Ver detalhes".

## 8. Modelo de dados

Tudo fica num SQLite local em `%APPDATA%/GameForge/gameforge.db` (Windows) ou `~/Library/Application Support/GameForge/gameforge.db` (macOS), com migrações versionadas pelo `sqlx`.

| Tabela | Campos principais | Descrição |
| --- | --- | --- |
| `system_reports` | id, created\_at, hardware\_hash, report\_json, health\_score | Cada diagnóstico executado |
| `plans` | id, created\_at, target, goal, model, plan\_json, status (draft, applied, discarded) | Planos gerados pela IA ou por preset |
| `snapshots` | id, plan\_id, created\_at, label, restore\_point\_id | Um snapshot por aplicação |
| `snapshot_items` | id, snapshot\_id, action, target\_key, old\_value, new\_value, status | Cada alteração com valor anterior para reverter |
| `profiles` | id, name, icon, items\_json, created\_at | Perfis nomeados (Competitivo, Live…) |
| `benchmarks` | id, game\_id, snapshot\_id, avg\_fps, p1\_low, frametime\_ms, created\_at | Medições antes/depois |
| `games` | id, store, name, install\_path, skill\_id, last\_optimized\_at | Jogos detectados |
| `skills` | id, version, source (bundled, remote), sha256, enabled | Skills instaladas |
| `chat_sessions` / `chat_messages` | id, role, content, plan\_id | Histórico do assistente |
| `settings` | key, value | Preferências do app (sem segredos) |
| `audit_log` | id, ts, actor (user, ai, system), event, data | Trilha de auditoria de tudo que mudou |

Segredos (chave da API, senha do obs-websocket, token do bot) ficam só no keychain do sistema, referenciados por nome. Os tipos Rust são a fonte da verdade; os tipos TypeScript são gerados com `ts-rs` ou `specta` para os dois lados nunca divergirem.

## 9. Segurança, permissões e reversibilidade

Um app que altera o sistema por sugestão de IA precisa de travas fortes. A regra central: a IA propõe, o usuário aprova e o núcleo só executa ações conhecidas, validadas e reversíveis.

### 9.1 Execução

- **Listas permitidas:** chaves de registro, domínios `defaults`, requisições do obs-websocket e chaves do Discord ficam em listas fixas no código. Qualquer valor fora delas é rejeitado.
- **Sem shell livre:** scripts PowerShell são embutidos, assinados e chamados por nome com parâmetros tipados; nunca se concatena texto vindo da IA em comandos.
- **Elevação mínima:** o app roda sem privilégios. Um helper elevado separado (serviço Windows ou helper privilegiado no macOS via SMAppService) executa só as ações marcadas `requires_admin`, com pedido UAC/senha a cada lote.
- **Tauri capabilities:** a interface só acessa comandos expostos explicitamente; sem acesso direto a arquivos ou shell pelo front.

### 9.2 Reversibilidade

- Snapshot obrigatório antes de qualquer `apply`; se o snapshot falhar, nada é aplicado.
- Ponto de Restauração do Windows antes de lotes com ações de sistema.
- Aplicação transacional por lote: se um item crítico falhar, os itens já aplicados do lote são revertidos.
- Restauração acessível mesmo sem internet e mesmo se a interface não abrir (`gameforge --restore-last`).

### 9.3 Privacidade

- Enviado à IA: apenas o `SystemReport` sem nome de usuário, caminhos pessoais, IPs, chaves ou nomes de conta (mascaramento automático antes do envio).
- Tela "O que é enviado" mostra o JSON exato de cada chamada.
- Telemetria do app desligada por padrão; quando ligada, só contagens anônimas e erros.

### 9.4 Integridade de skills

Skills remotas são baixadas de um repositório próprio, verificadas por SHA-256 e assinatura Ed25519 antes de instalar. Uma skill nunca adiciona tipos de ação: ela só descreve dados para ações que já existem no núcleo.

### 9.5 Regras de plataformas de terceiros

- Jogos: nada de injeção, overlay próprio dentro do jogo ou edição de arquivos protegidos, para não acionar anti-cheat.
- Discord: só bot oficial com convite do dono do servidor; nunca automação da conta do usuário.
- OBS: a chave de transmissão é digitada pelo usuário e vai direto ao OBS.

## 10. Estrutura do repositório

Monorepo com pnpm workspaces e Cargo workspace. O Claude Code deve criar exatamente esta árvore na Fase 0.

```text
gameforge/
├─ CLAUDE.md                     # regras para o Claude Code (seção 12.2)
├─ docs/
│  ├─ SDD.md                     # este documento
│  └─ adr/                       # decisões de arquitetura
├─ apps/
│  ├─ web/                        # site: vendas, checkout, minha conta, admin (seção 14.2)
│  └─ desktop/
│     ├─ src/                    # React
│     │  ├─ app/                 # rotas, layout, providers
│     │  ├─ features/            # dashboard, boost, games, obs, discord, live, network, monitor, history, assistant, settings
│     │  ├─ components/ui/       # shadcn/ui + componentes do design system
│     │  ├─ components/wizard/   # WizardShell, ChoiceTile, ScanTimeline, PlanItem, ApplyProgress
│     │  ├─ lib/ipc.ts           # wrappers tipados dos comandos Tauri
│     │  ├─ stores/              # Zustand
│     │  ├─ i18n/                # pt-BR, en, es
│     │  └─ styles/tokens.css    # tokens da seção 7.1
│     └─ src-tauri/
│        ├─ src/main.rs
│        ├─ src/commands/        # comandos expostos à interface
│        └─ capabilities/        # permissões Tauri
├─ crates/
│  ├─ gf-core/                   # Orchestrator, Plan, validação, ciclo do agente
│  ├─ gf-ai/                     # cliente Claude API, prompts, tools, cache
│  ├─ gf-diagnostics/            # SystemReport
│  ├─ gf-actions/                # catálogo de ações (apply/revert)
│  ├─ gf-snapshots/              # snapshots e restauração
│  ├─ gf-skills/                 # carregamento e validação de skills
│  ├─ gf-adapters-windows/
│  ├─ gf-adapters-macos/
│  ├─ gf-adapter-obs/
│  ├─ gf-adapter-discord/
│  ├─ gf-adapter-games/
│  ├─ gf-store/                  # SQLite + migrações
│  └─ gf-elevated-helper/        # binário privilegiado mínimo
├─ skills/
│  ├─ system/  games/  obs/  discord/  network/  scenarios/
│  └─ schema/skill.schema.json
├─ scripts/powershell/            # scripts assinados, chamados por nome
├─ services/api/                  # contas, assinaturas, webhooks e proxy de IA (seção 14)
├─ tests/e2e/                     # Playwright
└─ .github/workflows/             # CI: lint, testes, build Win/Mac, assinatura
```

## 11. Requisitos não funcionais e testes

| Requisito | Meta |
| --- | --- |
| Tempo de abertura do app | Abaixo de 2 s em SSD |
| Diagnóstico completo | Abaixo de 15 s |
| Plano da IA (do clique à revisão) | Abaixo de 25 s no p95 |
| Uso de RAM em repouso | Abaixo de 150 MB |
| Uso de CPU com monitor aberto | Abaixo de 2% |
| Tamanho do instalador | Abaixo de 25 MB (sem skills extras) |
| Taxa de reversão com sucesso | 100% nos testes de catálogo |
| Funcionamento offline | Diagnóstico, presets e restauração |
| Plataformas | Windows 10 22H2+ e 11 (x64); macOS 13+ (Apple Silicon e Intel) |
| Assinatura de código | Authenticode (Windows) e notarização Apple (macOS) |

### 11.1 Estratégia de testes

- **Unidade (Rust):** cada ação do catálogo tem teste `apply → read → revert → read` contra um adaptador falso; cobertura mínima de 85% em `gf-actions` e `gf-snapshots`.
- **Skills:** validação de todas as skills contra `skill.schema.json` no CI; testes de golden file com configurações reais de exemplo em `skills/**/fixtures/`.
- **IA:** suíte de avaliação com 30 cenários (hardware fraco, médio, forte × metas) usando respostas gravadas; verifica que todo plano é válido e respeita o nível de risco. Testes ao vivo com a API rodam só com uma variável de ambiente.
- **OBS:** testes de integração com OBS rodando em modo headless no CI do Windows, conectando via websocket.
- **Interface:** Vitest + Testing Library nos componentes; Playwright nos fluxos (onboarding, Quick Boost, Pronto para Live, Desfazer) com o núcleo em modo simulado.
- **Manual:** matriz de 6 máquinas de referência (NVIDIA, AMD, Intel integrada, notebook, Mac M-series, Mac Intel) antes de cada versão.

## 12. Plano de implementação para o Claude Code

O Claude Code deve construir em 11 fases (0 a 10), nesta ordem, e só avançar quando o critério de aceite da fase passar. Cada fase termina com commit, testes verdes e uma nota curta em `docs/progress.md`.

| Fase | Entregas | Critério de aceite |
| --- | --- | --- |
| 0. Fundação | Monorepo, Tauri 2 + React + Tailwind + shadcn/ui, tokens, janela sem moldura, barra lateral, rotas vazias, CI de lint e build | App abre no Windows e no macOS com todas as rotas navegáveis e tema escuro |
| 1. Diagnóstico | `gf-diagnostics`, `SystemReport`, tela Início com HealthRing e problemas | Relatório completo em menos de 15 s em máquina real; testes de parsing |
| 2. Núcleo de ações | `gf-actions`, `gf-snapshots`, `gf-store`, helper elevado, 6 ações de sistema | Teste apply/revert verde para todas; restauração via CLI funciona |
| 3. Assistente e Quick Boost | WizardShell, ScanTimeline, PlanItem, ApplyProgress, presets offline | Quick Boost completo com preset, revisão, aplicação e desfazer |
| 4. Motor de IA | `gf-ai`, tool use, `submit_plan`, validação, cache, tela "O que é enviado", chave no keychain | 30 cenários gravados geram planos 100% válidos |
| 5. Jogos | Detecção de lojas, `gf-skills`, 3 skills (Valorant, CS2, Fortnite), tela Jogos e benchmark | Otimizar e desfazer cada jogo em máquina real; benchmark antes/depois |
| 6. OBS | `gf-adapter-obs`, ativação do WebSocket, perfil, saída, áudio, cenas, teste de 30 s | Perfil Twitch 1080p60 criado do zero e live de teste sem quadros perdidos acima de 1% |
| 7. Discord | settings.json, cartões guiados, integração com OBS, bot e modelos de servidor | Servidor de teste montado a partir do modelo; ajustes locais reversíveis |
| 8. Pronto para Live + polimento | Assistente combinado, Rede, Monitor, Histórico, chat IA, i18n, animações, acessibilidade | Fluxo E2E completo no Playwright; checklist de acessibilidade AA |
| 9. Contas e cobrança | Site apps/web (vendas, checkout, minha conta, admin), services/api (Supabase, PaymentProvider com Asaas, webhooks idempotentes, proxy de IA com cotas), login do app com PKCE, entitlements assinados, limite de PCs | Compra em sandbox com cartão e Pix libera o Pro no app em menos de 1 min; falha de pagamento e cancelamento seguem os estados da seção 14.3 |
| 10. Distribuição | Assinatura, notarização, updater, repositório de skills assinado, instalador público em /download | Instaladores assinados e atualização automática testada |

### 12.1 Como usar este SDD no Claude Code

1. Exporte este documento em Markdown e salve como `docs/SDD.md` no repositório.
2. Crie o `CLAUDE.md` com o conteúdo da seção 12.2.
3. Abra o Claude Code na pasta e envie o prompt inicial da seção 12.3.
4. Ao fim de cada fase, revise o app rodando antes de liberar a próxima.

### 12.2 Conteúdo do CLAUDE.md

```markdown
# GameForge AI — regras do projeto

Fonte da verdade: docs/SDD.md. Leia a seção da fase atual antes de codar.

## Fluxo
- Trabalhe uma fase por vez (SDD seção 12). Não pule fases.
- Antes de codar uma fase: escreva o plano em docs/plans/fase-N.md.
- Ao terminar: testes verdes, lint limpo, atualize docs/progress.md, commit.

## Regras de código
- Rust: sem unwrap() fora de testes; erros com thiserror; async com tokio.
- TypeScript strict; sem any; tipos gerados do Rust via specta.
- Interface: só componentes do design system (SDD seção 7); nenhum texto fixo, use i18n.
- Todo comando Tauri novo precisa entrar em src-tauri/capabilities.

## Regras de segurança (inegociáveis)
- Nenhuma ação fora do catálogo (SDD 5.3). Nenhum shell com texto da IA.
- Toda ação implementa apply e revert, com teste apply→revert.
- Snapshot antes de qualquer apply.
- Segredos só no keychain. Nunca logar chaves, tokens ou chaves de stream.
- Nunca tocar arquivos de anti-cheat, executáveis de jogos ou automatizar conta do Discord.
- Plano e cota são decididos só pelo servidor; o app apenas verifica o token assinado de entitlements.
- Nunca colocar a chave da API do Claude no app em builds públicos.

## Comandos
- pnpm dev — app em modo desenvolvimento
- pnpm test — testes da interface
- cargo test --workspace — testes do núcleo
- pnpm e2e — Playwright
- pnpm validate:skills — valida skills contra o schema
```

### 12.3 Prompt inicial para o Claude Code

```text
Leia docs/SDD.md e CLAUDE.md por completo. Depois execute a Fase 0 do SDD
(seção 12): crie o monorepo com a estrutura da seção 10, configure Tauri 2,
React 19, Vite, Tailwind v4, shadcn/ui e os tokens da seção 7.1, implemente a
janela sem moldura, a barra lateral e todas as rotas da seção 6.1 com estados
vazios bonitos. Antes de codar, escreva docs/plans/fase-0.md com o plano e
espere minha aprovação. Ao terminar, rode lint e build e me mostre como abrir.
```

## 13. Riscos e decisões em aberto

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Jogos mudam o formato do arquivo de configuração após um patch | Ajuste falha ou é ignorado | Skills versionadas e atualizáveis sem nova versão do app; verificação pós-aplicação |
| Anti-cheat interpretar o app como suspeito | Banimento ou bloqueio | Só arquivos de configuração do usuário, nada com o jogo aberto, binário assinado |
| Discord não expõe ajustes de voz em arquivo | Automação parcial | Camada guiada + fallback experimental com controle de tela |
| Antivírus marcar o helper elevado | Instalação bloqueada | Assinatura de código, envio prévio a fornecedores de AV, helper mínimo |
| Custo da API por usuário | Margem do produto | Prompt caching, cache de planos, Haiku para tarefas simples, presets offline |
| IA sugerir algo errado | Desempenho pior | Catálogo fechado, faixas da skill, revisão do usuário, benchmark e desfazer |
| "Otimizadores" têm fama ruim | Desconfiança | Transparência total: diff de cada mudança, tela "O que é enviado", sem promessas exageradas |

### 13.1 Decisões em aberto

- [ ] Preços dos planos e cota mensal de IA (definir após medir o custo no beta, seção 14.1).
- [ ] Nome final do produto e registro de marca.
- [ ] Lista definitiva dos 10 jogos da v1.0 (sugestão na seção 4.3).
- [ ] Incluir o fallback com controle de tela já na v1.0 ou deixar para a v1.1?
- [ ] Hospedagem do repositório de skills (GitHub Releases ou CDN própria).

## 14. Monetização, contas e licenciamento

O GameForge é vendido por assinatura mensal ou anual, num site próprio, e o app libera o Pro por login (e-mail e senha, Google ou Discord), não por chave. Todo uso de IA passa pelo servidor da empresa, que confere o plano e a cota antes de chamar o Claude. Assim, quem cancela perde o acesso na hora e o instalador sozinho não vale nada.

&#91;embedded content: cobrança e acesso · site, gateway, API de contas, app e IA\]

O gateway avisa a API de contas por webhook; o app consulta essa API para saber o plano, e toda chamada de IA passa por ela antes de chegar ao Claude.

### 14.1 Planos

Venda vitalícia não é oferecida, porque cada análise com IA gera custo recorrente na API.

| Recurso | Grátis | Pro mensal | Pro anual |
| --- | --- | --- | --- |
| Diagnóstico e nota de saúde | Sim | Sim | Sim |
| Presets offline (sem IA) para sistema e jogos | Sim | Sim | Sim |
| Snapshots e desfazer | Sim | Sim | Sim |
| Planos personalizados com IA | 3 de teste | Cota mensal (definir no beta) | Cota mensal (definir no beta) |
| OBS completo, Discord, Pronto para Live | Prévia | Sim | Sim |
| Assistente em chat | Não | Sim | Sim |
| Benchmark antes/depois | Básico | Completo | Completo |
| PCs por conta | 1 | 3 | 3 |
| Preço | R$ 0 | A definir | Cerca de 10x o mensal (2 meses de desconto) |

Regra de preço: medir no beta o custo médio de IA por usuário ativo e cobrar pelo menos 3 a 4 vezes esse valor. Teste grátis do Pro de 7 dias, liberado uma vez por conta e por PC.

### 14.2 Site (apps/web)

Next.js (App Router) + Tailwind + shadcn/ui, com a mesma identidade visual do app (seção 7), hospedado na Vercel.

| Página | Rota | Conteúdo |
| --- | --- | --- |
| Início | `/` | Proposta, vídeo do app, antes/depois de FPS, depoimentos reais, chamada para baixar |
| Preços | `/precos` | Tabela de planos, alternância mensal/anual, perguntas frequentes |
| Download | `/download` | Instaladores Windows e macOS, requisitos, notas de versão |
| Entrar e criar conta | `/entrar`, `/cadastro` | E-mail e senha, Google, Discord, recuperação de senha |
| Checkout | `/checkout?plano=` | Cartão, Pix Automático e boleto, cupom, CPF/CNPJ para nota |
| Minha conta | `/conta` | Plano atual, uso da cota de IA, próxima cobrança, trocar plano, cancelar |
| Faturas | `/conta/faturas` | Histórico, segunda via, notas fiscais |
| Dispositivos | `/conta/dispositivos` | PCs vinculados, último acesso, remover |
| Resgatar código | `/conta/resgatar` | Códigos de presente ou revenda |
| Ajuda e legal | `/ajuda`, `/termos`, `/privacidade`, `/reembolso` | Suporte, termos de uso, LGPD, política de reembolso |
| Painel interno | `/admin` | Usuários, assinaturas, pagamentos, uso e custo de IA, cupons, códigos, reembolsos |

### 14.3 Gateway e gestão da assinatura

A cobrança recorrente, as novas tentativas e a nota fiscal ficam com o gateway. O servidor só reage aos webhooks e guarda o estado.

| Gateway | Uso | Meios |
| --- | --- | --- |
| Asaas (principal) | Clientes no Brasil | Cartão, Pix Automático, boleto; emissão de NFS-e |
| Mercado Pago (alternativa) | Clientes no Brasil | Cartão, Pix, saldo Mercado Pago |
| Stripe | Clientes fora do Brasil | Cartão, carteiras digitais |

O código usa uma interface `PaymentProvider` (criar cliente, criar assinatura, trocar plano, cancelar, validar webhook), para trocar de gateway sem mexer no resto.

Estados da assinatura:

1. `trialing`: teste de 7 dias, Pro liberado.
2. `active`: pago, Pro liberado.
3. `past_due`: pagamento falhou; Pro continua por 5 dias de carência enquanto o gateway tenta de novo, com aviso no app e e-mail.
4. `canceled`: o usuário cancelou; Pro continua até o fim do período pago.
5. `expired`: fim do período ou da carência; a conta volta ao Grátis sem perder perfis nem histórico.

Webhooks: verificação do token ou assinatura do gateway, idempotência pelo id do evento (tabela `webhook_events`), processamento em fila e reconciliação diária com a API do gateway para corrigir eventos perdidos. E-mails transacionais (boas-vindas, pagamento recebido, falha, cancelamento) via Resend.

### 14.4 API de contas (services/api)

Supabase (Auth + Postgres) com uma API em TypeScript (Hono em Cloudflare Workers ou rotas do Next.js). Tabelas no servidor:

| Tabela | Campos principais |
| --- | --- |
| `users` | id, email, nome, cpf\_cnpj (opcional), criado\_em, provider (email, google, discord) |
| `plans` | id, nome, intervalo, preço, cota\_ia\_mensal, max\_dispositivos, recursos\_json |
| `subscriptions` | id, user\_id, plan\_id, gateway, gateway\_sub\_id, status, período\_atual\_fim, cancelar\_no\_fim |
| `payments` | id, subscription\_id, valor, método, status, nota\_fiscal\_url, pago\_em |
| `devices` | id, user\_id, hash\_maquina, nome, os, último\_acesso, revogado |
| `ai_usage` | id, user\_id, device\_id, mês, análises, tokens\_entrada, tokens\_saída, custo\_estimado |
| `redeem_codes` | código, plano, meses, usado\_por, usado\_em, lote |
| `webhook_events` | id\_evento, gateway, tipo, payload, processado\_em |

Endpoints principais:

| Método e rota | Função |
| --- | --- |
| `POST /auth/app/start` e `/auth/app/exchange` | Login do app pelo navegador com PKCE |
| `POST /auth/refresh` | Renovar o token de acesso |
| `GET /me/entitlements` | Plano, recursos, cota restante, validade (token assinado) |
| `POST /devices` e `DELETE /devices/:id` | Vincular e remover PCs |
| `POST /ai/messages` | Proxy da API do Claude com verificação de plano e cota |
| `POST /billing/checkout` | Criar assinatura no gateway e devolver o link de pagamento |
| `POST /billing/change-plan` e `/billing/cancel` | Trocar ou cancelar plano |
| `POST /webhooks/{asaas,mercadopago,stripe}` | Receber eventos de pagamento |
| `POST /redeem` | Resgatar código de presente |

### 14.5 Login no app

1. Na primeira abertura, o app oferece "Entrar" ou "Continuar grátis".
2. "Entrar" abre o navegador padrão na página de login do site (com Google, Discord ou e-mail), usando PKCE.
3. O site devolve o código ao app pelo link `gameforge://auth/callback`; o app troca o código por tokens.
4. Token de acesso de 15 minutos e token de renovação de 30 dias, guardados no keychain do sistema.
5. O app registra o PC (hash anônimo da máquina) e pede os direitos de uso (`entitlements`), um token assinado com Ed25519 que o núcleo Rust verifica com a chave pública embutida.
6. Sem internet: recursos Grátis sempre funcionam; recursos Pro sem IA funcionam por até 7 dias desde a última validação; recursos com IA exigem conexão.
7. Passou de 3 PCs: o app mostra a lista e pede para remover um.

O modo "traga sua chave" (BYOK) da seção 3.3 fica restrito a builds de desenvolvimento e beta.

### 14.6 Proxy de IA e cotas

- O app nunca recebe a chave da API do Claude; ela fica só no servidor.
- Cada `POST /ai/messages` confere: token válido, dispositivo ativo, plano com IA e cota do mês.
- Uma "análise" = um plano gerado (com suas chamadas de leitura); o chat conta por mensagem com teto de tokens.
- Limite de frequência por usuário (por exemplo, 10 requisições por minuto) contra abuso.
- Cada chamada grava tokens e custo estimado em `ai_usage`; alerta no painel quando o custo de um usuário passar da receita dele.
- Cota esgotada: o app oferece o preset offline e mostra quando a cota renova.

### 14.7 Códigos de resgate (opcional)

Para revenda, parcerias com streamers ou presente: códigos no formato `GF-XXXX-XXXX-XXXX`, gerados em lote no painel, que dão N meses de Pro ao serem resgatados numa conta. A conta continua sendo o que libera o app; o código só adiciona tempo. Se no futuro for preciso ativação totalmente offline, avaliar o Keygen, que tem SDK para Tauri.

### 14.8 Instalador e distribuição

- Um único instalador público por plataforma: `.exe` (NSIS) assinado com Authenticode no Windows e `.dmg` notarizado no macOS.
- Download em `/download`, arquivos servidos por CDN (Cloudflare R2).
- Nenhuma chave ou conta dentro do instalador: o Pro é liberado pelo login.
- Atualizações pelo Tauri updater, com canal estável e beta.

### 14.9 Anti-abuso

- Teste grátis limitado por conta, por PC e por meio de pagamento.
- Estorno (chargeback) revoga o Pro e bloqueia novos testes daquela conta.
- Tokens revogáveis no servidor; PC removido perde acesso na próxima renovação.
- Detecção de compartilhamento: muitos PCs diferentes em pouco tempo geram alerta no painel.

### 14.10 Fiscal e legal

- Vender por assinatura com nota fiscal exige CNPJ; o enquadramento (MEI, Simples Nacional) deve ser definido com um contador.
- NFS-e emitida automaticamente pelo gateway a cada pagamento.
- Direito de arrependimento: reembolso integral se pedido em até 7 dias da compra online (CDC, art. 49).
- Termos de uso, política de privacidade conforme a LGPD e política de reembolso publicadas no site, com aceite registrado no cadastro.

### 14.11 Métricas do negócio

Receita recorrente mensal (MRR), conversão Grátis para Pro, conversão do teste, cancelamento mensal (churn), custo de IA por usuário, margem por plano e receita por meio de pagamento. Todas visíveis no painel `/admin`.
