# Play-field Prompts — Sloppy

> Style-guide palette reference:
> - Background deep: `#12022e`
> - Lane 1 / cyan: `#41e0ff`
> - Lane 2 / green: `#7cff6b`
> - Lane 3 / yellow: `#ffd23f`
> - Lane 4 / accent-pink: `#ff4d8d`
> - Text / UI white: `#ffffff`
>
> The play-field must feel like a deep-space neon arcade tunnel. It is always in
> motion (scrolling upward) so it must **tile seamlessly on the vertical axis**.
> Notes scroll over it, so it must stay dark and low-contrast at center while
> lane edges and decorative elements provide spatial orientation.

---

## Lane Track Background (`playfield_bg.png`)

```
Subject & purpose:
The scrolling background tile for the four-lane play-field of a DDR × Guitar
Hero rhythm game. Fills the full play area (1080 px wide) and tiles vertically
behind falling note sprites. The lane structure must be visible as subtle
vertical bands but must not compete with the notes for attention.

Style descriptors:
Neon-arcade, deep-space atmosphere. Base fill: very dark deep-purple (#12022e).
Four equal vertical bands (each 270 px wide), separated by hairline neon dividers.
Each band has a very faint, low-saturation tint hinting at its lane color —
leftmost band: trace of cyan (#41e0ff at ~8 % opacity), second: trace of green
(#7cff6b at ~8 % opacity), third: trace of yellow (#ffd23f at ~8 % opacity),
rightmost: trace of pink (#ff4d8d at ~8 % opacity). Lane dividers are 2–4 px
bright white lines at ~30 % opacity with a matching-color glow. The overall
surface has a subtle "scanline" horizontal texture (1 px lines at 5 % opacity)
suggesting a CRT arcade screen. Optional: very faint receding-grid perspective
lines converging at a vanishing point above the top edge, simulating speed/depth.
Mood: energetic, futuristic, welcoming. Low visual noise.

Composition & framing:
1080 × 512 px. Four equal vertical bands. The top 20 px and bottom 20 px must be
identical pixel rows so the tile joins are invisible when scrolling. No horizontal
break in pattern. Focal point is centered; decorative elements (grid lines, lane
glow) are symmetric about the vertical center axis.

Technical constraints:
Opaque PNG (no alpha channel needed — the play-field is always fully behind other
layers). 1080 × 512 px. The image MUST tile seamlessly on the Y axis (top edge
matches bottom edge exactly). Keep the file under 200 KB; use posterized/flat
regions to help PNG compression. No embedded ICC profile.

Negative prompt:
No text, no letters, no numbers, no symbols. No bright colors in the background
body — the background must stay dark so notes read clearly over it. No gradients
that break the vertical-band structure. No photorealistic textures (no concrete,
metal, or fabric). No characters or figures. No horizontal bands or patterns that
would look like notes when scrolling. No white areas brighter than 20 % luminance
in the background body.

Suggested tool & settings:
Stable Diffusion (SDXL) — model: DreamShaper XL or RealVisXL.
Sampler: DPM++ 2M Karras. Steps: 35. CFG: 6.5. Size: 1080 × 512 (or generate
at 2160 × 1024 and downscale). Tiling mode: enable seamless tiling (vertical
axis only) if the UI supports it.
Alternatively: Midjourney --ar 27:8 --style raw --v 6.1 (then ensure Y tiling
in post with an offset-clone blend in Photoshop/GIMP).
Post-process: verify seamless vertical tile by stacking two copies and checking
the seam in Aseprite or GIMP.
```

---

## Hit-line Bar (`hitline_bar.png`)

```
Subject & purpose:
The bright horizontal bar at the bottom of the play area — the "hit line" — that
marks the exact timing position where players must tap. It must be the most
visually prominent horizontal element on screen at all times so players can track
it with peripheral vision at high speed. Spans the full play-field width.

Style descriptors:
Intense, luminous, unmissable. A horizontal bar with a bright white-hot core
(#ffffff) that feathers outward in both vertical directions into a wide neon-pink
bloom (#ff4d8d). The bloom extends roughly 16 px above and below the 4 px solid
core. The leftmost and rightmost 4 px of the bar taper to 0 opacity to blend with
the lane edge dividers. On top of the bloom, very faint colored "lane indicator"
tick marks appear at each lane center (at 270/540/810 px from left) in the
matching lane color — these are small, no taller than 12 px, and do not interfere
with the core brightness. Overall effect: a glowing, vibrating power-line across
the screen. Energetic and precise.

Composition & framing:
1080 × 16 px canvas. The white core occupies the center 4 px row; the bloom
fades above and below from there, reaching 0 opacity at the top and bottom
canvas edges. Perfectly symmetric left-to-right. Lane tick marks at x = 135,
405, 675, 945 (lane centers).

Technical constraints:
Transparent PNG. 1080 × 16 px. Single frame (not animated — animation, if
desired later, is a shader effect in Godot, not a spritesheet). Keep file under
15 KB. Premultiplied alpha preferred.

Negative prompt:
No text, no letters, no numbers. No horizontal breaks or gaps in the bar —
it must appear as one continuous beam. No hard-edged rectangle appearance —
the bloom and glow are essential. No colors other than white and the four lane
colors in their tick marks. No patterns or textures in the bar body.

Suggested tool & settings:
This asset is simple enough to create precisely in a vector tool:
Preferred: Inkscape or Figma — draw a 1080 × 4 white rectangle, add a Gaussian
blur (σ = 6) on a duplicate layer colorized to #ff4d8d, flatten, export as PNG.
Alternatively: Stable Diffusion with ControlNet (line art mode) or Midjourney
--ar 67:1 --style raw -- though vector construction is more reliable for this.
If using SD: DreamShaper XL, Steps 20, CFG 5, size 1088 × 64 then crop/scale.
```

---

## Dev-agent implementation note

- `playfield_bg.png` goes in `assets/playfield/`. Import as a `Texture2D` for a
  `Sprite2D` or `TextureRect` node inside `PlayField`. Enable vertical tiling
  (repeat) and animate `offset.y` each frame by `scroll_speed * delta` to scroll.
  Reset offset by `512.0` each time it exceeds the tile height to keep it smooth.
- `hitline_bar.png` goes in `assets/playfield/`. Place as a `Sprite2D` at the
  bottom of the `PlayField` node, fixed y position (does not scroll). Z-index
  above all note sprites so it stays on top.
- `lane_divider.png` (4 × 256, generated in Figma/Inkscape as a 2 px white line
  with 30 % opacity glow): place three instances at x = 270, 540, 810,
  spanning the full play-field height, z-index below notes.
