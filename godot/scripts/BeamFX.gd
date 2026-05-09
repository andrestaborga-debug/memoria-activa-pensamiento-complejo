extends Line2D
## Transient beam / chain-arc visual. Fades out over `life` seconds.

var life: float = 0.2
var max_life: float = 0.2

func setup(start: Vector2, end: Vector2, color: Color, l: float, w: float) -> void:
	clear_points()
	add_point(start)
	add_point(end)
	default_color = color
	width = w
	life = l
	max_life = l

func _process(delta: float) -> void:
	life -= delta
	if life <= 0.0:
		queue_free(); return
	var a: float = clamp(life / max_life, 0.0, 1.0)
	modulate.a = a
