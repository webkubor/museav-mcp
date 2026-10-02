/**
 * 能力分组：reel —— 竖版短视频合成（开源项目 reel-kit）
 *
 * 三个工具，对应 CLI 自己的三条路径：
 *   templates  列可用模板
 *   bgm        列配乐库（别名 / 授权 / 时长）
 *   make       素材 + 逐句文案 → mp4
 *
 * ## 为什么它值得单独成组
 *
 * museav 出的是**原料**（图、无声片），reel 出的是**能发的成品**。这两段是
 * 一条业务线的前后半截，中间还夹着 voxflow 的配音 —— 分属三个仓库，
 * 而 agent 要干的活是「把这条线走完」。把 reel 接进来，这条线在 MCP 里才闭环。
 *
 * ## 前置
 *
 * `reel` 自己硬依赖 **ffmpeg**（不在 npm 包里）。缺它时 CLI 会报，
 * 而错误里那句装法就是这个分组 CliSpec 里写的那句。
 *
 * 配音是可选段：不给 `--voice` 时镜头时长由 `--per-shot` 决定（不需要任何模型）；
 * 给了 `--voice` 且走默认 `voxcraft` 后端，才会用到本地 Qwen3-TTS。
 * 所以「没装模型的人」也能用这个组出片，只是没有念白。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, statSync } from "node:fs";
import { requireFile } from "../util.js";
import { createRunner } from "../cli.js";
import { REEL_CLI } from "../clis.js";
import type { CapabilityGroup } from "../registry.js";

const runReel = createRunner(REEL_CLI);

/**
 * `--assets` 两种形态都收：目录（按文件名排序）或逗号分隔的多个文件。
 * 这是 CLI 的契约，所以校验也按两种形态来 —— 提前说清哪个路径不对，
 * 比让 CLI 在渲染到一半时报一句它自己的用法错误强。
 */
function normalizeAssets(value: string | undefined): string {
  if (!value) throw new Error("缺少必填参数: assets（素材图目录，或逗号分隔的多个文件）");
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("assets 是空的");
  if (parts.length === 1) {
    const p = parts[0];
    if (!existsSync(p)) throw new Error(`assets 路径不存在: ${p}`);
    return p; // 目录或单个文件都交给 CLI，它自己认
  }
  for (const p of parts) {
    if (!existsSync(p)) throw new Error(`assets 里的文件不存在: ${p}`);
    if (statSync(p).isDirectory()) throw new Error(`assets 用了逗号分隔，但其中是目录: ${p}`);
  }
  return parts.join(",");
}

export function registerReel(server: McpServer): number {
  server.tool(
    "reel_templates",
    "列出 reel 可用的竖版视频模板名（reel_make 的 template 从这里取，不要凭印象编）。",
    {},
    async () => {
      const out = await runReel(["templates"], 60_000);
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "reel_bgm",
    "列出 reel 的配乐库：别名、时长、风格、授权。用 reel_make 的 bgm 传别名；" +
      "想按别名取要先配配乐清单，直接给文件路径则不需要。",
    {},
    async () => {
      const out = await runReel(["bgm"], 60_000);
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "reel_make",
    "把素材图 + 逐句文案合成竖版短视频（mp4）。素材与文案**按顺序一一对应**，" +
      "数量不等时取较少的一方并明确报出来，不会静默丢弃。需要系统里有 ffmpeg。" +
      "不给 voice 时镜头时长由 perShot 决定（不需要任何模型）。",
    {
      assets: z.string().describe("素材图目录（按文件名排序）或逗号分隔的多个文件路径 —— 必填"),
      caps: z.string().optional().describe("逐句文案文件路径，一行一句；行数决定镜头数"),
      template: z.string().optional().describe("模板名，见 reel_templates；不传用 CLI 默认 sticker-promo"),
      out: z.string().optional().describe("输出 mp4 路径"),
      title: z.string().optional().describe("主标题"),
      subtitle: z.string().optional().describe("副标题"),
      footer: z.string().optional().describe("底部引导语"),
      bgm: z.string().optional().describe("背景音乐：别名（见 reel_bgm）或文件路径"),
      perShot: z.number().optional().describe("每镜时长（秒），默认 2.5；有配音时由念白决定"),
      lastShot: z.number().optional().describe("末镜时长（秒），留给引导语"),
      size: z.string().optional().describe("画布尺寸，默认 1080x1920（注意：部分模板会覆盖它）"),
      fps: z.number().optional().describe("输出帧率，默认 30"),
      transition: z
        .enum(["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down",
               "wipe-left", "wipe-right", "dissolve", "zoom-in"])
        .optional()
        .describe("镜与镜之间的转场，默认 none（硬切）"),
      transitionDuration: z.number().optional().describe("转场时长（秒），默认 0.4"),
      voice: z.string().optional().describe("开启配音：voxcraft 后端此项是已注册的音色 key；不给就没有念白"),
      voiceEngine: z.enum(["voxcraft", "museav"]).optional().describe("配音后端，默认 voxcraft（本地、免费）"),
      keepFrames: z.boolean().optional().describe("保留中间产物（排版 / 配音调试用）"),
    },
    async (params) => {
      const args = ["make", "--assets", normalizeAssets(params.assets)];
      if (params.caps) args.push("--caps", requireFile(params.caps, "caps（逐句文案）"));
      if (params.template) args.push("--template", params.template);
      if (params.out) args.push("--out", params.out);
      if (params.title) args.push("--title", params.title);
      if (params.subtitle) args.push("--subtitle", params.subtitle);
      if (params.footer) args.push("--footer", params.footer);
      if (params.bgm) args.push("--bgm", params.bgm);
      if (params.perShot) args.push("--per-shot", String(params.perShot));
      if (params.lastShot) args.push("--last-shot", String(params.lastShot));
      if (params.size) args.push("--size", params.size);
      if (params.fps) args.push("--fps", String(params.fps));
      if (params.transition) args.push("--transition", params.transition);
      if (params.transitionDuration) args.push("--transition-duration", String(params.transitionDuration));
      if (params.voice) args.push("--voice", params.voice);
      if (params.voiceEngine) args.push("--voice-engine", params.voiceEngine);
      if (params.keepFrames) args.push("--keep-frames");
      const out = await runReel(args);
      return { content: [{ type: "text", text: out }] };
    },
  );

  return 3;
}

export const reelGroup: CapabilityGroup = {
  id: "reel",
  title: "竖版短视频合成",
  project: "@kubor/reel-kit",
  homepage: "https://github.com/webkubor/reel-kit",
  summary:
    "素材 + 逐句文案 → 竖版成片（mp4）：自带多套版式模板、转场、配乐库与片尾引导语，" +
    "可选配音。**需要系统里有 ffmpeg**。museav 出原料，这个出能发的成品。",
  cli: REEL_CLI,
  register: registerReel,
};
