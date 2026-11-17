# Atualização de acesso na versão 0.3

Assine pelo site e gere sua chave depois da confirmação de pagamento, ou receba uma licença manual do admin. No desktop, abra Configurações → Licença para ativar. As chaves de API são geridas pelo servidor; as instruções BYOK 0.2 abaixo são históricas. IA consome créditos pelo uso; aplicar um plano já gerado e restaurar não consomem créditos. Validação offline máxima: 24 horas. Consulte [Cloud](CLOUD-RAILWAY.md) e [créditos](PRECOS-E-CREDITOS.md).

# GameForge AI 0.2 — usar otimização, IA e streaming

## Abrir

Use `target/debug/gameforge.exe`, gerado por `npm run package`. É um build beta sem assinatura de distribuição. O aplicativo normal não precisa ser iniciado como administrador: somente o helper de mudanças Windows usa UAC.

## Configurar a IA

1. Abra **Configurações**.
2. Salve a chave da API Anthropic para Claude Opus 5.5 (`claude-opus-5-5`).
3. Opcionalmente, salve a chave da API OpenAI para GPT-6.1 Sol (`gpt-6.1-sol`).
4. Em **Quick Boost**, selecione o objetivo e clique em **Preparar análise com IA**.
5. Confira o JSON. A seleção **Permitir envio à OpenAI se o Claude falhar** autoriza o fallback; desmarque para usar somente Claude.
6. Clique em **Enviar dados e gerar plano**. O modelo/provedor efetivamente utilizado aparece na revisão.

As consultas usam suas contas de API e podem gerar custo. As chaves ficam no cofre do SO e não são retornadas ao frontend. O diagnóstico enviado omite caminhos, nomes de processos, nomes de discos, IPs e credenciais; o objetivo nesta interface é uma opção predefinida. O app não lê arquivos livres para o modelo. Builds públicos precisam do proxy previsto no SDD; BYOK direto está restrito aos builds de desenvolvimento/beta.

Modelos confirmados na documentação oficial em 17/11/2026: [Claude](https://platform.claude.com/docs/en/models/overview) e [OpenAI](https://developers.openai.com/api/docs/models/gpt-6.1-sol). Ter o modelo disponível no aplicativo de chat não comprova acesso ou saldo na API da sua conta.

## Otimizar o Windows

1. Gere um plano com IA ou use **Usar preset offline**.
2. Marque as ações desejadas. Mouse e Alto desempenho não são selecionados automaticamente.
3. Clique em **Revisar valores antes de aplicar**. O estado anterior é capturado e a revisão fica registrada.
4. Confira efeitos, valores anteriores e novos. Clique em **Aprovar e aplicar no Windows (UAC)**.
5. Autorize a elevação da mesma conta de usuário no Windows. Se usar outra conta administrativa, o helper pode não localizar a operação e não deve alterar as configurações desse usuário.
6. O helper cria e conclui um Ponto de Restauração antes das alterações, confirma o snapshot durável, aplica o catálogo e relê os valores.

Catálogo desta versão: Game Mode; Game DVR/captura em segundo plano; aceleração do mouse; plano de energia Alto desempenho. Alto desempenho pode não existir em alguns notebooks. Alterações no mouse podem exigir sair da sessão. Não há overclock, debloat, desligamento de proteção, edição de anti-cheat ou execução de comandos do modelo.

Se a Proteção do Sistema estiver desativada, indisponível ou a criação do ponto falhar, o lote é bloqueado. Se todas as configurações já estiverem no estado solicitado, não se cria outra operação. Nenhum ganho de FPS é garantido.

Em **Histórico**, atualize as operações para consultar resultados, erros, desfazer ou cancelar uma revisão ainda não aplicada. Falhas parciais tentam compensar os valores; conflitos externos bloqueiam sobrescrita. Uma operação interrompida requer recuperação antes de outra do mesmo tipo.

## Conectar OBS e streaming

1. Abra **Configurações** e salve a senha do servidor WebSocket do OBS.
2. No OBS, habilite o servidor WebSocket v5 na porta local **4455**, com autenticação. O app não habilita acesso remoto ao computador.
3. Abra **Streaming**, clique em **Abrir OBS instalado** se necessário e depois **Conectar e autenticar no OBS**.
4. Escolha Twitch, Kick, YouTube ou outra plataforma RTMP/RTMPS.
5. Copie a URL de servidor e a chave do painel oficial da plataforma. A URL não deve conter a chave, credenciais, query ou fragmento.
6. Salve a chave no cofre. Cada plataforma possui uma entrada separada; trocar de plataforma não reutiliza a chave anterior.
7. Revise resolução, FPS, bitrate e destino. Autorize a criação do perfil e clique em **Criar e configurar perfil no OBS**.

O app cria um perfil `GameForge <plataforma> <id>`, configura vídeo e saída simples x264/veryfast, CBR e intervalo máximo de keyframe de dois segundos. Reativa o perfil para carregar os parâmetros e relê configurações, destino e credencial. O perfil anterior é mantido intacto. A chave vai ao OBS local; não vai à IA nem ao banco de snapshots do GameForge.

O padrão offline é 720p30 / 3500 kbps. Não há medição de upload sustentado nesta versão; confira o limite de upload e as exigências da plataforma. Os perfis usam CPU; seleção automática de NVENC/AMF/QuickSync ainda está pendente. Cenas e fontes continuam sendo as existentes no OBS: revise captura de jogo, microfone e webcam antes de transmitir.

No YouTube, crie/prepare a transmissão no YouTube Studio. A integração usa a URL e chave fornecidas pela plataforma, sem login OAuth ou gestão de título/categoria. Um perfil tem um destino; multistream simultâneo não está implementado. A aplicação não inicia uma transmissão automaticamente.

Desfazer reativa o perfil anterior e remove o perfil criado, após checar saídas paradas, perfil atual e assinatura do estado aplicado. Se você editar o perfil GameForge depois, o app bloqueia a restauração para preservar as alterações. Pare gravação/live antes de configurar ou restaurar.

Referências: [protocolo OBS](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md), [saída simples OBS](https://github.com/obsproject/obs-studio/blob/master/frontend/utility/SimpleOutput.cpp), [Twitch](https://dev.twitch.tv/docs/video-broadcast/), [Kick](https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com).

## Recuperação sem interface

```powershell
.\target\debug\gameforge.exe --restore-system-last
.\target\debug\gameforge.exe --restore-obs-last
.\target\debug\gameforge.exe --restore-last
```

Os dois primeiros restauram a última operação recuperável de Windows/OBS. Windows solicita UAC; OBS precisa estar aberto, autenticável e sem saídas ativas. O último mantém a compatibilidade com os snapshots de preferências da versão inicial. Códigos de saída não zero indicam falha; consulte o histórico quando a interface voltar a abrir.

## Alcance dos testes

Testes de catálogo e recuperação usam adaptadores de teste e diretórios temporários. Testes WebSocket usam um servidor simulado em loopback. Eles cobrem autenticação, solicitações, criação, verificação, rollback e desfazer, mas não substituem a homologação com seu Windows, versão do OBS, encoder e conta de streaming. Não foram feitas chamadas pagas às APIs, alteradas configurações reais do Windows ou iniciadas lives durante o desenvolvimento.
