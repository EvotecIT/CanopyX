import zlib from "node:zlib";

// Reads one entry of a generated workbook and the painted text runs of a generated PDF, without another library.
export function zipEntry(bytes, name) {
  const zip = Buffer.from(bytes), end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  for (let at = zip.readUInt32LE(end + 16), index = 0; index < zip.readUInt16LE(end + 10); index++) {
    const length = zip.readUInt16LE(at + 28), local = zip.readUInt32LE(at + 42);
    if (zip.toString("utf8", at + 46, at + 46 + length) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28), data = zip.subarray(start, start + zip.readUInt32LE(at + 20));
      return (zip.readUInt16LE(at + 10) === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    }
    at += 46 + length + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  throw new Error("Missing workbook entry " + name);
}
function pdfStreams(bytes) {
  return [...Buffer.from(bytes).toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)].flatMap(match => {
    try { return [zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1")]; } catch { return []; }
  });
}
export function pdfRuns(bytes) {
  return pdfStreams(bytes).flatMap(content => [...content.matchAll(/([-\d.]+) [-\d.]+ Tm <([a-f0-9]*)> Tj/g)].map(run => ({ x: Number(run[1]), text: Buffer.from(run[2], "hex").toString("latin1") })));
}
/** The distinct RGB fill colours a PDF sets, as "r g b" strings. */
export function pdfFillColours(bytes) {
  return [...new Set(pdfStreams(bytes).flatMap(content => [...content.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)].map(match => match.slice(1, 4).join(" "))))];
}
