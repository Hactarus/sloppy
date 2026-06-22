# Music Track Prompts — Sloppy

Reference: `audio/audio-guide.md`

Each prompt is self-contained and copy-paste ready for Suno, Udio, or
Stable Audio. Generate the full mix first, then generate each stem
separately using the same seed/style token.

---

## Track 1 — Tutorial (90 BPM)

**Output files:** `track_tutorial.ogg` + stems `_drums`, `_bass`, `_lead`, `_pads`

```
[SUNO / UDIO STYLE PROMPT]

Title: Sloppy Tutorial
BPM: 90 (exact, rigid grid, no swing, no tempo drift)
Key: C major
Time signature: 4/4
Genre: Arcade synthpop, chiptune-lite, educational calm
Mood: Welcoming, patient, encouraging — "you've got this"
Energy: Low. Sparse arrangement. Wide dynamic gaps between elements.

Instrumentation:
- DRUMS stem: Simple kick-snare pattern (kick on 1 and 3, snare on 2 and 4),
  hi-hat on every beat (quarters only). No fills. No 16th-note runs.
  The downbeat kick must be strong, punchy, unmistakable.
- BASS stem: Whole-note or half-note root pedal. Moves only on chord changes.
  Warm analog bass sine/saw. Minimal motion.
- LEAD stem: Simple 4-bar repeated melody, 8th notes maximum, bright chiptune
  square wave or clean synth lead. Melody stays within one octave.
  Plays from bar 9 onward (first 8 bars are drums + bass only).
- PADS stem: Gentle pad chord held for 2 bars each, soft attack, lush but quiet.
  Plays from bar 1. Stays in background, never louder than -18 LUFS.

Structure:
- Bar 1-8: Intro — drums + bass + pads only (no lead). Establishes groove.
- Bar 9-24: Main loop — all stems.
- Bar 25-32: Loop tail (identical to bars 9-16 for seamless loop back to bar 9).
- Total: 32 bars. Seamless loop from bar 9 to bar 32 (back to bar 9).
- At 90 BPM: 32 bars = 85.33 seconds total. Loop section = 24 bars = 64 seconds.

Loop: SEAMLESS. No silence, no gap, no reverb tail extending past bar 32.
Decay must resolve inside the bar. Loop point: end of bar 32 → start of bar 9.

Stems to generate separately (same style, same seed):
1. drums only (all other instruments silent/muted)
2. bass only
3. lead only
4. pads only

Reference vibe: early DDR 1st/2nd Mix background tracks, Kirby's Dream Land
  OST simplicity, Celeste "First Steps" calm energy.

Technical:
- OGG Vorbis, 44100 Hz, stereo, quality 6
- Target: -14 LUFS integrated, -1 dBTP true peak
- No clipping, no brick-wall limiting artifacts
- File size: full mix under 1.5 MB; each stem under 500 KB

Negative prompt:
NO tempo drift, NO swing or shuffle feel, NO syncopation in drums,
NO vocals or voice chops, NO silence at loop boundary, NO reverb tail
bleeding past the loop point, NO key changes, NO build-ups or drops
that break the loop, NO distorted or aggressive tones, NO minor key,
NO clipping or saturation artifacts.
```

---

## Track 2 — Easy (100 BPM)

**Output files:** `track_easy.ogg` + stems `_drums`, `_bass`, `_lead`, `_pads`

