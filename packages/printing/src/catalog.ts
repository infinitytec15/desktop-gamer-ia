export const slicers = [
  {
    id: "bambu",
    name: "Bambu Studio",
    technology: "fdm",
    adapter: "json",
    notes:
      "Cópia de preset .json de processo ou filamento. Reimporte e confira compatibilidade com impressora/bico.",
    source: "https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage",
  },
  {
    id: "orca",
    name: "OrcaSlicer",
    technology: "fdm",
    adapter: "json",
    notes:
      "Preset individual JSON. Bundles .orca_printer/.orca_filaments não são alterados.",
    source:
      "https://github.com/OrcaSlicer/OrcaSlicer_WIKI/blob/main/general_settings/import_export.md",
  },
  {
    id: "creality",
    name: "Creality Print (família Orca)",
    technology: "fdm",
    adapter: "json",
    notes:
      "JSON de processo/filamento da família Orca. Versões legadas usam orientação guiada.",
    source: "https://github.com/CrealityOfficial/CrealityPrint",
  },
  {
    id: "orca_flashforge",
    name: "Orca-Flashforge",
    technology: "fdm",
    adapter: "json",
    notes:
      "Preset individual JSON da família Orca. Não equivale ao formato do FlashPrint.",
    source: "https://github.com/FlashForge/Orca-Flashforge",
  },
  {
    id: "elegoo",
    name: "ElegooSlicer (família Orca)",
    technology: "fdm",
    adapter: "json",
    notes:
      "Cópia de preset JSON de processo/filamento. Campos herdados ausentes são preservados; confirme no software.",
    source: "https://github.com/elegooofficial/ElegooSlicer",
  },
  {
    id: "cura",
    name: "UltiMaker Cura",
    technology: "fdm",
    adapter: "cura",
    notes:
      "Cópia do ZIP .curaprofile, preservando containers e metadados. Requer perfil exportado pelo Cura.",
    source:
      "https://github.com/Ultimaker/Cura/blob/main/plugins/CuraProfileWriter/CuraProfileWriter.py",
  },
  {
    id: "prusa",
    name: "PrusaSlicer / SuperSlicer",
    technology: "fdm",
    adapter: "ini",
    notes:
      "Configuração .ini simples, sem bundle de impressoras físicas ou credenciais.",
    source:
      "https://help.prusa3d.com/article/how-to-import-and-export-custom-profiles-in-prusaslicer_382766",
  },
  {
    id: "flashprint",
    name: "FlashPrint",
    technology: "fdm",
    adapter: "guided",
    notes:
      "Ajustes guiados. Arquivos proprietários não são gerados sem schema/homologação.",
    source: "https://www.flashforge.com/download-center",
  },
  {
    id: "chitubox",
    name: "CHITUBOX",
    technology: "resin",
    adapter: "guided",
    notes:
      "Aplicação guiada nos campos de exposição e movimento. Não geramos .cfgx/.cfg ou arquivos fatiados.",
    source:
      "https://docs.chitubox.com/en-US/chitubox/latest/configure-print-settings",
  },
  {
    id: "lychee",
    name: "Lychee Slicer",
    technology: "resin",
    adapter: "guided",
    notes:
      "Relatório guiado; presets .lyr/.lyp são proprietários e não são reescritos.",
    source: "https://doc.mango3d.io/",
  },
  {
    id: "photon",
    name: "Anycubic Photon Workshop",
    technology: "resin",
    adapter: "guided",
    notes:
      "Confira os campos na versão instalada. Não geramos arquivo de impressão nem comandos para a máquina.",
    source: "https://www.anycubic.com/pages/firmware-software",
  },
  {
    id: "preform",
    name: "Formlabs PreForm",
    technology: "resin",
    adapter: "guided",
    notes:
      "Use material e perfil oficial. Exposição em energia (mJ/cm²) não é convertida de segundos; ajustes numéricos de exposição/movimento ficam desabilitados.",
    source: "https://formlabs.com/software/preform/",
  },
  {
    id: "other_fdm",
    name: "Outro fatiador FDM",
    technology: "fdm",
    adapter: "guided",
    notes:
      "Tabela de parâmetros e sequência de calibração para aplicar manualmente.",
    source: "",
  },
  {
    id: "other_resin",
    name: "Outro fatiador de resina",
    technology: "resin",
    adapter: "guided",
    notes:
      "Use a ficha técnica e confirme unidades no software. Sem exportação proprietária.",
    source: "",
  },
] as const;
export type SlicerId = (typeof slicers)[number]["id"];
export function slicer(id: string) {
  const result = slicers.find((s) => s.id === id);
  if (!result) throw new Error("Fatiador desconhecido");
  return result;
}
