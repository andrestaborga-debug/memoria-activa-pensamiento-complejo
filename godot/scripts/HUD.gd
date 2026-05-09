class_name HUD
extends CanvasLayer

## Mobile-first HUD. Built programmatically in _ready() so the TSCN
## stays tiny — easier to merge, harder to break.

var game: Node = null

# Top bar
var lives_label: Label
var money_label: Label
var wave_label: Label
var map_label: Label
var pause_btn: Button

# Bottom bar
var speed_btn: Button
var wave_btn: Button

# Sheets
var tower_picker_panel: PanelContainer
var tower_picker_list: GridContainer
var tower_picker_anchor: Vector2 = Vector2.ZERO

var tower_menu_panel: PanelContainer
var tower_menu_title: Label
var tower_menu_stats: GridContainer
var tower_menu_upgrades: VBoxContainer
var tower_menu_target_btn: Button
var tower_menu_sell_btn: Button
var current_tower: Tower = null

# Overlays
var pause_overlay: ColorRect
var end_overlay: ColorRect
var end_title: Label
var end_sub: Label

# Toast
var toast_label: Label
var toast_timer: float = 0.0

func _ready() -> void:
	layer = 10
	_build_top_bar()
	_build_bottom_bar()
	_build_tower_picker()
	_build_tower_menu()
	_build_overlays()
	_build_toast()

func bind(g: Node) -> void:
	game = g

func _process(delta: float) -> void:
	if toast_timer > 0.0:
		toast_timer -= delta
		toast_label.modulate.a = clamp(toast_timer / 0.4, 0.0, 1.0) if toast_timer < 0.4 else 1.0
		if toast_timer <= 0.0:
			toast_label.visible = false

# ── Builders ─────────────────────────────────────────────────────────────

func _build_top_bar() -> void:
	var bar := HBoxContainer.new()
	bar.anchor_left = 0.0; bar.anchor_top = 0.0
	bar.anchor_right = 1.0
	bar.offset_left = 16; bar.offset_top = 16
	bar.offset_right = -16; bar.offset_bottom = 80
	bar.add_theme_constant_override("separation", 8)
	add_child(bar)

	var lives_cell := _make_cell("LIVES", "20")
	var money_cell := _make_cell("CREDITS", "$ 0")
	var wave_cell := _make_cell("WAVE", "0 / 0")
	bar.add_child(lives_cell["panel"])
	bar.add_child(money_cell["panel"])
	bar.add_child(wave_cell["panel"])
	lives_label = lives_cell["value"]
	money_label = money_cell["value"]
	wave_label = wave_cell["value"]

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(spacer)

	map_label = Label.new()
	map_label.text = "—"
	map_label.add_theme_font_size_override("font_size", 16)
	map_label.add_theme_color_override("font_color", Color("#e7ecff"))
	bar.add_child(map_label)

	pause_btn = Button.new()
	pause_btn.text = "II"
	pause_btn.custom_minimum_size = Vector2(56, 56)
	pause_btn.pressed.connect(func(): if game: game.toggle_pause())
	_style_button(pause_btn)
	bar.add_child(pause_btn)

func _make_cell(label: String, value: String) -> Dictionary:
	var panel := PanelContainer.new()
	_style_panel(panel)
	var vb := VBoxContainer.new()
	panel.add_child(vb)
	var lbl := Label.new()
	lbl.text = label
	lbl.add_theme_font_size_override("font_size", 10)
	lbl.add_theme_color_override("font_color", Color("#8a96c7"))
	vb.add_child(lbl)
	var val := Label.new()
	val.text = value
	val.add_theme_font_size_override("font_size", 16)
	val.add_theme_color_override("font_color", Color("#e7ecff"))
	vb.add_child(val)
	return { "panel": panel, "value": val }

func _build_bottom_bar() -> void:
	var bar := HBoxContainer.new()
	bar.anchor_left = 1.0; bar.anchor_top = 1.0
	bar.anchor_right = 1.0; bar.anchor_bottom = 1.0
	bar.offset_left = -340; bar.offset_top = -84
	bar.offset_right = -16; bar.offset_bottom = -16
	bar.add_theme_constant_override("separation", 10)
	add_child(bar)

	speed_btn = Button.new()
	speed_btn.text = ">  1x"
	speed_btn.custom_minimum_size = Vector2(120, 64)
	speed_btn.pressed.connect(func(): if game: game.toggle_speed())
	_style_button(speed_btn)
	bar.add_child(speed_btn)

	wave_btn = Button.new()
	wave_btn.text = "START WAVE"
	wave_btn.custom_minimum_size = Vector2(200, 64)
	wave_btn.pressed.connect(func(): if game: game.start_wave())
	_style_button(wave_btn, true)
	bar.add_child(wave_btn)

