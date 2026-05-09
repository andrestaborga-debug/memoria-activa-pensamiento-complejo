extends Node
## Autoload (singleton). Holds tower / enemy / map definitions and the
## procedurally-generated wave plan. Built on first access; cached.

const TOTAL_WAVES: int = 20

var towers: Dictionary = {}     # id -> TowerData
var enemies: Dictionary = {}    # id -> EnemyData
var maps: Array[MapData] = []   # order matters (unlock chain)

func _ready() -> void:
	_build_towers()
	_build_enemies()
	_build_maps()

# ── Towers ───────────────────────────────────────────────────────────────

func _build_towers() -> void:
	towers["pulse"] = _mk_tower({
		"id": "pulse", "display_name": "Pulse Cannon", "icon_glyph": "◎",
		"color": Color("#5cf2ff"), "cost": 100,
		"description": "Reliable single-target. Cheap and quick.",
		"range_px": 300.0, "fire_rate": 1.4, "damage": 9.0, "projectile_speed": 800.0,
		"projectile_type": "bullet",
		"upgrades": [
			{ "name": "Tuned Coils",      "desc": "+rate, +damage",  "cost": 120,
			  "set": { "fire_rate": 2.0, "damage": 12.0 } },
			{ "name": "High-Vel Rounds",  "desc": "+range, +damage", "cost": 220,
			  "set": { "range_px": 380.0, "damage": 18.0, "projectile_speed": 1000.0 } },
			{ "name": "Overdrive",        "desc": "Damage burst",    "cost": 480,
			  "set": { "fire_rate": 2.6, "damage": 32.0, "range_px": 420.0 } },
		],
	})
	towers["mortar"] = _mk_tower({
		"id": "mortar", "display_name": "Plasma Mortar", "icon_glyph": "◉",
		"color": Color("#ff9f5c"), "cost": 240,
		"description": "Splash. Strong vs groups.",
		"range_px": 400.0, "fire_rate": 0.6, "damage": 22.0, "projectile_speed": 460.0,
		"projectile_type": "lob",
		"splash_radius": 90.0, "splash_damage": 16.0,
		"upgrades": [
			{ "name": "Wider Blast",      "desc": "+splash radius",   "cost": 200,
			  "set": { "splash_radius": 130.0, "splash_damage": 22.0 } },
			{ "name": "Heavy Shells",     "desc": "+damage",          "cost": 360,
			  "set": { "damage": 44.0, "splash_damage": 32.0 } },
			{ "name": "Saturation Fire",  "desc": "+rate, +splash",   "cost": 700,
			  "set": { "fire_rate": 1.0, "splash_radius": 160.0, "splash_damage": 50.0, "damage": 60.0 } },
		],
	})
	towers["cryo"] = _mk_tower({
		"id": "cryo", "display_name": "Cryo Emitter", "icon_glyph": "❄",
		"color": Color("#9ad8ff"), "cost": 180,
		"description": "Slows enemies. Light damage.",
		"range_px": 260.0, "fire_rate": 1.6, "damage": 4.0, "projectile_speed": 800.0,
		"projectile_type": "bullet",
		"status": { "slow": 0.4, "duration": 1.6 },
		"upgrades": [
			{ "name": "Deep Freeze",      "desc": "Stronger slow",    "cost": 180,
			  "set": { "status": { "slow": 0.55, "duration": 2.2 }, "damage": 6.0 } },
			{ "name": "Frost Field",      "desc": "Splash chill",     "cost": 320,
			  "set": { "splash_radius": 110.0, "splash_damage": 4.0,
					   "status": { "slow": 0.6, "duration": 2.4 }, "damage": 8.0 } },
			{ "name": "Absolute Zero",    "desc": "Brief freeze",     "cost": 600,
			  "set": { "splash_radius": 160.0, "splash_damage": 8.0,
					   "status": { "slow": 0.85, "duration": 2.6 },
					   "damage": 14.0, "fire_rate": 2.0 } },
		],
	})
	towers["laser"] = _mk_tower({
		"id": "laser", "display_name": "Laser Array", "icon_glyph": "≡",
		"color": Color("#ff6b9a"), "cost": 280,
		"description": "Fast piercing beams.",
		"range_px": 300.0, "fire_rate": 4.0, "damage": 5.0, "projectile_speed": 1500.0,
		"projectile_type": "beam", "pierce": 1,
		"upgrades": [
			{ "name": "Focus Lens",       "desc": "+damage, +range",  "cost": 240,
			  "set": { "damage": 8.0, "range_px": 380.0 } },
			{ "name": "Twin Emitter",     "desc": "+pierce",          "cost": 380,
			  "set": { "pierce": 3, "damage": 11.0 } },
			{ "name": "Phase Beam",       "desc": "Ignores armor",    "cost": 720,
			  "set": { "pierce": 5, "damage": 18.0, "fire_rate": 5.5, "armor_pierce": true } },
		],
	})
	towers["tesla"] = _mk_tower({
		"id": "tesla", "display_name": "Tesla Coil", "icon_glyph": "⚡",
		"color": Color("#ffe066"), "cost": 360,
		"description": "Chain lightning between enemies.",
		"range_px": 300.0, "fire_rate": 1.0, "damage": 16.0,
		"projectile_type": "chain",
		"chains": 3, "chain_range": 260.0, "chain_falloff": 0.7,
		"upgrades": [
			{ "name": "Conductive Mesh",  "desc": "+chains, +range",  "cost": 280,
			  "set": { "chains": 5, "chain_range": 320.0 } },
			{ "name": "Overcharge",       "desc": "+damage, +rate",   "cost": 460,
			  "set": { "damage": 28.0, "fire_rate": 1.4 } },
			{ "name": "Storm Core",       "desc": "Massive chain",    "cost": 880,
			  "set": { "chains": 8, "damage": 50.0, "chain_falloff": 0.85, "range_px": 400.0 } },
		],
	})
	towers["railgun"] = _mk_tower({
		"id": "railgun", "display_name": "Railgun", "icon_glyph": "↣",
		"color": Color("#c8a2ff"), "cost": 480,
		"description": "Long-range hyper-velocity slug. Pierces armor.",
		"range_px": 560.0, "fire_rate": 0.45, "damage": 75.0, "projectile_speed": 2200.0,
		"projectile_type": "rail", "pierce": 4, "armor_pierce": true,
		"upgrades": [
			{ "name": "Long Barrel",      "desc": "+range, +damage",  "cost": 360,
			  "set": { "range_px": 720.0, "damage": 110.0 } },
			{ "name": "Mag Accelerator",  "desc": "+rate",            "cost": 540,
			  "set": { "fire_rate": 0.8, "damage": 140.0 } },
			{ "name": "Singularity Slug", "desc": "Devastating",      "cost": 1100,
			  "set": { "damage": 320.0, "fire_rate": 0.9, "pierce": 8, "range_px": 840.0 } },
		],
	})

