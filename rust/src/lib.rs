//! Sloppy — Rust gameplay logic exposed to Godot via godot-rust (gdext).
//!
//! Timing and judging are the parts of a rhythm game where correctness and
//! precision matter most, so they live in Rust. Presentation (scenes, UI,
//! audio playback) stays in Godot/GDScript.

use godot::prelude::*;

mod conductor;
mod judge;

struct SloppyExtension;

#[gdextension]
unsafe impl ExtensionLibrary for SloppyExtension {}
