extends Control
## Map-select menu. Same UI strategy as HUD: code-built so the .tscn
## stays minimal.

var map_grid: GridContainer
var continue_btn: Button
var reset_btn: Button
var bg_rect: ColorRect

func _ready() -> void:
	_build_ui()

func _build_ui() -> void:
	bg_rect = ColorRect.new()
	bg_rect.color = Color("#0b1020")
	bg_rect.anchor_right = 1.0; bg_rect.anchor_bottom = 1.0
	add_child(bg_rect)
	var bg := bg_rect

	# Aurora glow shader for menu background
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
uniform float t = 0.0;
void fragment() {
	vec2 uv = UV;
	vec3 a = vec3(0.36, 0.95, 1.0);
	vec3 b = vec3(0.70, 0.47, 1.0);
	float band = sin(uv.y * 6.0 + t * 0.3) * 0.5 + 0.5;
	float band2 = sin(uv.x * 4.0 - t * 0.2) * 0.5 + 0.5;
	vec3 col = mix(vec3(0.04, 0.06, 0.13), mix(a, b, band) * 0.18 + vec3(0.04, 0.06, 0.13), band2);
	COLOR = vec4(col, 1.0);
}
"""
	var mat := ShaderMaterial.new()
	mat.shader = sh
	bg.material = mat
	bg.set_meta("shader_mat", mat)

	var center := CenterContainer.new()
	center.anchor_right = 1.0; center.anchor_bottom = 1.0
	add_child(center)

	var card := PanelContainer.new()
	_style_panel(card)
	card.custom_minimum_size = Vector2(560, 0)
	center.add_child(card)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 14)
	card.add_child(vb)

	var title := Label.new()
	title.text = "NEBULA DEFENSE"
	title.add_theme_font_size_override("font_size", 36)
	title.add_theme_color_override("font_color", Color("#5cf2ff"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(title)

	var tag := Label.new()
	tag.text = "Hold the line. Tap to build. Survive 20 waves."
	tag.add_theme_color_override("font_color", Color("#8a96c7"))
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(tag)

	map_grid = GridContainer.new()
	map_grid.columns = 3
	map_grid.add_theme_constant_override("h_separation", 10)
	map_grid.add_theme_constant_override("v_separation", 10)
	vb.add_child(map_grid)
	_populate_maps()

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	vb.add_child(row)

	continue_btn = Button.new()
	continue_btn.text = "Continue"
	continue_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	continue_btn.pressed.connect(_on_continue)
	_style_button(continue_btn, true)
	row.add_child(continue_btn)
	if SaveManager.get_last_map() == "":
		continue_btn.visible = false

	reset_btn = Button.new()
	reset_btn.text = "Reset save"
	reset_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset_btn.pressed.connect(_on_reset)
	_style_button(reset_btn, false, true)
	row.add_child(reset_btn)

	var hint := Label.new()
	hint.text = "Tip: rotate to landscape on small phones."
	hint.add_theme_color_override("font_color", Color("#7a8ab9"))
	hint.add_theme_font_size_override("font_size", 11)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(hint)

func _process(delta: float) -> void:
	if bg_rect and bg_rect.material is ShaderMaterial:
		var mat := bg_rect.material as ShaderMaterial
		var t = mat.get_shader_parameter("t")
		if t == null: t = 0.0
		mat.set_shader_parameter("t", float(t) + delta)

func _populate_maps() -> void:
	for c in map_grid.get_children(): c.queue_free()
	var unlocked: Dictionary = SaveManager.unlocked_maps()
	for m in GameData.maps:
		var locked: bool = not unlocked.get(m.id, false)
		var cleared: bool = SaveManager.is_cleared(m.id)
		var card := Button.new()
		card.custom_minimum_size = Vector2(170, 150)
		var dots: String = "■".repeat(m.difficulty) + "□".repeat(3 - m.difficulty)
		var star: String = " ★" if cleared else ""
		var lock_str: String = "  · Locked" if locked else ""
		card.text = "%s%s\n%s%s" % [m.display_name, star, dots, lock_str]
		card.disabled = locked
		card.pressed.connect(func(): _start_map(m.id))
		_style_button(card)
		map_grid.add_child(card)

func _start_map(id: String) -> void:
	var game_scene := load("res://scenes/Game.tscn")
	if game_scene == null: return
	# Pass map_id via SaveManager (last_map) — Game._ready picks it up.
	SaveManager.set_last_map(id)
	get_tree().change_scene_to_packed(game_scene)

func _on_continue() -> void:
	var last: String = SaveManager.get_last_map()
	if last != "": _start_map(last)

func _on_reset() -> void:
	SaveManager.reset()
	_populate_maps()
	continue_btn.visible = false

# Reused styling helpers (mirrors HUD's). Kept local to avoid coupling.

func _style_panel(p: PanelContainer) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.09, 0.19, 0.92)
	sb.border_color = Color("#1d2a55")
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(18)
	sb.content_margin_left = 24; sb.content_margin_right = 24
	sb.content_margin_top = 24; sb.content_margin_bottom = 24
	p.add_theme_stylebox_override("panel", sb)

func _style_button(b: Button, primary: bool = false, warn: bool = false) -> void:
	var n := StyleBoxFlat.new()
	if primary:
		n.bg_color = Color("#5cf2ff")
		b.add_theme_color_override("font_color", Color("#06102a"))
	elif warn:
		n.bg_color = Color(1.0, 0.48, 0.48, 0.18)
		b.add_theme_color_override("font_color", Color("#ff7a7a"))
	else:
		n.bg_color = Color(0.06, 0.09, 0.19, 0.92)
		b.add_theme_color_override("font_color", Color("#e7ecff"))
	n.border_color = Color("#1d2a55")
	n.set_border_width_all(1)
	n.set_corner_radius_all(10)
	n.content_margin_left = 14; n.content_margin_right = 14
	n.content_margin_top = 12; n.content_margin_bottom = 12
	b.add_theme_stylebox_override("normal", n)
	b.add_theme_stylebox_override("hover", n)
	b.add_theme_stylebox_override("pressed", n)
	b.add_theme_font_size_override("font_size", 14)
