/** Wo Koda beim Oeffnen landet. Rein, damit die Wahl ohne Workspace testbar ist (`activateView` in `main.ts` setzt sie nur um).
 *  Entscheidung Johannes 2026-11-02, Welle 30: auf jedem Mobilgeraet als Tab im Hauptbereich. Unter der Schublade haengt Obsidians Tab-Auswahl, und der Chat endet gemessen rund 155 px ueber der Tastatur;
 *  im Hauptbereich reicht er bis an den Rand. Der Desktop bleibt in der rechten Seitenleiste. Ein schon geoeffneter Chat bleibt, wo er ist. */
export type ChatPlacement = "existing" | "tab" | "side";

export function chatPlacement(input: { hasExisting: boolean; isMobile: boolean }): ChatPlacement {
  if (input.hasExisting) return "existing";
  return input.isMobile ? "tab" : "side";
}
