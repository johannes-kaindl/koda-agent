/** Die Zeile unter `## Now` im System-Prompt und die Antwort von `get_datetime` — eine Quelle.
 *  Koda kennt sonst kein Datum und erfindet eines (Session-Logs `2026-10-01-*` am 29.09.).
 *
 *  Format: `2026-09-30 (Wednesday) 23:45, Europe/Berlin`. Der Wochentag ist englisch, weil der
 *  Prompt-Anhang nicht der Oberflaeche folgt; die Zeitzone kommt aus der Option, nicht aus `TZ`,
 *  damit Tests auf jedem Rechner dasselbe sagen. `ms` ist `ClockPort.now()`. */
export function renderNow(ms: number, timeZone?: string): string {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} (${get("weekday")}) ${get("hour")}:${get("minute")}, ${zone}`;
}
