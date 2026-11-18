# Progresso — 17/11/2026 · beta 0.2

## Entrega atual: PC + IA + streaming

Pedido priorizado pelo usuário: otimizar Windows e configurar OBS para Twitch, Kick, YouTube/outros RTMP, usando Claude Opus 5.5 e fallback GPT-6.1 Sol.

Implementados clientes HTTPS oficiais, contrato fechado de plano, contexto sanitizado revisável, fallback com consentimento, credenciais no cofre do SO e chaves separadas por plataforma. IDs confirmados nas páginas oficiais dos provedores.

Executor Windows com revisão persistida, quatro ações tipadas, helper em modo separado do executável, UAC, Ponto de Restauração via API carregada do diretório do sistema, journal anterior à escrita, releitura e compensação. Game Mode usa AutoGameModeEnabled documentado pela Microsoft. Captura Game DVR altera as preferências do Xbox Game Bar; a troca é explicitada ao usuário. Mouse e energia alta exigem seleção explícita. Nada de comandos livres, antivírus, VBS, firewall ou anti-cheat.

OBS agora faz handshake/autenticação v5 e solicitações reais, cria perfil separado, configura vídeo/saída, CBR x264/veryfast, keyframe máximo de dois segundos, servidor/chave por RTMP/RTMPS, reativa o perfil e verifica. Armazena fingerprint do estado (sem credenciais em claro) para detectar alterações antes de desfazer. Não inicia live. Histórico tem operações de sistema e OBS e recuperação via CLI.

Permanecem disponíveis diagnóstico, monitor, jogos detectados, teste TCP, checklist Discord, snapshots de preferências e tipos gerados.

## Evidências

- 37 verificações Rust, incluindo exportação de tipos, validação de plano, política de fallback, ações Windows apply/revert com adaptador de teste, falha intermediária/conflito, credenciais ausentes dos journals, autenticação OBS e protocolo simulado de criação/verificação/rollback/desfazer.
- O teste de 30 variantes de contrato IA é sintético. Não representa 30 avaliações com respostas reais gravadas dos modelos.
- Dois testes Vitest e seis E2E Edge passaram. E2E simula IPC nos cenários de ações; não efetua ajustes reais no Windows.
- TypeScript/Vite, Clippy núcleo -D warnings e checagem Tauri passaram antes da última alteração de keyframe, repetidos conforme resultado final abaixo.
- Builds beta embutidos gerados com `npm run package`; validação final do executável e resultado dos últimos checks registrados ao terminar.
- ts-rs emite nota sobre deny_unknown_fields durante geração; validação serde no Rust continua ativa.

## O que ainda não foi validado ao vivo

- Chamada paga a Claude/OpenAI: nenhuma credencial foi fornecida/configurada no desenvolvimento.
- Windows/UAC/System Restore: o PC do usuário não foi modificado para testar a otimização. A lógica foi testada com adaptador controlado; homologação do caminho nativo elevado permanece necessária.
- OBS real com conta: protocolo testado com servidor simulado, sem configurar o perfil real do usuário ou iniciar uma live.
- macOS: CI configurado, sem execução local homologada nesta máquina Windows.

## Pendências do SDD completo

Autoencoder GPU, cenas/áudio OBS completos, medição sustentada de upload e teste de transmissão, skills/edição de jogos, benchmark FPS, bot Discord, perfis compartilháveis, i18n completo, diagnóstico GPU/drivers/monitores/SMART, servidor de contas/cotas/proxy público, site, cobrança, assinatura e updater.

A conexão atual com plataformas usa URL/chave, não OAuth, gestão de canal ou multistream simultâneo. A versão atual é beta local, não a versão comercial completa.

## Segurança e execução

Nenhum segredo vai ao SQLite, logs ou IA. O caminho de dados do helper usa Known Folder do Windows. O helper revalida catálogo e estado anterior, e bloqueia se não conseguir criar Ponto de Restauração. Scripts/shell do modelo não existem. O preset offline e os recursos de recuperação não dependem de APIs.

A auditoria npm anterior registrou alertas na cadeia de desenvolvimento; não considerar a mensagem de audit offline como nova avaliação de segurança. Homologação comercial deve repetir auditoria online.


## Atualização — instalador, primeira abertura e programas

