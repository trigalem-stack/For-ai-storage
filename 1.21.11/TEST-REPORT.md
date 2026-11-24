# Отчёт о переносе и проверке (Paper 1.21.11)

Дата: 2026-11-24

## 1. Исходные данные

* 18 jar-плагинов, собранных под Paper/Spigot API `1.21.4-R0.1-SNAPSHOT`, Java 21.
* Все плагины — самостоятельные (без внешних библиотек), используют только Bukkit/Paper API.

## 2. Проверка совместимости с API 1.21.11

Из каждого class-файла извлечены все ссылки на классы, методы и поля (constant pool),
после чего каждая ссылка проверена по реальному `paper-api-1.21.11-R0.1-SNAPSHOT.jar`:

| Показатель | Значение |
|---|---|
| Проверено class-файлов | 49 |
| Уникальных ссылок на классы | 204 |
| Уникальных ссылок на методы | 809 |
| Уникальных ссылок на поля | 603 |
| **Отсутствующих классов/методов/полей API** | **0** |

Единственные «не найденные» ссылки — ожидаемые и не влияющие на работу:

* `net.md_5.bungee.api.*` — поставляется отдельной библиотекой `bungeecord-chat`,
  которая входит в состав Paper (в jar paper-api её нет, но на сервере она есть);
* `Enum.name()`, `Enum.ordinal()`, `Object.equals()` — наследуются от JDK;
* `Player.sendActionBar(Component)` — наследуется от `Audience`
  (`Player` → `Entity` → `CommandSender` → `Audience`).

NMS (`net.minecraft.*`), `org.bukkit.craftbukkit.*` и рефлексия в плагинах не используются.

**Вывод:** плагины бинарно совместимы с Paper 1.21.11, изменения кода не требуются.

## 3. Проверка на реальном сервере

Сервер:

```
Paper 1.21.11-111-main@302c47c (2026-02-07T22:59:49Z)
Minecraft 1.21.11
Implementing API version 1.21.11-R0.1-SNAPSHOT
Java 25 (OpenJDK 64-Bit Server VM 25.0.5.1+2-LTS; Eclipse Adoptium Temurin-25.0.5.1+2)
```

Результат загрузки:

```
[PluginInitializerManager] Bukkit plugins (18):
 - ArtemisBow (1.0-1.21.11), DragonKatana (1.0-1.21.11), EmeraldSword (1.0-1.21.11),
   EnderBow (1.0-1.21.11), ExcaliburPlugin (1.0-1.21.11), FossilSword (1.0-1.21.11),
   KosaPlugin (1.0-1.21.11), MidasSword (1.0-1.21.11), MjolnirPlugin (1.0-1.21.11),
   PoisonDagger (1.0-1.21.11), PoseidonPlugin (1.0-1.21.11), PufferCannon (1.0-1.21.11),
   SculkCrossbow (1.0-1.21.11), ShadowBlade (1.0-1.21.11), SkySwordPlugin (1.0-1.21.11),
   StormBlade (1.1-1.21.11), UndeadStaff (1.0-1.21.11), VillagerWand (1.0-1.21.11)
...
Done (20.254s)! For help, type "help"
```

Все 18 плагинов включились без исключений.

Дополнительно: перед обновлением метаданных **оригинальные** jar 1.21.4 тоже были
загружены на этом же сервере 1.21.11 — все 18 включились без ошибок, а команды выдачи
отработали. То есть бинарная совместимость подтверждена и для исходных, и для
переупакованных jar.

Проверка команд выдачи (тестовый игрок `Tester`, все команды выполнены из консоли):

| Команда | Результат |
|---|---|
| `d_k give Tester` | Катана Дракона выдана |
| `e_m give Tester` | Клинок выдан (CMD: 5) |
| `e_b give Tester` | Лук выдан |
| `excalibur give Tester` | Экскалибур выдан |
| `i_m give Tester` | Меч выдан |
| `k_ch give Tester` | Коса выдана |
| `y_k give Tester` | Кинжал выдан |
| `poseidon give Tester` | Трезубец Посейдона выдан |
| `p_c give Tester` | Пушка выдана |
| `s_c give Tester` | Арбалет выдан |
| `s_b give Tester` | Теневой клинок выдан |
| `n_s give Tester` | Небесный меч выдан |
| `p_n give Tester` | Посох выдан |
| `v_w give Tester` | Посох выдан |
| `a_b give Tester` | Лук выдан |
| `m_s give Tester` | Меч Мидаса выдан |
| `mjolnir give Tester` | Мьёльнир выдан |
| `k_b give Tester` | Клинок выдан |

Инвентарь тестового игрока после команд содержал все 18 предметов.

Единственные ошибки в логе сервера — сетевые:

```
[PaperVersionFetcher] Error while parsing version list
javax.net.ssl.SSLHandshakeException: Remote host terminated the handshake
```

Они вызваны отсутствием доступа к `api.minecraftservices.com` в тестовом окружении
и к плагинам отношения не имеют.

## 4. Что изменено в jar

* `plugin.yml`: `api-version: '1.21.11'`, `version: *-1.21.11`;
* `META-INF/maven/**/pom.xml`: версия paper-api/spigot-api `1.21.11-R0.1-SNAPSHOT`, версия проекта `*-1.21.11`;
* `META-INF/maven/**/pom.properties`: версия проекта `*-1.21.11`;
* **все class-файлы и `config.yml` — байт-в-байт как в оригинале.**

Проверка совпадения class-файлов: все 18 jar, все записи, кроме `plugin.yml`/`pom.xml`/`pom.properties`,
идентичны оригиналам.
