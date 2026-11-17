# GameForge Cloud 0.3

A infraestrutura do serviço web é declarada em `.railway/railway.ts`, com valores de variáveis preservados no Railway e sem gerenciar o ciclo de vida do PostgreSQL. O formato legado `railway.toml` foi migrado: a documentação atual informa desativação em 01/12/2026. Mudanças de infraestrutura usam `railway config plan` e depois `railway config apply --yes`, sempre revisando o plano. Adicione nomes de novas variáveis como `preserve()` antes de um apply; não inclua os segredos no arquivo. A fonte GitHub faz autodeploy de código em main, mas mudanças no IaC requerem apply pelo CLI.

O deploy usa um serviço Node 24 com Express, site React/Vite e PostgreSQL. Não requer disco persistente no serviço web. Sessões, licenças, carteira e fila de pagamentos são compartilhadas no banco.

## Projeto e acessos

- Workspace Railway: **Intra Pay**.
- Projeto: `gameforge-ai` (`2a746c39-c8df-4688-bc9b-604b0c09c5b1`).
- Serviços: `gameforge-web` e `Postgres`.
- Origem prevista: `https://gameforge-web-production.up.railway.app`.
- Admin: `/admin/login`; conta do cliente: `/login` e `/cadastro`.

As variáveis internas são geradas por `scripts/cloud-setup.mjs`, que preserva valores existentes e envia segredos por stdin. A senha administrativa aleatória fica somente no Railway. Abra **gameforge-web → Variables** para definir seu `ADMIN_EMAIL` e sua `ADMIN_PASSWORD` (mínimo 16 caracteres). Não envie essas credenciais pelo chat nem faça commit de arquivos `.env`.

## Variáveis que o operador deve preencher

| Variável | Finalidade |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Login do painel administrativo; trocar a senha invalida sessões de admin |
| `MP_ACCESS_TOKEN` | Token da aplicação Mercado Pago correspondente ao ambiente |
| `MP_WEBHOOK_SECRET` | Segredo de assinatura das notificações; diferente do access token |
| `MP_COLLECTOR_ID` | ID do vendedor que deve receber os pagamentos |
| `MP_LIVE_MODE` | `false` em testes; `true` para pagamentos reais |
| `BILLING_ENABLED` | Manter `false` até homologar os cenários abaixo; usar `true` para abrir vendas |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Credenciais de IA, ou cadastrar no cofre pelo admin |
| `DESKTOP_DOWNLOAD_URL` | URL pública do instalador que corresponde ao domínio/chave pública atuais |

`DATABASE_URL` referencia `${{Postgres.DATABASE_URL}}`, pela rede privada. `SESSION_SECRET`, `LICENSE_PEPPER`, `PROVIDER_ENCRYPTION_KEY` e `LICENSE_PRIVATE_KEY` são gerados internamente. Preserve esses valores e faça backup seguro: alterar o pepper invalida hashes de licenças/tokens; alterar a chave de criptografia impede abrir as credenciais antigas; alterar a chave de assinatura exige migrar os instaladores. A chave privada aceita PEM com quebras de linha ou `\n` literais.

`DB_POOL_MAX=12` limita conexões por réplica; `WORKER_ENABLED=true` processa notificações. `PORT=8080` e health check `/api/health` estão configurados. `.env.example` documenta todos os campos.

## Mercado Pago

Cadastre a URL `https://gameforge-web-production.up.railway.app/api/webhooks/mercadopago` na aplicação do gateway. Habilite `subscription_preapproval`, `subscription_authorized_payment` e `payment`. A notificação precisa trazer `data.id` na query, `x-signature` e `x-request-id`.

Assinaturas usam `/preapproval` sem plano associado, com checkout hospedado e valores reconstruídos a partir do banco. Autorizar o contrato e voltar ao site **não** liberam a licença. O worker consulta fatura e pagamento oficiais, confere vendedor, ambiente, BRL, preço e referência; só `approved/accredited` sem estorno concede o período e os créditos. Recargas usam Checkout Pro, conferem também a merchant order e não estendem a licença.

A fila é persistida antes do ACK e usa `FOR UPDATE SKIP LOCKED`, retries e deduplicação. O admin permite reprocessar eventos e sincronizar assinaturas/recargas. Uma criação com resultado inconclusivo fica bloqueada para evitar nova cobrança; no admin, informe o ID do contrato e o servidor verificará a referência externa antes de vinculá-lo. Recargas inconclusivas exigem localizar o pagamento e usar a sincronização. Não tente comprar repetidamente enquanto uma operação estiver inconclusiva.

`MP_CANCEL_STATUS=cancelled` segue o SDK oficial; ambos `canceled`/`cancelled` são normalizados na leitura. Só registrar cancelamento depois da confirmação do gateway. O período pago continua válido. Homologue com as credenciais/contas adequadas: primeiro pagamento, renovação, pendência, recusa, cancelamento, estorno, contestação, topup, assinatura/recarga duplicada e reenvio de webhook. **Não foram feitas cobranças reais durante o desenvolvimento.**

