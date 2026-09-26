import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Metabase, MetabaseError } from "./metabase.js";
import { loadConfig } from "./config.js";
import { loadSession, saveSession } from "./session.js";
import { initHistory, addHistory } from "./history.js";

const MAX_ROWS = 200;

function claude(args: string[], quiet = false) {
  const r = spawnSync("claude", args, { stdio: quiet ? "ignore" : "inherit" });
  if (r.error) throw new Error("`claude` CLI not found. Install Claude Code, or add this to your MCP client config:\n" +
    JSON.stringify({ mcpServers: { msql: { command: "msql", args: ["mcp"] } } }, null, 2));
  return r.status === 0;
}

export async function mcpCommand(sub?: string) {
  if (sub === "enable") {
    const cfg = loadConfig();
    if (!loadSession() && !cfg.lastCredPath) console.error("⚠ Not logged in yet. Run `msql <url> <cred.txt>` once first.");
    claude(["mcp", "remove", "-s", "user", "msql"], true); // idempotent re-enable
    // absolute paths: Claude may not share the shell's PATH
    if (claude(["mcp", "add", "-s", "user", "msql", "--", process.execPath, fs.realpathSync(process.argv[1]), "mcp"]))
      console.log("✓ msql MCP enabled for Claude Code. Restart Claude to use it.");
    return;
  }
  if (sub === "disable") {
    if (claude(["mcp", "remove", "-s", "user", "msql"])) console.log("✓ msql MCP disabled.");
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
  let mb = new Metabase(baseUrl, loadSession()?.token);

  // stdout is the MCP channel: never log; re-login silently on expired token
  async function call<T>(fn: (mb: Metabase) => Promise<T>): Promise<T> {
    try { return await fn(mb); }
    catch (e) {
      if (!(e instanceof MetabaseError) || (e.status !== 401 && e.status !== 403) || !cfg.lastCredPath) throw e;
      const [email, ...rest] = fs.readFileSync(cfg.lastCredPath, "utf8").trim().split("|");
      const token = await new Metabase(baseUrl).login(email, rest.join("|"));
      const now = new Date().toISOString();
      saveSession({ baseUrl, token, createdAt: now, lastUsedAt: now });
      mb = new Metabase(baseUrl, token);
      return fn(mb);
    }
  }
  const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }] });
  const fail = (e: any) => ({ ...text(e.message), isError: true });

  const server = new McpServer({ name: "msql", version: "0.1.0" });

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
