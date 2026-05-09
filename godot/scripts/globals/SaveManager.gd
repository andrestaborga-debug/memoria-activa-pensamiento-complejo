extends Node
## Autoload (singleton). Persists per-map clear state and last-played map
## to user://save.cfg (lives in app sandbox on Android; survives upgrades).

const PATH := "user://save.cfg"

var data: ConfigFile = ConfigFile.new()

func _ready() -> void:
	var err := data.load(PATH)
	if err != OK:
		# fresh save
		data = ConfigFile.new()

func is_cleared(map_id: String) -> bool:
	return data.get_value("cleared", map_id, false)

func mark_cleared(map_id: String) -> void:
	data.set_value("cleared", map_id, true)
	_flush()

func unlocked_maps() -> Dictionary:
	# Linear unlock: crescent → twin → spiral
	var u := { "crescent": true, "twin": false, "spiral": false }
	if is_cleared("crescent"): u["twin"] = true
	if is_cleared("twin"): u["spiral"] = true
	return u

func set_last_map(map_id: String) -> void:
	data.set_value("session", "last_map", map_id)
	_flush()

func get_last_map() -> String:
	return data.get_value("session", "last_map", "")

func reset() -> void:
	data = ConfigFile.new()
	_flush()

func _flush() -> void:
	data.save(PATH)
