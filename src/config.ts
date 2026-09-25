import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const APP_DIR = path.join(os.homedir(), ".config", "msql");
export const CONFIG_FILE = path.join(APP_DIR, "config.json");
export const SESSION_FILE = path.join(APP_DIR, "session.json");
export const HISTORY_FILE = path.join(APP_DIR, "history.db");

export type Config = {
  baseUrl: string;
  lastCredPath?: string;
  databaseId?: number;
  databaseName?: string;
};

export function ensureDir() {
  fs.mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
}

export function loadConfig(): Config {
  ensureDir();
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return { baseUrl: "" }; }
}

export function saveConfig(config: Config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}