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
| 4 | **`assets/**/models/**/*.json` (65 файлов): `parent` без пространства имён дополнен до `minecraft:`** — `item/generated` → `minecraft:item/generated`, `item/crossbow` → `minecraft:item/crossbow`, `item/handheld` → `minecraft:item/handheld`, `item/handheld_rod` → `minecraft:item/handheld_rod`, `block/cube_all` → `minecraft:block/cube_all`, `builtin/entity` → `minecraft:builtin/entity` | В 1.21.11 `parent` модели **разрешается относительно пространства имён самой модели**, а не всегда `minecraft:`. Поэтому `astrum:item/battle_royale/*` с `parent: "item/generated"` искал несуществующий `astrum:item/generated` → модель не загружалась → вместо оружия **фиолетово-чёрный 3D-куб** (missing model). Именно так ломались 5 оружий. |
| 5 | **`assets/astrum/models/item/battle_royale/{scythe_of_disaster,poisonous_dagger,fossil_sword,undead_staff,storm_blade}.json`: грани с `"texture": "#missing"` переведены на основную текстуру модели (`#0`/`#1`)** — 121 грань | У этих 5 моделей часть торцов блока была размечена как «нет текстуры» и рендерилась фиолетовыми пятнами даже после починки `parent`. |

**Всё остальное — байт-в-байт как в оригинале:** 5 381 файл, 6 471 запись в архиве,
2 388 моделей (включая все 3D-модели с `elements`), 2 587 текстур (включая 2D-спрайты,
`.png.mcmeta` анимации), 54 звука, 5 шрифтов, 132 `.mcmeta`, блокстейты, `sounds.json`, `lang/*.json`.

Изменённых файлов всего **146**: 1 `pack.mcmeta` + 1 атлас + 79 item-определений + **65 моделей** (`parent` + у 5 моделей ещё грани `#missing`).

## Фиолетовые кубики у 5 оружий (исправлено)

Симптом: «Коса бедствия», «Отравленный кинжал», «Ископаемый меч», «Посох нежити», «Клинок бури»
вместо 3D-модели показывали **фиолетово-чёрный 3D-куб** (остальные 13 оружий — нормально).

Причина: у моделей этих предметов было `"parent": "item/generated"` **без пространства имён**.
В 1.21.11 `parent` разрешается относительно пространства имён модели, поэтому для
`astrum:item/battle_royale/scythe_of_disaster` игра искала `astrum:item/generated` — такого файла нет,
модель не загружалась и подставлялся missing model (тот самый куб).

В том же паке 61 модель `astrum` уже была с `"parent": "minecraft:item/generated"` — и они работали.
Исправление — чисто механическое: всем 65 моделям с `parent` без пространства имён дописан `minecraft:`.
Плюс у этих 5 моделей 121 грань с `#missing` переведена на основную текстуру, чтобы не осталось
фиолетовых торцов.

Проверка: после правки у всех 6 моделей, на которые ссылаются `item_model` этих оружий,
`parent` = `minecraft:item/generated` (существует в ванилле 1.21.11), все `textures` существуют,
`#missing` не осталось.

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
