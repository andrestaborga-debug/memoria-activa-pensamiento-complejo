class_name Game
extends Node2D

## Top-level game controller. Owns the map, paths, towers, enemies,
## projectiles, FX and HUD. Talks to GameData (definitions) and
## SaveManager (persistence) singletons.

const TOWER_SCENE := preload("res://scenes/Tower.tscn")
const ENEMY_SCENE := preload("res://scenes/Enemy.tscn")
const PROJECTILE_SCENE := preload("res://scenes/Projectile.tscn")
const BEAM_FX_SCENE := preload("res://scenes/BeamFX.tscn")

@export var map_id: String = "crescent"

# World logical size; scenes are designed at this resolution and stretched.
const WORLD_W: float = 1920.0
const WORLD_H: float = 1080.0

var map: MapData
var waves: Array = []
var wave_index: int = 0
var wave_active: bool = false
var pending_spawns: Array = []
var spawn_timer: float = 0.0

var money: int = 0
var lives: int = 0

var speed_mult: float = 1.0
var paused: bool = false
var ended: bool = false
var victory: bool = false

var towers: Array = []
var enemies: Array = []

var selected_tower: Tower = null
var placing_tower_id: String = ""
var placing_pos: Vector2 = Vector2.ZERO
var placing_valid: bool = false

@onready var background_rect: ColorRect = $Background/Gradient
@onready var stars: GPUParticles2D = $Background/Stars
@onready var paths_root: Node2D = $Paths
@onready var towers_root: Node2D = $Towers
@onready var enemies_root: Node2D = $Enemies   # holds the FX/transients only; enemies live under their Path2D
@onready var projectiles_root: Node2D = $Projectiles
@onready var fx_root: Node2D = $FX
@onready var preview_root: Node2D = $Preview
@onready var hud: CanvasLayer = $HUD

func _ready() -> void:
	add_to_group("game")
	# Allow MainMenu to set map_id before scene-change; if empty, use last/first.
	if map_id == "":
		map_id = SaveManager.get_last_map()
		if map_id == "":
			map_id = "crescent"
	map = GameData.get_map(map_id)
	waves = GameData.generate_waves(map.difficulty)
	money = map.start_money
	lives = map.start_lives
	SaveManager.set_last_map(map_id)

	_paint_background()
	_build_paths()
	_init_hud()
	hud.update_all()

