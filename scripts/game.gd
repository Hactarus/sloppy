extends Node2D
## Top-level gameplay glue. Drives the Conductor from the audio clock and
## routes lane inputs into the Judge. Presentation/feedback lives here in
## GDScript; timing and scoring live in Rust (res://rust) when the GDExtension
## is loaded, or in the pure-GDScript fallbacks on platforms where it isn't
## (e.g. Web exports without a WASM Rust build).

const LANE_COUNT := 4

@onready var music: AudioStreamPlayer = $Music

# Untyped so both the Rust GDExtension class and the GDScript fallback class
# are accepted without a parse-time type error.
var conductor
var judge

func _ready() -> void:
	if ClassDB.class_exists("Conductor"):
		conductor = Conductor.new()
	else:
		conductor = ConductorGD.new()
	add_child(conductor)
	conductor.bpm = 120.0
	conductor.offset_sec = 0.0

	if ClassDB.class_exists("Judge"):
		judge = Judge.new()
	else:
		judge = JudgeGD.new()
	judge.judged.connect(_on_judged)

	# music.play()  # enable once a track is imported

func _process(_delta: float) -> void:
	if music.playing:
		# Audio clock corrected for the time since the last mix — this is the
		# accurate playback position to feed the conductor.
		var pos := music.get_playback_position() + AudioServer.get_time_since_last_mix()
		conductor.update_song_position(pos)

func _unhandled_input(event: InputEvent) -> void:
	for lane in LANE_COUNT:
		if event.is_action_pressed("lane_%d" % lane):
			_handle_lane_press(lane)

func _handle_lane_press(lane: int) -> void:
	# A real implementation finds the nearest active note in `lane` and passes
	# its timing error. Stubbed here as a dead-on hit so the skeleton runs.
	var timing_error := 0.0
	judge.judge_hit(timing_error)

func _on_judged(judgment: int, combo: int, score: int) -> void:
	# Positive feedback hook: spawn particles, show "Great!", play a hit SFX,
	# bump the combo counter. Misses (judgment == 3) get a gentle cue only.
	print("judgment=%d combo=%d score=%d" % [judgment, combo, score])
