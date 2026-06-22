# UI / HUD Prompts — Sloppy

> Style-guide palette reference:
> - Background deep: `#12022e`
> - Lane 1 / cyan: `#41e0ff`
> - Lane 2 / green: `#7cff6b`
> - Lane 3 / yellow: `#ffd23f`
> - Lane 4 / accent-pink: `#ff4d8d`
> - Text / UI white: `#ffffff`
>
> All HUD elements sit over the live play-field, so they must be immediately
> readable against both the dark track and any note colors. Use transparent PNG
> so Godot composites them correctly. Text in banners is baked into the image —
> no runtime font rendering for judgment banners.

---

## Combo Counter Background (`hud_combo_bg.png`)

```
Subject & purpose:
A dark badge/pill shape that sits behind the combo number counter in the
top-center of the HUD. The Godot Label node for the combo number is overlaid
on top. This asset provides legibility contrast and a bit of visual flair.

Style descriptors:
Neon-arcade minimal UI panel. A horizontally elongated rounded rectangle (pill)
with a very dark semi-transparent fill — deep-purple (#12022e) at 75 % opacity.
Thin neon-pink (#ff4d8d) border, 2 px, with a soft outer glow (4 px, 40 %
opacity). Small decorative notches or corner accents in white (#ffffff) at the
four corners — 6 × 6 px right-angle brackets, echoing arcade-CRT UI chrome.
Overall feel: arcade HUD, tech-minimal, dark enough to never obscure notes.

Composition & framing:
256 × 128 px canvas. The pill shape fills the canvas with 8 px safe margin on
all sides. Horizontally symmetric. Vertically symmetric. The center area (inside
the border, roughly 220 × 90 px) is kept clear for the number text overlay.

Technical constraints:
Transparent PNG. 256 × 128 px. Use ninepatch: left/right stretch region
is the center 128 px; left and right caps (64 px each) are fixed. This allows
the pill to scale horizontally for wider combo numbers. Mark ninepatch guides
at x = 64 and x = 192. Keep file under 15 KB.

Negative prompt:
No text baked in — the number is a Godot Label. No opaque background fill —
must be semi-transparent. No bright colors in the fill area. No texture or
noise in the clear center zone.

Suggested tool & settings:
Preferred: Figma or Inkscape (vector, precise control over ninepatch zones).
If using SD: DreamShaper XL, Steps 20, CFG 5, 512 × 256, then scale down.
Midjourney: --ar 2:1 --style raw --v 6.1
```

---

## Score Display Background (`hud_score_bg.png`)

```
Subject & purpose:
Dark panel behind the score number in the top-right corner of the HUD.
Same visual family as the combo badge but rectangular, not a pill.

Style descriptors:
Same neon-arcade HUD language as the combo badge. A dark rounded rectangle
(corner radius 8 px) with deep-purple (#12022e) at 70 % opacity fill.
Thin white (#ffffff) border at 25 % opacity (more subtle than the combo badge).
A single thin cyan (#41e0ff) accent line along the bottom edge of the panel
(1 px line, full width, 60 % opacity) — a subtle tech underline. No corner
accents on this one — keep it smaller and simpler than the combo badge.

Composition & framing:
320 × 80 px canvas. 8 px safe margin. Clear interior (≈ 300 × 60 px) for
the score number.

Technical constraints:
Transparent PNG. 320 × 80 px. Ninepatch: horizontal stretch region center
192 px, left/right caps 64 px each. Keep file under 10 KB.

Negative prompt:
No baked text. No opaque fill. No bright saturated colors in the fill zone.

Suggested tool & settings:
Preferred: Figma or Inkscape.
Midjourney: --ar 4:1 --style raw --v 6.1
```

---

## Judgment Banner — "PERFECT!" (`judge_perfect.png`)

