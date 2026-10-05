/**
 * 能力分组：browser —— 浏览器操控（开源项目 lite-browser）
 *
 * 真实 Chrome + 复用已确认的登录态 + **人类交接协议**。这是它跟「拿 HTTP 抓一下」
 * 的根本区别：无官方 CLI 的服务（小红书 / 微信 / X）只能这么接，而且它把
 * 「撞到登录墙」变成了一条有契约的路径（status → await-human → resume），
 * 而不是让 agent 干等或反复重试。
 *
 * ## 为什么包 CLI 而不是转发它自带的 MCP
 *
 * lite-browser 自己带 MCP（`lite-browser mcp`），看起来该「转发」。但转发要给
 * 本 MCP 加一个 JSON-Schema→Zod 的运行时依赖（工具 schema 只能收 Zod），
 * 还要管子进程生命周期 —— 而它的 **CLI 本来就覆盖同一批操作**。
 * 按「能力归 CLI，MCP 只做串联」的口径，包 CLI 才是对的那条路：零新依赖、
 * 与其它分组同一套机制、失败模式也一致。
 *
 * ## 刻意**不**暴露的能力（这是判断，不是遗漏）
 *
 * 公开 MCP 意味着任何接入的客户端都能调这些工具，所以下面三类不进：
 *  · `exec -- <命令>` —— 把调用方输入变成任意 shell 命令。这是红线：
 *    「插件绝不把调用方输入变成任意 shell 命令」。
 *  · `cdp <method>` —— 裸协议通道，等同于把浏览器底层完全交出去；
 *    有明确操作需求时应该补一个语义化命令，而不是开这个口子。
 *  · `cookie export` / `cookie pull-system` —— 导出/解密 Cookie 等于直接
 *    交出登录凭据。跟 kyvault 不进公开 MCP 是同一条理由。
 *
 * `eval` 保留了（在页面里跑 JS）：读页面正文只能靠它，而且它跑在**本分组
 * 自己的会话**里，能做的事没超出「这个会话已经能点能读」的范围。
 *
 * ## 身份隔离：永远显式传 --agent
 *
 * 实测踩到的：lite-browser 的会话按 agent 隔离，而**默认身份就是 `default`**。
 * 我第一次验证时没传 --agent，直接开在别人正在用的 default 会话上，把对方
 * 的页面导航走了（它的会话列表里有 11 个会话，分属多个 agent）。
 * 所以这个分组**每次都显式传 --agent**，默认 `mcp`，可用环境变量
 * MUSEAV_MCP_BROWSER_AGENT 改 —— 让 MCP 驱动的浏览永远不跟别的 agent 抢会话。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createRunner } from "../cli.js";
import { BROWSER_CLI } from "../clis.js";
import type { CapabilityGroup } from "../registry.js";

const runBrowser = createRunner(BROWSER_CLI);

/** MCP 自己的浏览器身份 —— 见文件头「身份隔离」 */
function agent(): string {
  return process.env.MUSEAV_MCP_BROWSER_AGENT?.trim() || "mcp";
}

/** 每个命令都要带上的身份参数 */
function withAgent(args: string[]): string[] {
  return [...args, "--agent", agent()];
}

