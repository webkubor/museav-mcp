/**
 * 能力分组：contrast-guard —— 对比度门禁（开源项目 contrast-guard）
 *
 * 三个工具，对应 CLI 自己的三条路径：
 *   check    静态查「色值对不对」（读 contrast.config.*，零依赖，CI 里裸跑）
 *   init     生成一份配置模板（第一次用必须先跑，否则 check 会说找不到配置）
 *   measure  渲染后查「实际多少」（要浏览器，运行时探测，不在 dependencies 里）
 *
 * ⚠️ check 与 init 是 **cwd 敏感**的：配置从当前目录读。所以这两个工具都带
 * `dir` 参数，并把它当子进程 cwd —— 不这么做，agent 只能检查 MCP server
 * 自己的启动目录，而那个目录跟它想检查的项目毫无关系。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireDir } from "../util.js";
import { createRunner } from "../cli.js";
import { CONTRAST_CLI } from "../clis.js";
import type { CapabilityGroup } from "../registry.js";

const runContrast = createRunner(CONTRAST_CLI);

export function registerContrast(server: McpServer): number {
  server.tool(
    "contrast_check",
    "静态检查对比度：读项目里的 contrast.config.{js,mjs,json}，按配对色值判达标。零依赖、不联网。" +
      "返回逐条结论与整改项。第一次用某个项目要先 contrast_init 生成配置。",
    {
      dir: z.string().optional().describe("要检查的项目目录绝对路径（配置从这里读）；不传用 MCP 进程当前目录"),
      json: z.boolean().optional().describe("true=返回机器可读 JSON；不传=返回人读表格"),
    },
    async (params) => {
      const dir = requireDir(params.dir, "dir");
      const args = params.json ? ["--json"] : [];
      const out = await runContrast(args, undefined, undefined, undefined, { cwd: dir });
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "contrast_init",
    "在项目里生成一份 contrast.config 模板（含 files 与 pairs 示例）。只写一个新文件，不覆盖已有配置。",
    {
      dir: z.string().optional().describe("目标项目目录绝对路径；不传用 MCP 进程当前目录"),
    },
    async (params) => {
      const dir = requireDir(params.dir, "dir");
      const out = await runContrast(["--init"], 60_000, undefined, undefined, {
        cwd: dir,
        verdictExit: false, // 生成配置是动作，失败就是真失败（比如配置已存在）
      });
      return { content: [{ type: "text", text: out }] };
    },
  );

  server.tool(
    "contrast_measure",
    "渲染后计量：量一个 URL 的实际字号/灰阶/动效，可与基线逐项对比。" +
      "需要浏览器（运行时探测，没装会提示）；比 check 慢。baselines=true 时列出已存基线，此时不需要 url。",
    {
      url: z.string().optional().describe("要量的页面 URL（不带协议按 https 补）"),
      save: z.string().optional().describe("把这次结果存为基线，给个名字"),
      vs: z.string().optional().describe("与已存基线逐项对比（名字见 baselines=true 的列表）"),
      baselines: z.boolean().optional().describe("true=只列出已存基线，不量页面"),
      json: z.boolean().optional().describe("true=返回机器可读 JSON"),
    },
    async (params) => {
      if (!params.baselines && !params.url) {
        throw new Error("要么给 url 量一个页面，要么 baselines=true 列已存基线");
      }
      const args = ["measure"];
      if (params.baselines) args.push("--baselines");
      if (params.url) args.push(params.url);
      if (params.save) args.push("--save", params.save);
      if (params.vs) args.push("--vs", params.vs);
      if (params.json) args.push("--json");
      const out = await runContrast(args);
      return { content: [{ type: "text", text: out }] };
    },
  );

  return 3;
}

export const contrastGroup: CapabilityGroup = {
  id: "contrast",
  title: "对比度门禁",
  project: "contrast-guard",
  homepage: "https://github.com/webkubor/contrast-guard",
  summary:
    "静态查色值达不达标、渲染后量实际字号/灰阶/动效、存基线与基线对比。" +
    "「丑的每一处单看往往都『对』」，所以 check 与 measure 分工，别只跑一个。",
  cli: CONTRAST_CLI,
  register: registerContrast,
};