```
Subject & purpose:
A text banner that flashes on screen at the hit line for ~0.6 seconds whenever
the player lands a Perfect hit (timing error ≤ 45 ms). The word "PERFECT!" is
the full content. It must read in under 100 ms — it is a reflex game.

Style descriptors:
Bold, celebratory, maximum impact. The letters are white (#ffffff) with a
strong cyan (#41e0ff) outer glow/halo radiating 12–16 px. Font style:
chunky arcade block letters, slightly condensed, all-caps, no serifs. Each
letter has a thin (2 px) cyan outline. Behind the text, a very faint horizontal
light streak (lens-flare-like, white at center fading to transparent) adds
energy without obscuring the letterforms. The overall composition reads as a
bright, clean, triumphant announcement. Scale and weight suggest the highest
tier of achievement — this is the most prominent judgment banner.

Composition & framing:
512 × 128 px canvas. Text centered horizontally and vertically. Safe text area
480 × 100 px. The glow may bleed to the canvas edge — that is fine.

Technical constraints:
Transparent PNG. 512 × 128 px. Single frame. Keep file under 25 KB.
The text must be fully legible at 50 % scale (256 × 64 px display size on
some phones).

Negative prompt:
No lowercase letters. No thin or script fonts. No realistic photography or
3-D render. No background fill — fully transparent except the text and glow.
No yellow or pink tones bleeding into the cyan glow. No motion blur on the
letterforms themselves (blur only in the glow/halo layer).

Suggested tool & settings:
Preferred: Figma or Photoshop — set text in a bold condensed sans (e.g. Bebas
Neue or Impact), add outer glow effect, export. This is more reliable than AI
for legible typography.
If using AI: Adobe Firefly text-effect mode, or Midjourney with very short
prompt -- note AI often mangles letterforms, so always verify and redraw in
vector if needed.
Midjourney hint: "bold white arcade text PERFECT! cyan neon glow, transparent
background, flat design, no background --ar 4:1 --style raw --v 6.1"
```

---

## Judgment Banner — "GREAT!" (`judge_great.png`)

```
Subject & purpose:
Flash banner for a Great hit (timing error 46–90 ms). Second tier. Appears at
the same screen position as the Perfect banner but slightly smaller in perceived
weight.

Style descriptors:
Energetic and positive but one notch below Perfect. White (#ffffff) letters with
a green (#7cff6b) outer glow (10–12 px radius). Same chunky arcade block-letter
style as PERFECT!. Thin (2 px) green outline. Light streak backdrop at 50 %
opacity (half the intensity of the Perfect streak). The green glow gives a
"go!" feeling — fast, encouraging.

Composition & framing:
512 × 128 px canvas. Text centered. The word "GREAT!" is shorter than "PERFECT!"
so letterforms may be slightly wider-spaced or the type set slightly larger to
maintain visual mass.

Technical constraints:
Transparent PNG. 512 × 128 px. Single frame. Under 25 KB.

Negative prompt:
Same as PERFECT!: no lowercase, no thin fonts, no background fill, no pink or
yellow bleed into the green glow, no 3-D render.

Suggested tool & settings:
Preferred: Figma/Photoshop — match the exact type style used for PERFECT!,
swap glow color to #7cff6b.
Midjourney hint: "bold white arcade text GREAT! green neon glow, transparent
background, flat design --ar 4:1 --style raw --v 6.1"
```

---

## Judgment Banner — "GOOD!" (`judge_good.png`)

```
Subject & purpose:
Flash banner for a Good hit (timing error 91–150 ms). Third tier. Friendly and
encouraging — the player is getting there.

Style descriptors:
Warm and encouraging. White (#ffffff) letters with a yellow (#ffd23f) outer glow
(8–10 px radius, slightly dimmer than the Great glow). Same block-letter style.
Thin (2 px) yellow outline. No light-streak backdrop (keeps it quieter). The
yellow communicates "warm approval" rather than "maximum excitement."

Composition & framing:
512 × 128 px canvas. Text centered. "GOOD!" is the shortest word, so set at a
slightly larger size or increase letter-spacing to match the visual weight of
the other banners.

Technical constraints:
Transparent PNG. 512 × 128 px. Single frame. Under 20 KB.

Negative prompt:
Same family rules: no lowercase, no thin fonts, no background fill, no green or
pink bleed into the yellow glow.

Suggested tool & settings:
Preferred: Figma/Photoshop — match type style, swap glow to #ffd23f.
Midjourney hint: "bold white arcade text GOOD! yellow neon glow, transparent
background, flat design --ar 4:1 --style raw --v 6.1"
```

---

## Judgment Banner — "MISS" (`judge_miss.png`)

