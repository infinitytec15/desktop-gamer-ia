# Atualização 0.5 — UAC, roteamento e monitor

A versão atual é `target/release/bundle/nsis/GameForge AI_0.5.0_x64-setup.exe`, compilada com domínio e chave pública em `config/desktop-cloud.json`. Gere com `npm run installer`. A IA passa pelo serviço Cloud; ative a chave em Configurações → Licença. Veja [Railway e distribuição](CLOUD-RAILWAY.md). O módulo Impressão 3D analisa STL localmente e prepara planos/perfis para revisão. Consulte [compatibilidade e uso](IMPRESSAO-3D.md). A instalação 0.5 é por máquina e solicita UAC. Sem certificado, o aviso SmartScreen pode permanecer. Veja [segurança e assinatura](SEGURANCA-E-OPERACAO.md). O texto 0.2 abaixo é histórico da beta BYOK.

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
