/**
 * 三段版本比较 —— 只为「底层二进制够不够新」这一个用途存在，不追求完整 semver。
 *
 * 单独成文件是为了能测：index.ts 一被 import 就会 main() 起 MCP server，
 * 测试里没法直接引它的内部函数。
 *
 * 会咬人的地方是逐段按**数字**比，不是按字符串 —— "3.10.0" 字符串比 "3.6.0" 小，
 * 真出到 3.10 时会把新版本误判成过旧，而那时才发现就晚了。
 */
export function semverLt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}
