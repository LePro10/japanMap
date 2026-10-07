# japanMap

An open-world driving game in the browser: a 3 × 3 km Japanese landscape at
blue hour after rain — mountain pass, forest temple, rice paddies, neon city
and coast — with arcade driving, drift scoring, races and a walkable town.
Target platform: **CrazyGames** (desktop and mobile web).

**Status:** moving from a Three.js prototype to **Unity 6 (URP)**.
Current phase: [docs/STATUS.md](docs/STATUS.md) · Plan: [docs/PLAN.md](docs/PLAN.md)

> The Three.js prototype is still playable at
> https://lepro10.github.io/japanMap/ and lives read-only in
> [`legacy/threejs/`](legacy/threejs/).

## How this project is built

Entirely by AI agents (Claude Code with Unity MCP and Blender MCP). The
owner directs; agents write code, build assets, test and document.
Agent instructions: [CLAUDE.md](CLAUDE.md).

## Layout

```
Assets/_Project/    game code, art, data, scenes (Unity)      — from Phase 1
Packages/           Unity packages                             — from Phase 1
ProjectSettings/    Unity settings                             — from Phase 1
SourceData/legacy/  map data exported from the prototype (terrain, roads, props)
ArtSource/          Blender sources and asset generator scripts
Tools/              command-line tools for agents              — from Phase 1
docs/               plan, status, decisions, lessons, setup (German)
legacy/threejs/     the Three.js prototype, read-only
```

## Getting started

One-time setup (Unity, Blender, MCP servers, Git LFS): [docs/SETUP.md](docs/SETUP.md).
Then open a Claude Code session in this folder and say “Beginne mit Phase 1”.

## Credits

Third-party assets are listed per source: prototype assets (all CC0, mostly
Poly Haven) in [`legacy/threejs/assets/CREDITS.md`](legacy/threejs/assets/CREDITS.md);
Unity assets in `Assets/ThirdParty/LICENSES.md`.
