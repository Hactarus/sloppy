# SFX Prompts — Sloppy

Reference: `audio/audio-guide.md`

Each prompt is self-contained and copy-paste ready for ElevenLabs Sound Effects,
Stable Audio, or AudioCraft/AudioLDM. Prompts are fenced for direct pasting.

All hit/miss/UI sounds: OGG Vorbis, 44100 Hz, MONO.
Combo milestones, start jingle, results fanfare: OGG Vorbis, 44100 Hz, STEREO.
Loudness target: -12 LUFS integrated, -1 dBTP true peak.

---

## 1. Perfect Hit — `sfx_hit_perfect.ogg`

**Type:** Hit SFX (best timing window, ±20 ms)
**Duration target:** 80–100 ms
**Format:** OGG Vorbis, 44100 Hz, mono
**Loudness:** -12 LUFS, -1 dBTP

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A single, ultra-crisp electronic tap sound. Extremely short (under 100 ms
total). Bright, high-pitched — sits around 2–4 kHz fundamental.
Character: like a tiny crystal glass ping combined with a tight
electrostatic click. Immediate transient attack (< 5 ms rise time),
very fast exponential decay. A brief shimmer overtone fades out in the
last 30 ms, adding a "star" quality. Sounds satisfying and rewarding.
No reverb. No room sound. Completely dry.
Think: arcade button confirm sound, but cleaner and more musical.

Duration: exactly 100 ms. No silence before the transient.
No tail beyond 100 ms.

Negative prompt: NO buzz, NO distortion, NO low frequencies below 500 Hz,
NO reverb, NO echo, NO vocals, NO clipping, NO silence at start,
NO duration over 120 ms.
```

---

## 2. Great Hit — `sfx_hit_great.ogg`

**Type:** Hit SFX (second timing window, ±50 ms)
**Duration target:** 100–120 ms
**Format:** OGG Vorbis, 44100 Hz, mono
**Loudness:** -12 LUFS, -1 dBTP

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A short, satisfying electronic tap — slightly warmer and softer than the
perfect hit. Fundamental sits around 1.5–2.5 kHz. Tighter transient than
a drum but with a rounded, mellow quality. Think of a soft marimba or
vibraphone tap — short sustain, gentle attack. Slightly less brightness
and shimmer than the perfect sound. The listener should perceive it as
"good but not quite perfect." Completely dry, no reverb.

Duration: 100–120 ms. No silence before transient. Clean tail.

Negative prompt: NO harsh high frequencies above 6 kHz, NO buzzing,
NO reverb, NO distortion, NO clipping, NO silence at start,
NO duration over 150 ms, must sound distinctly duller than sfx_hit_perfect.
```

---

## 3. Good Hit — `sfx_hit_good.ogg`

**Type:** Hit SFX (third timing window, ±100 ms)
**Duration target:** 120–150 ms
**Format:** OGG Vorbis, 44100 Hz, mono
**Loudness:** -13 LUFS, -1 dBTP (slightly quieter than perfect/great)

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A soft, muted electronic pop or thud. Low-mid heavy, fundamental around
400–800 Hz. Reminiscent of pressing a soft rubber button or a deadened
drum hit. Short attack, fast decay, no shimmer, no brightness.
The sound should feel like "acceptable but not optimal" without being
negative or punishing. Noticeably duller and softer than the great hit.
Completely dry. No reverb.

Duration: 120–150 ms. No silence at start. Smooth natural fade.

Negative prompt: NO high-frequency sharpness above 3 kHz, NO buzz,
NO reverb, NO distortion, NO clipping, NO negative/failure associations,
NO duration over 200 ms, must sound noticeably different (duller) from
sfx_hit_great.
```

---

## 4. Miss — `sfx_miss.ogg`

**Type:** Miss cue (note not hit)
**Duration target:** 150–200 ms
**Format:** OGG Vorbis, 44100 Hz, mono
**Loudness:** -16 LUFS, -1 dBTP (quieter than hits — non-punishing)

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A very soft, low-register whoosh or muffled thud. No harsh or aggressive
quality whatsoever. Think of a gentle air puff, a soft pillow tap, or a
very quiet "shff" white noise sweep that descends slightly in pitch.
Frequency range: mostly 100–600 Hz, minimal high-frequency content.
Should feel like a neutral notification, not a failure buzzer.
Completely dry. Very short but with a gentle tail.

The key design intent: the player should barely notice it. The miss must
never interrupt the game feel or feel punishing.

Duration: 150–200 ms. Quiet start, peaks in the first 30 ms, gentle fade.

Negative prompt: NO buzzer sound, NO descending error tone, NO harsh
mid-frequencies, NO reverb, NO clipping, NO startling quality, NO volume
louder than the hit sounds, NO long tail over 250 ms, NEVER sound like
a wrong-answer noise from a game show.
```

