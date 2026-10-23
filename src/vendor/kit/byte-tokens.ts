// vendored from code-kit@0.34.0, src/ts/pure/byte-tokens.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Origin: koda-agent `src/core/tools/decode-byte-tokens.ts` (2026-10, n = 1; "the place from one is the library").
// Welle 22, Teil 2.

/** The result of {@link decodeByteTokens}. A failure names the run and the line, so a caller can word the message for its
 *  own reader (koda-agent sends it to the model as a tool error, in German); `error` is the same in English. */
export type ByteTokenResult =
  | { ok: true; text: string }
  | { ok: false; error: string; run: string; line: number };

/** Some local models write non-ASCII characters into their tool arguments as literal byte tokens
 *  (`<0xF0><0x9F><0x97><0x82>` instead of 🗂). Evidence: `_Koda/Skills/koda-start.md` and `koda-dashboard.md` in a user vault.
 *
 *  A run of such tokens is turned into bytes and read as **strict** UTF-8. If that fails (a truncated run, a lone
 *  continuation byte, an overlong or surrogate encoding) nothing is guessed: the call fails with the run and the line, because
 *  a silently repaired character would be an invented one. The caller hands the message back to the model, which can then
 *  correct the spot itself.
 *
 *  Only runs that contain a byte >= 0x80 are meant: there ASCII cannot be the intent. A run that would decode to ASCII only
 *  (`<0x0A>`, `<0x41>`) stays literal — it may stand in a note about hex tokens. ASCII tokens in front of the first byte
 *  >= 0x80 of a run stay as well; from there on everything is read.
 *
 *  Differs from koda-agent's version in two places: a byte order mark (`<0xEF><0xBB><0xBF>`) comes out as U+FEFF instead of
 *  being swallowed by `TextDecoder` (the character is in the output because the model wrote it); and a failure carries
 *  `run` and `line` besides the message. A run longer than 200 characters is cut with `…` in the message only.
 *
 *  @example decodeByteTokens("a <0xC3><0xA4>") // → { ok: true, text: "a ä" }
 *  @example decodeByteTokens("<0xF0><0x9F>")    // → { ok: false, run: "<0xF0><0x9F>", line: 1, error: … } */
export function decodeByteTokens(text: string): ByteTokenResult {
  // One decoder for the call: strict (`fatal`), and `ignoreBOM` so that U+FEFF stays in the output.
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let failure: { run: string; line: number } | undefined;
  const out = text.replace(/(?:<0x[0-9A-Fa-f]{2}>)+/g, (run: string, offset: number) => {
    if (failure !== undefined) return run;
    // Every token is six characters, `<0xNN>`.
    const count = run.length / 6;
    const bytes = new Uint8Array(count);
    let first = -1;
    for (let i = 0; i < count; i++) {
      const b = parseInt(run.slice(i * 6 + 3, i * 6 + 5), 16);
      bytes[i] = b;
      if (first < 0 && b >= 0x80) first = i;
    }
    if (first < 0) return run;
    try {
      return run.slice(0, first * 6) + decoder.decode(bytes.subarray(first));
    } catch {
      let line = 1;
      for (let i = text.indexOf("\n"); i !== -1 && i < offset; i = text.indexOf("\n", i + 1)) line++;
      failure = { run: run.slice(first * 6), line };
      return run;
    }
  });
  if (failure === undefined) return { ok: true, text: out };
  const shown = failure.run.length > 200 ? `${failure.run.slice(0, 200)}…` : failure.run;
  return {
    ok: false,
    run: failure.run,
    line: failure.line,
    error:
      `Invalid byte run ${shown} on line ${failure.line}: it does not form a complete UTF-8 character. ` +
      `Write the character itself or leave it out — nothing was written.`,
  };
}
