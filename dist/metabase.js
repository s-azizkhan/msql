import { normalizeBaseUrl } from "./config.js";
export class MetabaseError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export class Metabase {
    baseUrl;
    token;
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.baseUrl = normalizeBaseUrl(baseUrl);
    }
    async request(method, endpoint, body) {
        const headers = { "Content-Type": "application/json" };
        if (this.token)
            headers["X-Metabase-Session"] = this.token;
        const res = await fetch(this.baseUrl + endpoint, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = text;
        }
        if (!res.ok) {
            const msg = typeof data === "object" && data ? (data.message ?? data.error) : String(data);
            throw new MetabaseError(res.status, msg || `HTTP ${res.status}`);
        }
        return data;
    }
    async login(username, password) {
        const data = await this.request("POST", "/api/session", { username, password });
        return data.id;
    }
    async whoami() {
        return this.request("GET", "/api/user/current");
    }
    async databases() {
        const data = await this.request("GET", "/api/database");
        return data.data ?? data;
    }
    async metadata(databaseId) {
        return this.request("GET", `/api/database/${databaseId}/metadata`);
    }
    async execute(databaseId, sql) {
        const data = await this.request("POST", "/api/dataset", {
            database: databaseId,
            type: "native",
            native: { query: sql, "template-tags": {} },
            parameters: []
        });
        // Metabase returns 202 + status "failed" for SQL errors
        if (data?.status === "failed")
            throw new MetabaseError(400, data.error ?? "Query failed");
        return data;
    }
}
