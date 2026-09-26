# msql: Metabase SQL CLI and MCP Server

[![npm version](https://img.shields.io/npm/v/m-sql.svg)](https://www.npmjs.com/package/m-sql)
[![npm downloads](https://img.shields.io/npm/dm/m-sql.svg)](https://www.npmjs.com/package/m-sql)

**msql** is an interactive SQL terminal client for [Metabase](https://www.metabase.com/). It is also a **Model Context Protocol (MCP) server**, so AI agents like Claude Code, Claude Desktop and Cursor can run SQL through Metabase.

It logs in with your Metabase account and runs native SQL through the Metabase API. You don't need direct database credentials, a VPN or a DB client. If you can open Metabase, you can query it from the terminal.

```
msql › select id, email from users limit 2;

  ✓ 2 rows  ·  412ms

┌────┬───────────────────┐
│ id │ email             │
├────┼───────────────────┤
│ 1  │ ada@example.com   │
│ 2  │ alan@example.com  │
└────┴───────────────────┘
```

## Features

- **Terminal SQL client for Metabase:** type SQL and see results as a table. Queries on read-only databases work too.
- **No database credentials:** it uses a Metabase session token, so it works wherever Metabase has access (Postgres, MySQL, BigQuery, Snowflake, Redshift and others).
- **MCP server for AI agents:** `msql mcp enable` connects Claude Code in one command. Agents can list databases, describe tables and run queries.
- **Wide tables stay readable:** results with many columns switch to a one-record-per-block view, like `psql \x auto`.
- **Query history:** stored locally in SQLite. `:history` lists past queries and `:run ID` runs one again.
- **Remembers your session:** the saved token is reused, and it logs in again on its own when the token expires.

## Install

```bash
npm install -g m-sql
```

Or install straight from GitHub:

```bash
npm install -g https://github.com/s-azizkhan/msql/tarball/master
```

The npm package is `m-sql`; the command it installs is `msql`. Requires Node.js 20+.

## Quick start

1. Create a credentials file:

   ```bash
   echo 'you@example.com|your-password' > metabasecred.txt
   chmod 600 metabasecred.txt
   ```

2. Connect to your Metabase instance and pick a database:

   ```bash
   msql https://metabase.example.com metabasecred.txt
   ```

3. After that, run it with no arguments. It reuses the saved URL, credentials path and session:

   ```bash
   msql
   ```

To override either value:

```bash
msql https://other-metabase.example.com cred.txt
msql cred2.txt
```

## Interactive commands

| Command | Action |
|---|---|
| `:help` | Show help |
| `:db` | Switch database |
| `:tables` | List tables |
| `:describe TABLE` | Show a table's columns |
| `:history [N]` | Show the last N queries |
| `:run ID` | Run a history item again |
| `c` / `:clear` | Clear the screen |
| `:q` / `:quit` / Ctrl+D | Exit |

## MCP server: use Metabase from Claude, Cursor and other AI agents

msql includes an MCP server over stdio. Log in with `msql` once, then:

```bash
msql mcp enable    # register with Claude Code (all projects)
msql mcp disable   # unregister
```

**Other MCP clients** (Claude Desktop, Cursor, Windsurf, VS Code): add this to the client's MCP config:

```json
{
  "mcpServers": {
    "msql": { "command": "msql", "args": ["mcp"] }
  }
}
```

**MCP tools:**

| Tool | Description |
|---|---|
| `run_query` | Run native SQL. Returns up to 200 rows. Uses the database selected in msql unless `databaseId` is given. |
| `list_databases` | List Metabase databases (id, name, engine). |
| `describe_table` | List a table's columns and types. |

Queries run by agents are saved to `:history` too.

## Files

| Path | Contents |
|---|---|
| `~/.config/msql/config.json` | Metabase URL, credentials path, selected database |
| `~/.config/msql/session.json` | Metabase session token (mode 0600) |
| `~/.config/msql/history.db` | Query history (SQLite) |

## Security

- Your password is only read from your local credentials file and is never printed.
- The session token is stored with mode 0600. If Metabase rejects it, msql deletes it and logs in again from the credentials file.
- Queries run with your Metabase account's permissions. For AI agents, a Metabase user with read-only database access is recommended.

## FAQ

**How do I query Metabase from the command line?**
Install with `npm install -g m-sql`, then run `msql https://your-metabase cred.txt` and type SQL.

**Can Claude or Cursor query my Metabase database?**
Yes. Run `msql mcp enable` for Claude Code, or add the JSON config above to any MCP client.

**Do I need database credentials?**
No. msql only needs a Metabase login, and it can query any database connected to Metabase.

**Does it support Metabase saved questions or GUI queries?**
No, only native SQL.

## Uninstall

```bash
npm uninstall -g m-sql
rm -rf ~/.config/msql
```

## Author

Built by **[S.Aziz Khan](https://justaziz.com)**. Issues and PRs are welcome at [github.com/s-azizkhan/msql](https://github.com/s-azizkhan/msql).
