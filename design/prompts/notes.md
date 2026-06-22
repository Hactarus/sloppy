# Note Sprite Prompts — Sloppy

> All four notes must read as a cohesive family: same neon-arcade style, same
> lighting language, same stroke weight, same inner glow technique. They differ
> only in shape and color. Generate all four in one session if the tool
> supports batching; otherwise use identical non-color parameters across runs.
>
> Style-guide palette reference:
> - Background deep: `#12022e`
> - Lane 1 / cyan: `#41e0ff`
> - Lane 2 / green: `#7cff6b`
> - Lane 3 / yellow: `#ffd23f`
> - Lane 4 / accent-pink: `#ff4d8d`
> - Text / UI white: `#ffffff`

---

## Lane 1 — Cyan Arrow (`note_lane1.png`)

```
Subject & purpose:
A single game note sprite for Lane 1 of a DDR-style rhythm game. The shape is
a bold upward-pointing arrow (chevron/arrowhead silhouette, not a road sign —
thick, chunky, readable at a glance). It appears as a falling tile the player
must tap when it reaches the hit line.

Style descriptors:
Neon-arcade flat illustration. Vibrant cyan (#41e0ff) as the primary fill.
Bright white (#ffffff) inner highlight along the top face of the arrowhead.
Soft outer glow/bloom in the same cyan radiating 8–12 px beyond the shape edge.
Dark deep-purple (#12022e) semi-transparent inner shadow for depth. Clean,
minimal — no texture, no gradients beyond the single-step highlight. Friendly
and energetic, never aggressive. Reminiscent of 1980s arcade vector graphics
updated with a modern flat neon feel.

Composition & framing:
Perfectly centered on a 128 × 128 canvas. The arrow fills ~80 % of the canvas
(roughly 100 × 100 px active area). Equal padding on all sides. The arrowhead
points straight up. No rotation. Shape is symmetric about the vertical axis.

Technical constraints:
Transparent PNG background. 128 × 128 px. Power-of-two. Single frame (not a
spritesheet). Target file size under 20 KB. Premultiplied alpha preferred.
No embedded ICC profiles.

Negative prompt:
No text, no letters, no numbers. No road-sign or navigation-app arrow style.
No photorealism, no 3-D render, no bevel/emboss filters, no drop shadows that
extend beyond the glow. No busy background. No gradients with more than two
stops. No thin or spindly lines — strokes must be at least 6 px wide at final
size. No orange or red tones bleeding into the cyan.

Suggested tool & settings:
Stable Diffusion (SDXL) — model: Juggernaut XL or DreamShaper XL.
Sampler: DPM++ 2M Karras. Steps: 30. CFG: 7. Size: 512 × 512 then downscale
to 128 × 128 with Lanczos. Remove background with rembg.
Alternatively: Midjourney --ar 1:1 --style raw --v 6.1
Or: Adobe Firefly vector mode, flat icon style.
```

---

## Lane 2 — Green Diamond (`note_lane2.png`)

```
Subject & purpose:
A single game note sprite for Lane 2 of a DDR-style rhythm game. The shape is
a bold diamond (square rotated 45 degrees), thick-edged, chunky, instantly
readable. Falls down the lane and must be tapped on the hit line.

Style descriptors:
Neon-arcade flat illustration. Vibrant green (#7cff6b) as the primary fill.
Bright white (#ffffff) inner highlight on the top-left facet of the diamond.
Soft outer glow/bloom in the same green radiating 8–12 px beyond the shape edge.
Dark deep-purple (#12022e) semi-transparent inner shadow for depth. Same clean,
minimal vocabulary as the cyan arrow — no texture, single-step highlight only.
Cohesive family member with the arrow: same stroke weight (~6–8 px), same glow
radius, same overall visual mass.

Composition & framing:
Perfectly centered on a 128 × 128 canvas. The diamond fills ~80 % of the canvas.
Equal padding on all sides. Oriented as a true diamond (point up, point down).
Symmetric both horizontally and vertically.

Technical constraints:
Transparent PNG background. 128 × 128 px. Power-of-two. Single frame.
Target file size under 20 KB. Premultiplied alpha preferred.

Negative prompt:
No text, no letters, no numbers. No playing-card diamond style (no thin outline
only). No photorealism, no 3-D render, no bevel/emboss, no drop shadows beyond
the glow radius. No busy background. No cyan or yellow bleed into the green.
No thin lines — minimum 6 px stroke weight.

Suggested tool & settings:
Stable Diffusion (SDXL) — model: Juggernaut XL or DreamShaper XL.
Sampler: DPM++ 2M Karras. Steps: 30. CFG: 7. Size: 512 × 512 then downscale
to 128 × 128 with Lanczos. Remove background with rembg.
Alternatively: Midjourney --ar 1:1 --style raw --v 6.1
```

---

## Lane 3 — Yellow Circle (`note_lane3.png`)

