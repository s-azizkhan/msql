import Database from "better-sqlite3";
import { HISTORY_FILE, ensureDir } from "./config.js";
let db;
export function initHistory() {
    ensureDir();
    db = new Database(HISTORY_FILE);
    db.pragma("journal_mode = WAL");
    db.exec(`CREATE TABLE IF NOT EXISTS query_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_url TEXT NOT NULL,
    database_id INTEGER NOT NULL,
    database_name TEXT NOT NULL,
    query TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error TEXT
  )`);
}
export function addHistory(r) {
    db.prepare(`INSERT INTO query_history
    (base_url,database_id,database_name,query,started_at,duration_ms,row_count,status,error)
    VALUES (@baseUrl,@databaseId,@databaseName,@query,@startedAt,@durationMs,@rowCount,@status,@error)`).run({ error: null, ...r });
}
export function recent(limit = 20) {
    return db.prepare(`SELECT * FROM query_history ORDER BY id DESC LIMIT ?`).all(limit);
}
export function getOne(id) {
    return db.prepare(`SELECT * FROM query_history WHERE id=?`).get(id);
}
