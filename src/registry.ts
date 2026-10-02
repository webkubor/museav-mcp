/**
 * 能力分组注册表 —— 这个 MCP 的「版图」。
 *
 * ## 这个 MCP 是什么
 *
 * 它是 **CS 系统（CortexOS）的 MCP**：把 owner 个人工具链上各个开源项目的
 * CLI 能力，串成一张任意 agent 都能调用的网。
 *
 * 分层是硬的：
 *   - **能力在 CLI 里**（cs / museav-cli / contrast-guard / facet / …）。
 *     要加能力，先加到 CLI，不是加到这儿。
 *   - **MCP 只做串联**：探测、发现、调用、错误说人话。自己零实现。
 *
 * ## 为什么分组要能关
 *
 * 工具 schema 会随**每一次**模型请求发出去（现有 21 个工具约 3~4k token）。
 * 聚合 MCP 天然会越串越多，不设开关，代价是每个用户每次请求都在为
 * 「他机器上根本没装的那些工具」付 token。
 *
 * 所以默认策略是**探测式**：CLI 在 PATH 上才启用那个分组。
 * 想强开/关掉，用环境变量 MUSEAV_MCP_GROUPS（见 selectGroups）。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CliSpec } from "./cli.js";
import { cliAvailable } from "./cli.js";
import { museavGroup } from "./groups/museav.js";
import { vlmGroup } from "./groups/vlm.js";
import { contrastGroup } from "./groups/contrast.js";
import { facetGroup } from "./groups/facet.js";
import { reelGroup } from "./groups/reel.js";

export interface CapabilityGroup {
  /** 分组 id，也是 MUSEAV_MCP_GROUPS 里的开关名 */
  id: string;
  /** 中文名，给人看 */
  title: string;
  /** 对应的开源项目（包名 / 仓库名） */
  project: string;
  /** 项目主页 */
  homepage?: string;
  /** 一句话说清它能干什么 —— groups_list 直接回给 agent */
  summary: string;
  /** 依赖的外部 CLI；纯内置分组可以不写 */
  cli?: CliSpec;
  /** 注册工具，返回注册了几个 */
  register(server: McpServer): number;
}

/** 全部已知分组。加项目 = 往这里加一个，外加一个 groups/*.ts。 */
export const GROUPS: CapabilityGroup[] = [
  museavGroup,
  vlmGroup,
  contrastGroup,
  facetGroup,
  reelGroup,
];

export const GROUPS_ENV = "MUSEAV_MCP_GROUPS";

export interface SkippedGroup {
  group: CapabilityGroup;
  reason: string;
}

export interface Selection {
  enabled: CapabilityGroup[];
  skipped: SkippedGroup[];
  /** 用户写了但不认识的分组名 —— 拼错时不能静默 */
  unknown: string[];
  /** 是否走的是默认（探测式）策略 */
  byDefault: boolean;
}

/**
 * 解析 MUSEAV_MCP_GROUPS 并选出要启用的分组。
 *
 * 语法（逗号分隔）：
 *   all                 全开（不探测 CLI，缺 CLI 的调用时才报装什么）
 *   facet,contrast      只开这几个（白名单，不探测）
 *   -museav             默认集里去掉这几个
 *   facet,-vlm          白名单 + 排除，可混用
 *
 * 不设这个变量 = 默认策略：**CLI 在 PATH 上才启用**。
 */
export function selectGroups(spec: string | undefined, groups: CapabilityGroup[] = GROUPS): Selection {
  const raw = (spec ?? "").trim();
  const byDefault = raw === "";
  const tokens = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const include = tokens.filter((t) => !t.startsWith("-"));
  const exclude = new Set(tokens.filter((t) => t.startsWith("-")).map((t) => t.slice(1)));

  const known = new Set(groups.map((g) => g.id));
  const unknown = [...include, ...exclude].filter((id) => id !== "all" && !known.has(id));

  const enabled: CapabilityGroup[] = [];
  const skipped: SkippedGroup[] = [];

  const wants = (g: CapabilityGroup): boolean => {
    if (exclude.has(g.id)) return false;
    if (include.includes("all")) return true;
    if (include.length > 0) return include.includes(g.id);
    return cliAvailable(g.cli!) || !g.cli; // 默认：探测式
  };

  for (const g of groups) {
    if (wants(g)) {
      enabled.push(g);
      continue;
    }
    if (exclude.has(g.id)) {
      skipped.push({ group: g, reason: `被 ${GROUPS_ENV} 排除` });
    } else if (include.length > 0) {
      skipped.push({ group: g, reason: `不在 ${GROUPS_ENV} 白名单里` });
    } else {
      skipped.push({ group: g, reason: `没装 ${g.cli?.command ?? "依赖"}` });
    }
  }

  return { enabled, skipped, unknown, byDefault };
}

/**
 * groups_list —— 发现面。**永远注册**，即使一个分组都没启用。
 *
 * 存在的理由：默认策略下没装 CLI 的分组是「隐身」的，agent 无从知道
 * 这个 MCP 还能干什么、该让用户装什么。这一个工具就是那张地图。
 */
export function registerGroupsMeta(server: McpServer, selection: Selection, toolCounts: Map<string, number>): void {
  server.tool(
    "groups_list",
    "列出这个 MCP 的全部能力分组：哪些已启用（各几个工具）、哪些因为没装 CLI 而没启用、" +
      "以及每个分组对应哪个开源项目和怎么装。工具列表里没有的能力，先查这里再让用户装。",
    {},
    async () => {
      const lines: string[] = [];
      lines.push("# 能力分组（CS 系统的 MCP —— owner 个人工具链的串联层）");
      lines.push("");
      lines.push(`开关：环境变量 ${GROUPS_ENV}（逗号分隔 id；支持 -id 排除；all 全开）`);
      lines.push(`当前：启用 ${selection.enabled.length} 组 / 共 ${GROUPS.length} 组` +
        (selection.byDefault ? "（默认策略：装了 CLI 才启用）" : `（按 ${GROUPS_ENV} 指定）`));
      lines.push("");

      for (const g of GROUPS) {
        const on = selection.enabled.some((e) => e.id === g.id);
        const n = toolCounts.get(g.id) ?? 0;
        const mark = on ? "✅ 已启用" : "⛔ 未启用";
        lines.push(`## ${g.id} — ${g.title}　${mark}${on ? `（${n} 个工具）` : ""}`);
        lines.push(`项目：${g.project}${g.homepage ? `　${g.homepage}` : ""}`);
        lines.push(`能力：${g.summary}`);
        if (g.cli) {
          lines.push(`依赖：${g.cli.command}${g.cli.minVersion ? ` >= ${g.cli.minVersion}` : ""}`);
        }
        if (!on) {
          const why = selection.skipped.find((s) => s.group.id === g.id)?.reason;
          if (why) lines.push(`为什么没启用：${why}`);
          if (g.cli) lines.push(`装：${g.cli.install}`);
          lines.push(`强开（不装也能看见工具，调用时才报错）：${GROUPS_ENV}=${g.id}`);
        }
        lines.push("");
      }

      if (selection.unknown.length > 0) {
        lines.push(`⚠️ ${GROUPS_ENV} 里有不认识的 id：${selection.unknown.join(", ")}`);
        lines.push(`可用的：${GROUPS.map((g) => g.id).join(", ")}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n").trimEnd() }] };
    },
  );
}
