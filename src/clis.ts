/**
 * 外部 CLI 台账 —— 每个分组依赖哪个命令、怎么装、什么版本起步，全在这里。
 *
 * **真源说明**：能力属于 CLI，不属于 MCP。这个文件只描述「去哪儿找那个 CLI」，
 * 不描述能力本身 —— 所以加一个分组 = 加一份 CliSpec + 一个 groups/*.ts，
 * 而不是在 MCP 里重写一遍逻辑。
 *
 * 安装命令写的是**陌生人真能装上**的那一条。项目没发布到包管理器、或包名被
 * 无关包占用时，宁可先不进分组（见 README 的「还没进来的项目」一节），
 * 也不要给一条装完没有命令的提示。
 */
import type { CliSpec } from "./cli.js";

/** MUSE AV 出图中台：出图/视频、本地后期、模板技能、SkillHub */
export const MUSEAV_CLI: CliSpec = {
  name: "museav-cli",
  envVar: "MUSEAV_BIN",
  command: "museav",
  install: "npm i -g museav-cli@latest",
  minVersion: "3.9.0",
};

/** 本地看图理解（Apple MLX）。没有 --version，所以不做版本守卫。 */
export const VLM_CLI: CliSpec = {
  name: "mlx-vlm-kit",
  envVar: "MLX_VLM_BIN",
  command: "vlm",
  purpose: "本地看图靠它",
  install: "pipx install git+https://github.com/webkubor/mlx-vlm-kit.git",
  maxChars: 3000,
};

/** 对比度门禁：静态检查 + 渲染后计量。check 是 cwd 敏感的（读 contrast.config.*）。 */
export const CONTRAST_CLI: CliSpec = {
  name: "contrast-guard",
  envVar: "CONTRAST_GUARD_BIN",
  command: "contrast-guard",
  install: "npm i -g contrast-guard@latest",
  timeoutMs: 300_000,
  maxChars: 6000,
  // 不达标时它把报告打到 stdout 然后 exit 1 —— 那是判据，不是调用失败
  verdictExit: true,
};

/** Markdown → PDF / 长图 / 讲稿页。模板与主题由包内资源解析，不依赖 cwd。 */
export const FACET_CLI: CliSpec = {
  name: "facet",
  envVar: "FACET_BIN",
  command: "facet",
  install: "npm i -g @webkubor/facet@latest",
  timeoutMs: 300_000,
  maxChars: 4000,
};

/**
 * 竖版短视频合成（素材 + 逐句文案 → mp4）。
 *
 * 超时给到 15 分钟：它是真在渲染帧 + 调 ffmpeg 合成，1080×1920 几十秒的片子
 * 比出图慢得多；而「慢」和「卡死」在 agent 那边长得一模一样，所以宁可给宽。
 * 另外它**硬依赖 ffmpeg**（不在 npm 包里），装法见 install 提示的第二句。
 */
export const REEL_CLI: CliSpec = {
  name: "@kubor/reel-kit",
  envVar: "REEL_BIN",
  command: "reel",
  purpose: "竖版短视频合成靠它，且需要系统里有 ffmpeg",
  install: "npm i -g @kubor/reel-kit@latest（另外需要 ffmpeg：brew install ffmpeg）",
  timeoutMs: 900_000,
  maxChars: 4000,
};

/**
 * 浏览器操控（真实 Chrome + 登录态复用 + 人类交接协议）。
 *
 * 两处跟别的 CLI 不一样，都体现在这个 spec 里：
 *  · **退出码是状态**：`3=需要人类介入`、`4=等待人类超时` —— 不是故障。
 *  · **超时给到 15 分钟**：`await-human` 会阻塞着等人登录（默认等 300s，
 *    可以传更长），比出图/出片都久。
 *
 * 它不在 npm 上（bun 编译出来的单文件二进制），装法只有 install.sh 一条。
 */
export const BROWSER_CLI: CliSpec = {
  name: "lite-browser",
  envVar: "LITE_BROWSER_BIN",
  command: "lite-browser",
  purpose: "浏览器操控靠它",
  install: "curl -fsSL https://raw.githubusercontent.com/webkubor/lite-browser/main/install.sh | bash",
  timeoutMs: 900_000,
  maxChars: 6000,
  stateExitCodes: {
    3: "需要人类介入（登录 / 授权）—— 用 browser_status 看它在等什么，然后转告用户",
    4: "等待人类超时 —— 人没在时限内完成；可以延长 timeout 再试一次",
  },
};
