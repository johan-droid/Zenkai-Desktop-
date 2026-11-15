// Generates resources/icon.png, resources/icons/* (linux), icon.ico, icon.icns
// directly from the official Zenkai trademark logo (public/logo.png).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const srcLogo = path.resolve("public/logo.png");
if (!fs.existsSync(srcLogo)) {
  console.error("Error: public/logo.png not found!");
  process.exit(1);
}

// 1. Copy full 512x512 icon
fs.copyFileSync(srcLogo, "resources/icon.png");

// 2. Generate Linux icons & Windows ICO using Python PIL
const pyScript = `
import os
from PIL import Image

img = Image.open('public/logo.png').convert('RGBA')
os.makedirs('resources/icons', exist_ok=True)
for s in [16, 32, 48, 64, 128, 256, 512]:
    resized = img.resize((s, s), Image.Resampling.LANCZOS)
    resized.save(f'resources/icons/{s}x{s}.png', 'PNG')

ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save('resources/icon.ico', format='ICO', sizes=ico_sizes)

tray = img.resize((32, 32), Image.Resampling.LANCZOS)
tray.save('resources/tray.png', 'PNG')
`;

try {
  execSync(`python3 -c "${pyScript.replace(/\n/g, '; ')}"`, { stdio: "inherit" });
} catch (e) {
  console.error("Failed to run icon generation script:", e.message);
}

// 3. Generate macOS icon.icns from generated PNGs
const png128 = fs.readFileSync("resources/icons/128x128.png");
const png256 = fs.readFileSync("resources/icons/256x256.png");
const png512 = fs.readFileSync("resources/icons/512x512.png");

const icnsParts = [
  ["ic07", png128],
  ["ic08", png256],
  ["ic09", png512],
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

console.log("Official Zenkai trademark icons generated successfully: icon.png, icons/{16..512}xN.png, icon.ico, icon.icns, tray.png");
