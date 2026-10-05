/**
 * 入参校验 —— 从 src/index.ts 原样搬来，行为不变。
 *
 * 校验发生在**调 CLI 之前**：让 agent 拿到「哪个参数错了」，
 * 而不是让底层二进制报一句它自己的用法错误。
 */
import { existsSync, statSync } from "node:fs";

export function requireFile(p: string | undefined, label: string): string {
  if (!p) throw new Error(`缺少必填参数: ${label}`);
  if (!existsSync(p)) throw new Error(`${label} 文件不存在: ${p}`);
  if (statSync(p).isDirectory()) throw new Error(`${label} 是目录，需要文件: ${p}`);
  return p;
}

/** skill 入参可以是目录，也可以是 .zip 源包——两者都要，所以不能用 requireFile */
export function requireSkillPath(p: string | undefined): string {
  if (!p) throw new Error("缺少必填参数: path（skill 目录或 .zip 源包的绝对路径）");
  if (!existsSync(p)) throw new Error(`skill 路径不存在: ${p}`);
  if (!statSync(p).isDirectory() && !p.endsWith(".zip")) {
    throw new Error(`skill 路径要么是目录、要么是 .zip 源包，收到: ${p}`);
  }
  return p;
}

/** 目录参数：允许不存在时给一句人话，而不是让 CLI 在 cwd 里瞎找 */
export function requireDir(p: string | undefined, label: string): string | undefined {
  if (!p) return undefined;
  if (!existsSync(p)) throw new Error(`${label} 目录不存在: ${p}`);
  if (!statSync(p).isDirectory()) throw new Error(`${label} 需要目录，收到文件: ${p}`);
  return p;
}
