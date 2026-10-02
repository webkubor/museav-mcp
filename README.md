<h1 align="center">🧭 museav-mcp</h1>

<p align="center">
  <strong>CS 系统（CortexOS）的 MCP —— 一条命令，把个人工具链接进任意 AI Agent。</strong><br>
  把各开源项目的 CLI 能力串成一张网：出图 / 看图 / 对比度门禁 / Markdown 排版……<br>
  按「能力分组」组织，装了哪个 CLI 就自动长出哪组工具，没装的不会白占你的上下文。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/museav-mcp"><img src="https://img.shields.io/npm/v/museav-mcp?style=for-the-badge&color=3fb950&logo=npm&label=npm" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/museav-mcp"><img src="https://img.shields.io/npm/dm/museav-mcp?style=for-the-badge&color=6d7f9c&label=downloads" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/tools-27-4d6bfe?style=for-the-badge" alt="tools" />
  <img src="https://img.shields.io/badge/runtime_deps-2-5A9E6F?style=for-the-badge" alt="deps" />
  <img src="https://img.shields.io/badge/license-MIT-777?style=for-the-badge" alt="MIT" />
  <img src="https://img.shields.io/badge/transport-stdio-8957e5?style=for-the-badge" alt="stdio" />
</p>

<p align="center">
  <a href="README.en.md">English</a> · <a href="CHANGELOG.md">更新日志</a>
</p>

---

## 🎯 为什么用它，而不是别的

| 需求 | 逐个手搓命令 | 每个工具各接一遍 SDK | museav-mcp |
|---|:---:|:---:|:---:|
| 一个 Agent 里同时用出图 / 看图 / 门禁 / 排版 | ❌ 四套用法 | ❌ 接四遍协议 | ✅ 一个 server 全给 |
| 换 Agent 就失效 | ❌ 命令绑定 | ⚠️ 各家 SDK 不同 | ✅ 换谁都认 MCP |
| 没装的工具白占上下文 | — | ❌ 全量注册 | ✅ **探测式**：装了才注册 |
| 大图 / 长文进上下文 | ❌ 手动处理 | ❌ 自己写 base64 | ✅ 一律走绝对路径 |
| 加新能力 | 各自记命令 | ❌ 得改 MCP 代码 | ✅ 升级 CLI 就生效（MCP 只做串联） |

**分层是硬的：能力在 CLI 里，MCP 只做串联。** 这个仓自己零实现 —— 每个工具都是对某个项目
CLI 的一次薄封装。所以 CLI 一升级，MCP 这边立刻就有新能力；MCP 不重写任何逻辑，也就不存在
「两边行为不一致」。

传输方式 stdio。文件以**绝对路径**传入，处理结果写回磁盘并返回路径 —— 不走 base64。

## 🧩 能力分组（这张就是版图）

