/**
 * 能力分组：museav —— MUSE AV 出图中台（开源项目 museav-cli）
 *
 * 17 个工具：出图/出视频、本地后期（抠图/超分/去水印/压缩）、模板与技能清单、
 * 工作流与余额、素材上传、图生模板、SCULPT 反推、小红书 SkillHub 发布。
 *
 * 平台类工具需 `museav login`（个人 JWT，7 天）；本地后期那四个离线可用。
 *
 * ⚠️ 下面的工具体是从 src/index.ts **原样搬过来**的，除 runner 来源外一个字没改 ——
 * 它们每一条都对应一次线上踩坑（双路输出、截断留痕、dry-run 默认值…），
 * 改之前先读注释里的原因。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireFile, requireSkillPath } from "../util.js";
import { createRunner } from "../cli.js";
import { MUSEAV_CLI } from "../clis.js";
import type { CapabilityGroup } from "../registry.js";

// 名字保持 runMuseav —— 搬过来的工具体因此一个字都不用改
const runMuseav = createRunner(MUSEAV_CLI);

const LIST_LIMIT = 8000;

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

export function registerMuseav(server: McpServer): number {
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
    local: z.boolean().optional().describe("改走本地 vlm（mlx-vlm-kit）读图，仍产出 SCULPT 六要素结构 —— 免登录零成本。museav-cli 3.5.0 起本地引擎已从 Ollama 换成 mlx-vlm-kit；vlm 没装时 CLI 自动回落中台 API"),
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

// ---------- 工具 6-8：小红书 SkillHub ----------
//
// 这三个在 1.3.0 随 museav-cli 3.6.0 一起下线过，2026-09-28 跟着 CLI 3.9.0
// 恢复 skillhub 一并接回。1.3.0 移除时的判断是「CLI 自己都没这个命令了」，
// CLI 既然回来了，MCP 留着缺口只会让人以为装个 MCP 就能发 Skill，实际不行。

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
    "提交不可逆：Skill ID 是平台主键，跨版本不可改名。" +
    "⚠️ CLI 自带平台资产护栏：Skill 正文里抄了 MUSE AV 平台公共模板的提示词会被拒绝发布；" +
    "只引用模板 slug（museav gen --template xxx）是允许的。被拒时按提示把正文换成调用方式。",
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
  return 17;
}

export const museavGroup: CapabilityGroup = {
  id: "museav",
  title: "MUSE AV 出图中台",
  project: "museav-cli",
  homepage: "https://github.com/webkubor/museav-cli",
  summary:
    "出图/出视频、本地后期（抠图/超分/去水印/压缩）、模板与技能清单、素材上传、" +
    "图生模板、SCULPT 反推、小红书 SkillHub 发布。平台类需 museav login，本地后期离线可用。",
  cli: MUSEAV_CLI,
  register: registerMuseav,
};
