#!/usr/bin/env node
/**
 * museav-mcp — MUSE AV 出图中台后期能力 MCP Server
 *
 * 把 museav-cli 的生成/后期/素材能力暴露为 MCP 工具，供 Claude Code / DSH / WorkBuddy
 * 或任意 AI Agent 调用：
 *   - gen_background   出背景图 / 出图 / 出视频（在线，走中台，需登录）
 *   - remove_bg        本地抠图去背景（BiRefNet/ISNet/U2Net，免登录）
 *   - upscale_image    本地超分放大（Real-ESRGAN 4x，免登录）
 *   - remove_watermark 本地去水印（LaMa 修复，免登录）
 *   - compress_image   本地压缩图片（sharp，免登录）
 *   - list_templates   查可用图片/文字模板（Agent 自己挑，别硬编码）
 *   - list_skills      查可用技能（提示词在服务端展开，配合 gen 的 skill 用）
 *   - list_jobs        查自己的出图工作流（生成结果与失败原因）
 *   - upload_asset     上传素材拿公网直链（喂 gen 的 ref / 垫图）
 *   - image_to_template 图生模板：读图 + 文字层逆向 + 变量化，建成可复用模板
 *   - reverse         读图反推 SCULPT prompt（中台 API；与 vlm_reverse_prompt 互补，图像识别仍优先 mlx-vlm-kit）
 *   - list_models     查可用模型 / 视频档次（CLI 3.4.0+）
 *   - balance         查上游余额
 *   - list_video_templates 查可用视频模板（与 list_templates 平级）
 *   - vlm_describe     本地看图理解（mlx-vlm-kit，Qwen3-VL，免登录、零成本）
 *   - vlm_ask          对图片任意提问（本地 MLX，同上）
 *   - vlm_cover_check  音乐封面语义质检（本地 MLX，--batch 支持目录）
 *   - vlm_reverse_prompt 反推出图 prompt（喂回 gen 复刻同风格）
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

/**
 * @param timeout  默认 600s：本地模型/超分可能较慢
 * @param maxChars 回传上限。默认 2000 —— 出图/后期是单条结果，长了没用；
 *                 清单类（templates / skills / jobs）要放宽，否则截断处正好是 Agent
 *                 要读的模板清单，它只会以为「就这么多」。
 * @param mode     取哪一路输出。**这个不是可有可无的开关**：museav 的双路输出是
 *                 有分工的 —— stdout 给机器（`templates`/`skills` 是裸 id 列表），
 *                 stderr 给人（带中文名、分类、字段、是否需垫图的表格）。
 *                 Agent 要「挑一个模板」，挑的依据全在 stderr；只读 stdout 等于
 *                 把 104 个模板压成一串 UUID 丢给它。`jobs` 反过来，stdout 是完整
 *                 JSON（含 cdn_url / status / error），stderr 才是摘要。
 */
type OutMode = "stdout" | "stderr";

async function runMuseav(
  args: string[],
  timeout = 600_000,
  maxChars = 2000,
  mode: OutMode = "stdout",
): Promise<string> {
  const bin = resolveMuseavBin();
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout, // 默认 600s：本地模型/超分可能较慢
    });
    const raw = mode === "stderr"
      ? (stderr.trim() || stdout.trim())
      : (stdout.trim() || stderr.trim());
    // 截断要留痕：不说，Agent 会把截断处当成清单的结尾。
    const cut = raw.length > maxChars ? `\n…（输出已截断，共 ${raw.length} 字，用过滤参数收窄）` : "";
    return raw.slice(0, maxChars) + cut;
  } catch (err: any) {
    const detail = err?.stderr?.trim() || err?.message || String(err);
    throw new Error(`museav ${args[0]} 执行失败: ${detail}`.slice(0, 2000));
  }
}

const server = new McpServer({
  name: "museav-mcp",
  version: "1.1.0",
});