| 分组 | 开源项目 | 工具 | 干什么 | 前置 |
|---|---|:---:|---|---|
| `museav` | [museav-cli](https://github.com/webkubor/museav-cli) | 17 | 出图 / 出视频、本地后期（抠图·超分·去水印·压缩）、模板与技能清单、素材上传、图生模板、SCULPT 反推、小红书 SkillHub 发布 | `museav-cli` ≥ 3.9.0 |
| `vlm` | [mlx-vlm-kit](https://github.com/webkubor/mlx-vlm-kit) | 4 | 本地离线看图：描述、任意提问、封面质检、反推出图 prompt | `vlm`（Apple Silicon） |
| `contrast` | [contrast-guard](https://github.com/webkubor/contrast-guard) | 3 | 对比度门禁：静态查色值达不达标、渲染后量实际字号灰阶、存基线与基线对比 | `contrast-guard` |
| `facet` | [@webkubor/facet](https://github.com/webkubor/facet) | 2 | Markdown 排版成 PDF / 长图 / 讲稿页（自带多套模板） | `facet` |
| — | 本 MCP 自带 | 1 | `groups_list`：列出全部分组、各自装什么、为什么没启用 | 无 |

**默认策略是探测式**：某个分组的 CLI 在 `PATH` 上，它的工具才会注册。理由是工具 schema
会随**每一次**模型请求发出去 —— 聚合 MCP 越串越多，不该让用户为「他机器上根本没装的工具」
付 token。没启用的分组不会消失：`groups_list` 始终可用，它会告诉你这个 MCP 还能干什么、
该装什么。

想强开或裁剪，用环境变量 `MUSEAV_MCP_GROUPS`：

```bash
MUSEAV_MCP_GROUPS=all              # 全开（缺 CLI 的分组也注册，调用时才报装什么）
MUSEAV_MCP_GROUPS=facet,contrast   # 只开这几个
MUSEAV_MCP_GROUPS=-museav          # 默认集里去掉这几个
```

## ⚡ 30 秒上手

```bash
npm i -g museav-cli                    # 想要哪组能力，就装哪个 CLI（这一行是出图那组）
claude mcp add museav -- npx -y museav-mcp
```

然后在 Agent 里说「用 museav 出一张图」，或者先问一句「这个 MCP 有哪些能力分组」。

## 工具（27 个）

### `museav` 组 —— MUSE AV 出图中台（17）

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
| `skillhub_tags` | 查小红书 SkillHub 内容标签（发布必带，别硬编码） | ✅ 需要 |
| `skillhub_whoami` | 查 SkillHub 登录态（脱敏） | ✅ 需要 |
| `skillhub_publish` | 把本地 Agent Skill 发到小红书 SkillHub。**默认 dry-run**，`submit=true` 才真提交 | ✅ 需要 |

本地后期那四个不联网、不消耗中台额度。

### `vlm` 组 —— 本地看图理解（4）

| 工具 | 干什么 |
|---|---|
| `vlm_describe` | 描述图片主体与色调 |
| `vlm_ask` | 对图片任意提问 |
| `vlm_cover_check` | 音乐封面语义质检（`batch=true` 递归目录） |
| `vlm_reverse_prompt` | 反推出图 prompt，喂回 `gen_background` |

四个都免登录、零成本、不联网（本地 Qwen3-VL）；**需要 Apple Silicon**。

### `contrast` 组 —— 对比度门禁（3）

| 工具 | 干什么 |
|---|---|
| `contrast_check` | 静态查色值达不达标（读项目的 `contrast.config.*`），`dir` 指定项目目录 |
| `contrast_init` | 在项目里生成一份配置模板（第一次用要先跑这个） |
| `contrast_measure` | 渲染后量实际字号 / 灰阶 / 动效，可存基线与基线对比（需要浏览器） |

`check` 查「对不对」，`measure` 查「多少」——**丑的每一处单看往往都『对』**，所以两个都要跑。
不达标时工具会照常把完整报告交回来（CLI 用退出码当判据，不是调用失败）。

### `facet` 组 —— Markdown 排版成成品（2）

| 工具 | 干什么 |
|---|---|
| `facet_templates` | 列可用排版模板名（`facet_build` 的 `template` 从这里取） |
| `facet_build` | 把 Markdown 排成 PDF / 长图 / 讲稿页 |

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

`facet_build` 的 `template` 同理 —— 先用 `facet_templates` 拿清单。

## 前置条件

```bash
npm i -g museav-cli        # museav 组：出图 / 后期 / 素材 / SkillHub（需要 >= 3.9.0）
pipx install git+https://github.com/webkubor/mlx-vlm-kit.git   # vlm 组
npm i -g contrast-guard    # contrast 组
npm i -g @webkubor/facet   # facet 组
```

装哪几个由你决定 —— 没装的组就是不会注册，不会报错。

`gen_background` 还需要中台 apiKey（按 museav-cli 的说明配置）。
本地工具首次运行会下载对应模型（抠图 ~214MB、超分 ~65MB、去水印 ~200MB、
vlm 的 Qwen3-VL-4B 约 2.9GB）。

可执行文件不在全局 PATH 时，用环境变量指定绝对路径：
`MUSEAV_BIN`、`MLX_VLM_BIN`、`CONTRAST_GUARD_BIN`、`FACET_BIN`。

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

想让某个没装 CLI 的分组也出现在工具列表里（调用时才报装什么），加上 `env`：

```json
{
  "mcpServers": {
    "museav": {
      "command": "npx",
      "args": ["-y", "museav-mcp"],
      "env": { "MUSEAV_MCP_GROUPS": "all" }
    }
  }
}
```

### 本地开发（改这个仓库时）

```bash
pnpm install && pnpm build     # 产物在 dist/，package.json 的 bin 指向它
```

配置里把 `command` 换成 `node`、`args` 指向 `/绝对路径/museav-mcp/dist/index.js` 即可。

## 还没进来的项目（以及为什么）

这张版图是**逐步**长出来的，不是一次列全。没进来分三种情况，都不是「忘了」：

| 项目 | 为什么还没进 |
|---|---|
| [lite-browser](https://github.com/webkubor/lite-browser) | 它**自己就有 MCP**（21 个工具）。聚合层应该**转发**而不是重包一遍 —— 转发机制还没做，做了再接 |
| [scorecard](https://github.com/webkubor/scorecard) | 仓库里有 CLI，但 npm 上的 `scorecard` 被一个**无关的旧包**占着（tarball 里只有一个 `index.js`）。`npm i -g scorecard` 装不到它 —— 得先改名或加 scope 发布 |
| [kyvault](https://github.com/webkubor/kyvault) | **密钥库**，`get` 会打印明文。这类能力不进公开 MCP，是红线 |
| [voxflow](https://github.com/webkubor/voxflow) / [reel-kit](https://github.com/webkubor/reel-kit) | 工具面很清晰，但环境门槛高（本地 TTS 模型约 2.9GB / ffmpeg），适合单独一组慢慢加 |
| [trend-radar](https://github.com/webkubor/trend-radar) / [path-guard](https://github.com/webkubor/path-guard) / [tombstone-reaper](https://github.com/webkubor/tombstone-reaper-skill) | 能力好，但**没有可安装的 CLI**：前两个仓库还没开源 / 没发布，最后一个只有仓内脚本 |
| `im-notify-kit` / `ai-sse-kit` / `talk-skills` 等 | 纯库或纯提示词，没有命令行工具面 —— 要进得先给它们写一个 CLI |

**想加一组？** 三步：给那个项目确认 CLI 能装、在 `src/clis.ts` 加一份 `CliSpec`、
在 `src/groups/` 加一个分组文件并挂到 `src/registry.ts` 的 `GROUPS`。
MCP 侧不写任何业务逻辑。

## 验证

```bash
node test-mcp.mjs      # 起 server 跑 initialize + tools/list
                       # 断言：27 个工具、21 个老工具名一个不少、分组开关逻辑
```

`MUSEAV_MCP_GROUPS=all` 是测试用的启动方式 —— CI 机器上什么 CLI 都没装，
走默认的探测策略会一组都不启用，那就测不到工具集本身了。

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
