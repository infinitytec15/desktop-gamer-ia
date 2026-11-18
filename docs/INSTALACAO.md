# Atualização 0.5 — UAC, roteamento e monitor

A versão atual é `target/release/bundle/nsis/GameForge AI_0.6.0_x64-setup.exe`, compilada com domínio e chave pública em `config/desktop-cloud.json`. Gere com `npm run installer`. A IA passa pelo serviço Cloud; ative a chave em Configurações → Licença. Veja [Railway e distribuição](CLOUD-RAILWAY.md). O módulo Impressão 3D analisa STL localmente e prepara planos/perfis para revisão. Consulte [compatibilidade e uso](IMPRESSAO-3D.md). A instalação 0.6 é por máquina e solicita UAC. Sem certificado, o aviso SmartScreen pode permanecer. Veja [segurança e assinatura](SEGURANCA-E-OPERACAO.md). O texto 0.2 abaixo é histórico da beta BYOK.

# Instalação Windows — GameForge AI beta

Pacote: `target/debug/bundle/nsis/GameForge AI_0.2.0_x64-setup.exe`.

1. Abra o instalador. A tela inicial explica o que o GameForge faz e os limites da beta.
2. Clique em **Avançar**, escolha a pasta de instalação e confirme a instalação para sua conta.
3. Ao concluir, mantenha marcadas **Criar atalho na área de trabalho** e **Executar GameForge AI** para continuar imediatamente.
4. Na primeira abertura, o guia oferece configurar conexões ou começar pelo diagnóstico offline.
5. Em **Configurações**, habilite notificações se desejar. No Windows a identificação correta dos avisos depende da instalação e das políticas do sistema.

O pacote inclui o logo existente do GameForge, banner, ícone do instalador/aplicativo/desinstalador, mensagens de boas-vindas e de conclusão em português, pasta no Menu Iniciar e desinstalador padrão Windows. O destino padrão é `%LOCALAPPDATA%/GameForge AI`. O instalador prepara o WebView2 quando necessário; nesse caso é preciso acesso aos servidores Microsoft.

A instalação não aplica ajustes no Windows e não inicia uma live. Essas etapas possuem revisão e autorização no aplicativo. A chave da IA é fornecida após a instalação e fica no cofre do sistema. O pacote beta ainda não possui assinatura Authenticode.

Para gerar novamente:

```powershell
npm ci
npm run installer
```

Não apagar os dados do aplicativo ao testar desinstalação caso existam snapshots que ainda precisem ser restaurados. O desinstalador padrão permite manter os dados; o usuário decide sobre a remoção.


## Desktop 0.6 e macOS

O site é vitrine e gestão de conta, planos, créditos, chaves e downloads. Execute diagnóstico, Quick Boost, impressão 3D e integração OBS pelo aplicativo. A rota pública de impressão descreve recursos e não analisa arquivos.

O workflow Package macOS beta gera um DMG universal para macOS 13+, Intel e Apple Silicon, com assinatura ad hoc. Não equivale a Developer ID/notarização: o macOS pode exigir autorização em Privacidade e Segurança. DESKTOP_MAC_DOWNLOAD_URL só deve apontar para um artefato gerado/verificado. Os quatro ajustes Quick Boost são exclusivos de Windows. Sensores e integrações têm cobertura específica por plataforma; build/teste CI não é homologação física de todos os recursos.


Pacotes 0.6 publicados: [Windows x64](https://github.com/infinitytec15/desktop-gamer-ia/releases/download/v0.6.0/GameForge-AI-0.6.0-x64-setup.exe) e [macOS universal](https://github.com/infinitytec15/desktop-gamer-ia/releases/download/v0.6.0/GameForge-AI-0.6.0-universal.dmg). Os manifestos SHA256SUMS.txt e SHA256SUMS-macos.txt estão no mesmo release. No Mac, abra o DMG e copie o aplicativo para Aplicativos; esta beta ainda não tem Developer ID/notarização. Após abrir, configure sua chave em Configurações → Licença. O build universal foi conferido em CI; uso físico em Mac e sensores específicos ainda depende de homologação.
