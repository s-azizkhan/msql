import { normalizeBaseUrl } from "./config.js";

export class MetabaseError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export class Metabase {
  constructor(public baseUrl: string, private token?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const headers: Record<string,string> = { "Content-Type": "application/json" };
    if (this.token) headers["X-Metabase-Session"] = this.token;
    const res = await fetch(this.baseUrl + endpoint, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = typeof data === "object" && data ? (data.message ?? data.error) : String(data);
      throw new MetabaseError(res.status, msg || `HTTP ${res.status}`);
    }
    return data as T;
  }

  async login(username: string, password: string): Promise<string> {
    const data = await this.request<{id:string}>("POST", "/api/session", { username, password });
    return data.id;
  }

  async whoami(): Promise<any> {
    return this.request("GET", "/api/user/current");
  }

  async databases(): Promise<any[]> {
    const data = await this.request<any>("GET", "/api/database");
    return data.data ?? data;
  }

  async metadata(databaseId: number): Promise<any> {
    return this.request("GET", `/api/database/${databaseId}/metadata`);
  }

  async execute(databaseId: number, sql: string): Promise<any> {
    const data = await this.request<any>("POST", "/api/dataset", {
      database: databaseId,
      type: "native",
      native: { query: sql, "template-tags": {} },
      parameters: []
    });
    // Metabase returns 202 + status "failed" for SQL errors
    if (data?.status === "failed") throw new MetabaseError(400, data.error ?? "Query failed");
    return data;
  }
}