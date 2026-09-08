# museav-mcp

把 [museav-cli](https://github.com/webkubor/museav-cli)（MUSE AV 出图中台命令行工具）的能力包装成 **MCP server**，让 Claude Code / WorkBuddy / 任意支持 MCP 的 AI Agent 直接调用出图与图片后期处理。

传输方式 stdio。图片以**绝对路径**传入，处理结果写回磁盘并返回路径 —— 不走 base64，大图不炸上下文。

## 工具

| 工具 | 干什么 | 是否需要登录 |
|---|---|---|
| `gen_background` | 出背景图 / 一般出图 / 出视频（走中台） | ✅ 需要 |
| `remove_bg` | 抠图去背景（ISNet / U2Net），输出带 alpha 的 PNG | 免登录，本地跑 |
| `upscale_image` | 超分放大（Real-ESRGAN + Vulkan GPU），默认 4x | 免登录，本地跑 |
| `remove_watermark` | 去水印（LaMa 修复），自动定位，可传手工掩码 | 免登录，本地跑 |
| `compress_image` | 压缩（sharp），可指定最长边 / 质量 / 格式 | 免登录，本地跑 |
| `skillhub_tags` | 查小红书 SkillHub 内容标签（实时拉，别硬编码） | 免登录 |
| `skillhub_whoami` | 查 SkillHub 登录态 | 免登录 |
| `skillhub_publish` | 发布本地 Skill 到小红书 SkillHub，**默认 dry-run** | 真提交才需要 |

本地后期那四个不联网、不消耗中台额度。

### `skillhub_publish` 的两条硬规矩

1. **默认只预演**：不带 `submit=true` 就只做本地打包 + 校验，不上传不提交，把待提交内容
   返回给人核对。只有用户明确说「提交 / 确认 / submit」才带 `submit=true`——
   提交不可逆，Skill ID 是平台主键、跨版本不可改名。
2. **真提交前必须已登录**：未登录时底层 CLI 会打印二维码**并阻塞等扫码**，而 MCP 走
   `execFile`，要等进程结束才拿到输出——二维码根本传不到人眼前，就是死锁。所以这里
   直接报错，引导用户去自己终端跑一次 `museav skillhub login`。

## 前置条件

需要先装好 `museav` 命令，这个 MCP 只是它的包装层：

```bash
npm i -g museav-cli     # 或见 museav-cli 仓库说明
museav --version        # 确认可用
```

`gen_background` 还需要中台 apiKey（按 museav-cli 的说明配置）。本地那四个工具首次运行会下载对应模型。
`skillhub_*` 需要 `museav` >= 3.1.0。

## 安装

先装底层 CLI（工具都是壳，真活是它干的；`skillhub_*` 需要 >= 3.1.0）：

```bash
npm i -g museav-cli
```

## 接到 Agent 上

一行：

```bash
claude mcp add museav -- npx -y museav-mcp
```

或手写配置（Claude Code / 任意支持 MCP 的 Agent）：

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

`museav` 不在全局 PATH 时，用环境变量指定可执行文件：

```json
{
  "mcpServers": {
    "museav": {
      "command": "npx",
      "args": ["-y", "museav-mcp"],
      "env": { "MUSEAV_BIN": "/绝对路径/museav" }
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
node test-mcp.mjs      # 起 server 跑 initialize + tools/list，应输出 TOOLS_LIST_OK count = 8
```

## 说明

`gen_background` 的 `prompt` / `skill` / `template` **三者必须且只能提供一个**：`prompt` 是直接给提示词，`skill` 和 `template` 是让中台在服务端展开提示词（配合 `input` 传一句业务描述）。

本地工具的超时上限是 10 分钟 —— 超分和 LaMa 修复在大图上确实会慢。

## License

MIT
