# Astrummc — ресурс-пак для Minecraft 1.21.11 (Java Edition)

**Файл:** [`Astrummc-1.21.11.zip`](Astrummc-1.21.11.zip) — конвертация оригинального `Astrummc.zip`
(сделан под формат 45 / 1.21.4) в формат **75 / 1.21.11**.

Оригинальный `Astrummc.zip` в ветке `main` **не изменялся** — здесь лежит отдельный готовый архив.

## Что именно поменялось

Меняется только то, что требует сам формат 1.21.11. Модели, текстуры, звуки, шрифты, языки,
**все числовые значения `custom_model_data` — без изменений** (проверено автоматически: набор порогов
CMD в каждом item-файле совпадает с оригиналом один в один).

| # | Что | Зачем |
|---|-----|-------|
| 1 | `pack.mcmeta`: `pack_format: 45` → **`75`**, убрано `supported_formats: [13, 32767]`, добавлено **`min_format: 75`** и **`max_format: 75`** | В 1.21.11 (pack format 75) старый `supported_formats` с верхней границей > 64 **отклоняется игрой**: `Pack declares support for version newer than 64, but is missing mandatory fields min_format and max_format`. То есть оригинальный `pack.mcmeta` в 1.21.11 не принимается вообще. |
| 2 | В `assets/**/items/**/*.json` (79 файлов): `type` и `property` дополнены пространством имён — `model` → `minecraft:model`, `range_dispatch` → `minecraft:range_dispatch`, `condition` → `minecraft:condition`, `select` → `minecraft:select`, `special` → `minecraft:special`, `constant`/`potion` → `minecraft:constant`/`minecraft:potion`; `custom_model_data` → `minecraft:custom_model_data`, `using_item` → `minecraft:using_item`, `use_duration` → `minecraft:use_duration`, `crossbow/pull` → `minecraft:crossbow/pull`, `charge_type` → `minecraft:charge_type`, `compass` → `minecraft:compass`, `fishing_rod/cast` → `minecraft:fishing_rod/cast`, `has_component` → `minecraft:has_component`, `context_dimension` → `minecraft:context_dimension`, `broken` → `minecraft:broken`, `cooldown` → `minecraft:cooldown`, `display_context` → `minecraft:display_context` | Это **та же самая** запись (пространство имён по умолчанию — `minecraft`), просто в каноническом виде, как в ванильных файлах 1.21.11. Ничего не переименовывается и не переназначается. |
| 3 | `assets/minecraft/atlases/blocks.json`: `type: "directory"` → `minecraft:directory` | То же самое — каноническое имя источника атласа в 1.21.11. |

**Всё остальное — байт-в-байт как в оригинале:** 5 381 файл, 6 471 запись в архиве,
2 388 моделей (включая все 3D-модели с `elements`), 2 587 текстур (включая 2D-спрайты,
`.png.mcmeta` анимации), 54 звука, 5 шрифтов, 132 `.mcmeta`, блокстейты, `sounds.json`, `lang/*.json`.

Изменённых файлов всего **81**: 1 `pack.mcmeta` + 1 атлас + 79 item-определений.

## Что проверено

* `unzip -t` — архив цел, ошибок нет.
* Все 2 726 JSON-файлов парсятся; ни одного битого.
* Круговое сравнение деревьев (оригинал ↔ конвертация): различаются только те самые 81 файл.
* Пороги `custom_model_data` и ссылки на модели в item-определениях — **идентичны оригиналу** (автотест).
* `pack.mcmeta` прогнан через точный порт валидатора `net.minecraft.server.packs.metadata.pack.PackFormat`
  из `paper-1.21.11.jar` (декомпилирован): оригинал → **ошибка**, конвертация → **OK, диапазон 75.0..75.∞**.
* Структура item-определений сверена с ванильными файлами 1.21.11 (`items/compass.json`,
  `crossbow.json`, `fishing_rod.json`, `camel_spawn_egg.json` и т.д.) — совпадает.
* Все 12 использованных `property` и все 10 использованных `type` существуют в 1.21.11.

## Установка

1. Положить `Astrummc-1.21.11.zip` в папку `resourcepacks` клиента (либо на сервер и выдать через
   `resource-pack=` в `server.properties`).
2. Включить пак в меню «Resource Packs».

## Примечание по 1.21.11

В 1.21.11 (25w45a) добавлен отдельный атлас `items` — спрайты предметов теперь берутся из него,
а не из `blocks`. Поэтому перекрытие `atlases/blocks.json` из оригинала больше ничего не ломает:
источники атласов **складываются** между всеми активными паками, а ванильный `atlases/items.json`
собирает `item/` по всем пространствам имён (`astrum:`, `civilization:`, `minecraft:`) автоматически.
