#!/usr/bin/env node
/**
 * museav-mcp — MUSE AV 出图中台后期能力 MCP Server
 *
 * 把 museav-cli 的后期/生成能力暴露为 MCP 工具，供 WorkBuddy / 任意 AI Agent 调用：
 *   - gen_background   出背景图 / 出图 / 出视频（在线，走中台，需登录）
 *   - remove_bg        本地抠图去背景（ISNet/U2Net，免登录）
 *   - upscale_image    本地超分放大（Real-ESRGAN 4x，免登录）
 *   - remove_watermark 本地去水印（LaMa 修复，免登录）
 *   - compress_image   本地压缩图片（sharp，免登录）
 *   - skillhub_tags    查小红书 SkillHub 内容标签（发布必须带，不硬编码）
 *   - skillhub_whoami  查 SkillHub 登录态
 *   - skillhub_publish 发布本地 Skill 到小红书 SkillHub（**默认 dry-run**）
 *
 * 传输：stdio。所有图片文件以绝对路径传递，处理结果写回磁盘并返回路径。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync } from "node:fs";

const execFileAsync = promisify(execFile);

// museav CLI 可执行文件：优先环境变量指定，其次全局 PATH
function resolveMuseavBin(): string {
  const env = process.env.MUSEAV_BIN;
  if (env && existsSync(env)) return env;
  return "museav"; // 依赖全局安装的 museav 命令
}

function requireFile(p: string | undefined, label: string): string {
  if (!p) throw new Error(`缺少必填参数: ${label}`);
  if (!existsSync(p)) throw new Error(`${label} 文件不存在: ${p}`);
  if (statSync(p).isDirectory()) throw new Error(`${label} 是目录，需要文件: ${p}`);
  return p;
}

/** skill 入参可以是目录，也可以是 .zip 源包——两者都要，所以不能用 requireFile */
function requireSkillPath(p: string | undefined): string {
  if (!p) throw new Error("缺少必填参数: path（skill 目录或 .zip 源包的绝对路径）");
  if (!existsSync(p)) throw new Error(`skill 路径不存在: ${p}`);
  if (!statSync(p).isDirectory() && !p.endsWith(".zip")) {
    throw new Error(`skill 路径要么是目录、要么是 .zip 源包，收到: ${p}`);
  }
  return p;
}

async function runMuseav(args: string[], timeout = 600_000): Promise<string> {
  const bin = resolveMuseavBin();
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout, // 默认 600s：本地模型/超分可能较慢
    });
    return (stdout.trim() || stderr.trim()).slice(0, 2000);
  } catch (err: any) {
    const detail = err?.stderr?.trim() || err?.message || String(err);
    throw new Error(`museav ${args[0]} 执行失败: ${detail}`.slice(0, 2000));
  }
}

const server = new McpServer({
  name: "museav-mcp",
  version: "1.0.0",
});

// ---------- 工具 1：出背景图 / 出图 ----------
server.tool(
  "gen_background",
  "用 MUSE AV 出图中台生成壁纸背景图/一般出图/出视频（在线，需登录）",
  {
    prompt: z.string().optional().describe("出图提示词（与 skill/template 三选一）"),
    skill: z.string().optional().describe("中台技能 slug，提示词在服务端展开"),
    template: z.string().optional().describe("图片模板 id，提示词在服务端展开"),
    input: z.string().optional().describe("配合 skill 的一句业务描述"),
    ratio: z.enum(["3:4", "9:16", "1:1", "4:3", "16:9"]).optional().describe("宽高比"),
    model: z.string().optional().describe("模型名，如 gpt-image-2"),
    quality: z.enum(["low", "medium", "high"]).optional().describe("质量（仅 gpt-image）"),
    ref: z.string().optional().describe("垫图文件绝对路径，多张用逗号分隔"),
    transparent: z.boolean().optional().describe("透明背景 PNG（抠掉背景）"),
    video: z.boolean().optional().describe("生成视频"),
  },
  async (params) => {
    const args = ["gen"];
    const choice = [params.prompt, params.skill, params.template].filter(Boolean).length;
    if (choice !== 1) throw new Error("prompt / skill / template 必须且只能提供一个");
    if (params.prompt) args.push("--prompt", params.prompt);
    if (params.skill) { args.push("--skill", params.skill); if (params.input) args.push("--input", params.input); }
    if (params.template) args.push("--template", params.template);
    if (params.ratio) args.push("--ratio", params.ratio);
    if (params.model) args.push("--model", params.model);
    if (params.quality) args.push("--quality", params.quality);
    if (params.transparent) args.push("--transparent");
    if (params.video) args.push("--video");
    if (params.ref) {
      const refs = String(params.ref).split(",").map((s) => s.trim()).filter(Boolean);
      for (const r of refs) { requireFile(r, "垫图"); args.push("--ref", r); }
    }
    const out = await runMuseav(args);
    return { content: [{ type: "text", text: out }] };
  }
);

