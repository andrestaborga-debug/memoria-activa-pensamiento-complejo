class_name Tower
extends Node2D

## A placed tower. Renders procedurally if no sprite_path is set.
## Replace the procedural _draw() body by setting `data.sprite_path`
## and `data.turret_sprite_path` — the script auto-uses Sprite2D nodes.

signal sold(refund: int)
signal upgraded(new_level: int)

@export var data: TowerData
var game: Node = null

# Composed runtime stats (mutates with upgrades).
var stats: Dictionary = {}
var level: int = 0
var total_spent: int = 0
var cooldown: float = 0.0
var angle: float = -PI / 2.0
var target: Node = null
var target_mode: String = "first"
var selected: bool = false
var pulse_t: float = 0.0
var muzzle_flash: float = 0.0

@onready var base_sprite: Sprite2D = get_node_or_null("BaseSprite")
@onready var turret_pivot: Node2D = get_node_or_null("TurretPivot")
@onready var turret_sprite: Sprite2D = get_node_or_null("TurretPivot/TurretSprite")
@onready var glow: PointLight2D = get_node_or_null("Glow")

const TARGET_MODES := ["first", "last", "strong", "close"]

func configure(td: TowerData, g: Node) -> void:
	data = td
	game = g
	stats = _compose_stats(td)
	total_spent = td.cost
	_apply_visuals()

func _ready() -> void:
	if data and stats.is_empty():
		stats = _compose_stats(data)
		total_spent = data.cost
		_apply_visuals()

func _compose_stats(td: TowerData) -> Dictionary:
	return {
		"range_px": td.range_px,
		"fire_rate": td.fire_rate,
		"damage": td.damage,
		"projectile_speed": td.projectile_speed,
		"projectile_type": td.projectile_type,
		"splash_radius": td.splash_radius,
		"splash_damage": td.splash_damage,
		"pierce": td.pierce,
		"chains": td.chains,
		"chain_range": td.chain_range,
		"chain_falloff": td.chain_falloff,
		"armor_pierce": td.armor_pierce,
		"status": td.status.duplicate(true),
	}

func _apply_visuals() -> void:
	if base_sprite:
		if data.sprite_path != "" and ResourceLoader.exists(data.sprite_path):
			base_sprite.texture = load(data.sprite_path)
			base_sprite.visible = true
		else:
			base_sprite.visible = false
	if turret_sprite:
		if data.turret_sprite_path != "" and ResourceLoader.exists(data.turret_sprite_path):
			turret_sprite.texture = load(data.turret_sprite_path)
			turret_sprite.visible = true
		else:
			turret_sprite.visible = false
	if glow:
		glow.color = data.color
		glow.energy = 0.85
		if glow.texture == null:
			glow.texture = GameData.make_radial_alpha_texture()
	queue_redraw()

func _process(delta: float) -> void:
	pulse_t += delta
	if muzzle_flash > 0.0:
		muzzle_flash = max(0.0, muzzle_flash - delta * 6.0)
	if game == null or game.paused or game.ended:
		queue_redraw(); return
	cooldown -= delta * game.speed_mult

	if cooldown <= 0.0:
		var t := _find_target()
		if t != null:
			target = t
			var tp: Vector2 = t.world_position()
			angle = (tp - global_position).angle()
			_fire(t, tp)
			cooldown = 1.0 / stats["fire_rate"]
		else:
			target = null

	turret_pivot.rotation = angle
	queue_redraw()

# ── Targeting ────────────────────────────────────────────────────────────

func _find_target() -> Node:
	if game == null: return null
	var best: Node = null
	var best_key: float = -INF
	var r2: float = stats["range_px"] * stats["range_px"]
	for e in game.enemies:
		if not is_instance_valid(e) or not e.alive: continue
		var ep: Vector2 = e.world_position()
		var d2: float = global_position.distance_squared_to(ep)
		if d2 > r2: continue
		var key: float = 0.0
		match target_mode:
			"first":  key =  e.progress
			"last":   key = -e.progress
			"strong": key =  e.hp
			"close":  key = -d2
		if key > best_key:
			best_key = key; best = e
	return best

# ── Firing ───────────────────────────────────────────────────────────────

func _fire(t: Node, tp: Vector2) -> void:
	muzzle_flash = 1.0
	var s := stats
	var ptype: String = s["projectile_type"]

	if ptype == "bullet" or ptype == "lob":
		var future: Vector2 = _predict_target(t, tp, ptype)
		var p: Node = game.spawn_projectile()
		p.setup(global_position, future, s, data.color, ptype)
		if ptype == "lob":
			p.target_pos = future
	elif ptype == "beam":
		var hits := game.enemies_along_line(global_position, tp, 14.0)
		var n: int = 0
		for e in hits:
			if n > s["pierce"]: break
			e.take_damage(s["damage"], s["armor_pierce"])
			if not s["status"].is_empty(): e.apply_status(s["status"])
			n += 1
		game.spawn_beam_fx(global_position, tp, data.color, 0.12, 4.0)
	elif ptype == "rail":
		var far := global_position + Vector2.RIGHT.rotated(angle) * s["range_px"]
		var hits2 := game.enemies_along_line(global_position, far, 18.0)
		var n2: int = 0
		for e in hits2:
			if n2 > s["pierce"]: break
			e.take_damage(s["damage"], s["armor_pierce"])
			if not s["status"].is_empty(): e.apply_status(s["status"])
			n2 += 1
		game.spawn_beam_fx(global_position, far, data.color, 0.22, 7.0)
	elif ptype == "chain":
		_chain_strike(t)

