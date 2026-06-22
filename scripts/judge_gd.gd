## GDScript fallback judge.
## Used on platforms where the Rust GDExtension cannot be loaded (e.g. Web
## exports without a WASM build of the extension). Mirrors the API of the
## Rust Judge class so game.gd works identically on both code paths.
class_name JudgeGD
extends RefCounted

@export var perfect_window_sec: float = 0.045
@export var great_window_sec: float = 0.090
@export var good_window_sec: float = 0.150

var score: int = 0
var combo: int = 0
var max_combo: int = 0

signal judged(judgment: int, combo: int, score: int)

func judge_hit(timing_error_sec: float) -> int:
	var err := absf(timing_error_sec)

	var j: int
	if err <= perfect_window_sec:
		j = 0  # Perfect
	elif err <= great_window_sec:
		j = 1  # Great
	elif err <= good_window_sec:
		j = 2  # Good
	else:
		j = 3  # Miss

	if j == 3:
		combo = 0
	else:
		combo += 1
		if combo > max_combo:
			max_combo = combo

	var base_points: int = [100, 70, 40, 0][j]
	var multiplier: int = 1 + (combo / 10)
	score += base_points * multiplier

	judged.emit(j, combo, score)
	return j

func reset() -> void:
	score = 0
	combo = 0
	max_combo = 0
