// Generates resources/tray.png from the official Zenkai trademark logo (public/logo.png)
import { execSync } from "node:child_process";

const pyScript = `
from PIL import Image
img = Image.open('public/logo.png').convert('RGBA')
tray = img.resize((32, 32), Image.Resampling.LANCZOS)
tray.save('resources/tray.png', 'PNG')
`;
execSync(`python3 -c "${pyScript.replace(/\n/g, '; ')}"`, { stdio: "inherit" });
console.log("resources/tray.png generated from official Zenkai logo");
