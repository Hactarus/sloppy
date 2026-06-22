# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is
**Sloppy** — a Godot 4 rhythm game (DDR × Guitar Hero) exported to **Android**
and **Web**. Gameplay logic (timing, judging, scoring) is written in **Rust**
via godot-rust (gdext); presentation/UI is Godot + GDScript. The dev
environment is a **Nix flake**.

## Design pillars (treat as requirements)
1. **Train reflexes with a gentle, slow difficulty curve** — no sudden spikes.
2. **Constant positive feedback** — celebrate hits and combos; misses are gentle
   and never subtract score.
3. **Mobile/web first** — portrait, large touch targets, colorblind-safe notes
   (distinguish by shape AND color), small Web payloads.

## Specialized agents (`.claude/agents/`)
- **dev** — code/build/export work in Nix + Godot + Rust.
- **design** — visual/UX direction; outputs prompts for an image-generation AI.
- **sound-designer** — audio direction; outputs prompts for a music/SFX AI.

Route work to the matching agent.

## Conventions
- Timing must come from the **audio clock** (see `rust/src/conductor.rs`), never
  frame `delta`.
- Rebuild the Rust crate after editing `rust/` so `sloppy.gdextension` loads the
  fresh library.
- Work on the assigned feature branch; commit/push only when asked.

## Common commands
```sh
nix develop
cargo build --manifest-path rust/Cargo.toml
godot --headless --path .
```
