# Sloppy

A rhythm game in the spirit of **DDR × Guitar Hero**. Notes scroll down lanes
toward a hit line; tap in time. The goal is to **train reflexes** through a
**slow, smooth difficulty curve** while giving the player **constant positive
feedback**.

- **Engine:** Godot 4
- **Gameplay logic:** Rust via [godot-rust (gdext)](https://godot-rust.github.io/) — timing, judging, scoring
- **Dev environment:** Nix flake (pinned Godot + Rust toolchain + Android/Web tooling)
- **Targets:** Android and Web (HTML5/WASM)

## Project layout

```
flake.nix              Reproducible dev shell (godot, rust, emscripten, android-tools)
project.godot          Godot 4 project (portrait, mobile renderer)
sloppy.gdextension     Loads the Rust library per platform
scenes/main.tscn       Entry scene
scripts/game.gd        Glue: drives the conductor from audio, routes lane input
rust/                  Rust gameplay crate (cdylib)
  src/conductor.rs     Audio-clock → beats (the timing source of truth)
  src/judge.rs         Hit windows, scoring, combo (forgiving by design)
design/                Visual design specs + image-AI prompts (see design agent)
audio/                 Audio specs + music/SFX-AI prompts (see sound-designer agent)
.claude/agents/        Project agents: dev, design, sound-designer
```

## Getting started

```sh
nix develop                              # enter the dev shell
cargo build --manifest-path rust/Cargo.toml   # build the Rust extension (debug)
godot --headless --path .                # import + sanity-run
godot --path .                           # open the editor
```

After changing Rust, rebuild the crate so the `.gdextension` picks up the new
library.

## Exporting

- **Web:** build the Rust crate for `wasm32-unknown-emscripten`, then export with
  the Godot Web preset. Threaded builds need COOP/COEP headers
  (`SharedArrayBuffer`); otherwise use a single-threaded configuration.
- **Android:** install the Android export templates, build the Rust crate for
  each ABI (`aarch64-linux-android`, `armv7-linux-androideabi`,
  `x86_64-linux-android`), then export the APK/AAB. The `.gdextension` already
  maps each ABI to its `libsloppy.so`.

## Agents

This repo ships three Claude Code subagents (`.claude/agents/`):

- **`dev`** — implements game code and tooling with Nix, Godot, and Rust.
- **`design`** — defines visual/UX direction and writes prompts for an
  image-generation AI (it doesn't generate art itself).
- **`sound-designer`** — defines audio direction and writes prompts for a
  music/SFX-generation AI (it doesn't synthesize audio itself).
