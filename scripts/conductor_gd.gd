## GDScript fallback conductor.
## Used on platforms where the Rust GDExtension cannot be loaded (e.g. Web
## exports without a WASM build of the extension). Mirrors the API of the
## Rust Conductor class so game.gd works identically on both code paths.
class_name ConductorGD
extends Node

@export var bpm: float = 120.0
@export var offset_sec: float = 0.0
@export var latency_sec: float = 0.0

var _song_pos_sec: float = 0.0

func update_song_position(pos: float) -> void:
	_song_pos_sec = pos - latency_sec

func current_beat() -> float:
	if bpm <= 0.0:
		return 0.0
	return (_song_pos_sec - offset_sec) / (60.0 / bpm)

func beat_to_time(beat: float) -> float:
	if bpm <= 0.0:
		return 0.0
	return offset_sec + beat * (60.0 / bpm)

func time_to_beat(beat: float) -> float:
	return beat_to_time(beat) - _song_pos_sec