func _build_tower_picker() -> void:
	tower_picker_panel = PanelContainer.new()
	tower_picker_panel.anchor_left = 0.0; tower_picker_panel.anchor_right = 1.0
	tower_picker_panel.anchor_top = 1.0; tower_picker_panel.anchor_bottom = 1.0
	tower_picker_panel.offset_left = 16; tower_picker_panel.offset_right = -360
	tower_picker_panel.offset_top = -360; tower_picker_panel.offset_bottom = -100
	tower_picker_panel.visible = false
	_style_panel(tower_picker_panel, true)
	add_child(tower_picker_panel)

	var vb := VBoxContainer.new()
	tower_picker_panel.add_child(vb)
	var title := Label.new()
	title.text = "BUILD TOWER"
	title.add_theme_font_size_override("font_size", 11)
	title.add_theme_color_override("font_color", Color("#8a96c7"))
	vb.add_child(title)

	tower_picker_list = GridContainer.new()
	tower_picker_list.columns = 2
	tower_picker_list.add_theme_constant_override("h_separation", 8)
	tower_picker_list.add_theme_constant_override("v_separation", 8)
	vb.add_child(tower_picker_list)

	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(func():
		tower_picker_panel.visible = false
		if game: game.cancel_placing()
	)
	_style_button(cancel)
	vb.add_child(cancel)

func _build_tower_menu() -> void:
	tower_menu_panel = PanelContainer.new()
	tower_menu_panel.anchor_left = 0.0; tower_menu_panel.anchor_right = 1.0
	tower_menu_panel.anchor_top = 1.0; tower_menu_panel.anchor_bottom = 1.0
	tower_menu_panel.offset_left = 16; tower_menu_panel.offset_right = -360
	tower_menu_panel.offset_top = -380; tower_menu_panel.offset_bottom = -100
	tower_menu_panel.visible = false
	_style_panel(tower_menu_panel, true)
	add_child(tower_menu_panel)

	var vb := VBoxContainer.new()
	tower_menu_panel.add_child(vb)

	tower_menu_title = Label.new()
	tower_menu_title.add_theme_font_size_override("font_size", 16)
	tower_menu_title.add_theme_color_override("font_color", Color("#e7ecff"))
	vb.add_child(tower_menu_title)

	tower_menu_stats = GridContainer.new()
	tower_menu_stats.columns = 2
	tower_menu_stats.add_theme_constant_override("h_separation", 6)
	tower_menu_stats.add_theme_constant_override("v_separation", 6)
	vb.add_child(tower_menu_stats)

	tower_menu_upgrades = VBoxContainer.new()
	tower_menu_upgrades.add_theme_constant_override("separation", 6)
	vb.add_child(tower_menu_upgrades)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	vb.add_child(row)
	tower_menu_target_btn = Button.new()
	tower_menu_target_btn.text = "Target: First"
	tower_menu_target_btn.pressed.connect(_on_target_pressed)
	_style_button(tower_menu_target_btn)
	row.add_child(tower_menu_target_btn)

	tower_menu_sell_btn = Button.new()
	tower_menu_sell_btn.text = "Sell"
	tower_menu_sell_btn.pressed.connect(_on_sell_pressed)
	_style_button(tower_menu_sell_btn, false, true)
	row.add_child(tower_menu_sell_btn)

	var close := Button.new()
	close.text = "Close"
	close.pressed.connect(func():
		tower_menu_panel.visible = false
		if game: game.selected_tower = null; game._update_selection()
	)
	_style_button(close)
	vb.add_child(close)

func _build_overlays() -> void:
	pause_overlay = _make_overlay("Paused")
	pause_overlay.visible = false
	add_child(pause_overlay)

	end_overlay = _make_overlay("Game Over")
	end_overlay.visible = false
	add_child(end_overlay)

