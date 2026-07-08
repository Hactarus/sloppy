//! Pure game-logic functions, free of Godot types.
//!
//! Extracted so they can be unit-tested with plain `cargo test --lib`
//! without a running Godot runtime. The GodotClass wrappers delegate here.

/// Classify a hit by its absolute timing error.
/// Returns 0 = Perfect, 1 = Great, 2 = Good, 3 = Miss.
pub fn classify_hit(err_sec: f64, perfect_sec: f64, great_sec: f64, good_sec: f64) -> u8 {
    let err = err_sec.abs();
    if err <= perfect_sec {
        0
    } else if err <= great_sec {
        1
    } else if err <= good_sec {
        2
    } else {
        3
    }
}

/// Base score points for a given judgment (0–3). Miss returns 0 — never negative.
pub fn base_points(judgment: u8) -> i64 {
    match judgment {
        0 => 100,
        1 => 70,
        2 => 40,
        _ => 0,
    }
}

/// Score multiplier for the current combo streak.
pub fn combo_multiplier(combo: i64) -> i64 {
    1 + (combo / 10)
}

/// Seconds per beat at the given BPM.
pub fn sec_per_beat(bpm: f64) -> f64 {
    if bpm <= 0.0 {
        0.0
    } else {
        60.0 / bpm
    }
}

/// Current beat number given audio position, song offset, and BPM.
pub fn beat_at(song_pos_sec: f64, offset_sec: f64, bpm: f64) -> f64 {
    let spb = sec_per_beat(bpm);
    if spb == 0.0 {
        return 0.0;
    }
    (song_pos_sec - offset_sec) / spb
}

/// Wall-clock time (seconds into the stream) at which a given beat falls.
pub fn beat_to_sec(beat: f64, offset_sec: f64, bpm: f64) -> f64 {
    offset_sec + beat * sec_per_beat(bpm)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── classify_hit ────────────────────────────────────────────────────────

    #[test]
    fn perfect_at_zero_error() {
        assert_eq!(classify_hit(0.0, 0.045, 0.090, 0.150), 0);
    }

    #[test]
    fn perfect_at_boundary() {
        assert_eq!(classify_hit(0.045, 0.045, 0.090, 0.150), 0);
    }

    #[test]
    fn great_just_outside_perfect() {
        assert_eq!(classify_hit(0.046, 0.045, 0.090, 0.150), 1);
    }

    #[test]
    fn great_at_boundary() {
        assert_eq!(classify_hit(0.090, 0.045, 0.090, 0.150), 1);
    }

    #[test]
    fn good_midway() {
        assert_eq!(classify_hit(0.120, 0.045, 0.090, 0.150), 2);
    }

    #[test]
    fn miss_beyond_good() {
        assert_eq!(classify_hit(0.151, 0.045, 0.090, 0.150), 3);
    }

    #[test]
    fn negative_error_treated_as_absolute() {
        assert_eq!(classify_hit(-0.030, 0.045, 0.090, 0.150), 0);
    }

    // ── base_points / combo_multiplier ─────────────────────────────────────

    #[test]
    fn miss_never_negative() {
        let points = base_points(3);
        assert!(points >= 0, "Miss must not subtract score");
        assert_eq!(points, 0);
    }

    #[test]
    fn perfect_worth_more_than_great() {
        assert!(base_points(0) > base_points(1));
    }

    #[test]
    fn combo_multiplier_starts_at_one() {
        assert_eq!(combo_multiplier(0), 1);
        assert_eq!(combo_multiplier(9), 1);
    }

    #[test]
    fn combo_multiplier_increments_at_ten() {
        assert_eq!(combo_multiplier(10), 2);
        assert_eq!(combo_multiplier(19), 2);
        assert_eq!(combo_multiplier(20), 3);
    }

    // ── beat / timing math ─────────────────────────────────────────────────

    #[test]
    fn beat_at_120bpm_half_second_is_one_beat() {
        let b = beat_at(0.5, 0.0, 120.0);
        assert!((b - 1.0).abs() < 1e-9, "expected 1.0, got {b}");
    }

    #[test]
    fn beat_at_respects_offset() {
        // offset of 1 s means beat 0 starts at 1 s
        let b = beat_at(1.5, 1.0, 120.0);
        assert!((b - 1.0).abs() < 1e-9, "expected 1.0, got {b}");
    }

    #[test]
    fn beat_at_zero_bpm_returns_zero() {
        assert_eq!(beat_at(100.0, 0.0, 0.0), 0.0);
    }

    #[test]
    fn beat_to_sec_at_100bpm() {
        // 100 BPM → 0.6 s/beat; beat 4 = 2.4 s
        let t = beat_to_sec(4.0, 0.0, 100.0);
        assert!((t - 2.4).abs() < 1e-9, "expected 2.4, got {t}");
    }

    #[test]
    fn beat_to_sec_roundtrip() {
        let bpm = 140.0;
        let offset = 0.5;
        let beat = 7.0;
        let t = beat_to_sec(beat, offset, bpm);
        let back = beat_at(t, offset, bpm);
        assert!((back - beat).abs() < 1e-9, "roundtrip failed: {back}");
    }
}
