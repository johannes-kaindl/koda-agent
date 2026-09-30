/** Der Name, den das Modell an `load_skill` uebergibt — geprueft, bevor er einen Pfad wird.
 *  `.md` ist optional; ein Trenner oder `..` heisst „kein Skill-Name" und wird abgelehnt,
 *  nicht bereinigt: geraten wird hier nichts (Vorbild `resolveNotePath`). `null` = abgelehnt. */
export function cleanSkillRef(raw: string): string | null {
  const name = raw.trim().replace(/\.md$/i, "").trim();
  if (name === "" || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  return name;
}
