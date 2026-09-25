#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import chalk from "chalk";
import { Metabase, MetabaseError } from "./metabase.js";
import { loadConfig, saveConfig, normalizeBaseUrl } from "./config.js";
import { loadSession, saveSession, clearSession } from "./session.js";
import { initHistory, addHistory } from "./history.js";
import { printHelp, printHistory, historyQuery } from "./commands.js";
import { renderResult } from "./render.js";

const DEFAULT_URL = "https://metabase.example.com";

function credFromFile(file:string) {
  const raw = fs.readFileSync(path.resolve(file), "utf8").trim();
  const i = raw.indexOf("|");
  if (i < 1) throw new Error(`Invalid credential file. Expected email|password`);
  return { email: raw.slice(0,i), password: raw.slice(i+1) };
}

async function chooseDb(mb:Metabase, cfg:any): Promise<{id:number,name:string}> {
  const dbs = await mb.databases();
  if (!dbs.length) throw new Error("No databases are available to your Metabase account.");
  if (cfg.databaseId) {
    const found = dbs.find((d:any)=>d.id===cfg.databaseId);
    if (found) return {id:found.id,name:found.name};
  }
  console.log(`\n${chalk.bold("Select database")}\n`);
  dbs.forEach((d:any,i:number)=>console.log(`  ${i+1}. ${d.name} ${d.id===cfg.databaseId ? chalk.green("✓"): ""}`));
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  const answer = await new Promise<string>(resolve=>rl.question("\n  › ",resolve));
  rl.close();
  const n = Number(answer);
  const selected = dbs[(n>=1 && n<=dbs.length ? n : 1)-1];
  cfg.databaseId=selected.id; cfg.databaseName=selected.name; saveConfig(cfg);
  return {id:selected.id,name:selected.name};
}

async function login(baseUrl:string, credPath:string) {
  const {email,password}=credFromFile(credPath);
  const mb = new Metabase(baseUrl);
  process.stdout.write(`\n  ${chalk.dim("Signing in…")}`);
  const token=await mb.login(email,password);
  saveSession({baseUrl,token,createdAt:new Date().toISOString(),lastUsedAt:new Date().toISOString()});
  console.log(` ${chalk.green("✓")}`);
  return new Metabase(baseUrl,token);
}