---

## 5. Combo x10 Milestone — `sfx_combo_10.ogg`

**Type:** Combo milestone stinger
**Duration target:** 350–400 ms
**Format:** OGG Vorbis, 44100 Hz, stereo
**Loudness:** -12 LUFS, -1 dBTP

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A short, bright ascending 3-note chime sequence. Notes go up stepwise
(e.g. C5 → E5 → G5, a simple major arpeggio). Each note: 80–100 ms,
fast attack, medium decay, clean bell or marimba timbre with a slight
digital sparkle. Total duration 350–400 ms. Stereo: slight left-right pan
spread on the ascending notes (lowest note center, highest note wide).

The sound should feel like a small reward, a mini-celebration.
Bright, cheerful, game-appropriate.

Duration: 350–400 ms total. Clean tail.

Negative prompt: NO minor key, NO descending pitches, NO reverb beyond
a tiny room (< 50 ms), NO low-frequency content below 300 Hz, NO clipping,
NO duration over 500 ms, NO chord/cluster — individual sequential notes only.
```

---

## 6. Combo x50 Milestone — `sfx_combo_50.ogg`

**Type:** Combo milestone stinger (major achievement)
**Duration target:** 500–600 ms
**Format:** OGG Vorbis, 44100 Hz, stereo
**Loudness:** -11 LUFS, -1 dBTP (slightly louder than x10 — bigger moment)

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A longer, more elaborate ascending arpeggio spanning 5–6 notes
(e.g. C5 → E5 → G5 → C6 → E6 → G6 — two-octave major arpeggio sweep).
Each note: 60–80 ms, bright bell/chime timbre with an added sparkle/shimmer
layer that blooms on the final note. The final note should have a brief
(~100 ms) shimmer tail that suggests "sparkle" or "stars."
Stereo: wide stereo image, notes pan from left to right as they ascend.
Feels like the x10 sound but grander and more triumphant.

The sound should feel like a significant achievement unlocked.

Duration: 500–600 ms total.

Negative prompt: NO minor key, NO descending motion, NO harsh reverb,
NO low bass content below 300 Hz, NO clipping, NO duration over 700 ms,
NO drumbeats or percussive rhythm underneath, must sound distinctly
more impressive than sfx_combo_10.
```

---

## 7. Menu Click — `sfx_ui_click.ogg`

**Type:** UI interaction SFX
**Duration target:** 60–80 ms
**Format:** OGG Vorbis, 44100 Hz, mono
**Loudness:** -14 LUFS, -1 dBTP

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

An extremely short, light UI tap sound. Like pressing a clean plastic
or soft rubber button. Slightly higher-pitched than a mechanical keyboard
click — around 1–2 kHz. Very fast attack (< 3 ms), very fast decay.
Completely neutral — not positive or negative, just a clean confirmation
of input. Dry, no reverb, no echo.

Duration: 60–80 ms maximum. No silence at start.

Negative prompt: NO metallic harshness, NO low thud, NO reverb, NO echo,
NO clipping, NO duration over 100 ms, NO tone or musical pitch association,
NO sci-fi laser quality.
```

---

## 8. Song Start Jingle — `sfx_song_start.ogg`

**Type:** Count-in / song start stinger
**Duration target:** 1400–1500 ms (exactly 4 beats at the track's BPM
  when used as a count-in — note this is a fixed-length asset; the chart
  loader schedules it at beat_to_time(-4))
**Format:** OGG Vorbis, 44100 Hz, stereo
**Loudness:** -12 LUFS, -1 dBTP

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A 4-beat electronic count-in stinger, arcade style.
Four distinct ascending or level clicks/beeps — like a metronome but musical.
Beats 1, 2, 3: identical short synth blip (100 ms each), bright and punchy,
around 1.5 kHz. Beat 4: a slightly higher-pitched or brighter version of
the blip, signalling "go now." The rhythm must be perfectly even quarter notes.

The stinger must communicate "the song is about to start" without being
loud or startling. Upbeat and encouraging.

Total duration: 1500 ms exactly (4 quarter notes at ~100 BPM average).
Because this SFX plays before tracks of different BPMs, the Dev agent
uses beat_to_time(-4) at the correct BPM — the stinger itself is tempo-free
but it must resolve cleanly at its endpoint.

Negative prompt: NO music or melody beyond the 4 clicks, NO reverb,
NO echo, NO voices, NO countdown voice ("3, 2, 1"), NO clipping,
NO silence at start, NO duration under 1400 ms or over 1600 ms.
```

