# Fase 2 — persistência e recuperação

Migrar o diário de snapshots do JSON único para SQLite com id, ordem de inserção, data e payload. SQLite synchronous=FULL; snapshot pendente confirmado antes de qualquer escrita. Guardar preferências em arquivo com escrita atômica. Bloqueio de arquivo entre processos e mutex no processo Tauri. Estados pending/applied/restored, verificação integral antes de restaurar.

Migração automática do snapshot JSON antigo; tipos compartilhados gerados; no máximo 100 registros listados por consulta, sem apagar snapshots antigos. Desfazer por id é permitido somente quando o estado atual coincide com before ou after do snapshot. Snapshots pendentes bloqueiam nova aplicação.

Testes: migração legada, roundtrip, ordem inversa, conflito externo, interrupção, ações duplicadas e operação concorrente. Não alterar configurações da máquina de desenvolvimento para testar.

Pendências: catálogo do SO, helper elevado, Ponto de Restauração, recuperação de lotes heterogêneos e teste real em ambiente isolado. O adaptador atual altera apenas preferências do GameForge e não constitui otimizador de sistema.
