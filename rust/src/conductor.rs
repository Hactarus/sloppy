//! The Conductor is the single source of truth for musical time.
//!
//! Rhythm games must derive timing from the *audio* clock, not from frame
//! `delta`, or notes drift out of sync. The GDScript side feeds us the audio
//! playback position every frame (corrected for output latency and the
//! per-song audio offset) and we convert it to beats.

use godot::prelude::*;

#[derive(GodotClass)]
#[class(base=Node)]
pub struct Conductor {
    /// Beats per minute of the current track. Set by the chart loader.
    #[export]
    bpm: f64,
    /// Seconds from the start of the audio stream to the first beat (beat 0).
    #[export]
    offset_sec: f64,
    /// Player-calibrated audio/visual latency, in seconds.
    #[export]
    latency_sec: f64,

    /// Latest audio playback position (seconds), pushed in from GDScript.
    song_pos_sec: f64,

    base: Base<Node>,
}

#[godot_api]
impl INode for Conductor {
    fn init(base: Base<Node>) -> Self {
        Self {
            bpm: 120.0,
            offset_sec: 0.0,
            latency_sec: 0.0,
            song_pos_sec: 0.0,
            base,
        }
    }
}

#[godot_api]
impl Conductor {
    /// Seconds per beat for the current BPM.
    fn sec_per_beat(&self) -> f64 {
        if self.bpm <= 0.0 {
            return 0.0;
        }
        60.0 / self.bpm
    }

    /// Called every frame from GDScript with the current audio playback
    /// position (e.g. `AudioStreamPlayer.get_playback_position()` plus
    /// `AudioServer.get_time_since_last_mix()` minus output latency).
    #[func]
    pub fn update_song_position(&mut self, playback_position_sec: f64) {
        self.song_pos_sec = playback_position_sec - self.latency_sec;
    }

    /// Current position of the song measured in beats from beat 0.
    /// Can be negative during the lead-in before the first beat.
    #[func]
    pub fn current_beat(&self) -> f64 {
        let spb = self.sec_per_beat();
        if spb == 0.0 {
            return 0.0;
        }
        (self.song_pos_sec - self.offset_sec) / spb
    }

    /// Convert a beat number to its wall-clock time in the audio stream.
    /// Useful for scheduling note spawns ahead of time.
    #[func]
    pub fn beat_to_time(&self, beat: f64) -> f64 {
        self.offset_sec + beat * self.sec_per_beat()
    }

    /// Signed seconds between now and when `beat` should be hit.
    /// Negative = the beat is in the past (late), positive = upcoming (early).
    #[func]
    pub fn time_to_beat(&self, beat: f64) -> f64 {
        self.beat_to_time(beat) - self.song_pos_sec
    }
}