func _make_overlay(default_title: String) -> ColorRect:
	var rect := ColorRect.new()
	rect.color = Color(0.02, 0.04, 0.10, 0.86)
	rect.anchor_right = 1.0; rect.anchor_bottom = 1.0
	var center := CenterContainer.new()
	center.anchor_right = 1.0; center.anchor_bottom = 1.0
	rect.add_child(center)
	var card := PanelContainer.new()
	_style_panel(card, true)
	center.add_child(card)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 12)
	card.add_child(vb)

	var title := Label.new()
	title.text = default_title
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color("#e7ecff"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(title)
	rect.set_meta("title", title)

	if default_title == "Game Over":
		var sub := Label.new()
		sub.text = ""
		sub.add_theme_color_override("font_color", Color("#8a96c7"))
		sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		vb.add_child(sub)
		rect.set_meta("sub", sub)
		end_title = title; end_sub = sub
		var retry := Button.new()
		retry.text = "Retry"
		retry.pressed.connect(func(): if game: game.restart())
		_style_button(retry, true)
		vb.add_child(retry)
		var menu := Button.new()
		menu.text = "Back to menu"
		menu.pressed.connect(func(): if game: game.to_menu())
		_style_button(menu)
		vb.add_child(menu)
	else:
		var resume := Button.new()
		resume.text = "Resume"
		resume.pressed.connect(func(): if game: game.toggle_pause())
		_style_button(resume, true)
		vb.add_child(resume)
		var to_menu := Button.new()
		to_menu.text = "Back to menu"
		to_menu.pressed.connect(func(): if game: game.to_menu())
		_style_button(to_menu)
		vb.add_child(to_menu)

	return rect

func _build_toast() -> void:
	toast_label = Label.new()
	toast_label.anchor_left = 0.5; toast_label.anchor_right = 0.5
	toast_label.anchor_top = 0.0
	toast_label.offset_left = -120; toast_label.offset_right = 120
	toast_label.offset_top = 96; toast_label.offset_bottom = 130
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.add_theme_color_override("font_color", Color("#e7ecff"))
	toast_label.add_theme_font_size_override("font_size", 14)
	toast_label.visible = false
	add_child(toast_label)

# ── Styling helpers ──────────────────────────────────────────────────────

func _style_panel(p: PanelContainer, padded: bool = false) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.09, 0.19, 0.92)
	sb.border_color = Color("#1d2a55")
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(12)
	if padded:
		sb.content_margin_left = 14; sb.content_margin_right = 14
		sb.content_margin_top = 12; sb.content_margin_bottom = 12
	else:
		sb.content_margin_left = 10; sb.content_margin_right = 10
		sb.content_margin_top = 6; sb.content_margin_bottom = 6
	p.add_theme_stylebox_override("panel", sb)

func _style_button(b: Button, primary: bool = false, warn: bool = false) -> void:
	var normal := StyleBoxFlat.new()
	if primary:
		normal.bg_color = Color("#5cf2ff")
		b.add_theme_color_override("font_color", Color("#06102a"))
	elif warn:
		normal.bg_color = Color(1.0, 0.48, 0.48, 0.18)
		b.add_theme_color_override("font_color", Color("#ff7a7a"))
	else:
		normal.bg_color = Color(0.06, 0.09, 0.19, 0.92)
		b.add_theme_color_override("font_color", Color("#e7ecff"))
	normal.border_color = Color("#1d2a55")
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(10)
	normal.content_margin_left = 14; normal.content_margin_right = 14
	normal.content_margin_top = 10; normal.content_margin_bottom = 10
	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", normal)
	b.add_theme_stylebox_override("pressed", normal)
	b.add_theme_font_size_override("font_size", 14)

# ── Public API ───────────────────────────────────────────────────────────

func update_all() -> void:
	if game == null: return
	lives_label.text = str(max(0, game.lives))
	money_label.text = "$ %d" % game.money
	wave_label.text = "%d / %d" % [game.wave_index, GameData.TOTAL_WAVES]
	map_label.text = game.map.display_name if game.map else ""
	wave_btn.disabled = game.wave_active or game.ended
	if game.wave_active:
		wave_btn.text = "WAVE %d" % game.wave_index
	elif game.wave_index >= GameData.TOTAL_WAVES:
		wave_btn.text = "DONE"
	else:
		wave_btn.text = "START WAVE %d" % (game.wave_index + 1)
	speed_btn.text = ">  %dx" % int(game.speed_mult)

