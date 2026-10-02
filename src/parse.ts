/**
 * CLI 报错文本的解析 —— 单独成文件是为了能测，理由同 semver.ts：
 * facet.ts 一被 import 就会注册工具，测试里引不到它的内部函数。
 *
 * ## 为什么要从报错里取清单
 *
 * facet 的 CLI 没有 list 命令，但模板名校验是它自己的真源：传一个不存在的模板，
 * 它会回 `Unknown template "x". Available: a, b, c`。
 * 拿它的报错当清单是刻意的 —— 在 MCP 里抄一份模板名单必然漂移（facet 加模板时
 * 没人会记得改这边），而 agent 会照着过期名单编模板名，然后拿到一句它分不清是
 * 「拼错」还是「真没有」的报错。
 *
 * ## 2026-10-02 踩到的坑（这段代码存在的全部理由）
 *
 * Node 打未捕获异常的栈时，**先打出错那一行的源码**，而那行里也写着
 * `Available: ${templateNames.join(", ")}` —— 直接取第一个匹配，
 * 拿到的「清单」是 `${templateNames.join("` 和 `")}` 两段模板字面量垃圾，
 * 而 MCP 会把它当成模板名列表交给 agent。
 *
 * 所以：滤掉含 `${` 的候选行，并且只认 kebab-case 的条目。
 */

/** 从 CLI 报错文本里取出可用模板名；认不出就返回 null（调用方负责把原话透出来） */
export function parseAvailableTemplates(message: string): string[] | null {
  const candidates = [...message.matchAll(/Available:\s*([^\n]+)/g)]
    .map((m) => m[1])
    .filter((line) => !line.includes("$") && !line.includes("{"));
  for (const line of candidates) {
    const names = line
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9][a-z0-9-]*$/.test(s));
    if (names.length >= 2) return names;
  }
  return null;
}
