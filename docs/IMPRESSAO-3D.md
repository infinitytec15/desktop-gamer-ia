# Impressão 3D — beta 0.4

Disponível em **Impressão 3D** no desktop e painel do usuário e na página pública `/impressao-3d`. O módulo planeja e exporta cópias para revisão. Não controla a impressora, não inicia impressão e não substitui um fatiador.

## Impressoras e materiais

O catálogo reúne 166 nomes de modelos FDM: Bambu Lab (15), Creality (59), Flashforge (9), Elegoo (18), Anycubic (21), Prusa (18), Qidi (13) e Sovol (13). São nomes encontrados nos catálogos públicos dos fornecedores, com fontes em `packages/printing/src/printers.ts`; não representam 166 combinações de hardware/material homologadas. As listas são sugestões editáveis. A opção Outra permite informar modelos adicionais.

Para resina, existem famílias Elegoo Mars/Saturn/Jupiter, Anycubic Photon, Phrozen Sonic, Formlabs Form e Creality Halot, além do modelo personalizado. SLA, MSLA e DLP têm orientação de processo; seus parâmetros não são intercambiáveis. PreForm usa somente orientação de processo e perfis oficiais, sem converter segundos para energia de exposição.

Os valores iniciais da tela são exemplos. Marca/modelo não preenchem limites térmicos automaticamente. Confirme volume útil, bico, temperaturas e vazão com fabricante e calibração do material. Para resina temporizada, informe a temperatura real da resina, a camada e faixa de exposição já calibradas e limites de movimento; velocidades são **mm/min**, não mm/s. Equipamentos com movimentos em dois estágios exigem conferir cada estágio no software original.

## Fluxo

1. Escolha tecnologia, marca/modelo, fatiador, material, objetivo e problema. Informe os parâmetros atuais e limites reais e confirme a conferência.
2. Opcionalmente, selecione STL binário/ASCII de até 20 MiB e 200 mil triângulos. Escolha mm/polegadas antes de carregar. Análise e prévia ocorrem localmente em worker/Three.js: dimensões, área, bordas, triângulos degenerados e volume somente quando a topologia permite. A rotação exporta uma cópia STL em milímetros, sem alterar o arquivo original. 3MF/OBJ devem ser exportados como STL no CAD/fatiador.
3. Planeje localmente, sem créditos, ou revise os dados mostrados e autorize IA. Apenas o cenário e as métricas opcionais vão ao proxy; o STL e o preset não são enviados. A IA exige conta/licença válida, saldo e provedor configurado pelo operador. Claude é primário; fallback OpenAI depende da opção marcada e também pode consumir créditos.
4. Compare atual/proposto, justificativas e testes de calibração. Aceite a revisão para liberar relatório JSON, CSV e cópia STL. Isso registra revisão, não comprovação de impressão bem-sucedida.
5. Para fatiadores com adaptador, **duplique o preset no próprio fatiador**, exporte essa cópia e carregue-a. Confira a diferença campo a campo antes de baixar o arquivo alterado. Também é possível baixar o original e o relatório de alterações/hash. Metadados e nome interno são preservados: a importação pode substituir a cópia de mesmo nome; não importe sobre seu preset principal.
6. Importe no software original, confira os campos efetivamente alterados, compatibilidade com impressora/bico, camadas, margens, suportes e tempo estimado. Faça uma amostra calibrada antes de um lote.

## Compatibilidade por formato

| Fatiador | Entrega da beta | Limite |
| --- | --- | --- |
| Bambu Studio, OrcaSlicer, Creality Print moderno, Orca-Flashforge, ElegooSlicer | Cópia de preset individual JSON de processo ou filamento | Apenas campos conhecidos já presentes. Preserva herança, formato escalar/lista simples, metadados e campos desconhecidos. Sem bundles ou perfil de máquina. |
| UltiMaker Cura | Cópia `.curaprofile` ZIP com containers INI preservados | Apenas chaves conhecidas na seção de valores; não é um INI renomeado. |
| PrusaSlicer / SuperSlicer | Cópia de configuração INI simples | Não aceita bundles de impressora física. Preserva velocidades percentuais, fórmulas e campos não suportados. |
| FlashPrint / Creality legado / outro FDM | Tabela, relatório e sequência de calibração | Aplicação manual no software. |
| CHITUBOX / Lychee / Photon Workshop / outro de resina | Tabela de exposição/movimento e relatório | Não escreve formatos proprietários, arquivos fatiados nem suportes. |
| Formlabs PreForm | Recomendações de processo | Perfil/material oficial, sem valores numéricos inventados de exposição/movimento. |

JSON separa processo e filamento: temperatura requer exportar o filamento, enquanto velocidades/camadas ficam no processo. A mesa da família Orca requer selecionar a superfície correta. Campos ausentes/herdados, fórmulas e listas de múltiplos extrusores são preservados e apresentados como ignorados. **A tabela de diferenças do arquivo define o que a cópia realmente muda**; os demais valores do plano exigem conferência/aplicação no fatiador. Não se presume que todo parâmetro foi escrito no preset.

## Segurança e evidências

O app nunca executa G-code, scripts, macros ou caminhos vindos da IA/perfil. Campos desconhecidos, inclusive G-code do arquivo original, são preservados como dados. O adaptador rejeita categorias de máquina e campos aparentes de credenciais; não importe bundles com segredos. ZIPs e arquivos têm limites e não são extraídos no disco. No desktop, a exportação grava somente arquivos novos em `%APPDATA%/GameForge/exports`, com nome UUID, hash e registro no histórico; os fontes permanecem intactos. A recuperação consiste em descartar a cópia e manter/reimportar o original, cuja preservação é verificada nos testes.

Os números passam por validação compartilhada na UI e servidor: temperaturas/material, proporção camada/bico, vazão volumétrica, faixa de exposição e limites de movimento. Resina local preserva exposição/camada calibradas. Não há geração automática de suportes, reparo de malha, detecção completa de interseções/ilhas/sucção, otimização topológica nem cálculo de resistência. Volume geométrico não é consumo de material e não considera preenchimento, suportes ou contração. A caixa da peça não inclui brim/suportes.

Testes automatizados cobrem contratos, formatos, preservação de originais, topologia STL, exportação, interface, acesso e contabilização. **Importação nos executáveis reais dos fatiadores, impressão física, parâmetros específicos de cada modelo/material e chamada paga aos provedores ainda exigem homologação.** Os testes de IA usam transporte controlado; não representam uma chamada real ao Claude/OpenAI.

## Fontes dos adaptadores

- [Bambu Studio: presets e parâmetros](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage).
- [OrcaSlicer: importação e exportação](https://github.com/OrcaSlicer/OrcaSlicer_WIKI/blob/main/general_settings/import_export.md).
- [Creality Print](https://github.com/CrealityOfficial/CrealityPrint), [Orca-Flashforge](https://github.com/FlashForge/Orca-Flashforge), [ElegooSlicer](https://github.com/elegooofficial/ElegooSlicer).
- [Cura: implementação oficial do escritor ZIP](https://github.com/Ultimaker/Cura/blob/main/plugins/CuraProfileWriter/CuraProfileWriter.py).
- [Prusa: importação/exportação](https://help.prusa3d.com/article/how-to-import-and-export-custom-profiles-in-prusaslicer_382766).
- [CHITUBOX](https://docs.chitubox.com/en-US/chitubox/latest/configure-print-settings), [Lychee](https://doc.mango3d.io/), [PreForm](https://formlabs.com/software/preform/).
