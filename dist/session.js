import fs from "node:fs";
import { SESSION_FILE, ensureDir } from "./config.js";
export function loadSession() {
    ensureDir();
    try {
        return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    }
    catch {
        return null;
    }
}
export function saveSession(s) {
    ensureDir();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
}
export function clearSession() {
    try {
        fs.unlinkSync(SESSION_FILE);
    }
    catch { }
}