export function registerBrowser(server: McpServer): number {
  server.tool(
    "browser_open",
    "打开一个网页并建立会话（真实 Chrome）。后续的 snapshot / click / type / screenshot " +
      "都作用在这个会话上。要复用某个站点**已确认**的登录态就带 reuse=true（免扫码）；" +
      "撞到登录墙时用 browser_status → browser_await_human → browser_resume 走交接协议。",
    {
      url: z.string().describe("要打开的地址"),
      headless: z.boolean().optional().describe("true=无头模式（不弹窗口）；默认有头，便于人类接管"),
      reuse: z.boolean().optional().describe("复用已确认（verified）的登录态，免重复扫码"),
      profile: z.string().optional().describe("lite-browser 自己的持久化 profile 名，默认用本 MCP 的身份"),
      temp: z.boolean().optional().describe("true=临时会话，退出后不持久化"),
    },
    async (params) => {
      const args = ["open", params.url];
      if (params.headless) args.push("--headless");
      if (params.reuse) args.push("--reuse");
      if (params.profile) args.push("--profile", params.profile);
      if (params.temp) args.push("--temp");
      const out = await runBrowser(withAgent(args));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_snapshot",
    "提取当前页面的可交互元素并编号（@1、@2…）。click / type 的 target 直接传这个编号，" +
      "比 CSS 选择器稳（页面改版也不会失效）。",
    {},
    async () => {
      const out = await runBrowser(withAgent(["snapshot"]));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_click",
    "点击元素。target 优先用 browser_snapshot 给的 @编号，也接受 CSS 选择器。",
    {
      target: z.string().describe("@编号（推荐，见 browser_snapshot）或 CSS 选择器"),
    },
    async (params) => {
      const out = await runBrowser(withAgent(["click", params.target]));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_type",
    "在输入框里键入文本（支持多行与富文本）。",
    {
      target: z.string().describe("@编号（推荐）或 CSS 选择器"),
      text: z.string().describe("要输入的内容"),
    },
    async (params) => {
      const out = await runBrowser(withAgent(["type", params.target, params.text]));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_press",
    "按下特殊按键（Enter / Tab / Escape / Backspace 等）。",
    {
      key: z.string().describe("键名，如 Enter、Tab、Escape、Backspace"),
    },
    async (params) => {
      const out = await runBrowser(withAgent(["press", params.key]));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_scroll",
    "滚动页面（默认向下 400px）。",
    {
      direction: z.enum(["up", "down"]).optional().describe("方向，默认 down"),
      px: z.number().optional().describe("像素，默认 400"),
    },
    async (params) => {
      const args = ["scroll"];
      if (params.direction) args.push(params.direction);
      if (params.px) args.push(String(params.px));
      const out = await runBrowser(withAgent(args));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_screenshot",
    "截图当前视口，返回保存路径（默认存到 /tmp）。",
    {
      path: z.string().optional().describe("保存路径；不传由 CLI 决定（/tmp 下）"),
    },
    async (params) => {
      const args = params.path ? ["screenshot", params.path] : ["screenshot"];
      const out = await runBrowser(withAgent(args));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_eval",
    "在当前页面执行 JavaScript 并返回结果 —— **读页面正文/结构化数据只能靠它**" +
      "（snapshot 只给可交互元素）。作用范围就是这个浏览器会话，拿不到 shell。",
    {
      code: z.string().describe("要执行的 JS，如 document.body.innerText.slice(0,2000)"),
    },
    async (params) => {
      const out = await runBrowser(withAgent(["eval", params.code]));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_status",
    "查当前会话状态 —— **唯一的状态真源**：相位（idle/navigating/acting/awaiting_human/" +
      "blocked/completed）、在等谁、下一步该做什么、登录态判定。卡住时先看它，别猜。",
    {
      json: z.boolean().optional().describe("true=返回机器可读 JSON"),
    },
    async (params) => {
      const args = ["status"];
      if (params.json) args.push("--json");
      const out = await runBrowser(withAgent(args));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_await_human",
    "**阻塞等待人类完成登录或授权**，返回机器可读结果。这是交接协议的中段：" +
      "撞到登录墙 → 调它（会一直等）→ 人类在自己屏幕上完成 → 再 browser_resume。" +
      "⚠️ 它会真的占住这次工具调用直到人类完成或超时（默认 300 秒），" +
      "所以要先把「请你去浏览器里登录 X」告诉用户，再调它。",
    {
      timeout: z.number().optional().describe("最长等待秒数，默认 300"),
      poll: z.number().optional().describe("轮询间隔秒数，默认 3"),
      json: z.boolean().optional().describe("true=返回机器可读 JSON"),
    },
    async (params) => {
      const args = ["await-human"];
      if (params.timeout) args.push("--timeout", String(params.timeout));
      if (params.poll) args.push("--poll", String(params.poll));
      if (params.json) args.push("--json");
      // 给 runner 的超时要**比 CLI 自己的等待更长**，否则是 MCP 先把调用掐了，
      // agent 拿到的是超时错误而不是「人类没来」这个有契约的结果。
      const waitMs = ((params.timeout ?? 300) + 60) * 1000;
      const out = await runBrowser(withAgent(args), Math.max(waitMs, 120_000));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_resume",
    "人类处理完后恢复流程，清除等待态。交接协议的最后一步。",
    {},
    async () => {
      const out = await runBrowser(withAgent(["resume"]));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_close",
    "断开连接并清理本 MCP 的浏览器会话。用完就关，别让 Chrome 常驻。",
    {},
    async () => {
      const out = await runBrowser(withAgent(["close"]));
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "browser_sessions",
    "列出所有 agent 的浏览器会话（端口 / PID / 登录域 / 相位）。" +
      "排查「浏览器被谁占着」「登录态在哪」时用；只读，不会动别人的会话。",
    {},
    async () => {
      const out = await runBrowser(["session", "list"]);
      return { content: [{ type: "text", text: out }] };
    },
  );

  return 13;
}

export const browserGroup: CapabilityGroup = {
  id: "browser",
  title: "浏览器操控",
  project: "lite-browser",
  homepage: "https://github.com/webkubor/lite-browser",
  summary:
    "真实 Chrome 操控：打开/快照/点击/输入/按键/滚动/截图/执行 JS，加上**人类交接协议**" +
    "（status → await-human → resume），以及多 agent 会话隔离与登录态复用。" +
    "没有官方 CLI 的服务（小红书 / 微信 / X）只能这么接。",
  cli: BROWSER_CLI,
  register: registerBrowser,
};
