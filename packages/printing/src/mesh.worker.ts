import { parseStl } from "./mesh.js";
self.onmessage = async (
  event: MessageEvent<{ buffer: ArrayBuffer; unit: "mm" | "inch" }>,
) => {
  try {
    const mesh = parseStl(event.data.buffer, event.data.unit);
    const hash = await crypto.subtle.digest("SHA-256", event.data.buffer);
    const sha256 = Array.from(new Uint8Array(hash))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    self.postMessage(
      { mesh: { ...mesh, geometry: { ...mesh.geometry, sha256 } } },
      { transfer: [mesh.positions.buffer] },
    );
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "Não foi possível ler o STL",
    });
  }
};
