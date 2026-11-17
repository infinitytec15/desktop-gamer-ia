# Fase 1 — diagnóstico

Coleta nativa via sysinfo, sem shell: CPU, memória, discos, top 8 processos por RAM e sensores que o SO disponibiliza. Métricas indisponíveis ficam ausentes. Comando assíncrono para não bloquear a UI. Últimos 20 relatórios no SQLite local. Tipos TypeScript gerados a partir do Rust via ts-rs.

Aceite medido no Windows: coleta real em 211 ms, 16 núcleos lógicos, 31,9 GB RAM, 2 discos; zero sensores disponíveis. Não interpretar isso como ausência física de sensores.

Pendências para aceite integral do SDD: GPU, drivers, rede completa, monitores, SMART, XMP, pontuação explicável e matriz de hardware/OS. No macOS a coleta depende de execução do runner e testes reais.
