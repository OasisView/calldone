// One-off favicon generator: rasterizes public/favicon.svg into the .ico and
// PNG fallbacks. Run via `node scripts/gen-favicon.mjs`. Tooling is installed
// temporarily and removed after — see the npm commands in the PR.
import { readFileSync, writeFileSync } from "node:fs"
import { Resvg } from "@resvg/resvg-js"
import pngToIco from "png-to-ico"

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url))

function render(size) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: size } })
  return r.render().asPng()
}

// PNGs for the .ico (16/32/48) and the apple-touch-icon (180).
const ico = await pngToIco([render(16), render(32), render(48)])
writeFileSync(new URL("../public/favicon.ico", import.meta.url), ico)
writeFileSync(new URL("../public/apple-touch-icon.png", import.meta.url), render(180))

console.log("wrote public/favicon.ico and public/apple-touch-icon.png")