func toast(msg: String) -> void:
	toast_label.text = msg
	toast_label.visible = true
	toast_label.modulate.a = 1.0
	toast_timer = 1.6

func dismiss_open_sheets() -> bool:
	var open := tower_picker_panel.visible or tower_menu_panel.visible
	tower_picker_panel.visible = false
	tower_menu_panel.visible = false
	if game: game.cancel_placing()
	return open

func open_tower_picker(world_pos: Vector2) -> void:
	tower_picker_anchor = world_pos
	for c in tower_picker_list.get_children():
		c.queue_free()
	for id in GameData.towers.keys():
		var def: TowerData = GameData.towers[id]
		var btn := _make_tower_card(def)
		btn.pressed.connect(func():
			if game.money < def.cost:
				toast("Not enough credits"); return
			tower_picker_panel.visible = false
			game.begin_placing(id, world_pos)
		)
		tower_picker_list.add_child(btn)
	tower_picker_panel.visible = true
	tower_menu_panel.visible = false

func _make_tower_card(def: TowerData) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(160, 92)
	b.text = "%s\n%s\n$ %d" % [def.icon_glyph, def.display_name, def.cost]
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.add_theme_color_override("font_color", Color("#e7ecff"))
	if game and game.money < def.cost:
		b.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6, 0.7))
	_style_button(b)
	return b

func open_tower_menu(t: Tower) -> void:
	current_tower = t
	tower_picker_panel.visible = false
	tower_menu_panel.visible = true
	_refresh_tower_menu()

func _refresh_tower_menu() -> void:
	if current_tower == null: return
	var t: Tower = current_tower
	tower_menu_title.text = "%s · L%d" % [t.data.display_name, t.level]
	for c in tower_menu_stats.get_children(): c.queue_free()
	_add_stat("DAMAGE", str(int(t.stats["damage"])))
	_add_stat("RATE", "%.2f/s" % t.stats["fire_rate"])
	_add_stat("RANGE", str(int(t.stats["range_px"])))
	_add_stat("DPS", str(int(t.stats["damage"] * t.stats["fire_rate"])))

	for c in tower_menu_upgrades.get_children(): c.queue_free()
	if t.level >= t.data.upgrades.size():
		var max_l := Label.new()
		max_l.text = "Maxed ★"
		max_l.add_theme_color_override("font_color", Color("#6cf09c"))
		tower_menu_upgrades.add_child(max_l)
	else:
		var up: Dictionary = t.data.upgrades[t.level]
		var ub := Button.new()
		ub.text = "%s — %s\n$ %d" % [up["name"], up["desc"], up["cost"]]
		ub.disabled = (game.money < up["cost"])
		ub.pressed.connect(func():
			if t.upgrade():
				_refresh_tower_menu()
				update_all()
			else:
				toast("Not enough credits")
		)
		_style_button(ub)
		tower_menu_upgrades.add_child(ub)

	tower_menu_target_btn.text = "Target: %s" % t.target_mode.capitalize()
	tower_menu_sell_btn.text = "Sell ($ %d)" % int(floor(t.total_spent * 0.7))

func _add_stat(label: String, value: String) -> void:
	var pn := PanelContainer.new()
	_style_panel(pn)
	var vb := VBoxContainer.new()
	pn.add_child(vb)
	var l := Label.new()
	l.text = label
	l.add_theme_font_size_override("font_size", 10)
	l.add_theme_color_override("font_color", Color("#8a96c7"))
	vb.add_child(l)
	var v := Label.new()
	v.text = value
	v.add_theme_color_override("font_color", Color("#e7ecff"))
	v.add_theme_font_size_override("font_size", 14)
	vb.add_child(v)
	tower_menu_stats.add_child(pn)

func _on_target_pressed() -> void:
	if current_tower:
		current_tower.cycle_target_mode()
		_refresh_tower_menu()

func _on_sell_pressed() -> void:
	if current_tower:
		var refund: int = current_tower.sell()
		current_tower = null
		tower_menu_panel.visible = false
		toast("Refunded $ %d" % refund)
		update_all()

func set_paused(p: bool) -> void:
	pause_overlay.visible = p

func show_end(win: bool) -> void:
	end_overlay.visible = true
	end_title.text = "Victory" if win else "Defeat"
	end_sub.text = ("All %d waves cleared." % GameData.TOTAL_WAVES) if win else "The core was overrun."
