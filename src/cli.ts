/**
 * 外部 CLI 调用壳 —— 本 MCP 自己零实现，全部能力来自各开源项目自己的 CLI。
 *
 * 这个文件是「一个分组 = 一个 CLI」的公共底座：分组只声明 CliSpec，
 * 探测、版本守卫、超时、双路输出、截断留痕都由这里统一负责。
 *
 * ## 为什么要版本守卫
 *
 * 旧版 CLI 缺某个子命令时，agent 拿到的是 `unknown command`，而不是「请升级」。
 * 2026-09-16 真咬过一次：owner 机器上全局 museav 卡在 3.4.0，新发的 3.5.0 根本没生效，
 * 而 MCP 一声不吭照常跑。
 *
 * 守卫只在**首次真要用**时探一次并缓存；失败不缓存 —— 用户装好/升好之后，
 * 下一次调用就能通过，不必重启整个 MCP server。
 *
 * ## 为什么缺 CLI 要单独给话
 *
 * 分组是按 CLI 是否在 PATH 上自动启用的（见 registry.ts），所以正常情况下
 * 缺 CLI 的分组根本不会注册。但显式 `MUSEAV_MCP_GROUPS=<id>` 强开、
 * 或装好之后路径变了，仍会走到这里 —— 这时要给「装什么」，不是给 ENOENT。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { semverLt } from "./semver.js";

const execFileAsync = promisify(execFile);

/** 取哪一路输出。museav 的双路输出是有分工的，见 runMuseav 的注释。 */
export type OutMode = "stdout" | "stderr";

export interface CliSpec {
  /** 人类可读的项目名，报错里用（如 museav-cli） */
  name: string;
  /** 允许把二进制指到具体路径的环境变量（如 MUSEAV_BIN） */
  envVar: string;
  /** PATH 上的命令名（如 museav） */
  command: string;
  /** 缺这个 CLI 时给用户的安装命令 */
  install: string;
  /** 报错里的括注，说清它管什么（如「本地看图靠它」） */
  purpose?: string;
  /** 最低版本；不填 = 不做版本守卫（该 CLI 没有 --version 时别填） */
  minVersion?: string;
  /** 取版本号的参数，默认 --version */
  versionArgs?: string[];
  /** 默认超时，默认 600s：本地模型/超分可能较慢 */
  timeoutMs?: number;
  /** 默认回传上限，默认 2000 */
  maxChars?: number;
  /** 默认取哪一路输出 */
  mode?: OutMode;
  /**
   * 退出码是**判据**而不是故障 —— 非零时照样把报告交回给 agent。
   *
   * 2026-10-02 实测踩到的：contrast-guard 检查不达标时把完整 JSON 报告打到
   * **stdout**、然后 exit 1（它就是给 CI 当闸门用的）。按「非零=调用失败」处理，
   * agent 拿到的是「contrast-guard --json 执行失败」，而真正有价值的报告
   * （哪一对颜色、比值多少、建议改成什么）全被丢掉 —— 它只会以为工具坏了。
   */
  verdictExit?: boolean;
}

export interface RunOptions {
  /** CLI 是 cwd 敏感的（读配置、找 templates）时用 */
  cwd?: string;
  /** 按次覆盖 spec.verdictExit（同一个 CLI 里，有的子命令是判据、有的不是） */
  verdictExit?: boolean;
}

/** PATH 上找命令。Windows 的 PATHEXT 不处理 —— 本项目面向 macOS/Linux。 */
function which(command: string): string | null {
  const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of paths) {
    const full = join(dir, command);
    if (existsSync(full)) return full;
  }
  return null;
}

/** 环境变量优先，其次全局 PATH */
export function resolveBin(spec: CliSpec): string {
  const env = process.env[spec.envVar];
  if (env && existsSync(env)) return env;
  return spec.command;
}

/** 这个 CLI 现在能不能用 —— 分组自动启用的判据。不 spawn，纯查文件，快。 */
export function cliAvailable(spec: CliSpec): boolean {
  const env = process.env[spec.envVar];
  if (env) return existsSync(env);
  return which(spec.command) !== null;
}