func _predict_target(t: Node, tp: Vector2, ptype: String) -> Vector2:
	var dist: float = global_position.distance_to(tp)
	var flight: float = 0.0
	if ptype == "bullet":
		flight = dist / max(1.0, stats["projectile_speed"])
	elif ptype == "lob":
		flight = 0.9
	var spd: float = t.speed * t.slow_factor()
	return t.position_along_path(t.progress + spd * flight)

func _chain_strike(first: Node) -> void:
	var visited: Array = []
	var current: Node = first
	var dmg: float = stats["damage"]
	var prev: Vector2 = global_position
	var i: int = 0
	while current != null and i <= stats["chains"]:
		current.take_damage(dmg, stats["armor_pierce"])
		if not stats["status"].is_empty(): current.apply_status(stats["status"])
		var cp: Vector2 = current.world_position()
		game.spawn_beam_fx(prev, cp, data.color, 0.18, 3.0)
		visited.append(current)
		prev = cp
		var next: Node = null
		var nd: float = INF
		for e in game.enemies:
			if not is_instance_valid(e) or not e.alive or visited.has(e): continue
			var d: float = cp.distance_to(e.world_position())
			if d < stats["chain_range"] and d < nd:
				nd = d; next = e
		current = next
		dmg *= stats["chain_falloff"]
		i += 1

# ── Upgrade / sell ───────────────────────────────────────────────────────

func upgrade() -> bool:
	if level >= data.upgrades.size(): return false
	var up: Dictionary = data.upgrades[level]
	if game.money < up["cost"]: return false
	game.money -= up["cost"]
	total_spent += up["cost"]
	level += 1
	for k in up["set"].keys():
		stats[k] = up["set"][k]
	if up["set"].has("status"):
		stats["status"] = (up["set"]["status"] as Dictionary).duplicate(true)
	upgraded.emit(level)
	queue_redraw()
	return true

func sell() -> int:
	var refund: int = int(floor(total_spent * 0.7))
	game.money += refund
	sold.emit(refund)
	queue_free()
	return refund

func cycle_target_mode() -> void:
	target_mode = TARGET_MODES[(TARGET_MODES.find(target_mode) + 1) % TARGET_MODES.size()]

# ── Procedural drawing fallback ──────────────────────────────────────────

func _draw() -> void:
	if data == null: return
	var c: Color = data.color
	# Range indicator when selected
	if selected:
		var r: float = stats.get("range_px", data.range_px)
		draw_circle(Vector2.ZERO, r, Color(c.r, c.g, c.b, 0.06))
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 64, Color(c.r, c.g, c.b, 0.55), 2.0, true)

	var has_sprite: bool = base_sprite != null and base_sprite.visible
	if not has_sprite:
		# Hub
		var pulse: float = 0.5 + 0.5 * sin(pulse_t * 3.5)
		draw_circle(Vector2.ZERO, 30.0, Color(0.10, 0.15, 0.32, 0.95))
		draw_arc(Vector2.ZERO, 30.0, 0.0, TAU, 32,
			Color(c.r, c.g, c.b, 0.6 + 0.4 * pulse), 3.0, true)
		draw_circle(Vector2.ZERO, 22.0, Color(c.r * 0.45, c.g * 0.45, c.b * 0.45, 0.85))

		# Rotated barrel via transform
		draw_set_transform(Vector2.ZERO, angle, Vector2.ONE)
		draw_rect(Rect2(Vector2(0, -7), Vector2(28, 14)), Color(0.10, 0.15, 0.32))
		draw_rect(Rect2(Vector2(2, -5), Vector2(26, 10)), c)
		if muzzle_flash > 0.0:
			var mc := Color(c.r, c.g, c.b, muzzle_flash * 0.65)
			draw_circle(Vector2(30, 0), 18.0 * muzzle_flash, mc)
			draw_circle(Vector2(30, 0),  9.0 * muzzle_flash, Color(1, 1, 1, muzzle_flash * 0.8))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

		# Center cap
		draw_circle(Vector2.ZERO, 9.0, Color(0.04, 0.06, 0.13))
		draw_arc(Vector2.ZERO, 9.0, 0.0, TAU, 16, Color(c.r, c.g, c.b, 0.7), 1.5, true)

	# Level pips
	for i in range(level):
		var px: float = -10.0 + i * 8.0
		draw_circle(Vector2(px, 36.0), 3.0, c)
