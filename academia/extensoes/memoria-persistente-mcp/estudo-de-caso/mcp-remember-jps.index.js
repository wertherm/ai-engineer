// SNAPSHOT DE ESTUDO. Não use em produção e não rode: ele existe para ser lido, analisado por engenharia reversa e endurecido.
// Origem: repositório público tzdesing/mcp-remember-jps (index.js, commit 3092c09). Sem alterações no código abaixo.
// Roteiro de análise: ../README.md e ../../engenharia-reversa/README.md.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import sqlite3 from "sqlite3";
import http from "http";

const db = new sqlite3.Database("/data/memory.db");

// Criar tabela de memória se não existir
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, project TEXT, key TEXT, value TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
});

const server = new Server({ name: "my-squad-memory", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "save_memory", description: "Salva um fato, decisão ou credencial", inputSchema: { type: "object", properties: { project: { type: "string" }, key: { type: "string" }, value: { type: "string" } } } },
    { name: "get_memory", description: "Busca memórias de um projeto", inputSchema: { type: "object", properties: { project: { type: "string" } } } }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === "save_memory") {
    return new Promise((resolve) => {
      db.run("INSERT INTO memories (project, key, value) VALUES (?, ?, ?)", [args.project, args.key, args.value], () => resolve({ content: [{ type: "text", text: "Memória salva com sucesso!" }] }));
    });
  }
  if (name === "get_memory") {
    return new Promise((resolve) => {
      db.all("SELECT * FROM memories WHERE project = ?", [args.project], (err, rows) => resolve({ content: [{ type: "text", text: JSON.stringify(rows) }] }));
    });
  }
});

// Health check server to keep container alive
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", mcp: "running" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
healthServer.listen(PORT, "0.0.0.0", () => {
  console.error(`[MCP] Health check server listening on port ${PORT}`);
});

// Handle server errors gracefully
healthServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[MCP] Port ${PORT} already in use, continuing with MCP only`);
  } else {
    console.error(`[MCP] Server error:`, err);
  }
});

const transport = new StdioServerTransport();
console.error("[MCP] Starting MCP server on stdio");
await server.connect(transport);
console.error("[MCP] MCP server connected");
