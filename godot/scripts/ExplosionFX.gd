extends Node2D
## Quick expanding ring + flash. Frees itself when done.

var radius: float = 100.0
var color: Color = Color.WHITE
var t: float = 0.0
const DUR: float = 0.45

func setup(r: float, c: Color) -> void:
	radius = r
	color = c

func _process(delta: float) -> void:
	t += delta
	if t >= DUR:
		queue_free(); return
	queue_redraw()

func _draw() -> void:
	var k: float = clamp(t / DUR, 0.0, 1.0)
	var r: float = lerp(radius * 0.2, radius, k)
	var a: float = (1.0 - k) * 0.7
	draw_circle(Vector2.ZERO, r, Color(color.r, color.g, color.b, a * 0.5))
	draw_arc(Vector2.ZERO, r, 0.0, TAU, 48, Color(color.r, color.g, color.b, a), 4.0, true)