```
[SUNO / UDIO STYLE PROMPT]

Title: Sloppy Easy Groove
BPM: 100 (exact, machine-tight grid, no swing)
Key: G major
Time signature: 4/4
Genre: Synthpop, light arcade funk, upbeat electronic
Mood: Confident, fun, slightly bouncy — "warming up nicely"
Energy: Low-medium. Groove established from bar 1. Light syncopation on bass
  only (not drums).

Instrumentation:
- DRUMS stem: Kick on beats 1 and 3 with an added 8th-note kick on the "and"
  of beat 3 (light syncopation). Snare on 2 and 4. Closed hi-hat on every
  8th note. A single 2-beat fill every 8 bars at bar boundary only.
  Downbeat kick: punchy, loud, unmistakable.
- BASS stem: Walking 8th-note bassline in G major. Syncopated but predictable.
  Electric bass or analog synth bass. Medium-bright tone.
- LEAD stem: Catchy 8-bar hook, 8th to 16th note phrases, bright synth or
  retro electric piano. Enters at bar 5. Repeats every 8 bars with small
  variation on the B phrase.
- PADS stem: Warm pad chords changing every 2 bars. Slight detune for warmth.
  Subtle filter sweep on the pad (very slow, 16-bar cycle).

Structure:
- Bar 1-4: Intro — drums + bass only.
- Bar 5-8: Add pads.
- Bar 9-32: Full arrangement (all stems). Loop target.
- Total: 32 bars. Seamless loop from bar 9 to bar 32 (back to bar 9).
- At 100 BPM: 32 bars = 76.8 seconds. Loop section = 24 bars = 57.6 seconds.

Loop: SEAMLESS. Loop point: end of bar 32 → start of bar 9.
All reverb/delay tails must resolve before bar 32 ends.

Stems to generate separately (same style/seed):
1. drums only
2. bass only
3. lead only
4. pads only

Reference vibe: Pump It Up Fiesta intro tracks, Crypt of the NecroDancer "Disco
  Descent" energy level, OutRun "Magical Sound Shower" lightness.

Technical:
- OGG Vorbis, 44100 Hz, stereo, quality 6
- Target: -14 LUFS integrated, -1 dBTP true peak
- File size: full mix under 1.5 MB; each stem under 500 KB

Negative prompt:
NO tempo drift, NO vocals or spoken word, NO silence at loop boundary,
NO reverb tail past loop point, NO hard drops or dramatic breakdowns,
NO minor key passages, NO clipping, NO aggressive bass distortion,
NO changes in BPM or feel mid-track, NO jazz swing timing.
```

---

## Track 3 — Medium (120 BPM)

**Output files:** `track_medium.ogg` + stems `_drums`, `_bass`, `_lead`, `_pads`

```
[SUNO / UDIO STYLE PROMPT]

Title: Sloppy Midline Drive
BPM: 120 (exact, rigid, no swing)
Key: A minor (natural / Aeolian)
Time signature: 4/4
Genre: Electronic dance, nu-arcade synthwave, energetic
Mood: Focused, driving, slightly tense but not aggressive — "in the zone"
Energy: Medium-high. Full arrangement from early in the track. 8th and 16th
  note syncopation acceptable but must remain on-grid.

Instrumentation:
- DRUMS stem: Four-on-the-floor kick (every beat). Snare on 2 and 4 with a
  ghost note on the "and" of 4. Closed hi-hat 16th notes, open hat on every
  8th-note upbeat. Clap layer on snare hits for definition.
  Fills: a 1-bar fill every 8 bars, landing cleanly on the downbeat.
  Downbeat kick: punchy, loud, sub presence, unmistakable.
- BASS stem: Synth bass with a slight portamento. 16th-note rhythmic pattern
  in A minor. Groove is consistent with occasional 1-bar variation.
  Sub bass reinforces kick.
- LEAD stem: Two-part structure — an A-section 4-bar riff and a B-section
  8-bar melodic phrase that lifts in energy. Sawtooth or supersaw lead synth.
  Some light chorus/unison detune. Enters at bar 1.
- PADS stem: Dark-to-bright evolving pad in A minor. Slight LFO filter
  modulation (period = 4 bars). Adds atmosphere, never overpowers lead.

Structure:
- Bar 1-4: Drums + bass only (energetic, no lead yet).
- Bar 5-8: Add pads + lead A-section.
- Bar 9-32: Full arrangement. Loop target.
- Total: 32 bars. Seamless loop from bar 9 to bar 32 (back to bar 9).
- At 120 BPM: 32 bars = 64 seconds. Loop section = 24 bars = 48 seconds.

Loop: SEAMLESS. Loop point: end of bar 32 → start of bar 9.
All reverb/delay tails must resolve inside bar 32.

Stems to generate separately (same style/seed):
1. drums only
2. bass only
3. lead only
4. pads only

Reference vibe: DDR SuperNOVA mid-difficulty tracks, Geometry Dash
  "Electroman Adventures" drive, old-school Daft Punk arrangement discipline.

Technical:
- OGG Vorbis, 44100 Hz, stereo, quality 6
- Target: -14 LUFS integrated, -1 dBTP true peak
- File size: full mix under 1.5 MB; each stem under 500 KB

Negative prompt:
NO tempo drift, NO vocals, NO silence or gap at loop point, NO reverb tail
bleeding past loop boundary, NO breakdown sections that reduce energy below
the intro level, NO major key shift (stay in A minor throughout),
NO clipping or limiting artifacts, NO swing or shuffle timing,
NO dubstep wobble bass that obscures the beat, NO BPM changes.
```