func _paint_background() -> void:
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
uniform vec4 top : source_color;
uniform vec4 bottom : source_color;
void fragment() {
	float t = UV.y;
	COLOR = mix(top, bottom, t);
}
"""
	var mat := ShaderMaterial.new()
	mat.shader = sh
	mat.set_shader_parameter("top", map.bg_top)
	mat.set_shader_parameter("bottom", map.bg_bottom)
	background_rect.material = mat

	# Decor lights
	for d in map.decor:
		var light := PointLight2D.new()
		light.position = d["pos"]
		light.color = d["color"]
		light.energy = 0.6
		light.texture_scale = max(0.5, float(d["radius"]) / 64.0)
		# Use the default light texture provided by Godot; loaders may differ,
		# so create a simple fallback gradient texture programmatically.
		light.texture = GameData.make_radial_alpha_texture()
		$Background.add_child(light)

func _build_paths() -> void:
	for i in range(map.paths.size()):
		var p2d := Path2D.new()
		p2d.name = "Path%d" % i
		var curve := Curve2D.new()
		var pts: PackedVector2Array = map.paths[i]
		for v in pts:
			curve.add_point(v)
		p2d.curve = curve
		paths_root.add_child(p2d)
	# Draw the path strokes as a child Node2D with custom _draw
	var strokes := Node2D.new()
	strokes.name = "PathStrokes"
	strokes.set_script(preload("res://scripts/PathStrokes.gd"))
	strokes.map = map
	paths_root.add_child(strokes)

func _init_hud() -> void:
	hud.bind(self)

# ── Wave control ─────────────────────────────────────────────────────────

func start_wave() -> void:
	if wave_active or ended or wave_index >= GameData.TOTAL_WAVES: return
	wave_index += 1
	wave_active = true
	var wave: Dictionary = waves[wave_index - 1]
	var paths_count: int = paths_root.get_child_count() - 1   # minus PathStrokes
	for grp in wave["groups"]:
		for i in range(grp["count"]):
			var path_index: int = i % max(1, paths_count)
			pending_spawns.append({
				"spawn_at": _now() + grp["delay"] + i * grp["gap"],
				"type": grp["type"],
				"hp_mul": grp["hp_mul"],
				"path_index": path_index,
			})
	pending_spawns.sort_custom(func(a, b): return a["spawn_at"] < b["spawn_at"])
	hud.update_all()

func _now() -> float:
	return spawn_timer

# ── Process loop ─────────────────────────────────────────────────────────

func _process(delta: float) -> void:
	if paused or ended:
		return
	var dt: float = delta * speed_mult
	spawn_timer += dt
	_process_spawns()
	_check_wave_done()
	_update_placement_validity()

func _process_spawns() -> void:
	while pending_spawns.size() > 0 and pending_spawns[0]["spawn_at"] <= spawn_timer:
		var s: Dictionary = pending_spawns.pop_front()
		_spawn_enemy(s["type"], s["hp_mul"], s["path_index"])

func _spawn_enemy(type_id: String, hp_mul: float, path_index: int, progress_offset: float = 0.0) -> Node:
	var ed: EnemyData = GameData.get_enemy(type_id)
	if ed == null: return null
	var path := paths_root.get_node("Path%d" % path_index) as Path2D
	if path == null:
		path = paths_root.get_child(0) as Path2D
	var inst := ENEMY_SCENE.instantiate() as Enemy
	path.add_child(inst)
	inst.configure(ed, hp_mul)
	inst.progress = progress_offset
	inst.died.connect(_on_enemy_died.bind(inst, ed))
	inst.reached_end.connect(_on_enemy_reached_end.bind(inst))
	enemies.append(inst)
	inst.add_to_group("enemy")
	inst.tree_exited.connect(func(): if enemies.has(inst): enemies.erase(inst))
	return inst

func _on_enemy_died(reward: int, world_pos: Vector2, e: Enemy, ed: EnemyData) -> void:
	money += reward
	hud.update_all()
	if ed.on_death and ed.on_death.has("type"):
		var count: int = int(ed.on_death.get("count", 1))
		var offset: float = float(ed.on_death.get("offset", 16))
		var path_idx: int = (e.get_parent() as Path2D).name.replace("Path", "").to_int()
		for i in range(count):
			var off: float = (i - (count - 1) * 0.5) * offset
			_spawn_enemy(ed.on_death["type"], 1.0, path_idx, max(0.0, e.progress - 30.0 + off))

func _on_enemy_reached_end(_e: Enemy) -> void:
	lives = max(0, lives - 1)
	hud.update_all()
	if lives <= 0 and not ended:
		_end_game(false)

func _check_wave_done() -> void:
	if not wave_active: return
	if pending_spawns.size() > 0: return
	# Any enemy still alive?
	for e in enemies:
		if is_instance_valid(e) and e.alive: return
	wave_active = false
	money += 25 + wave_index * 8
	hud.update_all()
	if wave_index >= GameData.TOTAL_WAVES:
		_end_game(true)

func _end_game(win: bool) -> void:
	ended = true
	victory = win
	if win:
		SaveManager.mark_cleared(map_id)
	hud.show_end(win)

func restart() -> void:
	get_tree().reload_current_scene()

func to_menu() -> void:
	get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")

# ── Placement / input ────────────────────────────────────────────────────

func _unhandled_input(event: InputEvent) -> void:
	if ended or paused: return
	if event is InputEventScreenTouch and event.pressed:
		_handle_tap(event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_handle_tap(event.position)
	elif (event is InputEventScreenDrag) or (event is InputEventMouseMotion and (event.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0):
		if placing_tower_id != "":
			placing_pos = _screen_to_world(event.position)

func _handle_tap(screen_pos: Vector2) -> void:
	# If HUD captured the tap (e.g. button), it would have been handled already.
	var world: Vector2 = _screen_to_world(screen_pos)

	if placing_tower_id != "":
		_try_place(world)
		return

	if hud.dismiss_open_sheets():
		selected_tower = null
		_update_selection()
		return

	# Tap an existing tower?
	for t in towers_root.get_children():
		if t is Tower and (t.global_position.distance_to(world) <= 30.0):
			selected_tower = t
			_update_selection()
			hud.open_tower_menu(t)
			return

	if not _on_path(world) and world.x >= 0 and world.x <= WORLD_W and world.y >= 0 and world.y <= WORLD_H:
		selected_tower = null
		_update_selection()
		hud.open_tower_picker(world)

func _screen_to_world(screen_pos: Vector2) -> Vector2:
	# Stretch mode = canvas_items, viewport units already world units.
	# Account for canvas_transform if camera scales.
	return get_viewport().get_canvas_transform().affine_inverse() * screen_pos

func begin_placing(id: String, pos: Vector2) -> void:
	placing_tower_id = id
	placing_pos = pos

func cancel_placing() -> void:
	placing_tower_id = ""
	placing_valid = false
	queue_redraw_preview()

func _try_place(world: Vector2) -> void:
	if not _can_place(world):
		hud.toast("Cannot build there")
		placing_tower_id = ""
		queue_redraw_preview()
		return
	var def: TowerData = GameData.get_tower(placing_tower_id)
	if money < def.cost:
		hud.toast("Not enough credits")
		placing_tower_id = ""
		queue_redraw_preview()
		return
	money -= def.cost
	var t := TOWER_SCENE.instantiate() as Tower
	towers_root.add_child(t)
	t.global_position = world
	t.configure(def, self)
	t.sold.connect(_on_tower_sold.bind(t))
	towers.append(t)
	t.tree_exited.connect(func(): if towers.has(t): towers.erase(t))
	placing_tower_id = ""
	queue_redraw_preview()
	hud.update_all()

func _on_tower_sold(_refund: int, t: Tower) -> void:
	if selected_tower == t:
		selected_tower = null
	hud.update_all()

func _can_place(world: Vector2) -> bool:
	if world.x < 40 or world.y < 40 or world.x > WORLD_W - 40 or world.y > WORLD_H - 40:
		return false
	for path in paths_root.get_children():
		if not (path is Path2D): continue
		if _dist_to_curve((path as Path2D).curve, world) < map.path_width * 0.5 + 30.0:
			return false
	for t in towers_root.get_children():
		if t is Tower and t.global_position.distance_to(world) < 60.0:
			return false
	return true

func _on_path(world: Vector2) -> bool:
	for path in paths_root.get_children():
		if not (path is Path2D): continue
		if _dist_to_curve((path as Path2D).curve, world) < map.path_width * 0.5 + 6.0:
			return true
	return false

func _dist_to_curve(curve: Curve2D, p: Vector2) -> float:
	# Sample at fixed step along baked length
	var len: float = curve.get_baked_length()
	var step: float = max(8.0, len / 200.0)
	var best: float = INF
	var d: float = 0.0
	while d <= len:
		var pt: Vector2 = curve.sample_baked(d)
		var dd: float = pt.distance_to(p)
		if dd < best: best = dd
		d += step
	return best

func _update_placement_validity() -> void:
	if placing_tower_id != "":
		placing_valid = _can_place(placing_pos)
		queue_redraw_preview()

func _update_selection() -> void:
	for t in towers_root.get_children():
		if t is Tower:
			t.selected = (t == selected_tower)
			t.queue_redraw()

func queue_redraw_preview() -> void:
	preview_root.queue_redraw()

# ── Tower API exposed to Tower.gd ───────────────────────────────────────

func spawn_projectile() -> Projectile:
	var p := PROJECTILE_SCENE.instantiate() as Projectile
	projectiles_root.add_child(p)
	return p

func spawn_beam_fx(start: Vector2, end: Vector2, color: Color, life: float, width: float) -> void:
	var b := BEAM_FX_SCENE.instantiate()
	fx_root.add_child(b)
	b.setup(start, end, color, life, width)

func enemies_along_line(p1: Vector2, p2: Vector2, thickness: float) -> Array:
	var v: Vector2 = p2 - p1
	var L: float = v.length()
	if L == 0.0: return []
	var u: Vector2 = v / L
	var hits: Array = []
	for e in enemies:
		if not is_instance_valid(e) or not e.alive: continue
		var ep: Vector2 = e.world_position()
		var rel: Vector2 = ep - p1
		var t: float = rel.dot(u)
		if t < 0.0 or t > L: continue
		var d: float = (rel - u * t).length()
		if d <= thickness + e.data.size * 0.6:
			hits.append({ "e": e, "t": t })
	hits.sort_custom(func(a, b): return a["t"] < b["t"])
	return hits.map(func(h): return h["e"])

func explode(pos: Vector2, radius: float, dmg: float, armor_pierce: bool, color: Color, status: Dictionary) -> void:
	if radius <= 0.0 or dmg <= 0.0: return
	for e in enemies:
		if not is_instance_valid(e) or not e.alive: continue
		var d: float = pos.distance_to(e.world_position())
		if d <= radius:
			var falloff: float = 1.0 - d / radius
			e.take_damage(dmg * (0.5 + 0.5 * falloff), armor_pierce)
			if not status.is_empty(): e.apply_status(status)
	# explosion FX
	var node := Node2D.new()
	node.set_script(preload("res://scripts/ExplosionFX.gd"))
	fx_root.add_child(node)
	node.global_position = pos
	node.setup(radius, color)

# ── HUD callbacks ────────────────────────────────────────────────────────

func toggle_speed() -> void:
	speed_mult = 2.0 if speed_mult == 1.0 else (3.0 if speed_mult == 2.0 else 1.0)
	hud.update_all()

func toggle_pause() -> void:
	paused = not paused
	hud.set_paused(paused)