// ---------- 工具 1：出背景图 / 出图 ----------
server.tool(
  "gen_background",
  "用 MUSE AV 出图中台生成壁纸背景图/一般出图/出视频（在线，需登录）。" +
    "选模板或技能前先用 list_templates / list_skills 查真实清单，不要硬编码 slug。",
  {
    prompt: z.string().optional().describe("出图提示词（与 skill/template 三选一）"),
    skill: z.string().optional().describe("中台技能 slug，提示词在服务端展开（清单见 list_skills）"),
    template: z.string().optional().describe("图片模板 id，提示词在服务端展开（清单见 list_templates）"),
    input: z.string().optional().describe("配合 skill 的一句业务描述"),
    fields: z.string().optional().describe("配合 template 的占位符取值，JSON 对象字符串，如 '{\"artist\":\"王嘉尔\"}'；模板没有占位符就不用传"),
    ratio: z.enum(["3:4", "9:16", "1:1", "4:3", "16:9"]).optional().describe("宽高比"),
    model: z.string().optional().describe("模型名，如 gpt-image-2；视频如 artsdance-2-0-pro-260801，不传走 auto 路由"),
    quality: z.enum(["low", "medium", "high"]).optional().describe("质量（仅 gpt-image）"),
    ref: z.string().optional().describe("垫图文件绝对路径，多张用逗号分隔（最多 5 张，顺序对应提示词里的「图片1、图片2…」）"),
    transparent: z.boolean().optional().describe("透明背景 PNG（抠掉背景）"),
    video: z.boolean().optional().describe("生成视频"),
    duration: z.number().optional().describe("视频时长（秒，仅 video=true 有意义，由模型与上游支持范围决定）"),
    image: z.string().optional().describe("图生视频首帧图绝对路径（仅 video=true）"),
    project: z.string().optional().describe("归档进该工作区（id 或名字，账户身份才生效）"),
    batch: z.string().optional().describe("批量出图：文本文件绝对路径，每行一条（'#' 注释与空行跳过）；配合 skill/template 时每行是业务描述，否则是完整提示词"),
  },
  async (params) => {
    const args = ["gen"];
    const choice = [params.prompt, params.skill, params.template].filter(Boolean).length;
    if (choice !== 1) throw new Error("prompt / skill / template 必须且只能提供一个");
    if (params.prompt) args.push("--prompt", params.prompt);
    if (params.skill) { args.push("--skill", params.skill); if (params.input) args.push("--input", params.input); }
    if (params.template) args.push("--template", params.template);
    if (params.fields) args.push("--fields", params.fields);
    if (params.ratio) args.push("--ratio", params.ratio);
    if (params.model) args.push("--model", params.model);
    if (params.quality) args.push("--quality", params.quality);
    if (params.transparent) args.push("--transparent");
    if (params.video) args.push("--video");
    if (params.duration) args.push("--duration", String(params.duration));
    if (params.image) { requireFile(params.image, "image（视频首帧）"); args.push("--image", params.image); }
    if (params.project) args.push("--project", params.project);
    if (params.batch) { requireFile(params.batch, "batch 清单"); args.push("--batch", params.batch); }
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
  "本地抠图去背景（BiRefNet/ISNet/U2Net，免登录），输出带 alpha 的 PNG",
  {
    file: z.string().describe("输入图片绝对路径"),
    out: z.string().optional().describe("输出路径（默认 <名>-nobg.png）"),
    model: z.enum(["birefnet", "isnet", "u2net"]).optional().describe("模型，birefnet 默认（细节最好，模型约 214MB）；isnet/u2net 更小"),
    overwrite: z.boolean().optional().describe("输出文件已存在时是否覆盖（默认 false，CLI 会拒绝）"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["remove-bg", file];
    if (params.out) args.push("--out", params.out);
    if (params.model) args.push("--model", params.model);
    if (params.overwrite) args.push("--overwrite");
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
    overwrite: z.boolean().optional().describe("输出文件已存在时是否覆盖（默认 false，CLI 会拒绝）"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["upscale", file];
    if (params.out) args.push("--out", params.out);
    if (params.scale) args.push("--scale", String(params.scale));
    if (params.model) args.push("--model", params.model);
    if (params.overwrite) args.push("--overwrite");
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
    overwrite: z.boolean().optional().describe("输出文件已存在时是否覆盖（默认 false，CLI 会拒绝）"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["remove-watermark", file];
    if (params.out) args.push("--out", params.out);
    if (params.mask) { requireFile(params.mask, "mask"); args.push("--mask", params.mask); }
    if (params.overwrite) args.push("--overwrite");
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
    overwrite: z.boolean().optional().describe("输出文件已存在时是否覆盖（默认 false，CLI 会拒绝）"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["compress", file];
    if (params.out) args.push("--out", params.out);
    if (params.maxEdge) args.push("--max-edge", String(params.maxEdge));
    if (params.quality) args.push("--quality", String(params.quality));
    if (params.format) args.push("--format", params.format);
    if (params.overwrite) args.push("--overwrite");
    const out = await runMuseav(args);
    return { content: [{ type: "text", text: out }] };
  }
);

// ---------- 工具 5.5：素材与清单（给 Agent 自己挑，别硬编码） ----------
//
// 为什么要有这几个「只读清单」：出图前那两个必填项 —— 模板 id、技能 slug ——
// 都只能从中台实时拉。Agent 凭印象编一个出来，中台会报「模板不存在」，
// 而它根本分不清是自己拼错了还是真没这个模板。清单工具就是把这一步补上。
//
// 清单回传上限放宽：默认 2000 会把列表从中间截断，而截断处正是 Agent 要读的那部分。
// 8000 大约够 50 条模板 / 90 条技能；再长就该用 category / genre 收窄了。
const LIST_LIMIT = 8000;

server.tool(
  "list_templates",
  "查可用的图片/文字模板（自己租户建的 + 平台共享的）。gen_background 的 template 参数要从这里取，" +
    "不要硬编码；清单很长时先用 category 收窄。模板自带哪些占位符看「字段:」那一列，取值用 fields 传。",
  {
    category: z.string().optional().describe("按分类过滤，如 电商白底图 / 演唱会"),
    type: z.enum(["image", "article"]).optional().describe("图片模板还是文字模板，不传则两类都列并标注"),
    scope: z.enum(["mine", "tenant", "platform"]).optional().describe("只看我建的 / 只看本租户的 / 只看平台共享的"),
  },
  async (params) => {
    const args = ["templates"];
    if (params.category) args.push("--category", params.category);
    if (params.type) args.push("--type", params.type);
    if (params.scope) args.push(`--${params.scope}`);
    // stderr：带中文名/分类/比例/字段的可读表格；stdout 只有裸 id，Agent 挑不了
    const out = await runMuseav(args, 120_000, LIST_LIMIT, "stderr");
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "list_skills",
  "查可用技能（自己的私有技能 + 租户专属 + 公共技能库）。gen_background 的 skill 参数从这里取 slug，" +
    "不要硬编码；清单很长时先用 genre 收窄。最后一列标了是否需垫图。",
  {
    genre: z.string().optional().describe("按分类过滤，如 电商 / 人像写真"),
  },
  async (params) => {
    const args = ["skills"];
    if (params.genre) args.push("--genre", params.genre);
    const out = await runMuseav(args, 120_000, LIST_LIMIT, "stderr");
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "list_jobs",
  "查自己名下的出图工作流（个人 login 看自己的，租户 apiKey 看业务下全部）。" +
    "gen 失败、或要回头找出图结果 URL 时用它；服务端固定只返回最近 50 条。",
  {
    limit: z.number().optional().describe("最多显示几条（在最近 50 条以内截取），默认 20"),
    status: z.enum(["pending", "processing", "done", "failed"]).optional().describe("按状态过滤"),
    project: z.string().optional().describe("只看归档进该工作区的任务（id 或名字）"),
  },
  async (params) => {
    const args = ["jobs"];
    if (params.limit) args.push("--limit", String(params.limit));
    if (params.status) args.push("--status", params.status);
    if (params.project) args.push("--project", params.project);
    const out = await runMuseav(args, 120_000, LIST_LIMIT);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "upload_asset",
  "上传素材（图片/音频/视频，按字节内容判类型）拿公网直链。gen_background 的垫图要的是 URL 时走它；" +
    "本地文件直接传 ref 路径也行，不用先上传。",
  {
    file: z.string().describe("要上传的文件绝对路径"),
    toWorks: z.boolean().optional().describe("同时收进「我的作品」（外面做好的成品用这个，参考图不用）"),
    workspace: z.string().optional().describe("归档到指定工作区（id 或名字）"),
  },
  async (params) => {
    const file = requireFile(params.file, "file");
    const args = ["upload", file];
    if (params.toWorks) args.push("--to-works");
    if (params.workspace) args.push("--workspace", params.workspace);
    const out = await runMuseav(args, 300_000);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "image_to_template",
  "图生模板：上传图或传图片 URL → 读图 + 文字层逆向 + 变量化 → 建成可复用图片模板（原图自动焊成参考图）。" +
    "默认真建模板；只想看草稿、不想往模板库落东西时带 dryRun=true。",
  {
    input: z.string().describe("本地图片绝对路径，或图片 URL"),
    dryRun: z.boolean().optional().describe("true=只看模板草稿不建模板（不消耗模板库）；不传=真建"),
    name: z.string().optional().describe("模板中文名，不给则由中台生成"),
    slug: z.string().optional().describe("模板 slug（全局唯一，撞了直接报错不覆盖），不给则由中台生成"),
    category: z.string().optional().describe("模板分类，不给则按图片内容自动归类"),
    variables: z.string().optional().describe("收窄变量白名单，逗号分隔，如 title,subject,location"),
    labels: z.string().optional().describe("变量 → 你的业务叫法，JSON 对象字符串，如 '{\"subject\":\"艺人\"}'；只影响表单显示名"),
  },
  async (params) => {
    const isUrl = /^https?:\/\//i.test(params.input);
    const input = isUrl ? params.input : requireFile(params.input, "input（本地图片）");
    const args = ["image-to-template", input];
    if (params.dryRun) args.push("--no-create");
    if (params.name) args.push("--name", params.name);
    if (params.slug) args.push("--slug", params.slug);
    if (params.category) args.push("--category", params.category);
    if (params.variables) args.push("--variables", params.variables);
    if (params.labels) args.push("--labels", params.labels);
    const out = await runMuseav(args, 600_000);
    return { content: [{ type: "text", text: out }] };
  }
);


// ---------- 工具 5.6：补充能力（reverse / list_models / balance / video-templates） ----------
//
// reverse 走中台 API（默认）反推 SCULPT prompt，与下方 vlm_reverse_prompt（本地 mlx-vlm-kit）
// 是**互补**而不是替代：vlm 是通用 prompt 反推（本地、免费），reverse 是平台专用 SCULPT 六要素
// （中台、需登录），喂给 gen_background 更顺手。按用户的「图像识别优先 mlx-vlm-kit」原则，
// 调本工具前先看 vlm_reverse_prompt 是否够用；只有当 SCULPT 格式或平台侧约束被显式要求时才走这里。
server.tool(
  "reverse",
  "读图反推 SCULPT prompt（中台 API，stdout 输出英文 prompt；stderr 是结构化中文报告）。" +
    "图像识别默认优先用本地的 vlm_describe / vlm_reverse_prompt（mlx-vlm-kit，免登录零成本）；" +
    "本工具给出平台专用 SCULPT 格式，喂给 gen_background 更顺手。",
  {
    input: z.string().describe("本地图片绝对路径，或图片 URL"),
    local: z.boolean().optional().describe("强制走本地 Ollama qwen3-vl（需自备 Ollama + 模型；与「图像识别优先 mlx-vlm-kit」原则相悖，留着只是因为偶尔要离线）"),
  },
  async (params) => {
    const isUrl = /^https?:\/\//i.test(params.input);
    const input = isUrl ? params.input : requireFile(params.input, "input（图片）");
    const args = ["reverse", input];
    if (params.local) args.push("--local");
    // reverse 默认 stdout 一行英文 prompt，stderr 是结构化中文报告（SCULPT 六要素）。
    // 默认取 stdout 便于管道；agent 若要中文报告可用本地跑 + stderr。
    const out = await runMuseav(args, 300_000);
    return { content: [{ type: "text", text: out }] };
  }
);

// models / balance / video-templates：CLI 3.4.0 新增的运营/清单类工具
server.tool(
  "list_models",
  "查可用模型（CLI 3.4.0+）。--video=true 查视频档次（如 Seedance 2.x 对外名），可直接喂给 " +
    "gen_background 的 video=true + model 参数；不传则查图片模型。清单来自中台，CLI 不硬编码。",
  {
    video: z.boolean().optional().describe("查视频档次（对外名），可直接喂给 gen_background 的 video=true + model"),
  },
  async (params) => {
    const args = ["models"];
    if (params.video) args.push("--video");
    // stderr：人类可读表格（label + 时长/分辨率）；stdout 只有 value 列表（脚本解析用）
    const out = await runMuseav(args, 120_000, LIST_LIMIT, "stderr");
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "balance",
  "查上游余额（平台账户视角，看自己的余额）。",
  {},
  async () => {
    // stdout 输出完整 JSON（含 balance_cny / markup_pct / checked_at），比 stderr 的
    // 「¥X.XX 加价率 N%」更结构化，agent 解析更稳
    const out = await runMuseav(["balance"], 60_000);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "list_video_templates",
  "查可用视频模板（自己租户建的 + 平台共享的，与图片模板是两套表）。" +
    "gen_background 的 video=true + template 组合从这里取 id，不要硬编码。",
  {
    category: z.string().optional().describe("按分类过滤，如 电商 / 换装视频"),
  },
  async (params) => {
    const args = ["video-templates"];
    if (params.category) args.push("--category", params.category);
    // stderr：人类可读表格（id / 中文名 / 分类 / 比例 / 模型 / 字段 / 参考视频 / 归属）
    const out = await runMuseav(args, 120_000, LIST_LIMIT, "stderr");
    return { content: [{ type: "text", text: out }] };
  }
);

// ---------- 工具 5.5：本地看图理解（mlx-vlm-kit） ----------
//
// 免登录、零成本（本地 Qwen3-VL-4B，Apple MLX）。
// 与 museav reverse 的分工：reverse 走中台/本地 Ollama 专做「反推 SCULPT prompt」；
// vlm_* 是通用看图问答（描述/质检/任意提问），两者互补。
// 依赖：pipx install git+https://github.com/webkubor/mlx-vlm-kit.git（全局 vlm 命令）
function resolveVlmBin(): string {
  const env = process.env.MLX_VLM_BIN;
  if (env && existsSync(env)) return env;
  return "vlm";
}

async function runVlm(args: string[], timeout = 300_000): Promise<string> {
  const bin = resolveVlmBin();
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout });
    return stdout.trim().slice(0, 3000);
  } catch (err: any) {
    const detail = err?.stderr?.trim() || err?.message || String(err);
    throw new Error(`vlm ${args[0]} 执行失败: ${detail}`.slice(0, 2000));
  }
}

server.tool(
  "vlm_describe",
  "本地看图理解：描述图片主体与色调（免费/离线，Qwen3-VL）",
  { image: z.string().describe("图片绝对路径") },
  async (params) => {
    const file = requireFile(params.image, "image");
    const out = await runVlm(["describe", file]);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "vlm_ask",
  "对图片任意提问（本地看图理解，免费/离线）",
  {
    image: z.string().describe("图片绝对路径"),
    q: z.string().describe("要问的问题"),
  },
  async (params) => {
    const file = requireFile(params.image, "image");
    const out = await runVlm(["ask", file, "--q", params.q]);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "vlm_cover_check",
  "音乐封面语义质检：有无标题/主体/色调/是否合格。--batch 传目录",
  {
    image: z.string().describe("图片或目录绝对路径"),
    batch: z.boolean().optional().describe("目录递归批量质检"),
  },
  async (params) => {
    const p = params.image;
    if (!existsSync(p)) throw new Error(`路径不存在: ${p}`);
    const args = ["cover-check", p];
    if (params.batch || statSync(p).isDirectory()) args.push("--batch");
    const out = await runVlm(args);
    return { content: [{ type: "text", text: out }] };
  }
);

server.tool(
  "vlm_reverse_prompt",
  "反推出图 prompt（主体/风格/光线/构图），可直接喂 gen 复刻同风格",
  {
    image: z.string().describe("图片绝对路径"),
    lang: z.enum(["en", "zh"]).optional().describe("输出语言，默认 en"),
  },
  async (params) => {
    const file = requireFile(params.image, "image");
    const args = ["reverse-prompt", file, "--lang", params.lang || "en"];
    const out = await runVlm(args);
    return { content: [{ type: "text", text: out }] };
  }
);

//
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[museav-mcp] server started\n");
}

main().catch((err) => {
  process.stderr.write("[museav-mcp] fatal: " + (err?.message || err) + "\n");
  process.exit(1);
});
