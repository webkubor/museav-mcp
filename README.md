# museav-mcp

把 [museav-cli](https://github.com/webkubor/museav-cli)（MUSE AV 出图中台命令行工具）与
[mlx-vlm-kit](https://github.com/webkubor/mlx-vlm-kit)（Mac 本地看图理解）的能力包装成
**MCP server**，让 Claude Code / DSH / WorkBuddy / 任意支持 MCP 的 AI Agent 直接调用出图、
图片后期、素材查询与看图理解。

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
| `skillhub_tags` | 查小红书 SkillHub 内容标签（实时拉，别硬编码） | 免登录 |
| `skillhub_whoami` | 查 SkillHub 登录态 | 免登录 |
| `skillhub_publish` | 发布本地 Skill 到小红书 SkillHub，**默认 dry-run** | 真提交才需要 |

本地后期那四个和 `vlm_*` 那四个不联网、不消耗中台额度。

### 两个「先查再调」

`gen_background` 的 `template` / `skill` 是必填二选一，但 id 和 slug **只能从中台实时拉**：
先用 `list_templates` / `list_skills` 查真实清单，再传进去。凭印象编一个，中台只会报
「模板不存在」，Agent 分不清是自己拼错了还是真没有。

模板自带哪些占位符看清单里「字段:」那一列，取值用 `gen_background` 的 `fields` 传
（JSON 对象字符串）。

### `skillhub_publish` 的两条硬规矩

1. **默认只预演**：不带 `submit=true` 就只做本地打包 + 校验，不上传不提交，把待提交内容
   返回给人核对。只有用户明确说「提交 / 确认 / submit」才带 `submit=true`——
   提交不可逆，Skill ID 是平台主键、跨版本不可改名。
2. **真提交前必须已登录**：未登录时底层 CLI 会打印二维码**并阻塞等扫码**，而 MCP 走
   `execFile`，要等进程结束才拿到输出——二维码根本传不到人眼前，就是死锁。所以这里
   直接报错，引导用户去自己终端跑一次 `museav skillhub login`。

## 前置条件

这个 MCP 只是包装层，真活是两条命令干的：

```bash
npm i -g museav-cli      # 出图 / 后期 / 素材 / SkillHub（skillhub_* 需要 >= 3.1.0）
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