## Licença e instalador

1. Atualize os dados públicos de build com `npm run cloud:sync-desktop`, usando o CLI Railway autenticado.
2. Confira `config/desktop-cloud.json`: contém somente origem e chave pública, sem segredo.
3. Execute `npm run installer` no Windows. Saída: `target/release/bundle/nsis/GameForge AI_0.3.0_x64-setup.exe`.
4. Publique o artefato e configure `DESKTOP_DOWNLOAD_URL`.

O Rust valida assinatura Ed25519, emissor, dispositivo, público, validade e catálogo de direitos. A ativação guarda token e envelope no cofre do SO; a chave fornecida pelo usuário não é persistida. A IA passa pelo proxy com saldo de créditos, sem expor chaves dos provedores. Recursos de sistema/OBS exigem licença; diagnóstico e desfazer permanecem locais. Offline, a validade máxima é **24 horas**. Revogação não pode ser instantânea em um computador desconectado.

Mudança de domínio ou de chave de assinatura exige novo instalador. Builds sem configuração não ativam recursos licenciados. O instalador atual não possui certificado comercial Authenticode nem atualizador automático; trate o aviso do Windows e distribua a versão identificada pelo hash. Não executar otimizações para testar a instalação sem revisar o plano e a restauração.

## Concorrência e capacidade

- Estado compartilhado em PostgreSQL; sem sessões ou filas dependentes de uma instância Node.
- Limites de dispositivos, concessões de crédito e reservas usam transações/bloqueios. Carteira em inteiros de microcréditos e extrato auditável.
- Até três análises simultâneas por carteira, rate limits no banco, payloads limitados e timeout de provedor. Não há promessa de usuários ilimitados.
- Pode aumentar réplicas mantendo a soma de pools abaixo do limite do PostgreSQL. Com duas réplicas de pool 12, reserve ao menos 24 conexões mais administração/migrações. Fila compartilhada evita processar o mesmo item em paralelo; conciliação e concessões são idempotentes.
- Primeiro deploy usa uma réplica para não criar despesa de capacidade ociosa. Escale pelo Railway após medir CPU, memória, conexões, latência p95 e limites dos provedores. Não simule capacidade de produção com contadores na interface.
- Usuários, assinaturas, licenças e eventos têm busca no servidor e paginação de 50 registros. Recargas mostram as 200 compras recentes; sincronização pelo ID de compra também está disponível na API. Backup do Postgres, retenção, alertas e exercício de restauração são responsabilidades operacionais; configure no Railway antes de vendas.

## Desenvolvimento e testes

```powershell
npm ci
npm run build:cloud
# PostgreSQL local isolado, somente dados de teste:
docker run --name gameforge-test-pg --rm -d -e POSTGRES_PASSWORD=gameforge_test_only -e POSTGRES_DB=gameforge -p 127.0.0.1:55432:5432 postgres:17-alpine
$env:TEST_DATABASE_URL='postgresql://postgres:gameforge_test_only@127.0.0.1:55432/gameforge'
npm run api:test
node services/api/scripts/dev-bootstrap.mjs
node --env-file=.env.local services/api/dist/server.js
# Em outro terminal:
npm run e2e:web
```

O bootstrap local gera um `.env.local` ignorado pelo Git e usa credenciais de teste (`admin@example.test`, `fixture-admin-password-123`). Nunca use essas credenciais em produção. Os testes de API usam transporte de gateway/IA simulado e PostgreSQL real. As telas E2E usam a API local real. O site público e os painéis não apresentam dados fictícios em produção.

Os textos de termos/privacidade descrevem a operação beta, mas ainda exigem identificação da empresa e canal de atendimento do operador antes de abrir vendas. Recuperação automática de senha e verificação de e-mail não foram implementadas nesta versão.

## Fontes oficiais

- [Assinaturas sem plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments).
- [Webhooks Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks).
- [Checkout Pro](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post).
- [Health checks Railway](https://docs.railway.com/deployments/healthchecks).


### CLI de infraestrutura no Windows

O SDK consulta o binário nativo para conferir a versão. Se ocorrer erro de versão apesar do CLI atualizado, acrescente o diretório nativo ao PATH somente para esta sessão:

```powershell
$taskRailwayBin = Join-Path (npm root -g) "@railway/cli/bin"
$env:PATH = "$taskRailwayBin;" + $env:PATH
railway config plan
```

[Documentação oficial IaC](https://docs.railway.com/infrastructure-as-code). O plano aplicado nesta entrega preservou variáveis, GitHub e Postgres, modificando somente build, health check e política de reinício.