---

## Track 4 — Hard (140 BPM)

**Output files:** `track_hard.ogg` + stems `_drums`, `_bass`, `_lead`, `_pads`

```
[SUNO / UDIO STYLE PROMPT]

Title: Sloppy Hardline
BPM: 140 (exact, machine-precise, no swing)
Key: D minor (Dorian flavour — raised 6th for brightness)
Time signature: 4/4
Genre: Arcade hard-electronic, high-energy synthwave/trance hybrid
Mood: Intense, exhilarating, high-stakes — "full concentration, maximum output"
Energy: High from bar 1. Dense arrangement. 16th-note patterns throughout.
  Must feel relentlessly forward-moving.

Instrumentation:
- DRUMS stem: Four-on-the-floor kick, loud and sub-heavy. Snare on 2 and 4
  with additional snare rolls and ghost notes. Hi-hat 16th notes throughout
  with occasional 32nd-note ruffs. Open hat on every upbeat 8th.
  Percussion layer: shaker or tambourine on 16th-note grid.
  Fill: 2-beat fill every 4 bars, landing precisely on the next downbeat.
  Downbeat kick: very loud, punchy, unmistakable — must stand above the mix.
- BASS stem: Aggressive sawtooth or distorted synth bass. 16th-note rhythmic
  bassline with syncopated accents. Strong sub component tied to kick drum.
  Bass and kick are side-chained (ducking visible in the waveform).
- LEAD stem: Two lead layers — (a) a driving 4-bar arpeggio pattern in D Dorian
  on a supersaw synth; (b) a higher-register melodic counter-melody that
  appears every 8 bars. Both layers use tight stereo unison.
  Subtle pitch reverb allowed on lead B only, must resolve before bar end.
- PADS stem: Wide, lush pad chord sustains. Slightly dissonant tension pad
  on the B-section adds urgency. Modulates to brief F major chord for contrast
  then returns to D minor. Filter opens fully on pad from bar 1.

Structure:
- Bar 1-2: Drums only — immediate, intense, no build-up.
- Bar 3-8: Add bass. Add lead arpeggio (A-section).
- Bar 9-32: Full arrangement with lead B-section at bars 17-24. Loop target.
- Total: 32 bars. Seamless loop from bar 9 to bar 32 (back to bar 9).
- At 140 BPM: 32 bars = 54.86 seconds. Loop section = 24 bars = 41.14 seconds.

Loop: SEAMLESS. Loop point: end of bar 32 → start of bar 9.
All reverb/delay tails MUST resolve before bar 32 ends. The loop must be
inaudible on any crossfade-free repeat.

Stems to generate separately (same style/seed):
1. drums only
2. bass only
3. lead only (includes both arpeggio and counter-melody layers)
4. pads only

Reference vibe: DDR Extreme / SuperNOVA heavy tracks (e.g. MAX 300 energy level
but NOT as extreme), Touhou ZUN-style intensity translated to electronic,
Persona 5 battle music urgency, Taiko no Tatsujin oni difficulty feel.

Technical:
- OGG Vorbis, 44100 Hz, stereo, quality 6
- Target: -14 LUFS integrated, -1 dBTP true peak
- File size: full mix under 1.5 MB; each stem under 500 KB

Negative prompt:
NO tempo drift, NO vocals or voice chops, NO silence or gap at loop point,
NO reverb tail past loop boundary, NO BPM changes or half-time drops,
NO breakdown sections that remove the kick drum for more than 2 bars,
NO clipping or hard limiting artifacts, NO swing or shuffle timing,
NO dubstep wobble bass, NO pitch shifts on the kick drum,
NO silence or fade-out — track must loop at full energy.
```

