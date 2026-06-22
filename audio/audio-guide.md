# Audio guide — Sloppy

> Living document owned by the **sound-designer** agent. Every music/SFX-AI
> prompt should reference this so generated audio fits the game's rhythm.

## Sonic identity
Upbeat, clean, arcade-electronic. Strong, steady beat with an unmistakable
downbeat — the timing engine and note charts are built from it.

## BPM ladder (gentle difficulty curve)
| Tier        | BPM range | Feel                          |
|-------------|-----------|-------------------------------|
| Tutorial    | 90–100    | Sparse, very on-beat          |
| Easy        | 100–115   | Simple groove                 |
| Medium      | 115–135   | Fuller arrangement            |
| Hard        | 135–160   | Layered, busier (later only)  |

Each track must declare **exact BPM** and **offset** (first-beat timestamp), and
**loop on a bar boundary**.

## SFX palette
- Hit: crisp, satisfying, short, low-latency.
- Combo milestones: ascending tones / added stem layers.
- Miss: soft, non-punishing cue (no harsh buzzer).
- UI: light clicks.

## Formats
OGG Vorbis preferred (Godot Web/Android). SFX short; mind Web file-size budget.

## Prompts
Store ready-to-paste music/SFX-AI prompts under `audio/prompts/`.