func _mk_tower(d: Dictionary) -> TowerData:
	var t := TowerData.new()
	for k in d.keys():
		t.set(k, d[k])
	return t

# ── Enemies ──────────────────────────────────────────────────────────────

func _build_enemies() -> void:
	enemies["drone"]      = _mk_enemy({ "id":"drone",      "display_name":"Drone",
		"hp": 22.0, "speed": 80.0, "reward": 4,  "size": 14.0, "color": Color("#7fb3ff") })
	enemies["striker"]    = _mk_enemy({ "id":"striker",    "display_name":"Striker",
		"hp": 55.0, "speed": 100.0, "reward": 8, "size": 16.0, "color": Color("#ff8e72") })
	enemies["wraith"]     = _mk_enemy({ "id":"wraith",     "display_name":"Wraith",
		"hp": 90.0, "speed": 80.0, "reward": 12, "size": 16.0, "color": Color("#b377ff"),
		"regen": 6.0 })
	enemies["carrier"]    = _mk_enemy({ "id":"carrier",    "display_name":"Carrier",
		"hp": 200.0, "speed": 55.0, "reward": 18, "size": 22.0, "color": Color("#6cf09c"),
		"armor": 0.15, "on_death": { "type":"drone", "count":3, "offset":18 } })
	enemies["juggernaut"] = _mk_enemy({ "id":"juggernaut", "display_name":"Juggernaut",
		"hp": 900.0, "speed": 40.0, "reward": 70, "size": 28.0, "color": Color("#ffd166"),
		"armor": 0.45 })
	enemies["swarmer"]    = _mk_enemy({ "id":"swarmer",    "display_name":"Swarmer",
		"hp": 14.0, "speed": 130.0, "reward": 3, "size": 11.0, "color": Color("#5cf2ff") })
	enemies["behemoth"]   = _mk_enemy({ "id":"behemoth",   "display_name":"Behemoth",
		"hp": 5000.0, "speed": 28.0, "reward": 350, "size": 40.0, "color": Color("#ff5e7a"),
		"armor": 0.55 })

