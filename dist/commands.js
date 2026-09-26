import chalk from "chalk";
import { recent, getOne } from "./history.js";
export function printHelp() {
    console.log(`
${chalk.bold("Commands")}

  ${chalk.cyan(":help")}                 Show this help
  ${chalk.cyan(":clear")} / ${chalk.cyan("c")}     Clear screen
  ${chalk.cyan(":history")}              Show recent query history
  ${chalk.cyan(":history 50")}          Show 50 queries
  ${chalk.cyan(":run 42")}              Run history item #42
  ${chalk.cyan(":quit")} / ${chalk.cyan(":q")}     Exit
  ${chalk.cyan(":db")}                  Select database
  ${chalk.cyan(":tables")}              List tables
  ${chalk.cyan(":describe TABLE")}      Describe a table

${chalk.bold("Shortcuts")}
  ↑ / ↓       Previous / next SQL
  Ctrl+C      Cancel current input
  Ctrl+D      Exit
`);
}
export function printHistory(limit = 20) {
    const rows = recent(limit);
    console.log(`\n${chalk.bold("Query history")}\n`);
    for (const r of rows) {
        const first = r.query.replace(/\s+/g, " ").slice(0, 80);
        const icon = r.status === "ok" ? chalk.green("✓") : chalk.red("×");
        console.log(`  ${icon} ${String(r.id).padStart(4)}  ${chalk.dim(r.startedAt.replace("T", " ").slice(0, 19))}  ${String(r.durationMs).padStart(6)}ms  ${first}`);
    }
    console.log();
}
export function historyQuery(id) {
    return getOne(id)?.query;
}
