# Changelog

## 1.0.1 (2026-09-08)

### 首次走 CI 发版

1.0.0 是本地 `npm publish` 发的——首发时包在 npm 上还不存在，Trusted Publishing
没法预先绑定仓库，所以那版没有 provenance。这版起走 GitHub Actions：
三重版本校验（tag / package.json / CHANGELOG 顶部）→ 真起一次 stdio server 冒烟
→ `npm publish --provenance`。

功能没有变化，工具仍是 1.0.0 那八个。

- chore: `repository.url` 用 `git+https` 形式，去掉 `npm publish` 的规范化警告

## 1.0.0 (2026-09-08)

### 首次发布到 npm：一行接入，不用再 clone

以前接这个 MCP 要 clone 仓库、`pnpm build`、再往配置里填绝对路径。现在：

```bash
claude mcp add museav -- npx -y museav-mcp
```

### 八个工具

| 工具 | 背后 |
| --- | --- |
| `gen_background` | `museav gen`（出图/出视频，走中台，需登录） |
| `remove_bg` / `upscale_image` / `remove_watermark` / `compress_image` | `museav` 本地后期（免登录、不耗额度） |
| `skillhub_tags` / `skillhub_whoami` / `skillhub_publish` | `museav skillhub`（发布 Skill 到小红书 SkillHub） |

### SkillHub 发布：默认 dry-run，不会替你提交

- `skillhub_publish` **默认只预演**（本地打包 + 校验，不上传不提交），把待提交内容返回给人核对；
  只有用户明确说「提交 / 确认 / submit」时才带 `submit=true` 真提交
- 提交不可逆：Skill ID 是平台主键，跨版本不可改名
- 内容标签用 `skillhub_tags` 实时拉，不硬编码
- **真提交前会先卡登录态**：未登录时 CLI 会打印二维码并阻塞等扫码，而 MCP 走 execFile
  要等进程结束才拿到输出——二维码根本传不到人眼前，就是死锁。所以这里直接报错，
  引导用户去终端跑一次 `museav skillhub login`，而不是挂在那儿

> 依赖全局的 `museav`（>= 3.1.0，skillhub 系工具要它）：`npm i -g museav-cli`。
> 不在 PATH 时用 `MUSEAV_BIN` 环境变量指定。
