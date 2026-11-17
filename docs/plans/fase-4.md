# Planejamento IA e fluxo solicitado

Steering do usuário: priorizar PC + OBS + Twitch/Kick/YouTube/outros RTMP, Claude Opus 5.5 principal e GPT-6.1 Sol fallback.

Contrato fechado OptimizationPlan, catálogo Windows de quatro ações, vídeo 720p/1080p 30/60 FPS e bitrate limitado. Contexto sanitizado exibido antes de envio; tools submit_plan em Messages Anthropic e Responses OpenAI. Fallback somente com consentimento no produto. Cofre do SO para API e credenciais OBS; chaves de stream por plataforma.

Executor Windows: revisão capturada e persistida, helper do mesmo executável em modo separado antes de iniciar Tauri, UAC por lote, System Restore via API nativa, snapshot durável e compensação com conflito detectado. Ações fora do catálogo são rejeitadas. UI exige clique separado para aplicar depois da revisão.

OBS: handshake v5, autenticação SHA-256, perfil novo, vídeo/saída, RTMP/RTMPS do usuário, leitura de verificação, fingerprint de estado e restauração. Não iniciar live durante testes. CPU x264 nesta entrega; autoencoder GPU, cenas e áudio completo permanecem no backlog.

Aceite de código: contratos, fallback sem chamadas reais, estado simulado das ações apply/revert/falha, servidor OBS simulado, E2E da aprovação e separação de chaves. Aceite real ainda depende de API keys, OBS configurado e máquina de teste para Windows/UAC/System Restore. Não anunciar a beta como produto comercial homologado.
