// 简单 MCP 协议测试客户端：spawn server，写入 initialize/tools/list，读取响应
//
// 断言两件事，都是「人不会记得」的那种：
//
// ① **老工具一个都不能少。** museav-mcp 已经发到 2.x、有真实下载量，
//    工具名是它对用户的契约。分组化重构最容易出的事故就是某个工具
//    在搬家时掉了 —— 而掉了不会报错，只会让 agent 找不到那个工具。
//    所以下面把 21 个名字逐个钉死（只增不减，删工具是破坏性变更，得走大版本）。
//
// ② **工具总数与 README 一致。** 加了工具忘了改文档，在 CI 里变红，而不是等人发现。
//
// 用 MUSEAV_MCP_GROUPS=all 起 server：CI 机器上什么 CLI 都没装，
// 走默认的探测策略会一个分组都不启用，那就测不到工具集本身了。
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const EXPECTED_TOOL_COUNT = 27;   // 2026-10-02 分组化：museav 17 + vlm 4 + contrast 3 + facet 2 + groups_list

// 分组化之前就存在的 21 个工具 —— 这些名字是老用户的契约，不许消失
const LEGACY_TOOLS = [
  "gen_background", "remove_bg", "upscale_image", "remove_watermark", "compress_image",
  "list_templates", "list_skills", "list_jobs", "upload_asset", "image_to_template",
  "reverse", "list_models", "balance", "list_video_templates",
  "vlm_describe", "vlm_ask", "vlm_cover_check", "vlm_reverse_prompt",
  "skillhub_tags", "skillhub_whoami", "skillhub_publish",
];

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

// 分组选择逻辑也要测：CI 里没有 CLI，默认策略的判据就是「探测到才启用」，
// 一旦哪天写成「永远全开」，工具 schema 的 token 成本会静默翻几倍。
{
  const { selectGroups, GROUPS } = await import("./dist/registry.js");
  const all = selectGroups("all");
  if (all.enabled.length !== GROUPS.length) {
    console.error(`GROUP_FAIL all 应当启用全部 ${GROUPS.length} 组，实际 ${all.enabled.length}`);
    process.exit(1);
  }
  const only = selectGroups("facet,contrast");
  const ids = only.enabled.map((g) => g.id).join(",");
  if (ids !== "contrast,facet") {
    console.error(`GROUP_FAIL 白名单应当只启用 contrast,facet，实际 ${ids}`);
    process.exit(1);
  }
  const minus = selectGroups("-museav,-vlm");
  if (minus.enabled.some((g) => g.id === "museav" || g.id === "vlm")) {
    console.error("GROUP_FAIL -museav,-vlm 没被排除掉");
    process.exit(1);
  }
  const typo = selectGroups("museav,vm1");
  if (typo.unknown.join(",") !== "vm1") {
    console.error(`GROUP_FAIL 拼错的 id 应当被报出来，实际 ${JSON.stringify(typo.unknown)}`);
    process.exit(1);
  }
  console.log(`GROUP_OK ${GROUPS.length} 组；白名单/排除/拼错三条都通过`);
}

const child = spawn("node", ["dist/index.js"], {
  cwd: dirname(fileURLToPath(import.meta.url)),
  env: { ...process.env, MUSEAV_MCP_GROUPS: "all" },
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
      const names = msg.result.tools.map((t) => t.name);
      console.log("TOOLS_LIST_OK count =", names.length);
      for (const n of names) console.log("  -", n);

      const missing = LEGACY_TOOLS.filter((t) => !names.includes(t));
      if (missing.length > 0) {
        console.error(
          `LEGACY_TOOLS_MISSING 老工具在分组化里掉了 ${missing.length} 个：${missing.join(", ")} —— ` +
          `这些名字是已发布版本的契约，老用户的 agent 正靠它们干活`,
        );
        process.exit(1);
      }
      console.log(`LEGACY_OK ${LEGACY_TOOLS.length} 个老工具全部还在`);

      if (names.length !== EXPECTED_TOOL_COUNT) {
        console.error(
          `TOOLS_LIST_MISMATCH 期望 ${EXPECTED_TOOL_COUNT} 个，实际 ${names.length} 个 —— ` +
          `改了工具就同步改这个常量，以及 README 里写的数字`,
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
