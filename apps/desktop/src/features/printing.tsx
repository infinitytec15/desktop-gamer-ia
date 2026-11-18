import {
  PrintWorkbench,
  type PrintingAiInput,
  type SaveArtifact,
} from "@gameforge/printing/react";
import "@gameforge/printing/style.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
async function generateAi(input: PrintingAiInput) {
  if (!isTauri())
    throw new Error(
      "Abra o aplicativo desktop e ative sua licença para usar a IA. O planejamento local continua disponível.",
    );
  return invoke("printing_ai", { input });
}
const nativeSave: SaveArtifact = async (name, bytes) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return invoke<string>("save_print_artifact", {
    name,
    base64Data: btoa(binary),
  });
};
export default function PrintingPage() {
  return (
    <PrintWorkbench
      generateAi={generateAi}
      saveArtifact={isTauri() ? nativeSave : undefined}
    />
  );
}