// ---------- 工具 2：抠图去背景 ----------
server.tool(
  "remove_bg",
  "本地抠图去背景（ISNet/U2Net，免登录），输出带 alpha 的 PNG",
  {
    file: z.string().describe("输入图片绝对路径"),
    out: z.string().optional().describe("输出路径（默认 <名>-nobg.png）"),
    model: z.enum(["isnet", "u2net"]).optional().describe("模型，isnet 默认"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["remove-bg", file];
    if (params.out) args.push("--out", params.out);
    if (params.model) args.push("--model", params.model);
    const out = await runMuseav(args);
    const resultPath = params.out || file.replace(/\.([^.]+)$/, "-nobg.png");
    return { content: [{ type: "text", text: `${out}\n输出文件路径: ${resultPath}` }] };
  }
);

// ---------- 工具 3：超分放大 ----------
server.tool(
  "upscale_image",
  "本地超分放大（Real-ESRGAN + Vulkan GPU，免登录），默认 4x 输出 PNG",
  {
    file: z.string().describe("输入图片绝对路径"),
    out: z.string().optional().describe("输出路径"),
    scale: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional().describe("放大倍数，默认 4"),
    model: z.enum(["realesrgan-x4plus", "realesrgan-x4plus-anime"]).optional().describe("模型"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["upscale", file];
    if (params.out) args.push("--out", params.out);
    if (params.scale) args.push("--scale", String(params.scale));
    if (params.model) args.push("--model", params.model);
    const out = await runMuseav(args);
    const resultPath = params.out || file.replace(/\.([^.]+)$/, `-${params.scale || 4}x.png`);
    return { content: [{ type: "text", text: `${out}\n输出文件路径: ${resultPath}` }] };
  }
);

// ---------- 工具 4：去水印 ----------
server.tool(
  "remove_watermark",
  "本地去水印（LaMa 修复，免登录），自动定位，复杂画面可用 mask 指定",
  {
    file: z.string().describe("输入图片绝对路径"),
    out: z.string().optional().describe("输出路径（默认 <名>-clean.png）"),
    mask: z.string().optional().describe("手工掩码图（白色=去除区），跳过自动定位"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["remove-watermark", file];
    if (params.out) args.push("--out", params.out);
    if (params.mask) { requireFile(params.mask, "mask"); args.push("--mask", params.mask); }
    const out = await runMuseav(args);
    const resultPath = params.out || file.replace(/\.([^.]+)$/, "-clean.png");
    return { content: [{ type: "text", text: `${out}\n输出文件路径: ${resultPath}` }] };
  }
);

// ---------- 工具 5：压缩 ----------
server.tool(
  "compress_image",
  "本地压缩图片（sharp，免登录），默认同目录 <名>-min.<格式>",
  {
    file: z.string().describe("输入图片绝对路径"),
    out: z.string().optional().describe("输出路径"),
    maxEdge: z.number().optional().describe("最长边缩到此像素（等比）"),
    quality: z.number().optional().describe("jpg/webp 质量，默认 82"),
    format: z.enum(["jpg", "png", "webp"]).optional().describe("输出格式"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["compress", file];
    if (params.out) args.push("--out", params.out);
    if (params.maxEdge) args.push("--max-edge", String(params.maxEdge));
    if (params.quality) args.push("--quality", String(params.quality));
    if (params.format) args.push("--format", params.format);
    const out = await runMuseav(args);
    return { content: [{ type: "text", text: out }] };
  }
);

/**
 * SkillHub 是否已登录。whoami 未登录也返回 0，所以只能解析回执里的 loggedIn；
 * 解析不出来时按「未登录」处理——宁可多让用户登一次，也不能让 MCP 挂在扫码上死等。
 */
async function skillhubLoggedIn(): Promise<boolean> {
  try {
    const out = await runMuseav(["skillhub", "whoami"], 60_000);
    const line = out.split("\n").filter((l) => l.includes("RESULT_JSON:")).at(-1);
    if (!line) return false;
    const parsed = JSON.parse(line.slice(line.indexOf("RESULT_JSON:") + "RESULT_JSON:".length));
    return parsed?.credentials?.loggedIn === true;
  } catch {
    return false;
  }
}

// ---------- 工具 6-8：小红书 SkillHub ----------
//
// 为什么真提交要先卡登录态：未登录时 CLI 会打印二维码**并阻塞等扫码**，而 MCP 走
// execFile —— 要等进程结束才拿到输出，二维码根本传不到用户眼前，就是死锁。
// 所以这里未登录直接报错，让 agent 引导用户去终端登录，而不是挂在那儿。
server.tool(
  "skillhub_tags",
  "查小红书 SkillHub 的内容标签（发布必须带 tag，清单实时拉取，不要硬编码）",
  {},
  async () => {
    const out = await runMuseav(["skillhub", "tags"], 60_000);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "skillhub_whoami",
  "查小红书 SkillHub 登录态（脱敏）。真提交前先查这个，未登录要让用户在终端跑 museav skillhub login 扫码",
  {},
  async () => {
    const out = await runMuseav(["skillhub", "whoami"], 60_000);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "skillhub_publish",
  "发布本地 Skill 到小红书 SkillHub。**默认 dry-run**（只本地打包校验、不上传不提交），" +
    "把待提交内容返回给用户核对；只有用户明确说「提交/确认/submit」时才带 submit=true 真提交。" +
    "提交不可逆：Skill ID 是平台主键，跨版本不可改名。",
  {
    path: z.string().describe("本地 skill 目录或 .zip 源包的绝对路径（目录里必须有 SKILL.md）"),
    tag: z.string().describe("内容标签中文名，多个用逗号分隔；清单先用 skillhub_tags 拉，不要硬编码"),
    source: z.enum(["original", "repost"]).optional().describe("内容来源，默认 original（原创）"),
    repostSource: z.string().optional().describe("转载来源平台名（15 字以内），source=repost 时必填"),
    identifier: z.string().optional().describe("Skill ID（kebab-case，平台主键，跨版本不可改）；不传则由 CLI 从名称/目录名派生"),
    submit: z.boolean().optional().describe("true=真提交（不可逆，需已登录）；不传/false=只 dry-run 预演"),
  },
  async (params) => {
    const skillPath = requireSkillPath(params.path);
    const args = ["skillhub", "publish", skillPath, "--tag", params.tag];
    if (params.source) args.push("--source", params.source);
    if (params.repostSource) args.push("--repost-source", params.repostSource);
    if (params.identifier) args.push("--identifier", params.identifier);

    if (!params.submit) {
      const out = await runMuseav(args, 180_000);
      return {
        content: [{
          type: "text",
          text: `${out}\n\n（以上是 dry-run 预演，尚未提交。用户明确说「提交/确认/submit」后，再带 submit=true 调一次）`,
        }],
      };
    }

    // 真提交：先确认已登录，避免 CLI 挂在扫码上等一个谁也看不见的二维码。
    // 注意 whoami 未登录时**退出码是 0**（返回 {"loggedIn":false}），不能靠 try/catch 判断，
    // 必须读回执里的 loggedIn。
    if (!(await skillhubLoggedIn())) {
      throw new Error(
        "SkillHub 未登录，MCP 里没法扫码（二维码要等进程结束才能返回，会死锁）。" +
        "请让用户在自己终端跑一次：museav skillhub login —— 用小红书 App 扫码，完成后再回来提交。",
      );
    }
    const out = await runMuseav([...args, "--yes"], 900_000);
    return { content: [{ type: "text", text: out }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[museav-mcp] server started\n");
}

main().catch((err) => {
  process.stderr.write("[museav-mcp] fatal: " + (err?.message || err) + "\n");
  process.exit(1);
});
