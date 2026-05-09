extends Node2D
## Renders the ghost-tower preview while the player is placing.
## Walks up to the Game node to read placing_*.

@onready var game: Node = get_parent()

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	if game == null or game.placing_tower_id == "": return
	var def: TowerData = GameData.get_tower(game.placing_tower_id)
	if def == null: return
	var p: Vector2 = game.placing_pos
	var ok: bool = game.placing_valid
	var c: Color = Color("#6cf09c") if ok else Color("#ff7a7a")
	draw_circle(p, def.range_px, Color(c.r, c.g, c.b, 0.10))
	draw_arc(p, def.range_px, 0.0, TAU, 64, Color(c.r, c.g, c.b, 0.7), 2.0, true)
	draw_circle(p, 30.0, Color(0.10, 0.15, 0.32, 0.85))
	draw_arc(p, 30.0, 0.0, TAU, 32, def.color, 3.0, true)
