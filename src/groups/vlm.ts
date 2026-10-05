/**
 * 能力分组：vlm —— 本地看图理解（开源项目 mlx-vlm-kit）
 *
 * 4 个工具：描述、任意提问、封面质检、反推出图 prompt。
 * 免登录、零成本（本地 Qwen3-VL，Apple MLX）；**硬约束：Apple Silicon**。
 *
 * 与 museav 的 reverse 分工：reverse 走中台专做 SCULPT 格式反推；
 * vlm_* 是通用看图问答，两者互补，不互相替代。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, statSync } from "node:fs";
import { requireFile } from "../util.js";
import { createRunner } from "../cli.js";
import { VLM_CLI } from "../clis.js";
import type { CapabilityGroup } from "../registry.js";

const runVlm = createRunner(VLM_CLI);

export function registerVlm(server: McpServer): number {
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
  return 4;
}

export const vlmGroup: CapabilityGroup = {
  id: "vlm",
  title: "本地看图理解",
  project: "mlx-vlm-kit",
  homepage: "https://github.com/webkubor/mlx-vlm-kit",
  summary:
    "本地离线看图：描述主体与色调、任意提问、音乐封面语义质检、反推出图 prompt。" +
    "零成本不联网；需要 Apple Silicon（MLX）。",
  cli: VLM_CLI,
  register: registerVlm,
};
