<h1 align="center">🎨 museav-mcp</h1>

<p align="center">
  <strong>一个 MCP server，把出图、看图、素材库全套能力接进任意 AI Agent。</strong><br>
  MUSE AV 出图中台命令行工具 + Mac 本地看图理解，包装成 21 个工具 —— Claude Code / DSH / WorkBuddy / 任意支持 MCP 的 Agent 直接调用。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/museav-mcp"><img src="https://img.shields.io/npm/v/museav-mcp?style=for-the-badge&color=3fb950&logo=npm&label=npm" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/museav-mcp"><img src="https://img.shields.io/npm/dm/museav-mcp?style=for-the-badge&color=6d7f9c&label=downloads" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/runtime_deps-2-5A9E6F?style=for-the-badge" alt="deps" />
  <img src="https://img.shields.io/badge/license-MIT-777?style=for-the-badge" alt="MIT" />
  <img src="https://img.shields.io/badge/transport-stdio-4d6bfe?style=for-the-badge" alt="stdio" />
</p>

<p align="center">
  <a href="README.en.md">English</a> · <a href="CHANGELOG.md">更新日志</a>
</p>

---

## 🎯 为什么用它，而不是别的

| 需求 | 裸调 CLI | 自己接 SDK | museav-mcp |
|---|:---:|:---:|:---:|
| Claude Code 里出图 | ❌ 得自己拼命令 | ❌ 得自己接协议 | ✅ 一次调用 |
| 21 个工具统一发现 | ❌ 逐个记 | ❌ 逐个注册 | ✅ MCP 自动列举 |
| 大图不进上下文 | ❌ 要手动处理 | ❌ 自己写 base64 逻辑 | ✅ 走绝对路径 |
| 换 Agent 就失效 | ❌ 命令行绑定 | ⚠️ 各家 SDK 不同 | ✅ 换谁都认 MCP |

传输方式 stdio。图片以**绝对路径**传入，处理结果写回磁盘并返回路径 —— 不走 base64，大图不炸上下文。

## 工具（21 个）

| 工具 | 干什么 | 是否需要登录 |
|---|---|---|
| `gen_background` | 出背景图 / 一般出图 / 出视频（走中台） | ✅ 需要 |
| `remove_bg` | 抠图去背景（BiRefNet / ISNet / U2Net），输出带 alpha 的 PNG | 免登录，本地跑 |
| `upscale_image` | 超分放大（Real-ESRGAN + Vulkan GPU），默认 4x | 免登录，本地跑 |
| `remove_watermark` | 去水印（LaMa 修复），自动定位，可传手工掩码 | 免登录，本地跑 |
| `compress_image` | 压缩（sharp），可指定最长边 / 质量 / 格式 | 免登录，本地跑 |
| `list_templates` | 查可用图片 / 文字模板（挑 `template` 用，别硬编码） | ✅ 需要 |
| `list_skills` | 查可用技能（挑 `skill` slug 用，别硬编码） | ✅ 需要 |
| `list_video_templates` | 查可用视频模板（与 `list_templates` 平级，配合 `gen_background` 的 `video=true` + `template`） | ✅ 需要 |
| `list_models` | 查可用模型；`video=true` 查视频档次（可直接喂 `gen_background` 的 model） | ✅ 需要 |
| `balance` | 查上游余额 | ✅ 需要 |
| `list_jobs` | 查自己的出图工作流（结果 URL、失败原因） | ✅ 需要 |
| `upload_asset` | 上传素材拿公网直链（垫图要 URL 时用） | ✅ 需要 |
| `image_to_template` | 图生模板：读图 + 文字层逆向 + 变量化 | ✅ 需要 |
| `reverse` | 读图反推 SCULPT prompt（中台 API）。**与 `vlm_reverse_prompt` 互补**：图像识别默认优先本地 `vlm_*`，要走 SCULPT 格式再调这个 | ✅ 需要 |
| `vlm_describe` | 本地看图理解：描述主体与色调 | 免登录，本地跑 |
| `vlm_ask` | 对图片任意提问 | 免登录，本地跑 |
| `vlm_cover_check` | 音乐封面语义质检（`batch=true` 递归目录） | 免登录，本地跑 |
| `vlm_reverse_prompt` | 反推出图 prompt，喂回 `gen_background` | 免登录，本地跑 |
| `skillhub_tags` | 查小红书 SkillHub 内容标签（发布必带，别硬编码） | ✅ 需要 |
| `skillhub_whoami` | 查 SkillHub 登录态（脱敏） | ✅ 需要 |
| `skillhub_publish` | 把本地 Agent Skill 发到小红书 SkillHub。**默认 dry-run**，`submit=true` 才真提交 | ✅ 需要 |

