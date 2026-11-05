# Figma design/dev-cache

Single-screen frame cache for Cloud Agent / fullstack. Do **not** call `get_design_context` when a frame exists here.

Layout: `design/dev-cache/<fileKey>/<nodeId>/meta.json` + `screenshot.png`

- `nodeId` folder uses `-` instead of `:` (e.g. `109-2` = `109:2`)
- `cache_rev` in meta.json; bump on redesign
- Only 设计师figma may refresh via online Dev Mode
