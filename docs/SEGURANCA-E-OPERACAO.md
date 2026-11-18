# Operação e segurança — 0.5

## Chaves e acesso

No admin → Integrações, campos de chave são somente de gravação. Salvar substitui a credencial; campos de Mercado Pago em branco mantêm o valor anterior. A API devolve presença/estado, nunca a chave ou seus últimos caracteres. Não coloque tokens em VITE_*, arquivos versionados, logs, screenshots ou descrições de chamados.

O cofre usa AES-256-GCM, IV aleatório de 12 bytes, tag de autenticação e AAD vinculada ao provedor/integração. `PROVIDER_ENCRYPTION_KEY` permanece separada no ambiente Railway. Snapshots também são cifrados; restauração é transacional e auditada. Registros legados ainda são legíveis. Não troque a chave de criptografia sem recriptografar o cofre e os snapshots com procedimento próprio; perder a chave impede a recuperação das credenciais salvas.

Segredos de infraestrutura (banco, sessão, assinatura Ed25519, pepper e chave do cofre) continuam no Railway, fora do navegador e do instalador. Senhas são hashes scrypt com salt individual; chaves de licença e tokens de sessão/dispositivo são hashes HMAC. A chave de licença completa aparece uma vez no fluxo autorizado de criação, pois o cliente precisa ativar o desktop. Não existe função de revelar segredos de provedores já salvos.

Rotas administrativas exigem sessão admin; as de conta conferem titularidade; desktop usa token de dispositivo/licença. Sessões de produção usam cookie HttpOnly/Secure/SameSite e mutations web validam Origin. Webhook usa assinatura HMAC ligada a ID, request ID e timestamp; autorização de checkout não concede crédito. Erros retornam mensagens fixas/nomes de campos, sem pilhas, SQL, corpo do provedor ou chave. API sem cache; CSP/Helmet, limites de payload, rate limit compartilhado em PostgreSQL e limites de análises por carteira.

Essas medidas reduzem riscos; não são garantia de invulnerabilidade. Mantenha dependências, backups com teste de restauração, acesso Railway/GitHub com MFA, contas de operador restritas e rotação de segredos expostos. Não desative antivírus, UAC ou SmartScreen para distribuir o app.

## Mercado Pago

Salve access token, segredo de assinatura do webhook e ID do vendedor. Public key é opcional para Checkout Pro por redirecionamento. Escolha ambiente de produção separadamente de **Habilitar novas assinaturas e recargas**. Salvar chaves não ativa vendas automaticamente. O teste de token/vendedor apenas consulta `/users/me`; não cria cobrança e não homologa todo o gateway.

Copie a URL mostrada no painel (`APP_URL/api/webhooks/mercadopago`) e configure no Mercado Pago eventos de assinaturas e pagamentos. Homologue confirmação canônica, reenvio, cancelamento, reembolso e chargeback antes de ativar cobrança. O serviço/worker carrega a configuração cifrada atual; não precisa redeploy para trocar uma credencial do cofre. Chaves do cofre têm precedência sobre as do ambiente.

Concessões manuais são acesso administrativo, sem pagamento ou renovação Mercado Pago. Admin informa prazo e créditos concedidos uma vez. Alterar prazo/plano não concede créditos outra vez; ajustes de saldo têm motivo e extrato. Revogação cancela as chaves vinculadas. Bloqueio impede novas operações online; o cache offline já assinado pode durar até 24h. Remoção de acesso revoga sessões/dispositivos e anonimiza cadastro, preservando registros financeiros. Contratos Mercado Pago abertos bloqueiam a remoção até cancelamento/conferência, para evitar cobrar sem conceder acesso.

## Roteamento de IA e orçamento

O admin escolhe modelos de uma lista com preços conhecidos; clientes escolhem modo e esforço, sem controlar preço, endpoint ou limite arbitrário. O padrão novo usa Luna/Haiku no Econômico, Terra/Sonnet no Equilibrado e Opus/Sol no Avançado. Clientes antigos sem opções continuam no modo Avançado. Só provedores configurados são considerados e fallback depende de consentimento.

A estimativa é aproximada, não uma cobrança antecipada definitiva. A reserva é conservadora, inclui entrada, saída e fallback autorizado; um hash vincula os dados/contrato/roteamento ao orçamento apresentado. Mudanças exigem atualizar a estimativa. Mais esforço aumenta o limite de saída/raciocínio, pode usar mais tokens e não garante uma resposta melhor. O extrato usa o usage real por modelo; saldo reservado não utilizado volta. Transporte inconclusivo depois do envio é identificado para conferência; não se anuncia como consumo medido. O modelo não executa comandos nem altera livremente o sistema.

## Instalador e SmartScreen

O instalador 0.5 usa instalação por máquina e solicita elevação UAC. O aplicativo não precisa ficar elevado para uso diário; ajustes privilegiados continuam no helper com catálogo e restauração. Se já houver beta instalada por usuário, confira a versão e preserve dados/snapshots antes de substituir a instalação.

Sem certificado comercial, esta entrega é beta não assinada. SmartScreen verifica reputação/editor e pode continuar alertando. UAC não substitui essa verificação; até uma assinatura válida pode precisar adquirir reputação. [Explicação oficial Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

Para assinar, instale um certificado de code signing válido e sua chave privada no repositório de certificados do Windows do usuário que faz o build, ou prepare um serviço de assinatura com a cadeia exigida pela Microsoft. Não use certificado autoassinado como se fosse editor publicamente confiável. [Opções oficiais](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).

```powershell
$env:GF_SIGNING_CERT_THUMBPRINT='THUMBPRINT_PUBLICO_DE_40_HEXADECIMAIS'
$env:GF_REQUIRE_SIGNING='true'
npm run installer
```

O script passa ao Tauri apenas thumbprint/digest/timestamp, sem exportar a chave privada. Verifica assinatura do instalador ao terminar e falha se não for válida. Sem `GF_SIGNING_CERT_THUMBPRINT`, gera beta não assinada explicitamente identificada. `GF_REQUIRE_SIGNING=true` bloqueia esse build sem certificado. Segredos e senhas de certificado não são argumentos ou arquivos do repositório. O pipeline do updater é outro mecanismo e ainda não foi implementado.

## Monitor local

CPU/RAM/núcleos/frequência, swap, tráfego e volumes vêm de sysinfo. GPU NVIDIA vem de NVSMI em caminho do sistema; WDDM é fallback Windows para utilização do motor mais ocupado e VRAM usada, sem inventar temperatura ou total de memória. Temperaturas adicionais podem vir de sysinfo ou do provedor WMI do LibreHardwareMonitor já disponível. Não se instala driver nem se ganha acesso a todos os sensores por executar como admin. [NVIDIA NVSMI](https://docs.nvidia.com/deploy/nvidia-smi/index.html).

Comandos de leitura são constantes, sem interpolação de texto do usuário/IA, sem janela e com timeout; não rodam na thread da interface. Gráficos usam timestamps reais, pausam quando a janela está oculta e deixam lacunas para ausências. Tráfego soma interfaces e não equivale a teste de velocidade da internet. Leituras do monitor não são enviadas aos provedores de IA.
