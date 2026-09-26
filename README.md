# msql

A local interactive SQL client that uses a Metabase session instead of direct DB credentials.

## Install

```bash
npm install -g m-sql   # installs the `msql` command
```

From source:

```bash
npm install
npm run build
npm install -g .
```

## complete uninstall

`npm uninstall -g m-sql`
`rm -rf ~/.config/msql`
`rm -rf ~/msql`
`rm -f ~/msql.tar.gz`

## Credentials

Create `metabasecred.txt`:

```text
you@example.com|your-password
```

Protect it:

```bash
chmod 600 metabasecred.txt
```

First run:

```bash
msql https://metabase.example.com metabasecred.txt
```

After that:

```bash
msql
```

uses the saved base URL, saved credential-file path, and cached session token.

You can override either:

```bash
msql https://other-metabase.example.com cred.txt
msql https://metabase.example.com
msql cred2.txt
```

The token is stored in `~/.config/msql/session.json` with mode 0600. Configuration is stored in `~/.config/msql/config.json`; query history is in `~/.config/msql/history.db`.

## Interactive commands

- `c` / `:clear` — clear screen
- `:help`
- `:history [N]`
- `:run ID`
- `:db`
- `:tables`
- `:describe TABLE`
- `:q` / `:quit`


## Claude / MCP

```bash
msql mcp enable    # register with Claude Code (user scope)
msql mcp disable   # unregister
```

Log in with `msql` once first. Tools: `run_query`, `list_databases`, `describe_table`. Queries use the database picked in `msql` and are saved to `:history`.

Other MCP clients (Claude Desktop, Cursor):

```json
{ "mcpServers": { "msql": { "command": "msql", "args": ["mcp"] } } }
```

## Security

Passwords are read locally and are never printed. The cached Metabase session token is treated as a secret. If a token is rejected by Metabase, the cached session is discarded and the saved credential path is used for the next login.
