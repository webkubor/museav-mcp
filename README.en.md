<h1 align="center">🧭 museav-mcp</h1>

<p align="center">
  <strong>The MCP server of CortexOS (the CS system) — one command that wires a personal toolchain into any AI agent.</strong><br>
  Strings the CLI capabilities of several open-source projects into one network: image generation, local vision,<br>
  contrast gating, Markdown typesetting… organised as <em>capability groups</em>. A group's tools appear only when its CLI is installed, so nothing you don't have eats your context.
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
  <a href="README.md">中文</a> · <a href="CHANGELOG.md">Changelog</a>
</p>

---

## 🎯 Why This

| Need | Hand-rolled commands | SDK per tool | museav-mcp |
|---|:---:|:---:|:---:|
| Generation, vision, gating and typesetting in one agent | ❌ Four dialects | ❌ Wire the protocol four times | ✅ One server covers all |
| Survives switching agents | ❌ Tied to one CLI | ⚠️ Every vendor differs | ✅ Anything that speaks MCP |
| Tools you don't have eating context | — | ❌ Always registered | ✅ **Probing**: registered only if installed |
| Large images / long docs in context | ❌ Handle manually | ❌ Write base64 plumbing | ✅ Absolute paths on disk |
| Adding new capability | Remember each command | ❌ Edit the MCP | ✅ Upgrade the CLI (the MCP only multiplexes) |

**The layering is strict: capability lives in the CLI, the MCP only multiplexes.** This repo implements
nothing of its own — every tool is a thin shell over some project's CLI. Upgrade the CLI and the new
capability shows up here immediately; nothing is re-implemented, so the two can never disagree.

Transport is stdio. Files are passed in as **absolute paths**, and results are written back to disk and
returned as paths — no base64.

## 🧩 Capability groups (this is the map)

