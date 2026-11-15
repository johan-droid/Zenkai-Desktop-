// Generates resources/tray.png (16x16 solid) — run: node scripts/gen-tray-icon.mjs
import { writePng } from "./lib/png.mjs";

const [r, g, b, a] = [79, 140, 255, 255]; // Zenkai blue
writePng("resources/tray.png", 16, 16, (x, y) => {
  const edge = x === 0 || y === 0 || x === 15 || y === 15;
  return edge ? [30, 80, 160, a] : [r, g, b, a];
});
console.log("resources/tray.png written");
