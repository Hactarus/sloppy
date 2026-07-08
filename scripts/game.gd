extends Node2D
## Top-level gameplay glue. Builds the visual scene at runtime, drives the
## Conductor from the audio clock, and routes lane inputs into the Judge.
## Timing and scoring live in Rust (GDExtension) when loaded, or in the
## pure-GDScript fallbacks on Web exports where the extension isn't present.

const LANE_COUNT := 4
const LANE_COLORS := [
	Color(0.255, 0.878, 1.000),  # #41e0ff — cyan
	Color(0.486, 1.000, 0.420),  # #7cff6b — green
	Color(1.000, 0.824, 0.247),  # #ffd23f — yellow
	Color(1.000, 0.302, 0.553),  # #ff4d8d — pink
]
const BG_COLOR    := Color(0.071, 0.008, 0.180)  # #12022e

const JUDGMENT_LABELS := ["PERFECT", "GREAT", "GOOD", "MISS"]
const JUDGMENT_COLORS := [
	Color(1.000, 0.824, 0.247),  # gold
	Color(0.255, 0.878, 1.000),  # cyan
	Color(0.486, 1.000, 0.420),  # green
	Color(0.533, 0.533, 0.533),  # grey (misses are soft)
]

@onready var music: AudioStreamPlayer = $Music

# Untyped so both Rust GDExtension class and GDScript fallback are accepted.
var conductor
var judge

var _score_label: Label
var _combo_label: Label
var _judgment_label: Label

func _ready() -> void:
	_build_visuals()
	_init_conductor()
	_init_judge()

# ── Visual construction ────────────────────────────────────────────────────────

func _build_visuals() -> void:
	var vp := get_viewport_rect().size
	var lw := vp.x / LANE_COUNT
	var hit_y := vp.y * 0.82

	# Background fills the viewport. Added first then moved to index 0 so it
	# renders below the PlayField node already in the scene tree.
	var bg := ColorRect.new()
	bg.color = BG_COLOR
	bg.size = vp
	add_child(bg)
	move_child(bg, 0)

	# Dim lane strips so the columns are visible before notes arrive.
	for i in LANE_COUNT:
		var lane := ColorRect.new()
		lane.color = LANE_COLORS[i] * Color(1, 1, 1, 0.08)
		lane.size = Vector2(lw - 4, vp.y)
		lane.position = Vector2(i * lw + 2, 0)
		$PlayField.add_child(lane)

	# Horizontal hit-line where notes are judged.
	var hit_line := ColorRect.new()
	hit_line.color = Color(1, 1, 1, 0.55)
	hit_line.size = Vector2(vp.x, 6)
	hit_line.position = Vector2(0, hit_y)
	$PlayField.add_child(hit_line)

	# Tap zones — visible touch targets at the bottom of each lane.
	for i in LANE_COUNT:
		var zone := ColorRect.new()
		zone.color = LANE_COLORS[i] * Color(1, 1, 1, 0.30)
		zone.size = Vector2(lw - 4, vp.y - hit_y)
		zone.position = Vector2(i * lw + 2, hit_y)
		$PlayField.add_child(zone)

	# HUD: score, combo, judgment text on a CanvasLayer above everything.
	var hud := CanvasLayer.new()
	hud.layer = 2
	add_child(hud)

	_score_label = _make_label(hud, "0", 56)
	_score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_score_label.size = Vector2(vp.x - 20, 80)
	_score_label.position = Vector2(0, 30)

	_combo_label = _make_label(hud, "", 96)
	_combo_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_combo_label.size = Vector2(vp.x, 160)
	_combo_label.position = Vector2(0, 130)

	_judgment_label = _make_label(hud, "", 72)
	_judgment_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_judgment_label.size = Vector2(vp.x, 120)
	_judgment_label.position = Vector2(0, vp.y * 0.54)
	_judgment_label.modulate.a = 0.0  # hidden until first judgment

func _make_label(parent: Node, default_text: String, font_size: int) -> Label:
	var lbl := Label.new()
	lbl.text = default_text
	lbl.add_theme_font_size_override("font_size", font_size)
	parent.add_child(lbl)
	return lbl

# ── Engine init ───────────────────────────────────────────────────────────────

func _init_conductor() -> void:
	# ClassDB.instantiate() is a runtime string lookup — no parse-time class
	# resolution, so this compiles even when the GDExtension isn't loaded.
	if ClassDB.class_exists("Conductor"):
		conductor = ClassDB.instantiate("Conductor")
	else:
		conductor = ConductorGD.new()
	add_child(conductor)
	conductor.bpm = 120.0
	conductor.offset_sec = 0.0

func _init_judge() -> void:
	if ClassDB.class_exists("Judge"):
		judge = ClassDB.instantiate("Judge")
	else:
		judge = JudgeGD.new()
	judge.judged.connect(_on_judged)

# ── Per-frame update ──────────────────────────────────────────────────────────

func _process(_delta: float) -> void:
	if music.playing:
		var pos := music.get_playback_position() + AudioServer.get_time_since_last_mix()
		conductor.update_song_position(pos)

# ── Input ─────────────────────────────────────────────────────────────────────

func _unhandled_input(event: InputEvent) -> void:
	# Keyboard lanes (D F J K) — desktop and testing
	for lane in LANE_COUNT:
		if event.is_action_pressed("lane_%d" % lane):
			_handle_lane_press(lane)
			return
	# Touch input: map screen tap to the lane column below the finger
	if event is InputEventScreenTouch and event.pressed:
		var lane := int(event.position.x / (get_viewport_rect().size.x / LANE_COUNT))
		_handle_lane_press(clamp(lane, 0, LANE_COUNT - 1))

func _handle_lane_press(lane: int) -> void:
	# Stub: every press is a dead-on hit (timing_error = 0).
	# Replace with the actual timing error once notes are spawned.
	judge.judge_hit(0.0)

# ── Feedback ──────────────────────────────────────────────────────────────────

func _on_judged(judgment: int, combo: int, score: int) -> void:
	_score_label.text = str(score)

	_judgment_label.text = JUDGMENT_LABELS[judgment]
	_judgment_label.add_theme_color_override("font_color", JUDGMENT_COLORS[judgment])
	_judgment_label.modulate.a = 1.0

	_combo_label.text = ("%d COMBO" % combo) if combo >= 2 else ""

	# Fade out the judgment text after a short hold.
	var tween := create_tween()
	tween.tween_interval(0.30)
	tween.tween_property(_judgment_label, "modulate:a", 0.0, 0.40)
