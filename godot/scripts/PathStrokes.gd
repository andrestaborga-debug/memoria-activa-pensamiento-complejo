extends Node2D
## Renders path strokes (dark base + tinted surface + dashed centerline +
## start/end markers) for all paths defined in `map`.

@export var map: MapData

func _ready() -> void:
	queue_redraw()

func _draw() -> void:
	if map == null: return
	var w: float = map.path_width
	for pts in map.paths:
		_draw_polyline(pts, Color(0, 0, 0, 0.55), w + 10.0)
		_draw_polyline(pts, Color("#293566"), w)
		_draw_polyline_dashed(pts, Color(0.36, 0.95, 1.0, 0.45), 2.0, 16.0, 16.0)
		var first: Vector2 = pts[0]
		var last: Vector2 = pts[pts.size() - 1]
		draw_circle(first, 14.0, Color("#5cf2ff"))
		draw_circle(last, 18.0, Color("#ff7a7a"))
		var f: Font = ThemeDB.fallback_font
		draw_string(f, last + Vector2(-26, 7), "CORE", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color.WHITE)

func _draw_polyline(pts: PackedVector2Array, c: Color, width: float) -> void:
	for i in range(pts.size() - 1):
		draw_line(pts[i], pts[i + 1], c, width, true)
	# Round joints
	for i in range(pts.size()):
		draw_circle(pts[i], width * 0.5, c)

func _draw_polyline_dashed(pts: PackedVector2Array, c: Color, width: float, dash: float, gap: float) -> void:
	for i in range(pts.size() - 1):
		var a: Vector2 = pts[i]
		var b: Vector2 = pts[i + 1]
		var d: Vector2 = b - a
		var L: float = d.length()
		if L == 0.0: continue
		var u: Vector2 = d / L
		var pos: float = 0.0
		while pos < L:
			var seg_end: float = min(pos + dash, L)
			draw_line(a + u * pos, a + u * seg_end, c, width, true)
			pos = seg_end + gap
