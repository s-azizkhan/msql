import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Metabase, MetabaseError, authFromCred } from "./metabase.js";
import { loadConfig } from "./config.js";
import { loadSession, saveSession } from "./session.js";
import { initHistory, addHistory } from "./history.js";

const MAX_ROWS = 200;

const CONFIG_HINT = "add this to your MCP client config:\n" +
  JSON.stringify({ mcpServers: { msql: { command: "msql", args: ["mcp"] } } }, null, 2);

// undefined = `claude` CLI not installed
function claude(args: string[], quiet = false) {
  const r = spawnSync("claude", args, { stdio: quiet ? "ignore" : "inherit" });
  return r.error ? undefined : r.status === 0;
}

// Claude Desktop has no CLI; edit its config file. false = Desktop not installed.
function desktop(entry?: { command: string; args: string[] }) {
  const dir = process.platform === "darwin" ? path.join(os.homedir(), "Library/Application Support/Claude")
    : process.platform === "win32" ? path.join(process.env.APPDATA ?? "", "Claude")
    : path.join(os.homedir(), ".config/Claude");
  const file = path.join(dir, "claude_desktop_config.json");
  if (!fs.existsSync(entry ? dir : file)) return false;
  const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  cfg.mcpServers ??= {};
  if (entry) cfg.mcpServers.msql = entry; else delete cfg.mcpServers.msql;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return true;
}

export async function mcpCommand(sub?: string) {
  if (sub === "enable") {
    const cfg = loadConfig();
    if (!loadSession() && !cfg.lastCredPath) console.error("⚠ Not logged in yet. Run `msql <url> <cred.txt|token:...|apikey:...>` once first.");
    // absolute paths: Claude may not share the shell's PATH
    const [command, ...args] = [process.execPath, fs.realpathSync(process.argv[1]), "mcp"];
    claude(["mcp", "remove", "-s", "user", "msql"], true); // idempotent re-enable
    const code = claude(["mcp", "add", "-s", "user", "msql", "--", command, ...args]);
    if (code) console.log("✓ msql MCP enabled for Claude Code.");
    const desk = desktop({ command, args });
    if (desk) console.log("✓ msql MCP enabled for Claude Desktop.");
    if (code === undefined && !desk) throw new Error("Neither Claude Code nor Claude Desktop found. Install one, or " + CONFIG_HINT);
    if (code || desk) console.log("Restart Claude to use it.");
    return;
  }
  if (sub === "disable") {
    if (claude(["mcp", "remove", "-s", "user", "msql"])) console.log("✓ msql MCP disabled for Claude Code.");
    if (desktop()) console.log("✓ msql MCP disabled for Claude Desktop.");
    return;
  }
  if (sub) throw new Error("Usage: msql mcp [enable|disable]");
  await serve();
}

async function serve() {
  initHistory();
  const cfg = loadConfig();
  const baseUrl = cfg.baseUrl;
  if (!baseUrl) throw new Error("No Metabase URL set. Run `msql <url> <cred.txt>` once.");
  const s0 = loadSession();
  let mb = new Metabase(baseUrl, s0?.token, s0?.apiKey);

  // stdout is the MCP channel: never log; re-login silently on expired token
  async function call<T>(fn: (mb: Metabase) => Promise<T>): Promise<T> {
    try { return await fn(mb); }
    catch (e) {
      if (!(e instanceof MetabaseError) || (e.status !== 401 && e.status !== 403) || !cfg.lastCredPath) throw e;
      const { token, apiKey } = await authFromCred(baseUrl, fs.readFileSync(cfg.lastCredPath, "utf8"));
      const now = new Date().toISOString();
      saveSession({ baseUrl, token, apiKey, createdAt: now, lastUsedAt: now });
      mb = new Metabase(baseUrl, token, apiKey);
      return fn(mb);
    }
  }
  const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }] });
  const fail = (e: any) => ({ ...text(e.message), isError: true });

  const server = new McpServer({ name: "msql", version: "0.1.0" }, {
    instructions: `Remote databases via Metabase (${baseUrl}). Use these tools whenever you need data from a remote/deployed database (prod, staging, any DB connected to Metabase): validating behavior against real data, counts, lookups, debugging records. Don't use a browser, curl or a local DB client for them; local DB clients only reach local data.
Default database: ${cfg.databaseName ?? "none"}${cfg.databaseId ? ` (id ${cfg.databaseId})` : ""}. Call list_databases and pass databaseId when the user names another database. Say which database a result came from.
Workflow: list_databases → describe_table (column names) → run_query. Write SQL in the database's engine dialect. Results cap at ${MAX_ROWS} rows: use LIMIT, filters and aggregates instead of pulling raw tables.`,
  });

  server.registerTool("list_databases", { description: "List Metabase databases (id, name, engine)." },
    async () => {
      try { return text((await call(m => m.databases())).map((d: any) => ({ id: d.id, name: d.name, engine: d.engine }))); }
      catch (e) { return fail(e); }
    });

  server.registerTool("run_query", {
    description: `Run native SQL via Metabase (read-only). Returns up to ${MAX_ROWS} rows. Defaults to the database selected in msql.`,
    inputSchema: { sql: z.string(), databaseId: z.number().int().optional() },
  }, async ({ sql, databaseId }) => {
    const dbId = databaseId ?? cfg.databaseId;
    if (!dbId) return fail(new Error("No databaseId given and no default. Call list_databases or run `msql` once."));
    const started = Date.now(), startedAt = new Date().toISOString();
    const hist = { baseUrl, databaseId: dbId, databaseName: dbId === cfg.databaseId ? cfg.databaseName ?? "" : String(dbId), query: sql, startedAt };
    try {
      const data = await call(m => m.execute(dbId, sql));
      const rows: any[][] = data?.data?.rows ?? [];
      addHistory({ ...hist, durationMs: Date.now() - started, rowCount: rows.length, status: "ok" });
      return text({ columns: data?.data?.cols?.map((c: any) => c.name) ?? [], rows: rows.slice(0, MAX_ROWS), rowCount: rows.length, truncated: rows.length > MAX_ROWS });
    } catch (e: any) {
      addHistory({ ...hist, durationMs: Date.now() - started, rowCount: 0, status: "error", error: e.message });
      return fail(e);
    }
  });

  server.registerTool("describe_table", {
    description: "List columns (name, type) of a table. Accepts `table` or `schema.table`.",
    inputSchema: { table: z.string(), databaseId: z.number().int().optional() },
  }, async ({ table, databaseId }) => {
    try {
      const meta = await call(m => m.metadata(databaseId ?? cfg.databaseId!));
      const t = (meta?.tables ?? []).find((x: any) => x.name === table || `${x.schema}.${x.name}` === table);
      return t ? text(t.fields.map((f: any) => ({ name: f.name, type: f.database_type }))) : fail(new Error(`Table not found: ${table}`));
    } catch (e) { return fail(e); }
  });

  await server.connect(new StdioServerTransport());
}