本地后期那四个和 `vlm_*` 那四个不联网、不消耗中台额度。

### 发 Skill 之前必读

`skillhub_publish` **默认只预演**（本地打包校验，不上传不提交），把待提交内容返回给你核对。
只有用户明确说「提交 / 确认 / submit」才带 `submit=true` —— 提交不可逆，Skill ID 是
平台主键、跨版本不可改名。

真提交前会先查登录态。**未登录时 MCP 不会挂在那儿等你**：二维码要等进程结束才能
返回给用户，硬等就是死锁，所以会直接报错，让你引导用户去终端跑一次
`museav skillhub login` 扫码。

CLI 自带**平台资产护栏**：Skill 正文里抄了 MUSE AV 平台公共模板的提示词会被拒绝发布，
只引用模板 slug（`museav gen --template xxx`）则放行——搬运是重新分发资产，引用是正常集成。
被拒时按提示把正文换成调用方式。

### 两个「先查再调」

`gen_background` 的 `template` / `skill` 是必填二选一，但 id 和 slug **只能从中台实时拉**：
先用 `list_templates` / `list_skills` 查真实清单，再传进去。凭印象编一个，中台只会报
「模板不存在」，Agent 分不清是自己拼错了还是真没有。

模板自带哪些占位符看清单里「字段:」那一列，取值用 `gen_background` 的 `fields` 传
（JSON 对象字符串）。

## 前置条件

这个 MCP 只是包装层，真活是两条命令干的：

```bash
npm i -g museav-cli      # 出图 / 后期 / 素材 / SkillHub 发布（需要 >= 3.9.0）
pipx install git+https://github.com/webkubor/mlx-vlm-kit.git   # vlm_* 四个工具需要
```

`gen_background` 还需要中台 apiKey（按 museav-cli 的说明配置）。
本地工具首次运行会下载对应模型（抠图 ~214MB、超分 ~65MB、去水印 ~200MB、
vlm 的 Qwen3-VL-4B 约 2.9GB）。

两个可执行文件不在全局 PATH 时，用环境变量指定绝对路径：
`MUSEAV_BIN`（museav）、`MLX_VLM_BIN`（vlm）。

## 接到 Agent 上

Claude Code 一行：

```bash
claude mcp add museav -- npx -y museav-mcp
```

DSH 在 profile 的 `cordis.patch.yml` 里加一行：

```yaml
- id: mcp-museav
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: museav
    transport: stdio
    command: npx
    args: ['-y', 'museav-mcp']
```

或手写配置（任意支持 MCP 的 Agent）：

```json
{
  "mcpServers": {
    "museav": {
      "command": "npx",
      "args": ["-y", "museav-mcp"]
    }
  }
}
```

`museav` 不在全局 PATH 时：

```json
{
  "mcpServers": {
    "museav": {
      "command": "npx",
      "args": ["-y", "museav-mcp"],
      "env": { "MUSEAV_BIN": "/绝对路径/museav", "MLX_VLM_BIN": "/绝对路径/vlm" }
    }
  }
}
```

### 本地开发（改这个仓库时）

```bash
pnpm install && pnpm build     # 产物在 dist/，package.json 的 bin 指向它
```

配置里把 `command` 换成 `node`、`args` 指向 `/绝对路径/museav-mcp/dist/index.js` 即可。

## 验证

```bash
node test-mcp.mjs      # 起 server 跑 initialize + tools/list，应输出 TOOLS_LIST_OK count = 21
```

## 说明

`gen_background` 的 `prompt` / `skill` / `template` **三者必须且只能提供一个**：`prompt` 是直接给提示词，`skill` 和 `template` 是让中台在服务端展开提示词（配合 `input` 传一句业务描述）。

四个本地后期工具的 `out` 已存在时，CLI 会拒绝覆盖 —— 这是防手滑的语义，MCP 保留它：
要覆盖就显式传 `overwrite: true`，否则报错原文会回到 Agent 手里。

`list_templates` / `list_skills` 取的是 CLI 的**人类可读表格**（stderr），因为 stdout 只有裸 id；
`list_jobs` 取 stdout 的完整 JSON（含 `cdn_url` / `status` / `error`）。清单超过 8000 字会截断，
并附一句「输出已截断」——不附的话 Agent 会把截断处当成清单结尾。

本地工具的超时上限是 10 分钟 —— 超分和 LaMa 修复在大图上确实会慢。

## License

MIT
