/**
 * A dependency-free PDF writer for statements: Helvetica text on A4 pages,
 * deterministic bytes for the same lines (OWN-1 byte-identical regeneration).
 * Non-WinAnsi characters are replaced; the portal shows the live statement anyway.
 */
export function textPdf(
  lines: readonly string[],
  opts: { title: string } = { title: "Statement" },
): Uint8Array {
  const PER_PAGE = 58;
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(1, lines.length); i += PER_PAGE)
    pages.push(lines.slice(i, i + PER_PAGE));
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add(""); // placeholder 1
  const pagesObj = add(""); // placeholder 2
  const font = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const mono = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  );
  const pageIds: number[] = [];
  pages.forEach((pageLines, pi) => {
    const ops: string[] = ["BT", "/F1 11 Tf", "13 TL", "40 800 Td"];
    if (pi === 0) ops.push(`/F1 16 Tf (${esc(opts.title)}) Tj /F1 11 Tf T* T*`);
    for (const l of pageLines) {
      const monoLine = /^\s*[-+]?\d|^[ ]{2,}/.test(l) || /\s{2,}[-+]?[\d.,]+\s*[A-Z]{3}$/.test(l);
      ops.push(`${monoLine ? "/F2 9 Tf" : "/F1 10 Tf"} (${esc(l)}) Tj T*`);
    }
    ops.push(`/F1 8 Tf 0 -10 Td (Page ${String(pi + 1)} of ${String(pages.length)}) Tj`, "ET");
    const stream = ops.join("\n");
    const content = add(
      `<< /Length ${String(byteLength(stream))} >>\nstream\n${stream}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${String(pagesObj)} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${String(font)} 0 R /F2 ${String(mono)} 0 R >> >> /Contents ${String(content)} 0 R >>`,
      ),
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${String(pagesObj)} 0 R >>`;
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(" ")}] /Count ${String(pageIds.length)} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(byteLength(out));
    out += `${String(i + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = byteLength(out);
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root ${String(catalog)} 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return latin1(out);
}

function esc(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (ch === "(" || ch === ")" || ch === "\\") return `\\${ch}`;
      if (c < 32 || c > 255) return c === 0x2192 ? "->" : c === 0x20ac ? "\\200" : "?";
      return ch;
    })
    .join("");
}
const byteLength = (s: string): number => latin1(s).length;
function latin1(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

export const pdfDataUri = (bytes: Uint8Array): string =>
  `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
