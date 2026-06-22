# Audio Guide — Sloppy

> Living document owned by the **sound-designer** agent. Every music/SFX-AI
> prompt must reference this file so all generated assets fit together.
> Update this document before adding any new track or SFX.

---

## Sonic identity

Upbeat, clean, arcade-electronic. The aesthetic sits between early-2000s
rhythm-arcade (DDR, Pop'n Music) and modern chiptune-adjacent synthpop.
Strong, steady beat with an unmistakable downbeat — the timing engine and
note charts in `rust/src/conductor.rs` are built from it.
No tempo drift. No live-band looseness. Machine-tight grid.

---

## BPM ladder (definitive values)

These are the **exact BPMs** used for each difficulty tier. Every track must
pick one value from its tier's assigned BPM; no ranges at generation time.

| Tier     | Exact BPM | Sec/beat | Feel                                     |
|----------|-----------|----------|------------------------------------------|
| Tutorial | 90        | 0.667 s  | Sparse, every note lands on a beat       |
| Easy     | 100       | 0.600 s  | Simple groove, light syncopation         |
| Medium   | 120       | 0.500 s  | Fuller arrangement, 8th-note patterns    |
| Hard     | 140       | 0.429 s  | Layered, busier, 16th-note runs allowed  |

BPM escalation across the four tracks gives a natural progression feel even
if the player hears them in order during a single session.

### Conductor fields (per track)

The Dev agent sets these on the `Conductor` node when a song loads:

| Track file              | bpm   | offset_sec | loop_bar_count | loop_start_bar |
|-------------------------|-------|------------|----------------|----------------|
| track_tutorial.ogg      | 90.0  | 0.000      | 32             | 0              |
| track_easy.ogg          | 100.0 | 0.000      | 32             | 0              |
| track_medium.ogg        | 120.0 | 0.000      | 32             | 0              |
| track_hard.ogg          | 140.0 | 0.000      | 32             | 0              |

`offset_sec` must be **measured** after generation and updated here if the
generated file has any silence before beat 1. The chart loader reads this
table; do not rename files without updating chart data.

---

## SFX palette

All SFX are triggered from GDScript (or Rust via `AudioStreamPlayer`).
Keep every clip under 300 ms unless noted. Latency budget on Web is tight;
prefer mono OGG at 44100 Hz for all hit sounds.

| ID                    | Trigger condition                         | Max duration | Character                                       |
|-----------------------|-------------------------------------------|--------------|-------------------------------------------------|
| `sfx_hit_perfect`     | Timing window: Perfect (±20 ms)           | 120 ms       | Crisp, bright, high-pitched tick + shimmer      |
| `sfx_hit_great`       | Timing window: Great (±50 ms)             | 120 ms       | Slightly warmer tick, less shimmer              |
| `sfx_hit_good`        | Timing window: Good (±100 ms)             | 150 ms       | Soft thud/pop, noticeably duller than Perfect   |
| `sfx_miss`            | Note missed / no input                    | 200 ms       | Soft low whoosh or muffled thud, never buzzer   |
| `sfx_combo_10`        | Combo reaches 10                          | 400 ms       | Short ascending 3-note chime, bright            |
| `sfx_combo_50`        | Combo reaches 50                          | 600 ms       | Longer ascending arpeggio, adds sparkle layer   |
| `sfx_ui_click`        | Any menu button press                     | 80 ms        | Light plastic click / soft tap                  |
| `sfx_song_start`      | Countdown ends, song begins               | 1500 ms      | 4-beat count-in or quick rising synth stinger   |
| `sfx_results_fanfare` | Results screen appears                    | 3000 ms      | Short triumphant jingle, resolves to tonic      |

### Layered combo stem system

At combo milestones, additional instrument stems from the current background
track are faded in by the GDScript audio bus:

- Combo 10+: bass stem fades in (if not already playing)
- Combo 25+: lead stem fades in
- Combo 50+: pads/synth stem fades in + `sfx_combo_50` one-shot plays

This is handled in the audio bus mixer, not by replacing the track. Each
background track must therefore export stems as separate OGG files.

---

## Format requirements

### Music beds / stems

| Parameter         | Value                              |
|-------------------|------------------------------------|
| Format            | OGG Vorbis                         |
| Sample rate       | 44100 Hz                           |
| Channels          | Stereo                             |
| Target loudness   | -14 LUFS integrated, -1 dBTP peak |
| Loop              | Seamless (no gap or click)         |
| Loop point        | Bar boundary (always bar 0 → bar N)|
| Bit quality       | Vorbis quality 6 (~192 kbps)       |
| Max file size     | 1.5 MB per stem, 6 MB per full track bundle |

### SFX

| Parameter         | Value                              |
|-------------------|------------------------------------|
| Format            | OGG Vorbis                         |
| Sample rate       | 44100 Hz                           |
| Channels          | Mono (hit/miss/ui); Stereo (combo milestones, fanfare, start jingle) |
| Target loudness   | -12 LUFS integrated, -1 dBTP peak |
| Max file size     | 50 KB per clip (hit/miss/ui); 150 KB (combo/fanfare/jingle) |
| Fade out          | Hard tail preferred; no abrupt DC click at end |

### Naming convention

```
audio/
  music/
    track_tutorial.ogg
    track_tutorial_drums.ogg
    track_tutorial_bass.ogg
    track_tutorial_lead.ogg
    track_tutorial_pads.ogg
    track_easy.ogg
    track_easy_drums.ogg
    track_easy_bass.ogg
    track_easy_lead.ogg
    track_easy_pads.ogg
    track_medium.ogg          (+ stems)
    track_hard.ogg            (+ stems)
  sfx/
    sfx_hit_perfect.ogg
    sfx_hit_great.ogg
    sfx_hit_good.ogg
    sfx_miss.ogg
    sfx_combo_10.ogg
    sfx_combo_50.ogg
    sfx_ui_click.ogg
    sfx_song_start.ogg
    sfx_results_fanfare.ogg
```

---

## Dev agent handoff notes

- The Conductor node fields `bpm`, `offset_sec` are set by the chart loader.
  Values are in the table above; update `offset_sec` after measuring silence
  in each generated file.
- All stems for a track share an identical sample-accurate length and loop
  point so `AudioStreamPlayer` instances stay phase-locked.
- SFX are loaded into an `AudioStreamPlayer` pool (low-latency bus, no
  effects). Do not route hit SFX through the music reverb bus.
- `sfx_song_start` plays during the 4-beat lead-in before `offset_sec = 0`;
  schedule it at `beat_to_time(-4)` so it resolves on beat 0.
- Combo stem fade-in should use a 0.5 s linear volume ramp on the stem
  AudioStreamPlayer to avoid a jarring pop.

---

## Prompts

Ready-to-paste music/SFX-AI prompts live under `audio/prompts/`:
- `audio/prompts/tracks.md` — four background tracks
- `audio/prompts/sfx.md` — all SFX clips
