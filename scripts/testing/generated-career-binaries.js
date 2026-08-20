const encoder = new TextEncoder();

/** Creates a minimal one-page PDF entirely in memory. Empty text produces a scan-like no-text document. */
export function createGeneratedPdf(text = "") {
  const safeText = text.replace(/([\\()])/gu, "\\$1");
  const stream = text ? `BT\n/F1 12 Tf\n72 720 Td\n(${safeText}) Tj\nET` : "q\nQ";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(source).byteLength);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(source);
}

/** Creates the OLE signature and EncryptedPackage label used by protected DOCX containers. */
export function createGeneratedEncryptedDocxContainer() {
  const signature = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const label = "EncryptedPackage";
  const encodedLabel = new Uint8Array(label.length * 2);
  for (let index = 0; index < label.length; index += 1) encodedLabel[index * 2] = label.charCodeAt(index);
  return concatBytes([signature, encodedLabel]);
}

/** Creates a ZIP-signature payload that passes file sniffing but is not a valid DOCX archive. */
export function createGeneratedCorruptDocx() {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0xff, 0x00, 0x13, 0x37]);
}

/** Creates a browser-like file without allocating the declared oversized payload. */
export function createVirtualFile(name, bytes, declaredSize = bytes.byteLength) {
  return {
    name,
    size: declaredSize,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function concatBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}
