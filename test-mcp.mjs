// 简单 MCP 协议测试客户端：spawn server，写入 initialize/tools/list，读取响应
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const child = spawn("node", ["dist/index.js"], {
  cwd: dirname(fileURLToPath(import.meta.url)),
  stdio: ["pipe", "pipe", "inherit"],
});

const rl = createInterface({ input: child.stdout });
let id = 0;
const send = (method, params, extraId = null) => {
  const msg = { jsonrpc: "2.0", id: extraId ?? ++id, method, params };
  child.stdin.write(JSON.stringify(msg) + "\n");
};

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.result && msg.result.tools) {
      console.log("TOOLS_LIST_OK count =", msg.result.tools.length);
      for (const t of msg.result.tools) console.log("  -", t.name);
      process.exit(0);
    }
  } catch {}
});

// initialize
send("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "test-client", version: "1.0" },
});
setTimeout(() => {
  send("notifications/initialized", {});
}, 300);
setTimeout(() => {
  send("tools/list", {});
}, 600);
// safety exit
setTimeout(() => { console.error("TIMEOUT"); process.exit(1); }, 8000);
