import chalk from "chalk";
import Table from "cli-table3";
export function renderResult(data, duration) {
    const cols = data?.data?.cols?.map((c) => c.name) ?? [];
    const rows = data?.data?.rows ?? [];
    const count = data?.data?.rows?.length ?? 0;
    console.log(`\n  ${chalk.green("✓")} ${chalk.bold(String(count))} rows  ${chalk.dim("·")}  ${chalk.cyan(duration + "ms")}\n`);
    if (!cols.length) {
        if (data?.data?.results)
            console.log(JSON.stringify(data.data.results, null, 2));
        return;
    }
    const width = process.stdout.columns || 120;
    const fmt = (v) => v === null ? chalk.dim("NULL") : String(v);
    // ponytail: too wide for a grid → one record per block, like psql \x auto
    if (Math.floor(width / cols.length) < 12) {
        const pad = Math.max(...cols.map(c => c.length));
        rows.slice(0, 500).forEach((row, i) => {
            console.log(chalk.dim(`-[ RECORD ${i + 1} ]` + "-".repeat(Math.max(0, Math.min(width, 60) - 14))));
            cols.forEach((c, j) => console.log(`${chalk.bold(c.padEnd(pad))} ${chalk.dim("│")} ${fmt(row[j])}`));
        });
        if (rows.length > 500)
            console.log(chalk.dim(`\n  Showing 500 of ${rows.length} rows`));
        return;
    }
    const table = new Table({
        head: cols.map(c => chalk.bold(c)),
        chars: {
            top: "─",
            "top-mid": "┬",
            "top-left": "┌",
            "top-right": "┐",
            bottom: "─",
            "bottom-mid": "┴",
            "bottom-left": "└",
            "bottom-right": "┘",
            left: "│",
            "left-mid": "├",
            mid: "─",
            "mid-mid": "┼",
            right: "│",
            "right-mid": "┤",
            middle: "│"
        },
        wordWrap: true,
        colWidths: cols.map(() => Math.max(12, Math.min(38, Math.floor(width / cols.length))))
    });
    for (const row of rows.slice(0, 500))
        table.push(row.map(fmt));
    console.log(table.toString());
    if (rows.length > 500)
        console.log(chalk.dim(`\n  Showing 500 of ${rows.length} rows`));
}