| Group | Open-source project | Tools | What it does | Requires |
|---|---|:---:|---|---|
| `museav` | [museav-cli](https://github.com/webkubor/museav-cli) | 17 | Image / video generation, local post-processing (matting, upscaling, watermark removal, compression), template & skill listings, asset upload, image→template, SCULPT prompt reversal, SkillHub publishing | `museav-cli` ≥ 3.9.0 |
| `vlm` | [mlx-vlm-kit](https://github.com/webkubor/mlx-vlm-kit) | 4 | Local offline vision: describe, ask, cover-check, reverse-prompt | `vlm` (Apple Silicon) |
| `contrast` | [contrast-guard](https://github.com/webkubor/contrast-guard) | 3 | Contrast gating: static colour-pair check, rendered measurement, baselines | `contrast-guard` |
| `facet` | [@webkubor/facet](https://github.com/webkubor/facet) | 2 | Typeset Markdown into PDF / long image / slide deck | `facet` |
| — | built into this MCP | 1 | `groups_list`: every group, what to install, why one is off | none |

**The default strategy is probing**: a group's tools are registered only if its CLI is on `PATH`.
Tool schemas ship with *every* model request, and an aggregator only grows — users shouldn't pay tokens
for tools they never installed. Nothing disappears silently: `groups_list` is always available and tells
the agent what this MCP can do and what to install.

Force or trim groups with `MUSEAV_MCP_GROUPS`:

```bash
MUSEAV_MCP_GROUPS=all              # register everything (missing CLIs error only when called)
MUSEAV_MCP_GROUPS=facet,contrast   # only these
MUSEAV_MCP_GROUPS=-museav          # default set minus these
```

## ⚡ Quickstart

```bash
npm i -g museav-cli                    # install whichever CLI you want a group for
claude mcp add museav -- npx -y museav-mcp
```

## Tools (27)

### `museav` group — MUSE AV generation backend (17)

| Tool | What it does | Login required |
|---|---|---|
| `gen_background` | Generate backgrounds / images / video (via the backend) | ✅ yes |
| `remove_bg` | Background removal (BiRefNet / ISNet / U2Net), outputs alpha PNG | no, runs locally |
| `upscale_image` | Super-resolution (Real-ESRGAN + Vulkan GPU), 4x by default | no, runs locally |
| `remove_watermark` | Watermark removal (LaMa inpainting), auto-detects, accepts a manual mask | no, runs locally |
| `compress_image` | Compress (sharp); max edge / quality / format configurable | no, runs locally |
| `list_templates` | List available image / text templates (prefer these over hardcoding a `template`) | ✅ yes |
| `list_skills` | List available skills (prefer these over hardcoding a `skill` slug) | ✅ yes |
| `list_video_templates` | List video templates (sibling to `list_templates`; pairs with `gen_background`'s `video=true` + `template`) | ✅ yes |
| `list_models` | List models; `video=true` lists video tiers (feed straight into `gen_background`'s `model`) | ✅ yes |
| `balance` | Check upstream balance | ✅ yes |
| `list_jobs` | List your generation jobs (result URLs, failure reasons) | ✅ yes |
| `upload_asset` | Upload an asset and get a public direct link (use when a reference image needs a URL) | ✅ yes |
| `image_to_template` | Image → template: read the image, invert text layers, parameterize | ✅ yes |
| `reverse` | Reverse a SCULPT prompt from an image (backend API). **Complements** `vlm_reverse_prompt` | ✅ yes |
| `skillhub_tags` | List SkillHub content tags (required when publishing; never hardcode) | ✅ yes |
| `skillhub_whoami` | Check SkillHub login state (redacted) | ✅ yes |
| `skillhub_publish` | Publish a local agent skill to SkillHub. **Dry-run by default**; pass `submit=true` to really submit | ✅ yes |

### `vlm` group — local vision (4)

`vlm_describe`, `vlm_ask`, `vlm_cover_check`, `vlm_reverse_prompt` — all offline, zero-cost, no login
(local Qwen3-VL). **Apple Silicon required.**

### `contrast` group — contrast gating (3)

`contrast_check` (static colour pairs), `contrast_init` (generate a config), `contrast_measure`
(rendered sizes / greys / motion, baselines). `check` answers "is it right", `measure` answers
"how much" — **ugly things usually look "right" one at a time**, so run both.

### `facet` group — Markdown typesetting (2)

`facet_templates` (list template names), `facet_build` (Markdown → PDF / long image / slides).

## Prerequisites

```bash
npm i -g museav-cli        # museav group: generation / post-processing / assets / SkillHub (>= 3.9.0)
pipx install git+https://github.com/webkubor/mlx-vlm-kit.git   # vlm group
npm i -g contrast-guard    # contrast group
npm i -g @webkubor/facet   # facet group
```

Install only what you need — an uninstalled group simply isn't registered, and nothing errors.

`gen_background` additionally needs a backend apiKey (see the museav-cli README). Local tools download
model weights on first run (matting ~214MB, upscaling ~65MB, watermark removal ~200MB, vlm's
Qwen3-VL-4B about 2.9GB).

Point at executables outside the global PATH with `MUSEAV_BIN`, `MLX_VLM_BIN`, `CONTRAST_GUARD_BIN`,
`FACET_BIN`.

## Wiring it into an agent

See the [Chinese README](README.md#接到-agent-上) for the full Claude Code / DSH / any-MCP-client config
snippets, including how to pass `MUSEAV_MCP_GROUPS` through `env`.

## Not in yet (and why)

| Project | Why not |
|---|---|
| [lite-browser](https://github.com/webkubor/lite-browser) | It **already ships its own MCP** (21 tools). An aggregator should *forward* it, not re-wrap it — forwarding isn't built yet |
| [scorecard](https://github.com/webkubor/scorecard) | The repo has a CLI, but the `scorecard` npm name is held by an **unrelated stale package** — `npm i -g scorecard` doesn't install it |
| [kyvault](https://github.com/webkubor/kyvault) | A **secret store**; `get` prints plaintext. That class of capability never belongs in a public MCP |
| [voxflow](https://github.com/webkubor/voxflow) / [reel-kit](https://github.com/webkubor/reel-kit) | Clear tool surface, heavy environment (local TTS models ~2.9GB / ffmpeg) — better as their own group later |
| [trend-radar](https://github.com/webkubor/trend-radar) / [path-guard](https://github.com/webkubor/path-guard) / [tombstone-reaper](https://github.com/webkubor/tombstone-reaper-skill) | Good capability, but **no installable CLI** yet |

**Adding a group** takes three steps: make sure the project's CLI is installable, add a `CliSpec` in
`src/clis.ts`, add a group file under `src/groups/` and list it in `src/registry.ts`. No business logic
goes into the MCP.

## Verification

```bash
node test-mcp.mjs      # boots the server, runs initialize + tools/list
                       # asserts: 27 tools, all 21 legacy tool names still present, group-switch logic
```

`MUSEAV_MCP_GROUPS=all` is how the test boots: CI has no CLIs installed, so the default probing strategy
would register nothing and the tool set itself would go untested.

## Notes

- Results are written to disk; tools return paths, so you can hand them straight to a browser or another tool.
- Tools marked "runs locally" need no login and never touch the backend.
- This package is a thin multiplexer — real behaviour lives in each project's CLI. File issues there.

## License

MIT