function missingError(spec: CliSpec): Error {
  const purpose = spec.purpose ? `（${spec.purpose}）` : "";
  return new Error(
    `找不到 ${spec.command} 命令${purpose}。装： ${spec.install}` +
      `（或用环境变量 ${spec.envVar} 指到具体路径）`,
  );
}

export type Runner = (
  args: string[],
  timeout?: number,
  maxChars?: number,
  mode?: OutMode,
  opts?: RunOptions,
) => Promise<string>;

/**
 * 给一个 CliSpec，造一个绑定它的调用函数。
 *
 * @param timeout  默认取 spec.timeoutMs ?? 600_000：本地模型/超分可能较慢
 * @param maxChars 回传上限。默认取 spec.maxChars ?? 2000 —— 出图/后期是单条结果，
 *                 长了没用；清单类（templates / skills / jobs）要放宽，否则截断处
 *                 正好是 Agent 要读的清单，它只会以为「就这么多」。
 * @param mode     取哪一路输出。**这个不是可有可无的开关**：museav 的双路输出是
 *                 有分工的 —— stdout 给机器（`templates`/`skills` 是裸 id 列表），
 *                 stderr 给人（带中文名、分类、字段、是否需垫图的表格）。
 *                 Agent 要「挑一个模板」，挑的依据全在 stderr；只读 stdout 等于
 *                 把 104 个模板压成一串 UUID 丢给它。`jobs` 反过来，stdout 是完整
 *                 JSON（含 cdn_url / status / error），stderr 才是摘要。
 */
export function createRunner(spec: CliSpec): Runner {
  let ok: Promise<void> | null = null;

  async function ensure(): Promise<void> {
    if (!spec.minVersion) return; // 没有版本契约的 CLI 不做守卫
    if (ok) return ok;
    const probe = (async () => {
      const bin = resolveBin(spec);
      let raw: string;
      try {
        raw = (await execFileAsync(bin, spec.versionArgs ?? ["--version"], { timeout: 15_000 })).stdout;
      } catch (err: any) {
        if (err?.code === "ENOENT") throw missingError(spec);
        throw err;
      }
      const v = raw.match(/\d+\.\d+\.\d+/)?.[0];
      if (v && semverLt(v, spec.minVersion!)) {
        throw new Error(
          `${spec.name} 版本过旧：当前 ${v}，本 MCP 需要 >= ${spec.minVersion}。` +
            `升级： ${spec.install}`,
        );
      }
    })();
    ok = probe;
    try {
      await probe;
    } catch (e) {
      ok = null; // 失败不缓存：装好之后下一次调用就能过
      throw e;
    }
  }

  return async function run(args, timeout, maxChars, mode, opts): Promise<string> {
    await ensure();
    const bin = resolveBin(spec);
    const t = timeout ?? spec.timeoutMs ?? 600_000;
    const cap = maxChars ?? spec.maxChars ?? 2000;
    const m = mode ?? spec.mode ?? "stdout";
    try {
      const { stdout, stderr } = await execFileAsync(bin, args, { timeout: t, cwd: opts?.cwd });
      const raw = m === "stderr"
        ? (stderr.trim() || stdout.trim())
        : (stdout.trim() || stderr.trim());
      // 截断要留痕：不说，Agent 会把截断处当成清单的结尾。
      const cut = raw.length > cap ? `\n…（输出已截断，共 ${raw.length} 字，用过滤参数收窄）` : "";
      return raw.slice(0, cap) + cut;
    } catch (err: any) {
      if (err?.code === "ENOENT") throw missingError(spec);
      // 退出码是判据的 CLI：把报告交回，别把结论当故障
      const isVerdict = opts?.verdictExit ?? spec.verdictExit ?? false;
      if (isVerdict && typeof err?.code === "number") {
        const raw = (err?.stdout?.trim() || err?.stderr?.trim() || "");
        const note =
          `\n（${spec.command} 退出码 ${err.code}：这是它的判据，不是调用失败 —— ` +
          `按上面的报告决定怎么改）`;
        return (raw ? raw.slice(0, cap) : `${spec.command} 没有输出`) + note;
      }
      const detail = err?.stderr?.trim() || err?.message || String(err);
      throw new Error(`${spec.command} ${args[0]} 执行失败: ${detail}`.slice(0, 2000));
    }
  };
}
