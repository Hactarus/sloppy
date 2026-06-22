# Asset Inventory — Sloppy

> Maintained by the **design** agent. All dimensions are for the primary
> 1080 × 1920 portrait canvas unless noted. Power-of-two sizes are used for
> GPU textures; UI panels may be any size but must be divisible by 4.

---

## 1. Play-field

| Name | Purpose | Dimensions | Format |
|------|---------|-----------|--------|
| `playfield_bg.png` | Scrolling lane track (4 lanes) that tiles vertically behind falling notes | 1080 × 512 (tileable vertically) | Opaque PNG |
| `hitline_bar.png` | The bright horizontal bar at the bottom of the play area where notes must be hit | 1080 × 16 | Transparent PNG |
| `lane_divider.png` | Thin vertical line between lanes; repeated 3 times | 4 × 256 | Transparent PNG |

---

## 2. Notes

One sprite per lane. Each lane has a distinct **color AND shape** so they are
distinguishable without color vision.

| Name | Lane | Color | Shape | Dimensions | Format |
|------|------|-------|-------|-----------|--------|
| `note_lane1.png` | Lane 1 | Cyan `#41e0ff` | Arrow (pointing up) | 128 × 128 | Transparent PNG |
| `note_lane2.png` | Lane 2 | Green `#7cff6b` | Diamond (rotated square) | 128 × 128 | Transparent PNG |
| `note_lane3.png` | Lane 3 | Yellow `#ffd23f` | Circle | 128 × 128 | Transparent PNG |
| `note_lane4.png` | Lane 4 | Pink `#ff4d8d` | Square (rounded corners) | 128 × 128 | Transparent PNG |
| `note_hold_lane1.png` | Lane 1 hold tail | Cyan `#41e0ff` | Vertical pill/bar | 64 × 512 | Transparent PNG |
| `note_hold_lane2.png` | Lane 2 hold tail | Green `#7cff6b` | Vertical pill/bar | 64 × 512 | Transparent PNG |
| `note_hold_lane3.png` | Lane 3 hold tail | Yellow `#ffd23f` | Vertical pill/bar | 64 × 512 | Transparent PNG |
| `note_hold_lane4.png` | Lane 4 hold tail | Pink `#ff4d8d` | Vertical pill/bar | 64 × 512 | Transparent PNG |

---

## 3. Feedback / VFX

| Name | Purpose | Dimensions | Format |
|------|---------|-----------|--------|
| `hit_explosion_sheet.png` | Hit burst particle effect, spritesheet | 512 × 512 (4 × 4 grid, 16 frames at 128 × 128 each) | Transparent PNG spritesheet |
| `combo_fire_sheet.png` | Flame/energy aura shown when combo ≥ 10, loops | 256 × 512 (2 × 4 grid, 8 frames at 128 × 128 each) | Transparent PNG spritesheet |
| `miss_ripple_sheet.png` | Gentle ripple/fade shown on miss, no bright flash | 256 × 256 (2 × 2 grid, 4 frames at 128 × 128 each) | Transparent PNG spritesheet |

---

## 4. Judgment Text Banners

Rendered text-style vector shapes, NOT raw type (to avoid font dependency).

| Name | Text | Color | Dimensions | Format |
|------|------|-------|-----------|--------|
| `judge_perfect.png` | "PERFECT!" | White `#ffffff` with cyan `#41e0ff` glow | 512 × 128 | Transparent PNG |
| `judge_great.png` | "GREAT!" | White `#ffffff` with green `#7cff6b` glow | 512 × 128 | Transparent PNG |
| `judge_good.png` | "GOOD!" | White `#ffffff` with yellow `#ffd23f` glow | 512 × 128 | Transparent PNG |
| `judge_miss.png` | "MISS" | Soft grey `#aaaaaa`, no glow, small/quiet | 512 × 128 | Transparent PNG |

---

## 5. UI / HUD

| Name | Purpose | Dimensions | Format |
|------|---------|-----------|--------|
| `hud_combo_bg.png` | Dark pill/badge behind the combo number | 256 × 128 | Transparent PNG |
| `hud_score_bg.png` | Dark panel behind the score number, top-right | 320 × 80 | Transparent PNG |
| `hud_progress_bar_fill.png` | Song progress bar fill (left-to-right gradient) | 256 × 16 | Transparent PNG |
| `hud_progress_bar_track.png` | Song progress bar empty track | 1024 × 16 | Transparent PNG |
| `pause_overlay.png` | Semi-transparent dark overlay shown on pause | 1080 × 1920 | Opaque PNG (with alpha channel) |

---

## 6. Menus

| Name | Purpose | Dimensions | Format |
|------|---------|-----------|--------|
| `menu_bg.png` | Main-menu full-screen background | 1080 × 1920 | Opaque PNG |
| `song_card_bg.png` | Song-select card background (tappable), contains album-art slot | 960 × 256 | Transparent PNG |
| `song_card_selected.png` | Selected state border/glow for song card | 960 × 256 | Transparent PNG |
| `btn_primary.png` | Primary action button (Play, Retry) — ninepatch | 512 × 128 | Transparent PNG (ninepatch safe zone: 32 px inset all sides) |
| `btn_secondary.png` | Secondary button (Back, Options) — ninepatch | 512 × 128 | Transparent PNG (ninepatch safe zone: 32 px inset all sides) |
| `difficulty_pip.png` | Small dot indicating difficulty level | 32 × 32 | Transparent PNG |

---

## 7. Results Screen

| Name | Purpose | Dimensions | Format |
|------|---------|-----------|--------|
| `results_bg.png` | Full-screen results screen background | 1080 × 1920 | Opaque PNG |
| `results_rank_s.png` | Rank badge "S" (≥ 95 % perfect) | 256 × 256 | Transparent PNG |
| `results_rank_a.png` | Rank badge "A" | 256 × 256 | Transparent PNG |
| `results_rank_b.png` | Rank badge "B" | 256 × 256 | Transparent PNG |
| `results_rank_c.png` | Rank badge "C" | 256 × 256 | Transparent PNG |
| `results_rank_d.png` | Rank badge "D" | 256 × 256 | Transparent PNG |
| `results_new_best.png` | "NEW BEST!" banner shown on personal record | 512 × 128 | Transparent PNG |
| `results_confetti_sheet.png` | Confetti burst on good result, spritesheet | 512 × 512 (4 × 4 grid, 16 frames) | Transparent PNG spritesheet |

---

## 8. App Icon

| Name | Purpose | Dimensions | Format |
|------|---------|-----------|--------|
| `icon_512.png` | Android / Web store icon | 512 × 512 | Opaque PNG |
| `icon_192.png` | Android adaptive icon foreground layer | 192 × 192 | Transparent PNG |
| `icon_foreground_1024.png` | High-res foreground for Play Store feature graphic derivation | 1024 × 1024 | Transparent PNG |

---

## File layout

All generated assets live under `assets/` in the repo:

```
assets/
  notes/          note_lane*.png, note_hold_lane*.png
  playfield/      playfield_bg.png, hitline_bar.png, lane_divider.png
  vfx/            hit_explosion_sheet.png, combo_fire_sheet.png, miss_ripple_sheet.png
  ui/             hud_*.png, pause_overlay.png, btn_*.png, difficulty_pip.png
  judgment/       judge_*.png
  menus/          menu_bg.png, song_card_*.png
  results/        results_*.png
  icon/           icon_*.png
```
