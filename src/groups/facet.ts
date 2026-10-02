/**
 * 能力分组：facet —— Markdown 排版成 PDF / 长图 / 讲稿页（开源项目 facet）
 *
 * 两个工具：
 *   facet_templates  列可用模板
 *   facet_build      拿一份 Markdown 出成品
 *
 * 模板与主题由包内资源解析（projectRoot 锚在包自己身上），所以**不依赖 cwd**；
 * 但 --input / --output 的相对路径是相对 cwd 的，所以 build 仍带 `dir` 参数。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireDir, requireFile } from "../util.js";
import { createRunner } from "../cli.js";
import { FACET_CLI } from "../clis.js";
import { parseAvailableTemplates } from "../parse.js";
import type { CapabilityGroup } from "../registry.js";

const runFacet = createRunner(FACET_CLI);

export function registerFacet(server: McpServer): number {
  server.tool(
    "facet_templates",
    "列出 facet 可用的排版模板名（facet_build 的 template 从这里取，不要凭印象编）。",
    {},
    async () => {
      try {
        await runFacet(["--template", "__list_templates__"], 120_000);
      } catch (e: any) {
        const list = parseAvailableTemplates(String(e?.message ?? ""));
        if (list) {
          return {
            content: [{
              type: "text",
              text: `可用模板（${list.length} 个，facet_build 的 template 参数取这里的名字）：\n` +
                list.map((t) => `- ${t}`).join("\n"),
            }],
          };
        }
        throw e; // 报错格式变了就把原话透出来，别编
      }
      throw new Error("没能从 facet 拿到模板清单（它这次没报未知模板）。直接看 facet 仓的 templates/ 目录。");
    },
  );

  server.tool(
    "facet_build",
    "把一份 Markdown 排成成品（PDF / 长图 / 讲稿页）。模板名先用 facet_templates 查。" +
      "相对路径按 dir（不传则 MCP 进程当前目录）解析。",
    {
      input: z.string().describe("输入 Markdown 文件绝对路径"),
      output: z.string().optional().describe("输出文件路径（.pdf）；不传按模板名生成到 output/ 下"),
      template: z.string().optional().describe("排版模板名，见 facet_templates；不传用 CLI 默认 warm-handbook"),
      dir: z.string().optional().describe("工作目录绝对路径（相对路径按它解析）"),
      theme: z.string().optional().describe("自定义主题文件路径"),
      talk: z.boolean().optional().describe("true=按讲稿页排版（一屏一页）"),
      split: z.boolean().optional().describe("true=按字数自动分页"),
      all: z.boolean().optional().describe("true=用全部模板各出一份"),
    },
    async (params) => {
      const input = requireFile(params.input, "input");
      const dir = requireDir(params.dir, "dir");
      const args = ["--input", input];
      if (params.output) args.push("--output", params.output);
      if (params.template) args.push("--template", params.template);
      if (params.theme) { requireFile(params.theme, "theme"); args.push("--theme", params.theme); }
      if (params.talk) args.push("--talk");
      if (params.split) args.push("--split");
      if (params.all) args.push("--all");
      const out = await runFacet(args, undefined, undefined, undefined, { cwd: dir });
      return { content: [{ type: "text", text: out }] };
    },
  );

  return 2;
}

export const facetGroup: CapabilityGroup = {
  id: "facet",
  title: "Markdown 排版成成品",
  project: "@webkubor/facet",
  homepage: "https://github.com/webkubor/facet",
  summary:
    "把 Markdown 知识教程 / 项目型简历排成漂亮、稳定、可分享的 PDF 与长图。" +
    "自带多套模板（教程、简历、讲稿、杂志…），纯本地，不联网。",
  cli: FACET_CLI,
  register: registerFacet,
};
