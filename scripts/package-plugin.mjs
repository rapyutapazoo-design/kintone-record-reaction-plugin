import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const pluginDir = join(rootDir, "plugin");
const keysDir = join(rootDir, "keys");
const distDir = join(rootDir, "dist");
const ppkPath = join(keysDir, "private.ppk");
const outPath = join(distDir, "plugin.zip");
const packerBin = join(rootDir, "node_modules", ".bin", "kintone-plugin-packer");

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
if (!existsSync(keysDir)) mkdirSync(keysDir, { recursive: true });

const builtJsFiles = [join(pluginDir, "js", "desktop.js"), join(pluginDir, "js", "config.js")];
for (const f of builtJsFiles) {
  if (!existsSync(f)) {
    console.error(`ビルド成果物が見つかりません: ${f}`);
    console.error("先に npm run build を実行してください。");
    process.exit(1);
  }
}

function run(args) {
  return execFileSync(packerBin, args, { cwd: rootDir, encoding: "utf8" });
}

let output;
let generatedKey = false;

function findNewPpk(dir, before) {
  if (!existsSync(dir)) return null;
  const beforeSet = before ?? new Set();
  const files = readdirSync(dir);
  const found = files.find((f) => f.endsWith(".ppk") && !beforeSet.has(f));
  return found ? join(dir, found) : null;
}

if (existsSync(ppkPath)) {
  output = run(["--ppk", ppkPath, "--out", outPath, pluginDir]);
} else {
  // 秘密鍵が無い場合は生成させる。生成場所はバージョンによって
  // rootDir 直下 / dist/ / plugin/ のいずれかになり得るため、全て探索して回収する。
  const beforeRoot = new Set(readdirSync(rootDir));
  const beforeDist = existsSync(distDir) ? new Set(readdirSync(distDir)) : new Set();
  const beforePlugin = new Set(readdirSync(pluginDir));

  output = run(["--out", outPath, pluginDir]);

  const candidate =
    findNewPpk(rootDir, beforeRoot) ||
    findNewPpk(distDir, beforeDist) ||
    findNewPpk(pluginDir, beforePlugin);

  if (candidate) {
    renameSync(candidate, ppkPath);
    generatedKey = true;
  }
}

console.log(output.trim());
console.log(`plugin.zip: ${outPath}`);

// プラグインID = SHA256(公開鍵DER)の先頭32桁hexを 0-9a-f → a-p に変換したもの
// (kintone-plugin-packer 内部の uuid() ロジックと同一)。
function hex2a(hex) {
  return Array.from(hex)
    .map((ch) => {
      if (ch >= "0" && ch <= "9") {
        return String.fromCharCode(ch.charCodeAt(0) + ("a".charCodeAt(0) - "0".charCodeAt(0)));
      }
      if (ch >= "a" && ch <= "f") {
        return String.fromCharCode(ch.charCodeAt(0) + ("k".charCodeAt(0) - "a".charCodeAt(0)));
      }
      throw new Error(`invalid char: ${ch}`);
    })
    .join("");
}

function computePluginId(ppkFilePath) {
  const NodeRSA = require("node-rsa");
  const privateKeyPem = readFileSync(ppkFilePath, "utf8");
  const key = new NodeRSA(privateKeyPem);
  const publicKeyDer = key.exportKey("pkcs8-public-der");
  const hash = crypto.createHash("sha256").update(publicKeyDer).digest().toString("hex").slice(0, 32);
  return hex2a(hash);
}

try {
  const pluginId = computePluginId(ppkPath);
  console.log(`plugin id: ${pluginId}`);
} catch (e) {
  console.log(`plugin id: (算出に失敗しました: ${e.message})`);
}

if (generatedKey) {
  console.log("");
  console.log("秘密鍵を生成しました。プラグインIDを固定するため安全な場所にバックアップしてください。");
  console.log(`秘密鍵の保存先: ${ppkPath}`);
}
