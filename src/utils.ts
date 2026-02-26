import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const homeDir = () =>
  process.env.BROWSER_MEMORY_HOME || path.join(process.cwd(), ".browser-memory");

export const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

export const nowIso = () => new Date().toISOString();

export const genId = (prefix = "id") => `${prefix}_${crypto.randomUUID()}`;

export const readJson = (filePath, fallback = null) => {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

export const writeJson = (filePath, value) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

export const parseArgs = (argv) => {
  const out = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const [keyRaw, inline] = token.slice(2).split("=");
      const key = keyRaw.trim();
      if (inline !== undefined) {
        out[key] = inline;
        i += 1;
        continue;
      }
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
        i += 1;
        continue;
      }
      out[key] = next;
      i += 2;
      continue;
    }
    out._.push(token);
    i += 1;
  }
  return out;
};

export const printJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

export const fail = (message, code = 1) => {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(code);
};

export const boolFlag = (value, fallback = false) => {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};