- Instalador NSIS de cerca de 5 MB gerado, português brasileiro, logo/header/sidebar, metadados, ícones, Menu Iniciar, atalho desktop na tela de conclusão e desinstalador.
- Instalação por usuário, sem instalar como administrador; os ajustes do sistema continuam exigindo o helper separado com UAC.
- Guia de primeira abertura com informação sobre o produto e botões para continuar nas conexões ou diagnóstico offline.
- Plugin de notificações integrado, opt-in e desativação no app. Avisos de plano disponível, falha e operação concluída enquanto o aplicativo está aberto. Windows precisa da instalação para identidade adequada dos avisos.
- Inventário de programas Win32 registrados (71 detectados no teste local, com avisos de fontes inacessíveis). Store/MSIX e portáteis não são cobertos integralmente.
- Questionário de programa, objetivos e critérios de aceite registrados localmente. Solicitações exigem plano válido, aprovação anterior à execução vinculada e resultado técnico aplicado antes do aceite final. O aceite é declarado pelo usuário.
- Importação automática da senha WebSocket a partir da configuração local do OBS para o cofre, somente quando o servidor já estiver habilitado na porta suportada. Não habilita acesso remoto nem envia senha à IA.
- Última bateria: 45 verificações Rust, dois testes Vitest e nove testes E2E passaram; Clippy do núcleo passou. Inventário real testado com saída somente de contagem. Testes de ações continuam simulados.
- Controle genérico por tela, Discord servidor/bot, Wi-Fi completo e teste de velocidade continuam pendentes. A API Claude não ganha acesso ao desktop por existir uma chave; é necessário implementar e homologar a ponte local de computer use, com autorização e interrupção pelo usuário. Não declarar esses recursos concluídos.


## Cloud 0.3 — 17/11/2026

Pedido do usuário: site público moderno (Impeccable/Emil), Three.js + GSAP, painéis admin/user, Railway, Mercado Pago, licenças e créditos.

Implementado: landing responsiva com cena 3D original/reduced motion, planos do banco, cadastro/login/cookies HttpOnly, admin por ENV, Dashboard, bloqueio de usuários, catálogo de três planos e três recargas editáveis, chaves manuais/assinatura, dispositivos, cofre de provedores e auditoria. Busca/paginação em usuários, assinaturas, licenças e eventos. Banco, sessões, carteira e fila compartilhados suportam múltiplas instâncias; sem promessa de capacidade ilimitada.

Cobrança: contrato preapproval e Checkout Pro para recargas; webhook HMAC, inbox durável, worker com SKIP LOCKED/retries e consultas canônicas. Autorização ou retorno do checkout não concede acesso. Pagamento approved/accredited com vendedor/ambiente/moeda/valor/referência validados concede período/créditos uma vez. Reembolso/contestação revoga período e reverte saldo. Valores existentes de contrato são preservados ao editar catálogo.

Créditos: custo Standard oficial por entrada/saída/cache, saldo inteiro em microcréditos, reserva antes de chamar IA, acerto pelo usage, deduplicação de solicitação e tratamento conservador de uso inconclusivo. Margem comercial e reservas editáveis, bloqueio de preços abaixo do mínimo. Planos Core 49,90/1000, Creator 119,90/3500, Studio 249,90/9000; pacotes 1000/39,90, 4000/139,90, 12000/359,90. Veja PRECOS-E-CREDITOS.md.

Desktop: ativação via proxy, token no cofre, Ed25519 com chave pública compilada, emissor/dispositivo/validade verificados, cache offline máximo de 24h, geração por proxy com saldo. Sistema/OBS exigem licença; restauração e diagnóstico seguem locais. Instalador release 0.3 compilado (4.234 MiB), com logo, textos atualizados, atalho e onboarding. Nenhuma instalação/otimização/transmissão foi executada para validar este pacote.

Evidências locais: npm run build e build:cloud passaram; npm test (2), E2E desktop (9), API/PostgreSQL real (15, sem pagamentos/chamadas IA reais), E2E web (3, cadastro, senha, navegação desktop/mobile, catálogo, chave manual, integrações e WebGL/reduced motion), cargo test gf-core (47 incluindo tipos e assinatura). Inspeção visual da hero e Dashboard. Dependências de produção: npm audit --omit=dev sem vulnerabilidades na consulta.

Railway: projeto gameforge-ai criado no workspace Intra Pay com Postgres, gameforge-web, domínio e ENV internas geradas privadamente. Pagamentos continuam desativados e provedores vazios para o operador preencher/homologar. Publicação e URL saudável devem ser verificadas antes de declarar deploy concluído.

Pendências comerciais/operacionais: homologar gateway/IA com credenciais adequadas; completar identificação da empresa/atendimento, recuperação de senha/verificação de e-mail, backups/alertas e teste sustentado de carga. Não houve cobrança real. A entrega Cloud não conclui Discord bot, controle genérico de PC, OAuth, multistream, cenas completas ou otimização macOS do SDD.


Publicação: commit inicial ef4242c enviado ao GitHub infinitytec15/desktop-gamer-ia. Railway declarou SUCCESS e GET /api/health retornou ok no domínio público. Instalador e SHA256SUMS publicados no prerelease v0.3.0; hash SHA256 f850799e91e538eb4336064a8cf9d2051aaeb08b1ff40326935d92435719647d. URL de download cadastrada no serviço. Configuração migrada para IaC atual (.railway/railway.ts) após revisar plano sem destruição, preservando todas as ENV e PostgreSQL. CLI atual advertiu cutoff do formato legado para 01/12/2026; arquivo antigo removido depois da migração/aplicação.


