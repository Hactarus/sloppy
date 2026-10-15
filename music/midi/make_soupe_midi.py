#!/usr/bin/env python3
"""Render the "Soupe aux choux" hommage (soupe-aux-choux.strudel) to a
standard MIDI file. Original tune, not the film's theme. No dependencies.

    python3 music/midi/make_soupe_midi.py   # writes music/midi/soupe-aux-choux-hommage.mid
"""
import struct
from pathlib import Path

BPM = 116
PPQ = 480
EIGHTH = PPQ // 2
BAR = PPQ * 4

# Same 8th-note grid as melA in the .strudel file ("@n" = hold n steps).
MEL_A = [
    "f4 a4 c5 a4 f5@2 e5 d5",
    "c5@2 a4 c5 bb4@2 g4@2",
    "g4 bb4 d5 bb4 g5@2 f5 e5",
    "f5@4 c5@2 ~@2",
    "d5 d5 f5 d5 c5@2 a4 c5",
    "bb4 bb4 d5 bb4 a4@2 f4 a4",
    "g4 a4 bb4 c5 e5@2 g5 e5",
    "f5@2 c5 a4 f4@2 ~@2",
]
ROOTS = [41, 41, 43, 48, 38, 46, 48, 41]          # F F Gm C Dm Bb C F
SPACE_OFFSETS = [0, 5, 3, 4]                      # F Dm Bb C triads
ARP = [0, 2, 4, 7, 4, 2, 0, 2]
# alien bleeps per bar: (start in 8ths, midi note)
BLEEPS = [[(0, 77)], [(4, 84)], [(0, 74)], [(0, 79), (5, 72)]]

F_MAJOR = [0, 2, 4, 5, 7, 9, 11]
NAMES = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}

# General MIDI programs (0-based)
LEAD, BASS, ARP_PRG, PAD = 81, 38, 98, 89         # saw lead, synth bass, crystal, warm pad
CH_LEAD, CH_BASS, CH_ARP, CH_PAD, CH_BLEEP, CH_DRUM = 0, 1, 2, 3, 4, 9
KICK, CLAP, HAT = 36, 39, 42


def name_to_midi(tok):
    pc = NAMES[tok[0]]
    rest = tok[1:]
    if rest.startswith("b"):
        pc, rest = pc - 1, rest[1:]
    elif rest.startswith("#"):
        pc, rest = pc + 1, rest[1:]
    return 12 * (int(rest) + 1) + pc


def degree(base, d):
    return base + 12 * (d // 7) + F_MAJOR[d % 7]


def village(events, t0):
    for bar, line in enumerate(MEL_A):
        t = t0 + bar * BAR
        for tok in line.split():
            tok, _, hold = tok.partition("@")
            steps = int(hold or 1)
            if tok != "~":
                events.append((t, CH_LEAD, name_to_midi(tok), steps * EIGHTH - 20, 92))
            t += steps * EIGHTH
        bt = t0 + bar * BAR
        for beat, iv in enumerate([0, 7, 0, 7]):               # oom-pah
            events.append((bt + beat * PPQ, CH_BASS, ROOTS[bar] + iv, PPQ - 60, 100))
        for beat in (0, 2):
            events.append((bt + beat * PPQ, CH_DRUM, KICK, 120, 100))
        for beat in (1, 3):
            events.append((bt + beat * PPQ, CH_DRUM, HAT, 60, 70))
        events.append((bt + 7 * EIGHTH, CH_DRUM, CLAP, 120, 80))
    return t0 + len(MEL_A) * BAR


def space(events, t0):
    for bar, off in enumerate(SPACE_OFFSETS):
        bt = t0 + bar * BAR
        for i, d in enumerate(ARP):
            events.append((bt + i * EIGHTH, CH_ARP, degree(65, d + off), EIGHTH - 10, 70))
        for d in (0, 2, 4):
            events.append((bt, CH_PAD, degree(53, d + off), BAR - 30, 55))
        for step, note in BLEEPS[bar]:
            events.append((bt + step * EIGHTH, CH_BLEEP, note, EIGHTH // 2, 60))
    return t0 + len(SPACE_OFFSETS) * BAR


def vlq(n):
    out = [n & 0x7F]
    while n > 0x7F:
        n >>= 7
        out.insert(0, (n & 0x7F) | 0x80)
    return bytes(out)


def track(name, msgs):
    """msgs: list of (abs_tick, bytes). Returns an MTrk chunk."""
    meta_name = (0, b"\xff\x03" + vlq(len(name)) + name.encode())
    data, last = b"", 0
    for tick, msg in [meta_name] + sorted(msgs, key=lambda m: (m[0], m[1][0] & 0xF0 != 0x80)):
        data += vlq(tick - last) + msg
        last = tick
    data += b"\x00\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def main():
    events = []
    t = space(events, 0)
    t = village(events, t)
    t = village(events, t)
    t = space(events, t)
    end = village(events, t)

    tempo = 60_000_000 // BPM
    conductor = [
        (0, b"\xff\x51\x03" + tempo.to_bytes(3, "big")),
        (0, b"\xff\x58\x04\x04\x02\x18\x08"),               # 4/4
        (0, b"\xff\x59\x02\xff\x00"),                       # F major
        (end, b"\xff\x01\x00"),
    ]
    tracks = [track("Soupe aux choux hommage", conductor)]
    for ch, prg, label in [(CH_LEAD, LEAD, "Lead"), (CH_BASS, BASS, "Bass"),
                           (CH_ARP, ARP_PRG, "Space arp"), (CH_PAD, PAD, "Space pad"),
                           (CH_BLEEP, 80, "Alien bleeps"), (CH_DRUM, None, "Drums")]:
        msgs = [] if prg is None else [(0, bytes([0xC0 | ch, prg]))]
        for start, c, note, dur, vel in events:
            if c == ch:
                msgs.append((start, bytes([0x90 | ch, note, vel])))
                msgs.append((start + dur, bytes([0x80 | ch, note, 0])))
        tracks.append(track(label, msgs))

    out = Path(__file__).with_name("soupe-aux-choux-hommage.mid")
    out.write_bytes(b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), PPQ) + b"".join(tracks))
    print(f"wrote {out} ({end // BAR} bars, {BPM} BPM)")


if __name__ == "__main__":
    main()
