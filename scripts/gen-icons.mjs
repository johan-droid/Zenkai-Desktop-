// Generates resources/icon.png, resources/icons/* (linux), icon.ico, icon.icns
// from one design function — run: node scripts/gen-icons.mjs
import fs from "node:fs";
import { encodePng, writePng } from "./lib/png.mjs";

// Zenkai blue, rounded corners, lighter diagonal band, darker border.
function design(size) {
  const edge = Math.max(1, Math.round(size * 0.045));
  const radius = Math.round(size * 0.18);
  return (x, y) => {
    // rounded-corner mask (hard edge; placeholder brand art)
    const cx = x < radius ? radius : x >= size - radius ? size - radius - 1 : x;
    const cy = y < radius ? radius : y >= size - radius ? size - radius - 1 : y;
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
    const isBorder =
      x < edge || y < edge || x >= size - edge || y >= size - edge;
    if (isBorder) return [30, 80, 160, 255];
    const d = (x + y) / (2 * size);
    return d < 0.42 ? [96, 156, 255, 255] : [79, 140, 255, 255];
  };
}

// main png + linux icon set (NxN names electron-builder expects)
writePng("resources/icon.png", 512, 512, design(512));
for (const s of [16, 32, 48, 64, 128, 256, 512]) {
  writePng(`resources/icons/${s}x${s}.png`, s, s, design(s));
}

// ICO: single PNG-compressed 256x256 entry (valid Vista+)
const png256 = encodePng(256, 256, design(256));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; // width (0 = 256)
entry[1] = 0; // height (0 = 256)
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bitcount
entry.writeUInt32LE(png256.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12); // offset
fs.writeFileSync("resources/icon.ico", Buffer.concat([header, entry, png256]));

// ICNS: PNG-based chunks ic07 (128), ic08 (256), ic09 (512)
const icnsParts = [
  ["ic07", encodePng(128, 128, design(128))],
  ["ic08", encodePng(256, 256, design(256))],
  ["ic09", encodePng(512, 512, design(512))],
];
const body = Buffer.concat(
  icnsParts.map(([type, png]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  }),
);
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns", 0, "ascii");
icnsHeader.writeUInt32BE(8 + body.length, 4);
fs.writeFileSync("resources/icon.icns", Buffer.concat([icnsHeader, body]));

console.log(
  "icons written: icon.png, icons/{16..512}xN.png, icon.ico, icon.icns",
);
