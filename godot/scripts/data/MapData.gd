class_name MapData
extends Resource

## A playable map: background, enemy paths (one or more), starting economy.

@export var id: String = ""
@export var display_name: String = ""
@export var difficulty: int = 1
@export var bg_top: Color = Color(0.05, 0.08, 0.22)
@export var bg_bottom: Color = Color(0.10, 0.06, 0.26)
@export var path_width: float = 56.0

# Each path is an Array of Vector2 waypoints.
@export var paths: Array[PackedVector2Array] = []

# Decorative lights/crystals placed in the world.
# { "pos": Vector2, "radius": float, "color": Color }
@export var decor: Array[Dictionary] = []

@export var start_money: int = 650
@export var start_lives: int = 20
