// 简单 MCP 协议测试客户端：spawn server，写入 initialize/tools/list，读取响应
//
// 工具数是个约定值：README / docs 都写着「TOOLS_LIST_OK count = 17」，
// 这个断言就是让「加了工具忘了改文档」在 CI 里变红，而不是等人去发现。
// 新增工具时把这个数一起改（只增不减，删工具是破坏性变更，得走大版本）。
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const EXPECTED_TOOL_COUNT = 18;

// 版本守卫的语义比较必须按数字逐段比。字符串比的话 "3.10.0" < "3.6.0"，
// 真出到 3.10 时会把新版本判成过旧、把所有工具锁死 —— 而那时离现在还很远，
// 没有断言的话没人会想起来。
{
  const { semverLt } = await import("./dist/semver.js");
  const cases = [
    ["3.5.0", "3.6.0", true],    // 旧版要拦
    ["3.6.0", "3.6.0", false],   // 相等放行
    ["3.6.1", "3.6.0", false],   // 新版放行
    ["3.10.0", "3.6.0", false],  // ← 字符串比会在这里错
    ["4.0.0", "3.6.0", false],
    ["2.9.9", "3.6.0", true],
  ];
  for (const [a, b, want] of cases) {
    if (semverLt(a, b) !== want) {
      console.error(`SEMVER_FAIL semverLt("${a}","${b}") 期望 ${want}`);
      process.exit(1);
    }
  }
  console.log(`SEMVER_OK ${cases.length} 条`);
}

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
      const count = msg.result.tools.length;
      console.log("TOOLS_LIST_OK count =", count);
      for (const t of msg.result.tools) console.log("  -", t.name);
      if (count !== EXPECTED_TOOL_COUNT) {
        console.error(
          `TOOLS_LIST_MISMATCH 期望 ${EXPECTED_TOOL_COUNT} 个，实际 ${count} 个 —— ` +
          `改了工具就同步改这个常量，以及 README / docs 里写的数字`,
        );
        process.exit(1);
      }
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