```
Subject & purpose:
Indicator for a missed note (no hit within the timing window). Must be present
but gentle — it acknowledges the miss without shaming the player. Smaller and
quieter than all hit banners.

Style descriptors:
Subdued, soft, non-punishing. Pale grey (#aaaaaa) letters. No glow. Very faint
white outline (1 px, 40 % opacity) for definition. Same block-letter style but
at approximately 70 % the visual weight of the GOOD! banner. No background
streak. The overall read is: "oops — no big deal, keep going." The word is
deliberately in mixed-weight all-caps (not bold italic) so it does not alarm.

Composition & framing:
512 × 128 px canvas. Text centered. The small perceived size is achieved via
lighter weight and lower opacity, not by using a smaller canvas — the canvas
stays 512 × 128 px for code consistency.

Technical constraints:
Transparent PNG. 512 × 128 px. Single frame. Under 15 KB.

Negative prompt:
No bright colors, no glow, no red tones (red = danger/anger — forbidden here),
no exclamation mark (it should read as "miss" not "MISS!"), no background fill,
no dramatic effects.

Suggested tool & settings:
Preferred: Figma/Photoshop — same type style, grey fill, no effects layer.
Midjourney hint: "soft grey arcade text MISS, no glow, transparent background,
flat minimal design, subdued --ar 4:1 --style raw --v 6.1"
```

---

## Results Screen Background (`results_bg.png`)

```
Subject & purpose:
Full-screen background for the post-song results screen. Shows after every
song completion. Must feel celebratory for good results (the rank badge and
stats are overlaid on top) but remain neutral enough to work at all rank levels.

Style descriptors:
Neon-arcade celebration atmosphere. Deep-purple base (#12022e) with a large
central radial burst — like a spotlight or starburst — in very faint multi-color
neon tones (muted versions of all four lane colors: #41e0ff, #7cff6b, #ffd23f,
#ff4d8d, all at 15–20 % opacity). The burst radiates from center-screen
upward (vanishing point is above screen center). Along the bottom third of the
screen, a subtle horizontal light shelf in pink (#ff4d8d at 10 % opacity)
grounds the composition. Scattered across the background: tiny star/sparkle
sprites (8–12 px, white, low density) suggesting confetti at rest. The overall
tone is triumphant and spacious — this is a stage, not a tunnel.
No text in the background — all text is overlaid by Godot Labels.

Composition & framing:
1080 × 1920 px (portrait). Radial burst centered at approximately x = 540,
y = 640 (upper third). Safe zone for UI overlays: leave the center 800 × 1400
px area relatively free of high-contrast elements. Corners can have decorative
neon corner-bracket chrome accents (same style as the combo badge but larger).

Technical constraints:
Opaque PNG. 1080 × 1920 px. Keep file under 400 KB — use posterized/flat regions
and limit the number of distinct gradient stops. No embedded ICC profile.

Negative prompt:
No text, no letters, no numbers in the background image. No photorealistic
textures. No characters or figures. No busy repeating patterns. No hard-edged
geometric shapes that could be mistaken for UI elements or notes.

Suggested tool & settings:
Stable Diffusion (SDXL) — DreamShaper XL or Juggernaut XL.
Sampler: DPM++ 2M Karras. Steps: 35. CFG: 6. Size: 1080 × 1920.
Alternatively: Midjourney --ar 9:16 --style raw --v 6.1
Post-process: desaturate / darken the center region in Photoshop so overlaid
white text stays legible.
```

---

## Dev-agent implementation note

### Judgment banners
- All four banners (`judge_perfect.png`, `judge_great.png`, `judge_good.png`,
  `judge_miss.png`) go in `assets/judgment/`.
- In `game.gd`, hook `_on_judged(judgment, combo, score)`: show the matching
  banner `Sprite2D` at the hit line (y = hitline_y - 80), animate scale from
  1.2 → 1.0 over 0.15 s then fade alpha 1.0 → 0.0 over 0.4 s. Miss banner:
  use the same timing but scale from 0.9 → 1.0 (smaller entry).
- Judgment int mapping (from `judge_gd.gd`): 0 = Perfect, 1 = Great, 2 = Good,
  3 = Miss.

### HUD backgrounds
- `hud_combo_bg.png` goes in `assets/ui/`. Parent node: `NinePatchRect` with
  ninepatch margins L=64, R=64, T=0, B=0. Overlay a `Label` (font size 56,
  bold, color `#ffffff`) centered in the rect.
- `hud_score_bg.png` same treatment; place in top-right corner, anchor
  top-right.

### Results screen
- `results_bg.png` goes in `assets/results/`. Full-screen `TextureRect` as the
  bottom-most node of the results scene; set stretch mode to "Cover".