---

## Stem generation notes (all tracks)

When generating stems in Suno/Udio:
1. Generate the full mix first. Note the seed/style code.
2. Re-run with the same seed and append to the style prompt:
   `[STEMS ONLY: drums — all other instruments completely silent]`
   Repeat for bass, lead, pads.
3. All stems must be the same exact duration (sample-accurate) as the full mix
   so they remain phase-locked when played simultaneously in Godot.
4. Verify loop points in an audio editor (Audacity, Reaper): the last sample
   of bar 32 must splice cleanly into the first sample of bar 9 with no
   click, gap, or pitch discontinuity.

For Stable Audio:
- Duration: set to exact bar count in seconds (see per-track calculation above).
- Steps: 150+ for music quality.
- Guidance: 7.5.
- Use the prompt text verbatim inside the text field.

## Dev agent handoff

| File                       | BPM   | offset_sec | Loop: end bar → start bar |
|----------------------------|-------|------------|---------------------------|
| track_tutorial.ogg         | 90.0  | 0.000      | bar 32 → bar 9            |
| track_tutorial_drums.ogg   | 90.0  | 0.000      | bar 32 → bar 9            |
| track_tutorial_bass.ogg    | 90.0  | 0.000      | bar 32 → bar 9            |
| track_tutorial_lead.ogg    | 90.0  | 0.000      | bar 32 → bar 9            |
| track_tutorial_pads.ogg    | 90.0  | 0.000      | bar 32 → bar 9            |
| track_easy.ogg             | 100.0 | 0.000      | bar 32 → bar 9            |
| track_easy_drums.ogg       | 100.0 | 0.000      | bar 32 → bar 9            |
| track_easy_bass.ogg        | 100.0 | 0.000      | bar 32 → bar 9            |
| track_easy_lead.ogg        | 100.0 | 0.000      | bar 32 → bar 9            |
| track_easy_pads.ogg        | 100.0 | 0.000      | bar 32 → bar 9            |
| track_medium.ogg           | 120.0 | 0.000      | bar 32 → bar 9            |
| track_medium_drums.ogg     | 120.0 | 0.000      | bar 32 → bar 9            |
| track_medium_bass.ogg      | 120.0 | 0.000      | bar 32 → bar 9            |
| track_medium_lead.ogg      | 120.0 | 0.000      | bar 32 → bar 9            |
| track_medium_pads.ogg      | 120.0 | 0.000      | bar 32 → bar 9            |
| track_hard.ogg             | 140.0 | 0.000      | bar 32 → bar 9            |
| track_hard_drums.ogg       | 140.0 | 0.000      | bar 32 → bar 9            |
| track_hard_bass.ogg        | 140.0 | 0.000      | bar 32 → bar 9            |
| track_hard_lead.ogg        | 140.0 | 0.000      | bar 32 → bar 9            |
| track_hard_pads.ogg        | 140.0 | 0.000      | bar 32 → bar 9            |

All offset_sec values are 0.000 assuming no silence before beat 1.
Measure each generated file and update if any pre-beat silence exists.
The Conductor's `beat_to_time(-4)` call schedules `sfx_song_start` during
the 4-beat lead-in; ensure the track file does not contain its own count-in.
