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

除 `gen_background` 外都在本地跑，不联网、不消耗中台额度。

## 前置条件

需要先装好 `museav` 命令，这个 MCP 只是它的包装层：

```bash
npm i -g museav-cli     # 或见 museav-cli 仓库说明
museav --version        # 确认可用
```

`gen_background` 还需要中台 apiKey（按 museav-cli 的说明配置）。本地那四个工具首次运行会下载对应模型。

## 安装

```bash
pnpm install
pnpm build       # 产物在 dist/，package.json 的 bin 指向它
```

## 接到 Agent 上

以 Claude Code 为例，在 MCP 配置里加：

```json
{
  "mcpServers": {
    "museav": {
      "command": "node",
      "args": ["/绝对路径/museav-mcp/dist/index.js"]
    }
  }
}
```

`museav` 不在全局 PATH 时，用环境变量指定可执行文件：

```json
{
  "mcpServers": {
    "museav": {
      "command": "node",
      "args": ["/绝对路径/museav-mcp/dist/index.js"],
      "env": { "MUSEAV_BIN": "/绝对路径/museav" }
    }
  }
}
```

## 验证

```bash
node test-mcp.mjs      # 起 server 跑 initialize + tools/list，应输出 TOOLS_LIST_OK count = 5
```

## 说明

`gen_background` 的 `prompt` / `skill` / `template` **三者必须且只能提供一个**：`prompt` 是直接给提示词，`skill` 和 `template` 是让中台在服务端展开提示词（配合 `input` 传一句业务描述）。

本地工具的超时上限是 10 分钟 —— 超分和 LaMa 修复在大图上确实会慢。

## License

MIT