func _mk_enemy(d: Dictionary) -> EnemyData:
	var e := EnemyData.new()
	for k in d.keys():
		e.set(k, d[k])
	return e

# ── Maps ─────────────────────────────────────────────────────────────────
# World coordinates are in pixels of a 1920×1080 logical playfield.
# The Game scene scales this to the actual viewport.

func _build_maps() -> void:
	var crescent := MapData.new()
	crescent.id = "crescent"
	crescent.display_name = "Crescent Ridge"
	crescent.difficulty = 1
	crescent.bg_top = Color("#0d1638")
	crescent.bg_bottom = Color("#1a1042")
	crescent.path_width = 64.0
	crescent.start_money = 650
	crescent.paths = [PackedVector2Array([
		Vector2(-40, 260), Vector2(380, 260), Vector2(380, 640),
		Vector2(940, 640), Vector2(940, 260), Vector2(1420, 260),
		Vector2(1420, 840), Vector2(1960, 840),
	])]
	crescent.decor = [
		{ "pos": Vector2(620, 430), "radius": 42.0, "color": Color("#5cf2ff") },
		{ "pos": Vector2(1180, 500), "radius": 32.0, "color": Color("#b377ff") },
		{ "pos": Vector2(240, 860), "radius": 50.0, "color": Color("#6cf09c") },
	]
	maps.append(crescent)

	var twin := MapData.new()
	twin.id = "twin"
	twin.display_name = "Twin Conduits"
	twin.difficulty = 2
	twin.bg_top = Color("#101a3e")
	twin.bg_bottom = Color("#3a1644")
	twin.path_width = 56.0
	twin.start_money = 600
	twin.paths = [
		PackedVector2Array([
			Vector2(-40, 240), Vector2(480, 240), Vector2(480, 560),
			Vector2(1320, 560), Vector2(1320, 920), Vector2(1960, 920),
		]),
		PackedVector2Array([
			Vector2(-40, 920), Vector2(260, 920), Vector2(260, 380),
			Vector2(1080, 380), Vector2(1080, 720), Vector2(1600, 720),
			Vector2(1600, 160), Vector2(1960, 160),
		]),
	]
	twin.decor = [
		{ "pos": Vector2(840, 160), "radius": 36.0, "color": Color("#5cf2ff") },
		{ "pos": Vector2(720, 920), "radius": 38.0, "color": Color("#b377ff") },
	]
	maps.append(twin)

	var spiral := MapData.new()
	spiral.id = "spiral"
	spiral.display_name = "Spiral Vault"
	spiral.difficulty = 3
	spiral.bg_top = Color("#1a0e3a")
	spiral.bg_bottom = Color("#481350")
	spiral.path_width = 56.0
	spiral.start_money = 550
	spiral.paths = [PackedVector2Array([
		Vector2(-40, 100), Vector2(1800, 100), Vector2(1800, 980),
		Vector2(140, 980), Vector2(140, 260), Vector2(1580, 260),
		Vector2(1580, 820), Vector2(330, 820), Vector2(330, 460),
		Vector2(1360, 460), Vector2(1360, 640), Vector2(550, 640),
		Vector2(550, 540), Vector2(2040, 540),
	])]
	spiral.decor = [{ "pos": Vector2(960, 540), "radius": 60.0, "color": Color("#ffd166") }]
	maps.append(spiral)

