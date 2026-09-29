<h1 align="center">🎨 museav-mcp</h1>

<p align="center">
  <strong>One MCP server that plugs image generation, vision, and asset-library tooling into any AI agent.</strong><br>
  Wraps <a href="https://github.com/webkubor/museav-cli">museav-cli</a> (MUSE AV generation backend) and <a href="https://github.com/webkubor/mlx-vlm-kit">mlx-vlm-kit</a> (local Mac vision) into 21 tools — callable from Claude Code, DSH, WorkBuddy, or any MCP-capable agent.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/museav-mcp"><img src="https://img.shields.io/npm/v/museav-mcp?style=for-the-badge&color=3fb950&logo=npm&label=npm" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/museav-mcp"><img src="https://img.shields.io/npm/dm/museav-mcp?style=for-the-badge&color=6d7f9c&label=downloads" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/runtime_deps-2-5A9E6F?style=for-the-badge" alt="deps" />
  <img src="https://img.shields.io/badge/license-MIT-777?style=for-the-badge" alt="MIT" />
  <img src="https://img.shields.io/badge/transport-stdio-4d6bfe?style=for-the-badge" alt="stdio" />
</p>

<p align="center">
  <a href="README.md">中文</a> · <a href="CHANGELOG.md">Changelog</a>
</p>

---

## 🎯 Why This

| Need | Raw CLI | Own SDK integration | museav-mcp |
|---|:---:|:---:|:---:|
| Generate an image inside Claude Code | ❌ Assemble commands yourself | ❌ Wire the protocol yourself | ✅ One tool call |
| Discover all 21 tools uniformly | ❌ Remember each one | ❌ Register each one | ✅ MCP auto-discovery |
| Keep large images out of context | ❌ Handle manually | ❌ Write base64 plumbing | ✅ Absolute paths on disk |
| Survives switching agents | ❌ Tied to one CLI | ⚠️ Every vendor differs | ✅ Anything that speaks MCP |

Transport is stdio. Images are passed in as **absolute paths**, and results are written back to disk and returned as paths — no base64, so large images never blow up the context window.

## Tools (21)

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
| `reverse` | Reverse a SCULPT prompt from an image (backend API). **Complements** `vlm_reverse_prompt`: recognition defaults to local `vlm_*`; call this when you specifically need SCULPT format | ✅ yes |

## Prerequisites

This MCP is only a wrapper — the real work is done by two commands:

```bash
npm i -g museav-cli      # generation / post-processing / assets / SkillHub publishing (needs >= 3.9.0)
pipx install git+https://github.com/webkubor/mlx-vlm-kit.git   # required for the four vlm_* tools
```

`gen_background` additionally needs a backend apiKey (configure it as described in the museav-cli README).
Local tools download their model weights on first run (background removal ~214MB, upscaling ~65MB, watermark removal ~200MB, vlm's Qwen3-VL-4B about 2.9GB).

If either executable is not on the global PATH, point at it with an environment variable:
`MUSEAV_BIN` (museav) and `MLX_VLM_BIN` (vlm).

## Wiring it into an agent

See the [Chinese README](README.md#接到-agent-上) for the full Claude Code / DSH / WorkBuddy config snippets.

## Notes

- Image results are written to disk; the tool returns paths, so you can hand them straight to a browser or another tool.
- Tools marked "runs locally" need no login and never touch the backend.
- This package is a thin wrapper — the real behaviour lives in museav-cli and mlx-vlm-kit. File issues there.

## License

MIT
