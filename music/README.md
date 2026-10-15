# music/ — Strudel sketches

Live-coded music for Sloppy using [Strudel](https://strudel.cc), the
JavaScript port of TidalCycles.

| File | What |
| --- | --- |
| `tetris.strudel` | Tetris Theme A ("Korobeiniki", public-domain folk song), chiptune arrangement, 150 BPM, form A A B A |
| `soupe-aux-choux.strudel` | *La Soupe aux choux* hommage: an **original** tune in the film's spirit, with a "cosmic" interlude. The real 1981 theme is still under copyright, so it is not transcribed here |
| `midi/soupe-aux-choux-hommage.mid` | MIDI export of the hommage (GM, 116 BPM, tracks: lead, bass, space arp, pad, bleeps, drums). Regenerate with `python3 music/midi/make_soupe_midi.py` |
| `index.html` | Minimal local player: pick a song, edit live, Play/Stop |
| `flake.nix` | Nix flake for the tooling |

## Play

```sh
nix run ./music            # local player → http://localhost:8090/
nix run ./music#repl       # full upstream Strudel REPL (clones it, pnpm dev)
nix develop ./music        # shell with strudel-serve, strudel-repl, node, pnpm
```

Or just paste a `.strudel` file into <https://strudel.cc> and press
Ctrl+Enter.

Browsers only start audio after a click, so press **Play** once the page has
loaded. The player pulls `@strudel/web` and the drum samples
(`tidalcycles/dirt-samples`) from the network.

## Conventions

- 1 cycle = 1 bar of 4/4; tempo is set with `.cpm(BPM / 4)`.
- Melodies use an 8th-note grid per bar (`@n` holds a note for n steps).
- Sections are combined with `arrange([bars, section], ...)`.
