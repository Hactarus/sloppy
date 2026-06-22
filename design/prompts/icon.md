# App Icon Prompt — Sloppy

> Style-guide palette reference:
> - Background deep: `#12022e`
> - Lane 1 / cyan: `#41e0ff`
> - Lane 2 / green: `#7cff6b`
> - Lane 3 / yellow: `#ffd23f`
> - Lane 4 / accent-pink: `#ff4d8d`
> - Text / UI white: `#ffffff`
>
> The icon is the first thing a user sees in the store listing and on their home
> screen. It must communicate: rhythm game, neon-arcade, fun, immediate. It must
> be legible at 48 × 48 px (Android notification bar) and striking at 512 × 512
> px (Play Store feature graphic thumbnail).

---

## Primary App Icon — 512 × 512 (`icon_512.png`)

```
Subject & purpose:
App icon for "Sloppy", a DDR × Guitar Hero rhythm game on Android and Web.
The icon is the face of the game in the Play Store and on the Android home
screen. It must evoke "tap to the beat," feel energetic and friendly, and stand
out in a grid of other game icons.

Concept:
A stylized view looking down a glowing neon rhythm-game lane, showing the four
lane note shapes (arrow, diamond, circle, rounded square) ascending toward a
bright hit line near the bottom of the frame. The notes are shown mid-fall in
their four lane colors. Above the hit line, a radial burst of light in all four
colors fills the upper two-thirds of the frame like an energy explosion. The
word "SLOPPY" is NOT included — icon only, no text (Play Store guidelines allow
text but clean iconic compositions perform better at small sizes).

Style descriptors:
Neon-arcade illustration, flat with glow/bloom. Deep-purple background (#12022e).
The four note shapes are rendered in their canonical colors:
  - Arrow: cyan (#41e0ff), leftmost lane
  - Diamond: green (#7cff6b), second lane
  - Circle: yellow (#ffd23f), third lane
  - Rounded square: pink (#ff4d8d), rightmost lane
Each note has a bright white inner highlight and a saturated outer glow
(same technique as the in-game note sprites). The central radial burst uses all
four colors blending outward from a hot-white (#ffffff) core at the top center.
The hit line is visible as a thin bright-white glowing bar one-third up from the
bottom. Overall: electric, joyful, bold. No gradients with more than three stops.
No photorealism.

Composition & framing:
512 × 512 px. Circular safe zone (Android adaptive icon): important elements
inside a 460 × 460 px inscribed circle. The four notes are arranged horizontally
across the lower third of the frame, evenly spaced, each centered in its lane.
The radial burst fills the upper two-thirds. The hit line runs horizontally
across the frame at y ≈ 340 px (two-thirds down). The composition reads clearly
at 48 × 48 px: four colored blobs on a dark field with a bright burst above them.
Visual center of gravity is slightly above center.

Technical constraints:
Opaque PNG (Android icon must not use transparency at the root level — the
adaptive icon layer handles that separately). 512 × 512 px. Keep file under
100 KB. No rounded corners baked in — Android and the Play Store apply their
own masking. No embedded ICC profile.

Negative prompt:
No text, no letters, no game title in the image. No photorealistic rendering.
No thin lines that disappear at 48 px. No more than four distinct hue regions —
the palette is fixed to the four lane colors plus the dark background. No
brown, orange, or desaturated colors. No characters, no faces, no hands. No
guitar or instrument shapes (this is a lane-tap game, not a music instrument
game). No busy repeating patterns. No white or very light background — the
deep-purple base (#12022e) must dominate.

Suggested tool & settings:
Stable Diffusion (SDXL) — model: Juggernaut XL or DreamShaper XL.
Sampler: DPM++ 2M Karras. Steps: 40. CFG: 7.5. Size: 1024 × 1024 then
downscale to 512 × 512 with Lanczos.
Alternatively: Midjourney --ar 1:1 --style raw --v 6.1
Or: Adobe Firefly icon mode.

Post-process checklist:
1. Downscale to 48 × 48 and confirm: four colored blobs readable, bright burst
   visible, no mud.
2. Apply 4 px corner radius preview to simulate Android squircle mask.
3. Check legibility on both dark and light wallpapers.
```

---

## Adaptive Icon Foreground Layer — 192 × 192 (`icon_192.png`)

```
Subject & purpose:
The foreground layer of the Android adaptive icon system (API 26+). This is
placed over a solid deep-purple (#12022e) background layer by the OS. Only the
center ~66 % of the canvas is guaranteed visible (the OS clips to a squircle or
circle depending on launcher). Used at sizes from 48 px to 192 px.

Style descriptors:
Identical neon-arcade style to the main icon. This layer contains only the
four note shapes (arrow, diamond, circle, rounded square) and the hit line bar —
no background fill, no burst (the burst effect is omitted here so it does not
compete with the OS-applied background). The notes are arranged in a tight
horizontal row centered on the canvas. Each note has its full glow treatment.
The hit line is a thin horizontal bar in pink (#ff4d8d) at y = 110 px.

Composition & framing:
192 × 192 px canvas. Safe zone: 128 × 128 px centered inscribed square
(leave 32 px margin all sides — the OS may clip this). The four notes are
centered in a row at y ≈ 90 px (slightly above canvas center). Each note ≈
28 × 28 px display size in this asset.

Technical constraints:
Transparent PNG. 192 × 192 px. Under 30 KB.

Negative prompt:
No background fill — transparent only. No burst or large glow effects that
extend to canvas edges. No text.

Suggested tool & settings:
Preferred: Figma or Inkscape — scale down the note sprites from the 128 × 128
originals and arrange. Much more reliable than AI for precise small-size
composition.
```

---

## High-res Foreground for Play Store — 1024 × 1024 (`icon_foreground_1024.png`)

```
Subject & purpose:
High-resolution version of the adaptive icon foreground for the Play Store
listing page and as the source for deriving feature graphics. Not shipped in
the APK — store asset only.

Style descriptors:
Same as icon_192.png foreground but rendered at full quality with maximum glow
detail. At this size each note is approximately 150 × 150 px; the glow and
highlight work at this resolution shows the full craft of the asset family.
Notes are the same four shapes with full per-lane colors and glows. Hit line in
pink (#ff4d8d), 8 px tall at this scale.

Composition & framing:
1024 × 1024 px. Safe zone: 680 × 680 px centered. Four notes in a horizontal
row at y ≈ 480 px.

Technical constraints:
Transparent PNG. 1024 × 1024 px. Under 200 KB. No ICC profile.

Negative prompt:
No background fill. No text. No characters.

Suggested tool & settings:
Scale up the note sprites from 128 × 128 originals using nearest-neighbor or
2× pixel scaling in Aseprite, then apply higher-resolution glow in Photoshop
using Gaussian blur + Screen blend mode.
```

---

## Dev-agent implementation note

- `icon_512.png` → `assets/icon/icon_512.png`. Also copy to
  `android/build/res/mipmap-xxxhdpi/icon.png` (or whatever path `project.godot`
  references under `application/config/icon`).
- `icon_192.png` → `assets/icon/icon_192.png`. Reference as the adaptive icon
  foreground in `android/build/res/mipmap-*/ic_launcher_foreground.png`.
- The background layer for the adaptive icon is a solid fill of `#12022e` —
  no image needed, configure in `android/build/res/drawable/ic_launcher_background.xml`.
- For the Web export favicon, derive a 32 × 32 and 180 × 180 PNG from
  `icon_512.png` using Lanczos downscale.
