# Changelog

## 2.2.0 (2026-10-02)

### 从「museav 的 MCP」变成 CS 系统的 MCP：能力分组化，开始串联整条工具链

owner 口径：**能力归 CLI，MCP 只做串联层。** 这个 MCP 从此是 CS 系统（CortexOS）的 MCP ——
把个人工具链上各开源项目的 CLI 能力，串成一张任意 agent 都能调用的网。要加能力，
先加到那个项目的 CLI，再在这儿加一个分组；MCP 侧不写业务逻辑。

**名字和 21 个工具名一个字没动** —— 老用户的 agent 正靠它们干活。`test-mcp.mjs` 现在把
这 21 个名字逐个钉死，掉了就 CI 变红。

新增三个分组（都是已发 npm、零账号、陌生人装完就能用）：

- `contrast`（[contrast-guard](https://github.com/webkubor/contrast-guard)）3 个工具：
  静态查色值、生成配置、渲染后计量与基线对比
- `facet`（[@webkubor/facet](https://github.com/webkubor/facet)）2 个工具：
  列排版模板、把 Markdown 排成 PDF / 长图 / 讲稿页
- `reel`（[@kubor/reel-kit](https://github.com/webkubor/reel-kit)）3 个工具：
  列版式模板、列配乐库、素材 + 逐句文案合成竖版成片（mp4）。
  **硬依赖系统里的 ffmpeg**（不在 npm 包里）。museav 出原料，它出能发的成品 ——
  这两段是一条业务线的前后半截，接上这条线在 MCP 里才闭环

工具数 21 → **30**（museav 17 + vlm 4 + contrast 3 + facet 2 + reel 3 + `groups_list`）。

#### 行为变化：默认策略改成「探测式」

某个分组的 CLI 在 `PATH` 上，它的工具才会注册。

工具 schema 会随**每一次**模型请求发出去（原先 21 个工具约 3~4k token）。聚合 MCP 天然越串
越多，不设开关，代价是每个用户每次请求都在为「他机器上根本没装的那些工具」付 token。

装全了的用户感知不到区别；只装了 museav-cli 的用户，工具列表里少了 4 个 `vlm_*` ——
那 4 个在没有 `vlm` 二进制的机器上本来也只会报错。没启用的分组不会消失：新增的
`groups_list` 工具始终可用，它会说清这个 MCP 还能干什么、该装什么命令。

想恢复「全列出来」，设 `MUSEAV_MCP_GROUPS=all`；裁剪用 `-museav` 这种写法。

#### 两个实测踩到的坑（都写进注释了）

1. **`contrast-guard` 用退出码当判据**：检查不达标时它把完整 JSON 报告打到 stdout，然后
   `exit 1`。按「非零 = 调用失败」处理，agent 拿到的是「contrast-guard --json 执行失败」，
   而哪一对颜色、比值多少、建议改成什么色值 —— 全丢。为此给 `CliSpec` 加了 `verdictExit`。
2. **`facet` 没有 list 命令**，模板清单只能从它自己的报错里取；而 Node 打栈时会先打出错
   那一行的**源码**，那行里也写着 `Available: ${templateNames.join(", ")}` —— 直接取第一个
   匹配，拿到的「清单」是两段模板字面量垃圾。已按「滤掉含 `${` 的候选行 + 只认 kebab-case」
   修掉，并保留「报错格式变了就把原话透出来，不编」。

#### 其他

- server 版本从 `package.json` 读（原先写死在代码里，包已发到 2.x 时 server 还自称 1.1.0）
- 加了 MCP `instructions`：告诉 agent 先查 `groups_list` 再让用户装 CLI
- 每个分组的 CLI 缺失/过旧报错都带**可照抄的安装命令**，并支持用环境变量指到绝对路径

#### 还没进来的（不是忘了）

`lite-browser` 自己就有 MCP，聚合层该**转发**而不是重包（转发机制还没做）；
`scorecard` 的 npm 名被一个无关旧包占着，`npm i -g scorecard` 装不到它；
`kyvault` 是密钥库、`get` 会打印明文，这类能力不进公开 MCP。
完整清单与理由见 README 的「还没进来的项目」一节。

## 2.1.0 (2026-09-28)

### 接回 skillhub_* 三个工具：CLI 回来了，MCP 不该留着缺口

1.3.0 移除这三个工具的理由是「CLI 自己都没这个命令了」——那时 museav-cli 3.6.0
刚好移除了 `skillhub`。**2026-09-28 CLI 以 3.9.0 恢复了这个命令**（它是 MUSE AV
唯一的出站通道：装一个 CLI 既能出图又能把做好的 Skill 发到小红书），MCP 却还停在
「没有这条能力」。

缺口留着是有代价的：文档写着、用户以为装个 MCP 就能发 Skill，实际不行。

- `skillhub_tags` / `skillhub_whoami` / `skillhub_publish` 接回，工具数 18 → 21
- `MIN_MUSEAV` 3.6.0 → **3.9.0**（`skillhub` 是 3.9.0 才有的，用 3.6.0 当门槛
  等于放行一个会报 unknown command 的旧版 CLI）
- `skillhub_publish` 的工具说明里写进**平台资产护栏**：Skill 正文抄了 MUSE AV
  平台公共模板的提示词会被 CLI 拒绝；只引用模板 slug 放行。不写这条，Agent 遇到
  拒绝时只会看到一句「预演失败」，不知道为什么

`requireSkillPath` 这个 helper 从 1.3.0 起就一直没人用（工具被删了它被留下了），
这次接回工具正好用上，不用再删。

## 2.0.0 (2026-09-16)

### 加版本守卫：底层二进制太旧时直接说「请升级」，不再让 agent 撞 unknown command

本包自己零实现，全靠外部两个二进制干活 —— 代价是对它们的版本完全不设防。
**2026-09-16 真咬过一次**：owner 机器上全局 museav 卡在 3.4.0，新发的 3.5.0
根本没生效，而 MCP 一声不吭照常跑，是排查别的事时才发现的。

- `runMuseav` 入口加 `ensureMuseav()`：首次真要用时探一次 `museav --version`，
  低于 `MIN_MUSEAV`（当前 3.6.0）直接报错并给出可照抄的升级命令。
- **失败不缓存**：用户装好/升好之后，下一次调用就能通过，不必重启整个 MCP server。
  （实测验证：旧版被拦 → 升级 → 同一进程内下一次调用直接成功。）
- `vlm` 缺失时从裸 ENOENT 改成给出 `pipx install …` 安装命令。
- semver 比较抽成 `src/semver.ts` 并加断言。**按数字逐段比，不是字符串** ——
  字符串比的话 `"3.10.0" < "3.6.0"`，真出到 3.10 时会把新版本判成过旧、锁死全部工具。

### 版本号更正

1.3.0 移除了 `skillhub_*` 三个工具。按本仓自己的约定（test-mcp.mjs 顶部注释：
「删工具是破坏性变更，得走大版本」）那次就该发 2.0.0，发成 minor 是错的。
本次一并更正到 2.0.0 —— 加版本硬门槛本身也是破坏性的。

### 顺带修掉的文档漂移

- `reverse` 工具的 `local` 参数还写着「强制走本地 Ollama qwen3-vl」，
  而 museav-cli 3.5.0 起本地引擎已换成 mlx-vlm-kit。
- `test-mcp.mjs` 的 `EXPECTED_TOOL_COUNT` 还是 21（实际 18）。
  **这个断言本来就该拦住 1.3.0 那次删除，是我没跑 npm test 就发了。**

## 1.3.0 (2026-09-16)

### 移除 skillhub_* 三个工具（跟随 museav-cli 3.6.0）

museav-cli 3.6.0 删掉了 `skillhub` 命令（发小红书 SkillHub，owner 一次没用过，
且是该 CLI 唯一的第三方工具依赖）。本包这三个工具是它的透传层，必须同步删，
否则 agent 调用会拿到 `unknown command`。

- 移除 `skillhub_tags` / `skillhub_whoami` / `skillhub_publish`，以及只为它们
  服务的 `skillhubLoggedIn()` 登录态探测。工具数 21 → 18。
- 前置条件写清最低版本：`museav-cli >= 3.6.0`。

## 1.2.0 (2026-09-15)

### 补上 CLI 3.4.0 的四个新工具，门槛提到 21 个

`npx -y museav-mcp` 终于把 `museav` 升级后的命令也包进来。`speak` / `transcribe` 不在
3.4.0（计划中），所以这一版只上这四个：

| 工具 | 背后 | 取流 |
| --- | --- | --- |
| `reverse` | `museav reverse`（中台 API 反推 SCULPT prompt） | stdout = 一行英文 prompt；stderr = 结构化中文报告（SCULPT 六要素） |
| `list_models` | `museav models [--video]` | stderr = 人类表格（label + 时长/分辨率），便于 agent 挑 |
| `balance` | `museav balance` | stdout = 完整 JSON（balance_cny / markup_pct / checked_at），agent 解析更稳 |
| `list_video_templates` | `museav video-templates [--category]` | stderr = 人类表格（id / 中文名 / 分类 / 比例 / 模型 / 字段 / 参考视频 / 归属） |

### reverse 与 vlm_reverse_prompt 的分工

按用户原则「图像识别优先走 mlx-vlm-kit」，新增 `reverse` 并不意味着以后默认用它。
两个工具是**互补**而不是替代：

- **`vlm_reverse_prompt`**（本地，Qwen3-VL-4B，mlx-vlm-kit）：通用 prompt 反推，免登录零成本，默认够用
- **`reverse`**（中台 API）：平台专用 SCULPT 六要素格式，喂给 `gen_background` 更顺手

`reverse` 的 description 里直接写了这个分工，agent 调它前应该先看 `vlm_reverse_prompt`
够不够。

### 兼容性

工具只增不减；1.1.0 的所有 schema 保持可用。新增的 `reverse` 与已有的 `vlm_reverse_prompt` 没有参数冲突（一个吃本地图片路径/URL，一个只吃本地路径）。

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