async function main() {
  initHistory();
  const args=process.argv.slice(2);
  const urlArg=args.find(a=>/^https?:\/\//i.test(a));
  const credArg=args.find(a=>!/^https?:\/\//i.test(a) && !a.startsWith("-"));
  const cfg=loadConfig();
  if (urlArg) { cfg.baseUrl=normalizeBaseUrl(urlArg); saveConfig(cfg); }
  const baseUrl=cfg.baseUrl || DEFAULT_URL;
  if (!cfg.baseUrl) { cfg.baseUrl=baseUrl; saveConfig(cfg); }

  let session=loadSession();
let mb: Metabase | undefined;
let loggedIn = false;

  if (session && normalizeBaseUrl(session.baseUrl)===baseUrl) {
    mb=new Metabase(baseUrl,session.token);
    try { await mb.whoami(); session.lastUsedAt=new Date().toISOString(); saveSession(session); loggedIn=true; }
    catch (e) {
      if (!(e instanceof MetabaseError) || (e.status!==401 && e.status!==403)) throw e;
      clearSession();
    }
  }

  if (!loggedIn) {
    const credPath=credArg || cfg.lastCredPath || path.join(process.cwd(),"metabasecred.txt");
    if (!fs.existsSync(credPath)) {
      throw new Error(`No valid Metabase session found and credentials file not found: ${credPath}\nUse: msql https://metabase.example.com cred.txt`);
    }
    cfg.lastCredPath=path.resolve(credPath); saveConfig(cfg);
    mb=await login(baseUrl,cfg.lastCredPath);
  }

  if (!mb) {
    throw new Error("Unable to establish a Metabase session.");
  }

  const db = await chooseDb(mb, cfg);
  console.log(`\n  ${chalk.bold("◉ msql")}  ${chalk.dim("·")}  ${chalk.cyan(baseUrl.replace(/^https?:\/\//,""))}`);
  console.log(`  ${chalk.dim("Database")} ${chalk.bold(db.name)} ${chalk.green("● connected")}`);
  console.log(`  ${chalk.dim("Type :help for commands · Ctrl+D to quit")}\n`);

  const rl=readline.createInterface({input:process.stdin,output:process.stdout,historySize:1000,terminal:true});
  rl.setPrompt(chalk.cyan("msql › "));
  rl.prompt();

  for await (const line of rl) {
    const q=line.trim();
    if (!q) { rl.prompt(); continue; }
    if (q==="c" || q===":clear") { console.clear(); rl.prompt(); continue; }
    if (q===":q" || q===":quit" || q==="exit") { rl.close(); break; }
    if (q===":help") { printHelp(); rl.prompt(); continue; }
    if (q.startsWith(":history")) { printHistory(Number(q.split(/\s+/)[1])||20); rl.prompt(); continue; }
    if (q.startsWith(":run ")) {
      const query=historyQuery(Number(q.split(/\s+/)[1]));
      if (!query) console.log(chalk.red("  History item not found."));
      else await runQuery(mb!,db,query);
      rl.prompt(); continue;
    }
    if (q===":db") {
      const selected=await chooseDb(mb!,cfg); db.id=selected.id; db.name=selected.name;
      console.log(`  ${chalk.green("✓")} Using ${chalk.bold(db.name)}\n`); rl.prompt(); continue;
    }
    if (q===":tables") {
      try {
        const meta=await mb!.metadata(db.id);
        const tables=meta?.tables ?? meta?.data?.tables ?? [];
        console.log(`\n${chalk.bold("Tables")}\n`);
        for (const t of tables) console.log(`  ${t.schema ? t.schema+"." : ""}${t.name}`);
        console.log();
      } catch(e:any){ console.log(chalk.red(`  ${e.message}`)); }
      rl.prompt(); continue;
    }
    if (q.startsWith(":describe ")) {
      const name=q.slice(10).trim();
      try {
        const meta=await mb!.metadata(db.id);
        const tables=meta?.tables ?? [];
        const t=tables.find((x:any)=>x.name===name || `${x.schema}.${x.name}`===name);
        if (!t) console.log(chalk.yellow("  Table not found in Metabase metadata."));
        else console.log(JSON.stringify(t.fields ?? t, null, 2));
      } catch(e:any){ console.log(chalk.red(`  ${e.message}`)); }
      rl.prompt(); continue;
    }
    await runQuery(mb!,db,q);
    rl.prompt();
  }
}

async function runQuery(mb:Metabase, db:{id:number,name:string}, sql:string) {
  const started=Date.now(); const startedAt=new Date().toISOString();
  try {
    const data=await mb.execute(db.id,sql);
    const duration=Date.now()-started;
    const rows=data?.data?.rows?.length ?? 0;
    addHistory({baseUrl:mb.baseUrl,databaseId:db.id,databaseName:db.name,query:sql,startedAt,durationMs:duration,rowCount:rows,status:"ok"});
    renderResult(data,duration);
  } catch(e:any) {
    const duration=Date.now()-started;
    addHistory({baseUrl:mb.baseUrl,databaseId:db.id,databaseName:db.name,query:sql,startedAt,durationMs:duration,rowCount:0,status:"error",error:e.message});
    if (e instanceof MetabaseError && (e.status===401 || e.status===403)) {
      console.log(`\n${chalk.yellow("⚠ Metabase session expired.")}`);
      console.log(`  Re-login using the last credential file on the next start.`);
    } else console.log(`\n${chalk.red("✕")} ${e.message}\n`);
  }
}

main().catch(e=>{ console.error(`\n${chalk.red("✕")} ${e.message}\n`); process.exit(1); });