Verificação pública adicional: admin login OK, catálogo Core/Creator/Studio, cobrança desativada, download disponível, chave pública do desktop igual à do servidor e zero contas de cliente artificiais em produção. Burst de 100 leituras /api/public, concorrência 10, p95 172ms no ambiente observado (não certifica carga sustentada). API ampliada para 16 testes, incluindo falha determinística de checkout, recarga com preferência inicialmente não salva, bloqueio de segundo contrato pausado e estornos. CI anterior passou; runner Windows do commit acfb99a revelou colisão entre diretórios temporários por timestamp. Fixtures OBS/lib/workflow agora usam UUID e o teste de falha OBS verifica o erro esperado de SetStreamServiceSettings, preservando a exigência de rollback.


Escalabilidade de leitura: migration 002 adiciona índices de pagamentos aprovados por assinatura, assinaturas/planos por conta, licenças/recargas por usuário e análises em andamento por carteira. Migrações sequenciais preservam checksum da 001 já aplicada, com lock transacional na inicialização para réplicas concorrentes.

## Impressão 3D 0.4 — 17/11/2026

Escopo pedido: FDM e resina, máximo de modelos Bambu/Creality/Flashforge/Elegoo e outras marcas, ajustes de qualidade/temperatura/velocidade/suportes e apresentação no site. Pesquisa de formatos oficiais resultou em uma matriz explícita: família Orca JSON individual; Cura ZIP/INI; Prusa INI simples; FlashPrint e formatos proprietários de resina com aplicação guiada. Fontes/limites em IMPRESSAO-3D.md, catalog.ts e printers.ts. Catálogo de 166 nomes FDM e famílias de resina; não são 166 homologações físicas, nem uma base de limites térmicos certificados.

Fases 1–4 implementadas: pacote compartilhado @gameforge/printing, contratos estritos com limites e validação de resultado da IA; regras locais sem créditos; análise STL binário/ASCII em worker com limites, hash, topologia, métricas e cópia orientada; Three.js sob demanda; comparação/revisão e exportação de relatório/CSV/STL; adaptadores alteram apenas campos conhecidos já presentes, mantêm metadados, fórmulas/percentuais não suportados e G-code como dados sem executar. Original e relatório/hash podem ser baixados. Nome interno do preset é preservado e o fluxo exige duplicar no fatiador antes de exportar. Desktop grava somente arquivos novos UUID, registra hash e nunca sobrescreve o fonte. Reversão é descartar a cópia/reusar o original, cuja preservação é testada.

Proxy: rotas web/desktop com autenticação, licença e mesma carteira. Migration 003 torna dispositivo opcional para análises web e registra tipo/hash da entrada. Deduplicação confere carteira/dispositivo/tarefa/entrada, cotas são compartilhadas com o planejador de sistema, reserva e acerto seguem usage. Sem upload do STL/preset nem comandos da IA. Fallback depende de consentimento. Provedores reais continuam por configurar/homologar.

UI: seção pública, /impressao-3d, item no painel usuário e desktop; inventário de fatiadores encaminha ao módulo. Campos com unidades, lista editável/modelo personalizado, limites confirmados, saída marcada como proposta e aceite antes de exportar. Para resina preserva camada/exposição calibradas nas regras locais; PreForm não fabrica segundos/velocidades. Não há geração automática de suporte, reparo/topologia otimizada, envio à impressora ou universalidade de presets. Compatibilidade estrutural ainda não significa importação validada no software nativo.

Verificação até esta etapa: 48 testes Rust, Clippy -D warnings, dois Vitest, nove E2E desktop e cinco E2E web passaram. Novos E2E usam STL real de fixture local, worker, WebGL e download de preset, sem envio de malha ao servidor; conferem cópia/metadados e resina/PreForm/mobile. API/PostgreSQL: 17 testes passaram, incluindo licença, consumo de IA controlado, deduplicação e rejeição de proposta fora do limite. Auditoria npm de dependências de produção retornou zero vulnerabilidades. Build cloud e release anteriores desta fase passaram; builds finais e publicação registrados abaixo. Capturas em .impeccable/review/printing-*.png. Nenhuma impressão física, importação em fatiador real ou chamada paga de IA foi feita.


Bateria final 0.4: 92 verificações passaram (48 Rust incluindo tipos, 17 API, 11 impressão, 2 Vitest, 9 E2E desktop, 5 E2E web). Os dois E2E de impressão foram repetidos após o ajuste de validação de modelo e arredondamento de vazão. npm run build, build:cloud, Clippy e instalador NSIS release passaram. Instalador 4,40 MiB; SHA256 dfb8362c7e4fcb9c042880e7bde646ec925a27840eeec311c67bcd1ed0e2cf79. Não instalado/executado no caminho nativo nesta homologação.