```
Subject & purpose:
A single game note sprite for Lane 3 of a DDR-style rhythm game. The shape is
a solid circle (disc), thick-ringed with a filled center, chunky and bold.
Falls down the lane and must be tapped on the hit line.

Style descriptors:
Neon-arcade flat illustration. Vibrant yellow (#ffd23f) as the primary fill.
Bright white (#ffffff) inner highlight as a small crescent on the upper-left
of the circle, simulating soft frontal lighting. Soft outer glow/bloom in the
same yellow radiating 8–12 px beyond the shape edge. Dark deep-purple (#12022e)
semi-transparent thin rim for shape definition. Same visual vocabulary as the
cyan arrow and green diamond — minimal, flat, same stroke weight and glow
radius. The circle is the "smoothest" shape in the set: no corners, pure curve.

Composition & framing:
Perfectly centered on a 128 × 128 canvas. Circle fills ~80 % of canvas
(diameter ≈ 100 px). Equal padding all sides. Perfectly round — not oval.

Technical constraints:
Transparent PNG background. 128 × 128 px. Power-of-two. Single frame.
Target file size under 20 KB. Premultiplied alpha preferred.

Negative prompt:
No text, no letters, no numbers. No button or UI-chip look (avoid flat grey or
beveled UI circles). No photorealism, no 3-D render, no bevel/emboss beyond the
highlight crescent. No busy background. No oval or egg shape — must be a true
circle. No green or pink bleed into the yellow.

Suggested tool & settings:
Stable Diffusion (SDXL) — model: Juggernaut XL or DreamShaper XL.
Sampler: DPM++ 2M Karras. Steps: 30. CFG: 7. Size: 512 × 512 then downscale
to 128 × 128 with Lanczos. Remove background with rembg.
Alternatively: Midjourney --ar 1:1 --style raw --v 6.1
```

---

## Lane 4 — Pink Rounded Square (`note_lane4.png`)

```
Subject & purpose:
A single game note sprite for Lane 4 of a DDR-style rhythm game. The shape is
a square with generously rounded corners (corner radius ≈ 20–25 % of the side
length), filled solid. Falls down the lane and must be tapped on the hit line.
The rounded square is the most "friendly" of the four shapes.

Style descriptors:
Neon-arcade flat illustration. Vibrant hot-pink (#ff4d8d) as the primary fill.
Bright white (#ffffff) inner highlight bar across the top quarter of the shape,
simulating a glossy sheen. Soft outer glow/bloom in the same pink radiating
8–12 px beyond the shape edge. Dark deep-purple (#12022e) thin rim for shape
definition. Same vocabulary as the other three notes — flat, minimal, same
stroke weight and glow radius. This shape is the squarest in the family but
corners are never sharp.

Composition & framing:
Perfectly centered on a 128 × 128 canvas. Rounded square fills ~80 % of canvas
(≈ 100 × 100 px active area). Equal padding all sides. Upright — no rotation.

Technical constraints:
Transparent PNG background. 128 × 128 px. Power-of-two. Single frame.
Target file size under 20 KB. Premultiplied alpha preferred.

Negative prompt:
No text, no letters, no numbers. No sharp 90-degree corners — corners must
be visibly rounded. No photorealism, no 3-D render, no bevel/emboss beyond the
glossy highlight. No busy background. No red or purple bleed into the pink.
No thin lines — minimum 6 px stroke weight.

Suggested tool & settings:
Stable Diffusion (SDXL) — model: Juggernaut XL or DreamShaper XL.
Sampler: DPM++ 2M Karras. Steps: 30. CFG: 7. Size: 512 × 512 then downscale
to 128 × 128 with Lanczos. Remove background with rembg.
Alternatively: Midjourney --ar 1:1 --style raw --v 6.1
```

---

## Hold-note tails (shared technique note)

Hold tails (`note_hold_lane*.png`) use the same per-lane color but are vertical
pill/bar shapes at 64 × 512 px. Generate each as a vertically tiling gradient
stripe: solid lane color at top, fading to 40 % opacity at the bottom, with a
2–3 px white edge highlight on the left. They must tile seamlessly at the top
and bottom edges so Godot can stretch them to any hold length. Use the same
glow treatment as the matching note head but with lower intensity (50 % of the
head's glow strength). File suffix: `note_hold_lane1.png` through
`note_hold_lane4.png`. Same negative prompt as the note heads applies.

---

## Dev-agent implementation note

- Place all note sprites under `assets/notes/`.
- Each note head is a 128 × 128 `Sprite2D`; scale in-engine to lane width
  (target ~240 px per lane on 1080-wide canvas, so scale factor ≈ 1.875).
- Hold tails: use a `NinePatchRect` or a `TextureRect` with `STRETCH_TILE` on
  the vertical axis only; the 64 × 512 asset's top 64 px and bottom 64 px are
  the non-stretching caps.
- Colorblind shape mapping: Lane 1 = arrow, Lane 2 = diamond, Lane 3 = circle,
  Lane 4 = rounded square. This maps to `judge_hit` lane indices 0–3 in
  `game.gd`.
