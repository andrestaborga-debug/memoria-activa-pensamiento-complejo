class_name EnemyData
extends Resource

## Static definition for one enemy archetype.
## Replace `sprite_path` with an animated SpriteFrames later (set
## `animated = true` and `frames_path` to .tres) for full animation.

@export var id: String = ""
@export var display_name: String = ""
@export var color: Color = Color.WHITE
@export_file("*.png", "*.webp") var sprite_path: String = ""
@export var animated: bool = false
@export_file("*.tres") var frames_path: String = ""

@export var hp: float = 22.0
@export var speed: float = 80.0                # path units / second
@export var reward: int = 4
@export var size: float = 14.0                 # visual radius in px
@export var armor: float = 0.0                 # 0..1 damage reduction
@export var regen: float = 0.0                 # hp/sec

# On death, optionally spawn child enemies. Empty = none.
# { "type": "drone", "count": 3, "offset": 18 }
@export var on_death: Dictionary = {}
