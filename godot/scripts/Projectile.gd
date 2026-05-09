class_name Projectile
extends Node2D

## Bullet, lob (mortar arc), and other transient projectiles.
## Beams / rails / chains are handled instantly by the Tower and only spawn
## a fading FX line — see Game.spawn_beam_fx().

var ptype: String = "bullet"
var target_pos: Vector2 = Vector2.ZERO
var velocity: Vector2 = Vector2.ZERO
var color: Color = Color.WHITE
var damage: float = 0.0
var splash_radius: float = 0.0
var splash_damage: float = 0.0
var armor_pierce: bool = false
var status: Dictionary = {}
var life: float = 2.0

# lob-specific
var start_pos: Vector2 = Vector2.ZERO
var elapsed: float = 0.0
var lob_T: float = 0.9
var lob_arc: float = 110.0

@onready var trail: Line2D = $Trail
var _trail_pts: Array[Vector2] = []

func setup(start: Vector2, target: Vector2, stats: Dictionary, c: Color, t: String) -> void:
	global_position = start
	start_pos = start
	target_pos = target
	color = c
	ptype = t
	damage = stats.get("damage", 0.0)
	splash_radius = stats.get("splash_radius", 0.0)
	splash_damage = stats.get("splash_damage", 0.0)
	armor_pierce = stats.get("armor_pierce", false)
	status = (stats.get("status", {}) as Dictionary).duplicate(true)
	if t == "bullet":
		var dir: Vector2 = (target - start).normalized()
		velocity = dir * stats.get("projectile_speed", 800.0)
	elif t == "lob":
		velocity = Vector2.ZERO
	if trail:
		trail.default_color = color
	queue_redraw()

func _process(delta: float) -> void:
	var game := get_tree().get_first_node_in_group("game")
	if game == null: return
	if game.paused or game.ended: return
	var dt: float = delta * game.speed_mult

	if ptype == "bullet":
		global_position += velocity * dt
		life -= dt
		_push_trail(global_position)
		# Hit detection
		for e in game.enemies:
			if not is_instance_valid(e) or not e.alive: continue
			var ep: Vector2 = e.world_position()
			if global_position.distance_to(ep) <= e.data.size + 6.0:
				e.take_damage(damage, armor_pierce)
				if not status.is_empty(): e.apply_status(status)
				if splash_radius > 0.0:
					game.explode(global_position, splash_radius, splash_damage, armor_pierce, color, status)
				_destroy(); return
		if life <= 0.0 \
				or global_position.x < -100 or global_position.x > 2100 \
				or global_position.y < -100 or global_position.y > 1300:
			_destroy()
	elif ptype == "lob":
		elapsed += dt
		var t: float = clamp(elapsed / lob_T, 0.0, 1.0)
		var p: Vector2 = start_pos.lerp(target_pos, t)
		p.y -= sin(t * PI) * lob_arc
		global_position = p
		_push_trail(global_position)
		if t >= 1.0:
			# explode at target
			game.explode(target_pos, splash_radius, splash_damage, armor_pierce, color, status)
			# small direct hit on the closest enemy at impact
			var closest: Node = null
			var cd: float = INF
			for e in game.enemies:
				if not is_instance_valid(e) or not e.alive: continue
				var d: float = target_pos.distance_to(e.world_position())
				if d < cd: cd = d; closest = e
			if closest and cd < 36.0:
				closest.take_damage(damage, armor_pierce)
			_destroy()
	queue_redraw()

func _push_trail(p: Vector2) -> void:
	if trail == null: return
	_trail_pts.append(p)
	if _trail_pts.size() > 12:
		_trail_pts.pop_front()
	# Convert to local space relative to projectile
	var local: PackedVector2Array = PackedVector2Array()
	for pt in _trail_pts:
		local.append(pt - global_position)
	trail.points = local

func _destroy() -> void:
	queue_free()

func _draw() -> void:
	if ptype == "bullet":
		draw_circle(Vector2.ZERO, 8.0, Color(color.r, color.g, color.b, 0.35))
		draw_circle(Vector2.ZERO, 4.0, color)
	elif ptype == "lob":
		# preview impact circle
		var dir_local := target_pos - global_position
		draw_circle(dir_local, splash_radius, Color(color.r, color.g, color.b, 0.10))
		draw_arc(dir_local, splash_radius, 0.0, TAU, 32,
			Color(color.r, color.g, color.b, 0.45), 1.5, true)
		draw_circle(Vector2.ZERO, 9.0, Color(color.r, color.g, color.b, 0.6))
		draw_circle(Vector2.ZERO, 5.0, color)
