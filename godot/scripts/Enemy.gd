class_name Enemy
extends PathFollow2D

## Enemy travels along the parent Path2D. Renders procedurally if no
## sprite is configured. Replace by setting `data.sprite_path` (or
## `data.frames_path` + `animated=true` for AnimatedSprite2D).

signal died(reward: int, world_pos: Vector2)
signal reached_end()

@export var data: EnemyData
var hp: float = 0.0
var max_hp: float = 0.0
var speed: float = 0.0
var alive: bool = true
var slow_strength: float = 0.0
var slow_duration: float = 0.0
var hp_mul: float = 1.0
var pulse_t: float = 0.0

@onready var sprite: Sprite2D = get_node_or_null("Sprite")
@onready var animated_sprite: AnimatedSprite2D = get_node_or_null("AnimatedSprite")

func configure(ed: EnemyData, mul: float = 1.0) -> void:
	data = ed
	hp_mul = mul
	max_hp = ed.hp * mul
	hp = max_hp
	speed = ed.speed
	loop = false
	rotates = false
	progress = 0.0
	_apply_visuals()

func _ready() -> void:
	if data and max_hp == 0.0:
		configure(data, 1.0)

func _apply_visuals() -> void:
	if data == null: return
	var use_anim: bool = (animated_sprite != null and data.animated
		and data.frames_path != "" and ResourceLoader.exists(data.frames_path))
	var use_static: bool = (not use_anim and sprite != null
		and data.sprite_path != "" and ResourceLoader.exists(data.sprite_path))
	if use_anim:
		animated_sprite.sprite_frames = load(data.frames_path)
		animated_sprite.play("walk")
		animated_sprite.visible = true
		if sprite: sprite.visible = false
	elif use_static:
		sprite.texture = load(data.sprite_path)
		sprite.visible = true
		if animated_sprite: animated_sprite.visible = false
	else:
		if sprite: sprite.visible = false
		if animated_sprite: animated_sprite.visible = false
	queue_redraw()

func world_position() -> Vector2:
	return global_position

func position_along_path(p: float) -> Vector2:
	# Sample the parent Path2D's curve at offset p (clamped).
	var path: Path2D = get_parent() as Path2D
	if path == null: return global_position
	var curve := path.curve
	var clamped: float = clamp(p, 0.0, curve.get_baked_length())
	return path.global_transform * curve.sample_baked(clamped)

func slow_factor() -> float:
	if slow_duration > 0.0:
		return 1.0 - slow_strength
	return 1.0

func _process(delta: float) -> void:
	if not alive: return
	pulse_t += delta
	var game := get_tree().get_first_node_in_group("game")
	if game and (game.paused or game.ended):
		queue_redraw(); return
	var dt: float = delta * (game.speed_mult if game else 1.0)

	if slow_duration > 0.0:
		slow_duration -= dt
		if slow_duration <= 0.0: slow_strength = 0.0

	progress += speed * slow_factor() * dt
	if data.regen > 0.0:
		hp = min(max_hp, hp + data.regen * dt)

	var path: Path2D = get_parent() as Path2D
	if path and progress_ratio >= 1.0:
		alive = false
		reached_end.emit()
		queue_free()
		return
	queue_redraw()

func take_damage(dmg: float, armor_pierce: bool) -> void:
	if not alive: return
	var actual: float = dmg
	if not armor_pierce and data.armor > 0.0:
		actual = dmg * (1.0 - data.armor)
	hp -= actual
	if hp <= 0.0: _die()

func apply_status(status: Dictionary) -> void:
	if status.has("slow") and status.has("duration"):
		slow_strength = max(slow_strength, float(status["slow"]))
		slow_duration = max(slow_duration, float(status["duration"]))

func _die() -> void:
	alive = false
	var game := get_tree().get_first_node_in_group("game")
	if game and game.has_node("FX"):
		var burst := Node2D.new()
		burst.set_script(preload("res://scripts/ExplosionFX.gd"))
		game.get_node("FX").add_child(burst)
		burst.global_position = global_position
		burst.setup(data.size * 2.5, data.color)
	died.emit(data.reward, global_position)
	queue_free()

# ── Procedural drawing fallback ──────────────────────────────────────────

func _draw() -> void:
	if data == null: return
	var has_sprite: bool = (sprite and sprite.visible) or (animated_sprite and animated_sprite.visible)
	if not has_sprite:
		var c := data.color
		var pulse: float = 0.5 + 0.5 * sin(pulse_t * 4.0)
		draw_circle(Vector2.ZERO, data.size + 3.0, Color(c.r, c.g, c.b, 0.18 + 0.12 * pulse))
		draw_circle(Vector2.ZERO, data.size, c)
		draw_circle(Vector2(-data.size * 0.3, -data.size * 0.3), data.size * 0.45, Color(0, 0, 0, 0.35))
	if data.armor > 0.0:
		draw_arc(Vector2.ZERO, data.size + 4.0, 0.0, TAU, 28, Color(1, 1, 1, 0.55), 2.0, true)
	if slow_duration > 0.0:
		draw_circle(Vector2.ZERO, data.size + 6.0, Color(0.6, 0.85, 1.0, 0.30))
	if hp < max_hp and alive:
		var w: float = max(22.0, data.size * 2.0)
		var x: float = -w / 2.0
		var y: float = -data.size - 10.0
		draw_rect(Rect2(Vector2(x, y), Vector2(w, 4)), Color(0, 0, 0, 0.5))
		var ratio: float = clamp(hp / max_hp, 0.0, 1.0)
		var bar_color: Color = Color("#6cf09c") if ratio > 0.5 else (Color("#ffd166") if ratio > 0.25 else Color("#ff7a7a"))
		draw_rect(Rect2(Vector2(x, y), Vector2(w * ratio, 4)), bar_color)
