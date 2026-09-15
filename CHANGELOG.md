# Changelog

## 1.1.0 (2026-09-15)

### 把 1.0.1 之后压在本地的东西发出去，并补齐包装层缺的参数

1.0.1 之后仓库里已经有了 mlx-vlm-kit 那四个本地看图工具，但它们**从没发到 npm**：
`package.json` 还停在 1.0.1、最新 tag 是 `v1.0.1`、`publish.yml` 只在推 `v*` 时触发。
所以 `npx -y museav-mcp` 拿到的一直是八个工具的旧版。这版把它们发出去，共 **17 个工具**。

### 新增：本地看图理解（mlx-vlm-kit）

免登录、零调用成本（本地 Qwen3-VL-4B，Apple MLX）：

| 工具 | 干什么 |
| --- | --- |
| `vlm_describe` | 描述图片主体与色调 |
| `vlm_ask` | 对图片任意提问 |
| `vlm_cover_check` | 音乐封面语义质检（`batch=true` 递归目录） |
| `vlm_reverse_prompt` | 反推出图 prompt，喂回 `gen_background` 复刻同风格 |

前置：`pipx install git+https://github.com/webkubor/mlx-vlm-kit.git`（>= 0.1.0）。
`vlm` 不在 PATH 时用 `MLX_VLM_BIN` 指定。与 `museav reverse` 的分工：reverse 专做
SCULPT prompt 逆向，`vlm_*` 是通用看图问答，两者互补。

### 新增：素材与清单五个工具

出图前那两个必填项（模板 id、技能 slug）只能从中台实时拉。Agent 凭印象编一个，
中台报「模板不存在」，它分不清是自己拼错了还是真没这个模板——这五个工具补的就是这一步。

| 工具 | 背后 |
| --- | --- |
| `list_templates` | `museav templates`（可按 category / type / 归属过滤） |
| `list_skills` | `museav skills`（可按 genre 过滤） |
| `list_jobs` | `museav jobs`（出图结果 URL、失败原因） |
| `upload_asset` | `museav upload`（拿公网直链，喂垫图） |
| `image_to_template` | `museav image-to-template`（读图 + 文字层逆向 + 变量化，默认 `dryRun` 可只看草稿） |

### 修复

- **`templates` / `skills` 只回传裸 id，Agent 挑不了**。museav 的双路输出是有分工的：
  stdout 给机器（`templates`/`skills` 是换行分隔的 id/slug），stderr 给人（带中文名、
  分类、比例、字段、是否需垫图的表格）。默认取 stdout 等于把 104 个模板压成一串 UUID
  丢给 Agent。清单类改取 stderr；`jobs` 反过来，stdout 是完整 JSON（含 cdn_url /
  status / error），保持原样。
- **清单被截断在 2000 字且不留痕**。上限放宽到 8000，并且截断时追加
  「…（输出已截断，共 N 字，用过滤参数收窄）」——不说的话 Agent 会把截断处当成清单结尾。
- **四个本地后期工具都缺 `--overwrite`**。CLI 在输出文件已存在时会拒绝执行，而 MCP
  从不传这个标志，于是同一个 `out` 路径第二次调用必失败。现在四个工具都加了
  `overwrite` 参数（默认 false，保持 CLI 的防覆盖语义，报错原文照回给 Agent）。
- **`remove_bg` 的模型枚举漏了 `birefnet`**——它是 CLI 的默认模型（细节最好），
  枚举里只有 `isnet` / `u2net`，等于最该用的那个传不进去。
- **`gen_background` 缺 5 个 CLI 已有参数**：`fields`（模板占位符取值）、
  `duration` + `image`（视频时长 / 图生视频首帧）、`project`（归档工作区）、
  `batch`（批量出图清单）。

### 兼容性

工具只增不减；`gen_background`、四个本地后期、`skillhub_*` 的原有参数全部保持可用。
新增参数都是可选的。唯一的行为变化是 `list_*` 类的回传内容变长（上限 8000 字）。

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
