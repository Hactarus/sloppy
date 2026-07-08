//! Hit judging and scoring.
//!
//! Design pillars: a gentle difficulty curve and constant positive feedback.
//! So the windows are forgiving by default, misses are never punished with
//! score loss, and the judgment names are encouraging.

use godot::prelude::*;

/// Quality of a single hit, from best to "we'll get the next one".
#[derive(GodotConvert, Var, Export, Debug, Clone, Copy, PartialEq, Eq)]
#[godot(via = i64)]
pub enum Judgment {
    Perfect = 0,
    Great = 1,
    Good = 2,
    Miss = 3,
}

#[derive(GodotClass)]
#[class(base=RefCounted)]
pub struct Judge {
    /// Hit-window half-widths in seconds. Generous by default; the difficulty
    /// curve tightens these gradually rather than all at once.
    #[export]
    perfect_window_sec: f64,
    #[export]
    great_window_sec: f64,
    #[export]
    good_window_sec: f64,

    #[var]
    score: i64,
    #[var]
    combo: i64,
    #[var]
    max_combo: i64,

    base: Base<RefCounted>,
}

#[godot_api]
impl IRefCounted for Judge {
    fn init(base: Base<RefCounted>) -> Self {
        Self {
            perfect_window_sec: 0.045,
            great_window_sec: 0.090,
            good_window_sec: 0.150,
            score: 0,
            combo: 0,
            max_combo: 0,
            base,
        }
    }
}

#[godot_api]
impl Judge {
    /// Emitted after every judged input so the UI can fire positive feedback.
    #[signal]
    fn judged(judgment: i64, combo: i64, score: i64);

    /// Judge a hit given the signed timing error (seconds; 0 = dead on).
    /// Returns the `Judgment` and updates score/combo. A `Miss` keeps the
    /// player's score intact — we never subtract points.
    #[func]
    pub fn judge_hit(&mut self, timing_error_sec: f64) -> i64 {
        let j = crate::logic::classify_hit(
            timing_error_sec,
            self.perfect_window_sec,
            self.great_window_sec,
            self.good_window_sec,
        );
        let judgment = match j {
            0 => Judgment::Perfect,
            1 => Judgment::Great,
            2 => Judgment::Good,
            _ => Judgment::Miss,
        };

        match judgment {
            Judgment::Miss => {
                self.combo = 0;
            }
            _ => {
                self.combo += 1;
                if self.combo > self.max_combo {
                    self.max_combo = self.combo;
                }
            }
        }

        let multiplier = crate::logic::combo_multiplier(self.combo);
        self.score += crate::logic::base_points(j) * multiplier;

        let j = judgment as i64;
        self.base
            .to_gd()
            .emit_signal("judged", &[j.to_variant(), self.combo.to_variant(), self.score.to_variant()]);
        j
    }

    /// Reset for a new song.
    #[func]
    pub fn reset(&mut self) {
        self.score = 0;
        self.combo = 0;
        self.max_combo = 0;
    }
}
