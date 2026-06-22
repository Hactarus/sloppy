# Visual style guide — Sloppy

> Living document owned by the **design** agent. Every image-AI prompt should
> reference this so generated assets stay cohesive.

## Mood
Energetic, friendly, neon-arcade. Celebratory, never harsh. Success feels great;
misses feel gentle.

## Palette
| Role            | Hex       |
|-----------------|-----------|
| Background deep | `#12022e` |
| Lane 1 / cyan   | `#41e0ff` |
| Lane 2 / green  | `#7cff6b` |
| Lane 3 / yellow | `#ffd23f` |
| Accent / hit    | `#ff4d8d` |
| Text / UI       | `#ffffff` |

## Readability rules
- Notes are distinguishable by **shape AND color** (colorblind-safe).
- High contrast against the lane background; clear, bright hit line.
- Portrait-first (1080×1920). Large touch targets, thumb-reachable controls.

## Asset conventions
- Sprites: transparent PNG, power-of-two where practical.
- Keep Web payload small; prefer simple flat/neon shapes over heavy detail.

## Prompts
Store ready-to-paste image-AI prompts under `design/prompts/`.
