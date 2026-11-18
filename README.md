# GameForge AI 0.5

Aplicativo Windows para diagnosticar o PC, planejar ajustes com Claude Opus 5.5 e fallback GPT 6.1 Sol, revisar/aplicar mudanças do catálogo e configurar perfis OBS. Inclui site público 3D, contas, painéis de usuário/admin, licenças por dispositivo, assinaturas Mercado Pago e carteira de créditos de IA.

## Cloud

- `apps/web`: React 19, Vite, Three.js e GSAP; landing, cadastro, login, planos, assinatura, créditos, chaves, dispositivos e download.
- `services/api`: Express 5, PostgreSQL, sessões HttpOnly, login admin por ENV, catálogo editável, cofre de provedores AES-GCM, webhook assinado, fila durável e proxy IA com reservas/acerto de créditos.
- `Dockerfile` e `.railway/railway.ts`: Node 24, site e API na mesma origem, PostgreSQL separado, health check e migração transacional.

Consulte [operação e variáveis do Railway](docs/CLOUD-RAILWAY.md) e [custos e política de créditos](docs/PRECOS-E-CREDITOS.md). Cobrança inicia desabilitada até configurar e homologar Mercado Pago. Não houve transações reais nos testes.

```powershell
npm ci
npm run build:cloud
npm run api:test # integração exige TEST_DATABASE_URL de um banco isolado
```

O admin edita planos e recargas. Site e página de planos consultam o mesmo catálogo. O cliente só gera chave de assinatura depois de pagamento aprovado; o admin também pode criar licenças manuais com vencimento. A chave completa aparece uma vez, é armazenada como hash e ativa a vaga de um computador. Acesso offline usa envelope Ed25519 com validade máxima de 24 horas. A chave privada e os tokens de IA permanecem no servidor.

## Desktop e instalador

Build: Windows, Node 24, Rust estável, Visual Studio Build Tools C++ e WebView2.

```powershell
npm run cloud:sync-desktop # grava somente origem/chave pública em config/desktop-cloud.json
npm run installer         # release com NSIS
npm run desktop           # desenvolvimento nativo
npm run dev               # prévia da UI, sem acesso real ao PC
```

Instalador: `target/release/bundle/nsis/GameForge AI_0.6.0_x64-setup.exe`. Inclui logo, apresentação, atalho e guia inicial. Depois de instalar, vá em **Configurações → Licença**, cole sua chave e conecte o OBS. Não precisa de chaves de API no desktop.

O app coleta CPU/RAM/discos/processos/sensores disponíveis, detecta instalações registradas e jogos Steam/Epic, testa conectividade TCP e registra objetivos/aceites. A IA recebe somente o contexto revisado e propõe ações de um catálogo fechado. Quatro ações Windows: Game Mode, captura Game DVR, aceleração do mouse e energia Alto desempenho. Sistema exige revisão, elevação e restauração disponível. OBS usa WebSocket v5, autenticação, perfil separado, x264/veryfast/CBR e uma plataforma RTMP/RTMPS por perfil. Restauração permanece gratuita e local.

```powershell
npm run build
npm test
npm run e2e
npm run printing:test
npm run e2e:web # servidor/API local conforme guia Cloud
cargo test -p gf-core
cargo clippy -p gf-core --all-targets -- -D warnings
cargo check -p gameforge
```

## Impressão 3D

Novo módulo no desktop, painel do usuário e `/impressao-3d`: catálogo de 166 nomes de modelos FDM e famílias de resina, modelo personalizado, análise local de STL, orientação de uma cópia, parâmetros FDM e resina, comparação e exportação revisada. IA usa a mesma carteira, licença e proxy; planejamento local não usa créditos. JSON da família Orca, Cura ZIP e Prusa INI têm adaptadores estruturais; FlashPrint e fatiadores de resina possuem aplicação guiada. Não envia comandos à impressora. Consulte [compatibilidade, calibração e limites](docs/IMPRESSAO-3D.md).

## Roteamento, administração e monitor (0.5)

Econômico (Luna/Haiku), Equilibrado (Terra/Sonnet) e Avançado (Opus/Sol), com esforço rápido/normal/profundo e estimativa/reserva antes da chamada. Modelos e custos são permitidos pelo servidor; fallback só dentro do orçamento autorizado. Admin configura rotas, chaves de IA e Mercado Pago cifradas, copia webhook e restaura a versão anterior do cofre. Gestão de usuário inclui concessão manual, saldo, cadastro, bloqueio e remoção de acesso com histórico financeiro preservado.

Monitor local com gráficos CPU/RAM/GPU/temperaturas/rede, núcleos e volumes. NVIDIA NVSMI e WDDM no Windows; sensores adicionais via sysinfo/LibreHardwareMonitor se disponíveis. GPU real validada nesta máquina; temperatura de CPU não estava exposta. Não instala drivers nem inventa sensores.

Instalador 0.5 pede UAC para instalar por máquina. Sem certificado comercial fornecido, continua beta não assinada: UAC não elimina SmartScreen. Para assinatura válida, consulte [distribuição e segurança](docs/SEGURANCA-E-OPERACAO.md).

## Limites da beta

Sem promessa de ganho de FPS, usuários ilimitados ou configuração automática de qualquer programa. Não há controle genérico da tela, criação automática de servidor Discord, multistream simultâneo, login OAuth das plataformas, cenas/áudio completos no OBS ou suporte homologado de otimização macOS. Aplicações sem adaptador possuem orientação guiada. Sensores dependem do hardware. O instalador é sem assinatura comercial Authenticode e não possui updater automático.

Ações de sistema e OBS têm testes com adaptadores/protocolo controlados; não aplicamos otimizações nem iniciamos transmissão na máquina durante o desenvolvimento. Gateway e IA foram simulados nos testes financeiros, que usam PostgreSQL real. Homologação com credenciais de produção e OBS/Windows reais continua necessária antes da abertura comercial. Verificação de e-mail, recuperação automática de senha, identificação da empresa e canal de atendimento ainda precisam de conclusão operacional antes de vendas.

Dados locais em `%APPDATA%/GameForge`; credenciais no cofre do sistema. Recuperação: `gameforge.exe --restore-system-last`, `--restore-obs-last` ou `--restore-last`. Nunca execute comandos livres produzidos pela IA. Consulte [progresso](docs/progress.md), [SDD](docs/SDD.md) e [instalação](docs/INSTALACAO.md).


Desktop beta 0.6: [Windows x64 e macOS universal](https://github.com/infinitytec15/desktop-gamer-ia/releases/tag/v0.6.0). O site é vitrine e gestão de conta, planos, créditos, chaves e downloads; as ferramentas ficam no aplicativo. Quick Boost tem quatro ajustes exclusivos do Windows; no Mac, use os módulos compatíveis indicados na interface. Consulte docs/INSTALACAO.md para assinatura, requisitos e limites reais.
