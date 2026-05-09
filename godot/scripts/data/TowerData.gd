class_name TowerData
extends Resource

## Static definition for one tower archetype + its upgrade ladder.
## Drop a Texture2D into `sprite_path` and the Tower scene auto-uses it.

@export var id: String = ""
@export var display_name: String = ""
@export var icon_glyph: String = "◎"          # fallback when no UI icon texture
@export var color: Color = Color.WHITE
@export var description: String = ""
@export var cost: int = 100
@export_file("*.png", "*.webp") var sprite_path: String = ""
@export_file("*.png", "*.webp") var turret_sprite_path: String = ""

# Base stats at level 0 (just built).
@export var range_px: float = 280.0
@export var fire_rate: float = 1.4             # shots per second
@export var damage: float = 9.0
@export var projectile_speed: float = 800.0
@export_enum("bullet", "lob", "beam", "rail", "chain") var projectile_type: String = "bullet"
@export var splash_radius: float = 0.0
@export var splash_damage: float = 0.0
@export var pierce: int = 0
@export var chains: int = 0
@export var chain_range: float = 0.0
@export var chain_falloff: float = 0.7
@export var armor_pierce: bool = false

# Status applied on hit (slow). Empty dict = none.
# { "slow": 0.4, "duration": 1.6 }
@export var status: Dictionary = {}

# Upgrades. Each upgrade is a Dictionary with keys: name, desc, cost, set
# `set` is a Dictionary of stat overrides (e.g. {"damage": 18, "range_px": 360}).
@export var upgrades: Array[Dictionary] = []
