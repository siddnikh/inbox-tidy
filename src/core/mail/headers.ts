const ENCODED_WORD = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;

function decodeWord(charset: string, encoding: string, text: string): string {
  let bytes: Uint8Array;
  if (encoding.toUpperCase() === "B") {
    bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } else {
    const raw = text.replace(/_/g, " ");
    const out: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const hex = raw.slice(i + 1, i + 3);
      if (raw[i] === "=" && /^[0-9a-fA-F]{2}$/.test(hex)) {
        out.push(Number.parseInt(hex, 16));
        i += 2;
      } else {
        out.push(raw.charCodeAt(i) & 0xff);
      }
    }
    bytes = Uint8Array.from(out);
  }
  // RFC 2231 allows a language suffix: "UTF-8*en".
  return new TextDecoder(charset.split("*")[0]).decode(bytes);
}

// RFC 2047 encoded words. Whitespace between two adjacent encoded words is not part of the text.
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/(=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bBqQ]\?)/g, "$1")
    .replace(ENCODED_WORD, (match, charset: string, encoding: string, text: string) => {
      try {
        return decodeWord(charset, encoding, text);
      } catch {
        return match;
      }
    });
}

// Parses a raw header block (as returned for a HEADER.FIELDS fetch) into lowercased names.
// Continuation lines are unfolded; the first occurrence of a repeated header wins.
export function parseHeaderBlock(block: Buffer | string | null | undefined): Map<string, string> {
  const headers = new Map<string, string>();
  if (!block) return headers;
  const text = typeof block === "string" ? block : block.toString("utf8");
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = decodeEncodedWords(line.slice(colon + 1).trim());
    if (name && !headers.has(name)) headers.set(name, value);
  }
  return headers;
}