---

## 9. Results Fanfare — `sfx_results_fanfare.ogg`

**Type:** Results screen fanfare / success jingle
**Duration target:** 2800–3000 ms
**Format:** OGG Vorbis, 44100 Hz, stereo
**Loudness:** -12 LUFS, -1 dBTP

```
[ELEVENLABS SFX / STABLE AUDIO PROMPT]

A short triumphant fanfare jingle for a rhythm game results screen.
Upbeat, celebratory, arcade-pop style. Instrumentation: bright synth brass,
chime bells, and a light synth bass hit.

Structure:
- 0–500 ms: Rising melodic phrase (4 notes ascending — anticipation).
- 500–1800 ms: Triumphant chord stab + bright arpeggiated figure
  (the "success" moment). Major key (C major preferred).
- 1800–2800 ms: Resolution — held major chord with shimmer decay,
  final bass hit at ~2500 ms to punctuate the end.

Rhythm: implied 4/4, around 120 BPM feel, but this is not looped.
The jingle should feel like an NES/SNES-era victory fanfare updated with
modern synth textures.

Must resolve harmonically — ends on the tonic, feels complete. The player
should feel rewarded and satisfied hearing this.

Total duration: 2800–3000 ms. No loop. Natural fade on the final chord.

Negative prompt: NO minor key, NO descending ending (must resolve upward
or level on tonic), NO reverb longer than 500 ms, NO clipping,
NO vocals or voice, NO drums or percussive beat (chords and melody only),
NO duration over 3500 ms or under 2500 ms, NO sad or ambiguous resolution.
```

---

## Generation tool recommendations

| SFX                 | Recommended tool                        | Key settings                          |
|---------------------|-----------------------------------------|---------------------------------------|
| sfx_hit_perfect     | ElevenLabs Sound Effects                | Duration: 0.1 s; prompt as above      |
| sfx_hit_great       | ElevenLabs Sound Effects                | Duration: 0.1 s                       |
| sfx_hit_good        | ElevenLabs Sound Effects                | Duration: 0.15 s                      |
| sfx_miss            | ElevenLabs Sound Effects                | Duration: 0.2 s                       |
| sfx_combo_10        | ElevenLabs Sound Effects / Stable Audio | Duration: 0.4 s; Steps 100            |
| sfx_combo_50        | ElevenLabs Sound Effects / Stable Audio | Duration: 0.6 s; Steps 100            |
| sfx_ui_click        | ElevenLabs Sound Effects                | Duration: 0.08 s                      |
| sfx_song_start      | Stable Audio                            | Duration: 1.5 s; Steps 150; Guidance 7|
| sfx_results_fanfare | Stable Audio / Suno (instrumental only) | Duration: 3.0 s; Steps 200; Guidance 8|

## Post-processing checklist (all SFX)

1. Normalize to target loudness (-12 LUFS / -16 LUFS for miss) using ffmpeg-loudnorm
   or a DAW loudness tool.
2. Trim silence from the start of the file — first sample must be the transient.
3. Ensure no DC offset (high-pass at 20 Hz if needed).
4. Export to OGG Vorbis quality 4–6 using `ffmpeg -c:a libvorbis -q:a 5`.
5. Verify file size is within budget (see `audio/audio-guide.md`).
6. Drop into `audio/sfx/` using exact filenames in the guide.

## Dev agent handoff

| File                     | Trigger point (GDScript/Rust)                         | Bus           |
|--------------------------|-------------------------------------------------------|---------------|
| sfx_hit_perfect.ogg      | Judge result == Perfect                               | SFX (no FX)   |
| sfx_hit_great.ogg        | Judge result == Great                                 | SFX (no FX)   |
| sfx_hit_good.ogg         | Judge result == Good                                  | SFX (no FX)   |
| sfx_miss.ogg             | Note scroll past hit zone with no input               | SFX (no FX)   |
| sfx_combo_10.ogg         | combo_count crosses 10                                | SFX (no FX)   |
| sfx_combo_50.ogg         | combo_count crosses 50                                | SFX (no FX)   |
| sfx_ui_click.ogg         | Any Button.pressed signal                             | UI bus        |
| sfx_song_start.ogg       | Scheduled at Conductor.beat_to_time(-4)               | SFX (no FX)   |
| sfx_results_fanfare.ogg  | Results scene _ready()                                | Music bus     |

All hit/miss SFX use a pooled AudioStreamPlayer (pool size 4+) on a
dedicated low-latency bus with no effects inserts, to minimise Web audio
scheduling jitter.