# ── Wave generation ───────────────────────────────────────────────────────

func generate_waves(map_diff: int) -> Array:
	var waves: Array = []
	for w in range(1, TOTAL_WAVES + 1):
		var groups: Array = []
		var power: float = 1.0 + (w - 1) * 0.18 + (map_diff - 1) * 0.25
		var is_boss: bool = (w == 10 or w == 20)
		var is_mini: bool = (w == 5 or w == 15)

		if is_boss:
			groups.append({ "type": "behemoth" if w == 20 else "juggernaut",
				"count": 1, "gap": 0.5, "delay": 1.0, "hp_mul": 1.0 })
			groups.append({ "type": "striker", "count": int(8 + w * 0.6),
				"gap": 0.5, "delay": 2.0, "hp_mul": 1.0 })
			groups.append({ "type": "drone", "count": int(20 + w * 0.5),
				"gap": 0.25, "delay": 4.0, "hp_mul": 1.0 })
			if w == 20:
				groups.append({ "type": "wraith", "count": 12, "gap": 0.6, "delay": 6.0, "hp_mul": 1.0 })
				groups.append({ "type": "carrier", "count": 4, "gap": 1.2, "delay": 10.0, "hp_mul": 1.0 })
		elif is_mini:
			groups.append({ "type": "juggernaut", "count": 1, "gap": 0.5, "delay": 1.0, "hp_mul": 0.55 })
			groups.append({ "type": "striker", "count": 6 + w, "gap": 0.4, "delay": 1.5, "hp_mul": 1.0 })
			groups.append({ "type": "drone", "count": 12 + w, "gap": 0.3, "delay": 3.0, "hp_mul": 1.0 })
		else:
			var drones: int = max(0, int(8 + w * 1.4))
			var strikers: int = (int(2 + w * 0.7) if w >= 3 else 0)
			var wraiths: int = (int(1 + w * 0.35) if w >= 6 else 0)
			var carriers: int = (int(w * 0.18) if w >= 8 else 0)
			var swarmers: int = (int(8 + w * 0.6) if (w >= 4 and w % 2 == 0) else 0)
			if drones > 0:
				groups.append({ "type":"drone", "count":drones, "gap":0.55, "delay":0.0, "hp_mul":1.0 })
			if strikers > 0:
				groups.append({ "type":"striker", "count":strikers, "gap":0.7, "delay":1.5, "hp_mul":1.0 })
			if wraiths > 0:
				groups.append({ "type":"wraith", "count":wraiths, "gap":0.9, "delay":3.0, "hp_mul":1.0 })
			if carriers > 0:
				groups.append({ "type":"carrier", "count":carriers, "gap":1.4, "delay":4.5, "hp_mul":1.0 })
			if swarmers > 0:
				groups.append({ "type":"swarmer", "count":swarmers, "gap":0.18, "delay":6.0, "hp_mul":1.0 })

		for g in groups:
			g["hp_mul"] *= power
		waves.append({ "index": w, "groups": groups })
	return waves

func make_radial_alpha_texture(size: int = 128) -> ImageTexture:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var half: float = float(size) * 0.5
	for y in range(size):
		for x in range(size):
			var d: float = Vector2(x - half, y - half).length() / half
			var a: float = clamp(1.0 - d, 0.0, 1.0)
			a = a * a
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)

func get_tower(id: String) -> TowerData:
	return towers.get(id, null)

func get_enemy(id: String) -> EnemyData:
	return enemies.get(id, null)

func get_map(id: String) -> MapData:
	for m in maps:
		if m.id == id:
			return m
	return null
