import { build } from "esbuild";
import { resolve } from "node:path";
import { readFile, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
const production = process.argv.includes("--production");
const outdir = production ? "dist-production" : "dist";
try {
  process.loadEnvFile(production ? ".env.production" : ".env");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const env = process.env;
let devKey;
try {
  devKey = JSON.parse(await readFile("development-key.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  await import("./create-dev-key.mjs");
  devKey = JSON.parse(await readFile("development-key.json", "utf8"));
}
const publicKey = env.POD_EXTENSION_PUBLIC_KEY || (production ? undefined : devKey.publicKey);
const config = {
  apiOrigin: env.POD_API_ORIGIN || "http://localhost:8787",
  siteOrigin: env.POD_SITE_ORIGIN || "http://localhost:3000",
  publishableKey: env.POD_CLERK_PUBLISHABLE_KEY || "",
  syncHost: env.POD_CLERK_SYNC_HOST || "http://localhost",
};
if (production) {
  for (const name of ["POD_API_ORIGIN", "POD_SITE_ORIGIN", "POD_CLERK_FRONTEND_API", "POD_CLERK_SYNC_HOST", "POD_CLERK_PUBLISHABLE_KEY"]) {
    if (!env[name]) throw new Error(`Production build requires ${name}; copy .env.production.example to .env.production`);
  }
  for (const name of ["POD_API_ORIGIN", "POD_SITE_ORIGIN", "POD_CLERK_FRONTEND_API", "POD_CLERK_SYNC_HOST"]) {
    const url = new URL(env[name]);
    if (url.protocol !== "https:" || /(^|\.)(localhost|local|test|invalid)$/.test(url.hostname) || /^(127\.|0\.|\[::1\])/.test(url.hostname) || url.hostname.endsWith(".clerk.accounts.dev") || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error(`${name} must be a production HTTPS origin`);
    }
  }
  if (!config.publishableKey.startsWith("pk_live_")) throw new Error("Production requires a live Clerk publishable key");
  const clerkHost = Buffer.from(config.publishableKey.slice(8), "base64").toString().replace(/\$$/, "");
  if (new URL(env.POD_CLERK_FRONTEND_API).hostname !== clerkHost) throw new Error("Clerk publishable key and Frontend API do not match");
  if (new URL(config.syncHost).origin !== new URL(env.POD_CLERK_FRONTEND_API).origin) throw new Error("Production Clerk Sync Host must match the Frontend API");
  if (publicKey === devKey.publicKey) throw new Error("Do not reuse the development extension identity for a store build");
}
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = env.POD_EXTENSION_VERSION || packageJson.version;
if (!/^\d+(\.\d+){0,3}$/.test(version) || version.split(".").some(part => Number(part) > 65535 || (part.length > 1 && part.startsWith("0"))) || version.split(".").every(part => Number(part) === 0)) throw new Error("Invalid Chrome extension version");
const origins = [
  config.apiOrigin,
  config.siteOrigin,
  config.syncHost,
  env.POD_CLERK_FRONTEND_API,
]
  .filter(Boolean)
  .map((value) => `${new URL(value).origin}/*`);
if (production) await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
// Reuse the exact PNG renditions already embedded in the site's favicon.
const favicon = await readFile("assets/favicon.ico");
const icons = {};
for (let i = 0; i < favicon.readUInt16LE(4); i++) {
  const entry = 6 + i * 16;
  const size = favicon[entry] || 256;
  const length = favicon.readUInt32LE(entry + 8);
  const offset = favicon.readUInt32LE(entry + 12);
  const png = favicon.subarray(offset, offset + length);
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error("Site favicon must contain PNG renditions");
  icons[size] = `icon-${size}.png`;
  await writeFile(`${outdir}/${icons[size]}`, png);
}
icons[256] = "icon-256.png";
await copyFile("assets/icon.png", `${outdir}/icon-256.png`);
icons[128] = "icon-128.png";
await copyFile("src/assets/icon-128.png", `${outdir}/icon-128.png`);
await build({
  entryPoints: ["src/background.ts", "src/panel.ts", "src/content.ts"],
  outdir,
  bundle: true,
  alias: { "@clerk/ui/no-rhc": resolve("scripts/clerk-ui-disabled.ts") },
  format: "iife",
  target: "chrome116",
  define: {
    __CONFIG__: JSON.stringify(config),
    "process.env.NODE_ENV": '"production"',
  },
  minify: true,
});
await writeFile(
  `${outdir}/manifest.json`,
  JSON.stringify(
    {
      manifest_version: 3,
      name: "PixOnDeck — Image to Prompt",
      version,
      minimum_chrome_version: "116",
      description:
        "Turn images into editable prompts with PixOnDeck credits or your own API key.",
      permissions: [
        "sidePanel",
        "storage",
        "contextMenus",
        "scripting",
        "cookies",
      ],
      host_permissions: [...new Set([...origins, "http://*/*", "https://*/*"])],
      background: { service_worker: "background.js" },
      icons,
      action: { default_title: "PixOnDeck", default_icon: icons },
      side_panel: { default_path: "panel.html" },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'none'",
      },
      key: publicKey,
    },
    null,
    2,
  ),
);
await Promise.all(
  ["panel.html", "panel.css"].map((name) =>
    copyFile(`src/${name}`, `${outdir}/${name}`),
  ),
);
await copyFile("assets/logo.svg", `${outdir}/logo.svg`);
if (!config.publishableKey)
  console.warn(
    "Shell built; configure .env with development Clerk settings before login testing.",
  );

await mkdir(`${outdir}/assets`, { recursive: true });
for (const name of ["welcome-demo.mp4", "welcome-demo-poster.jpg"]) {
  await copyFile(`src/assets/${name}`, `${outdir}/assets/${name}`);
}

if (production) console.log(`Production candidate built in ${outdir}; backend readiness and store identity still require live verification.`);

for (const name of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.txt", "BRANDING.md"]) {
  await copyFile(name, `${outdir}/${name}`);
}
