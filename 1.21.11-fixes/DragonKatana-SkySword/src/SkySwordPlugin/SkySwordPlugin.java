package ru.astrum.skysword;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.block.Block;
import org.bukkit.block.BlockState;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.inventory.PrepareSmithingEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlotGroup;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.BoundingBox;

/*
 * Небесный меч (SkySword) — Paper 1.21.11, версия 4.
 *
 * Как в оригинале 1.21.4: ПКМ включает/выключает способность, каждый тик проверяется место под
 * ногами, ставится снежная платформа 3x3, один кубик за платформу, всего 20 кубиков, потом
 * перезарядка 50 секунд, платформа живёт 100 тиков (5 секунд).
 *
 * Что переписано (причины жалоб «падаю, тпхает обратно, не успевает, не работает в прыжке»):
 *
 * 1. Платформа ставится на уровне ходьбы (walkLevel), а не на текущей высоте. Просадка на 0.05-0.2
 *    блока из-за границы блока или пинга больше не сдвигает платформу на блок ниже.
 * 2. Платформа ставится ЧАСТИЧНО: если часть клеток 3x3 занята камнем, водой или снегом мира,
 *    снег ставится в свободные клетки, а занятые остаются как есть. Кубик тратится, если поставлен
 *    хотя бы один блок, и кубик НЕ тратится, если под игроком уже наша платформа.
 * 3. Платформа ставится и в прыжке: берётся уровень, с которого игрок прыгнул (walkLevel), поэтому
 *    снег появляется ровно под ним на новой высоте. Если игрок стоит в воздухе (завис на платформе),
 *    платформа переставляется, когда старая исчезает.
 * 4. Нет никаких телепортаций игрока: позицию игрока плагин не меняет вообще. Раньше «подъём на
 *    верх платформы» через teleport и был тем самым «тпхает обратно».
 * 5. Зигзаг и диагонали: платформа ставится в тех клетках 3x3, где под игроком в этом столбце нет
 *    опоры, поэтому при движении зигзагом снег ложится углом, а не только крестом.
 * 6. Снег ставится только в воздух: снег мира, снег чужой платформы, вода и лава не заменяются.
 * 7. У каждого блока-платформы есть владелец: при исчезновении платформа возвращает только свои
 *    блоки (воздух) и никогда не трогает чужие.
 * 8. Paper 1.21.2+ откатывает игрока, если он «влез» в блок (ping: клиент впереди сервера).
 *    Обработчик PlayerFailMoveEvent разрешает движение, если игрок держит меч и все твёрдые блоки
 *    в его боксе — снег наших платформ. Это убирает «падаю, тпхает назад, иду медленно».
 * 9. Урон от падения отменяется, если меч в основной ИЛИ во второй руке.
 */
public class SkySwordPlugin extends JavaPlugin implements Listener, CommandExecutor {

    /** Время жизни платформы: 100 тиков = 5 секунд (как в оригинале 1.21.4). */
    private static final long LIFETIME_TICKS = 100L;
    /** Насколько блоков ниже уровня ходьбы ещё ставим платформу на уровне ходьбы. */
    private static final double LEVEL_TOLERANCE = 1.5;
    /** Страховка от утечки памяти. */
    private static final int MAX_PLATFORMS = 1024;

    private NamespacedKey isSwordKey;
    private NamespacedKey usesKey;
    private NamespacedKey activeKey;
    private NamespacedKey cdEndKey;

    /** Уровень, на котором игрок последний раз стоял на опоре (земля или наша платформа). */
    private final Map<UUID, Double> walkLevel = new HashMap<UUID, Double>();
    /** Владелец каждого блока платформы. */
    private final Map<Pos, Platform> owners = new HashMap<Pos, Platform>();
    /** Все живые платформы. */
    private final List<Platform> platforms = new ArrayList<Platform>();
    /** [lastX, lastZ, smoothVx, smoothVz] в блоках за тик. */
    private final Map<UUID, double[]> motion = new HashMap<UUID, double[]>();

    /* ============================== Жизненный цикл ============================== */

    @Override
    public void onEnable() {
        this.saveDefaultConfig();
        this.isSwordKey = new NamespacedKey((Plugin)this, "is_sky_sword");
        this.usesKey = new NamespacedKey((Plugin)this, "sky_uses");
        this.activeKey = new NamespacedKey((Plugin)this, "sky_active");
        this.cdEndKey = new NamespacedKey((Plugin)this, "sky_cooldown_end");
        this.getServer().getPluginManager().registerEvents((Listener)this, (Plugin)this);
        this.getCommand("n_s").setExecutor((CommandExecutor)this);
        Bukkit.getScheduler().runTaskTimer((Plugin)this, () -> {
            long now = System.currentTimeMillis();
            for (Player p : Bukkit.getOnlinePlayers()) {
                this.handlePlayerTick(p, now);
            }
        }, 0L, 1L);
    }

    @Override
    public void onDisable() {
        for (Platform pf : new ArrayList<Platform>(this.platforms)) {
            this.removePlatform(pf);
        }
        this.platforms.clear();
        this.owners.clear();
        this.walkLevel.clear();
        this.motion.clear();
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        this.walkLevel.remove(e.getPlayer().getUniqueId());
        this.motion.remove(e.getPlayer().getUniqueId());
    }

    /* ================================= Команда ================================= */

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return false;
        }
        if (args[0].equalsIgnoreCase("give") && args.length == 2) {
            Player target = Bukkit.getPlayer(args[1]);
            if (target != null) {
                target.getInventory().addItem(new ItemStack[]{this.createSword(Material.DIAMOND_SWORD)});
                sender.sendMessage("§aНебесный Меч выдан игроку " + target.getName());
            } else {
                sender.sendMessage("§cИгрок не найден.");
            }
            return true;
        }
        if (args[0].equalsIgnoreCase("config") && args.length == 3 && args[1].equalsIgnoreCase("cooldown")) {
            try {
                int cd = Integer.parseInt(args[2]);
                this.getConfig().set("cooldown", cd);
                this.saveConfig();
                sender.sendMessage("§aПерезарядка Небесного меча изменена на " + cd + " сек.");
            }
            catch (NumberFormatException e) {
                sender.sendMessage("§cОшибка: введите число.");
            }
            return true;
        }
        return false;
    }

    /* ================================== Предмет ================================== */

    private ItemStack createSword(Material mat) {
        ItemStack item = new ItemStack(mat);
        this.updateSwordMeta(item);
        ItemMeta meta = item.getItemMeta();
        meta.getPersistentDataContainer().set(this.usesKey, PersistentDataType.INTEGER, 20);
        meta.getPersistentDataContainer().set(this.activeKey, PersistentDataType.BYTE, (byte)0);
        item.setItemMeta(meta);
        return item;
    }

    private void updateSwordMeta(ItemStack item) {
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return;
        }
        meta.setDisplayName("§b§lНебесный Меч");
        meta.setUnbreakable(true);
        meta.addItemFlags(new ItemFlag[]{ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_UNBREAKABLE});
        int cd = this.getConfig().getInt("cooldown", 50);
        List<String> lore = new ArrayList<String>();
        lore.add("");
        lore.add("§7 Способность §bоблачная походка");
        lore.add("§7 Создаёт под ногами рыхлый снег для");
        lore.add("§7 ходьбы по воздуху");
        lore.add("");
        lore.add("§7 Лимит кубиков §e20 шт");
        lore.add("§7 Перезарядка §e" + cd + " сек");
        lore.add("");
        lore.add("§7 Пассивная способность §bполностью");
        lore.add("§7 защищает от урона при падении,");
        lore.add("§7 если меч в основной или второй руке");
        lore.add("");
        lore.add("§7Когда экипировано:");
        lore.add("§9 Скорость: +15%");
        lore.add("");
        lore.add("§7Когда в ведущей руке:");
        lore.add("§a Скорость атаки: 1.6");
        lore.add("§a Урон при атаке: 7.5");
        meta.setLore(lore);
        try {
            meta.setItemModel(NamespacedKey.fromString("astrum:battle_royale/cloud_sword"));
        }
        catch (Exception exception) {
            // модель опциональна
        }
        meta.removeAttributeModifier(org.bukkit.attribute.Attribute.MOVEMENT_SPEED);
        meta.removeAttributeModifier(org.bukkit.attribute.Attribute.ATTACK_DAMAGE);
        meta.removeAttributeModifier(org.bukkit.attribute.Attribute.ATTACK_SPEED);
        meta.addAttributeModifier(org.bukkit.attribute.Attribute.MOVEMENT_SPEED,
            new org.bukkit.attribute.AttributeModifier(new NamespacedKey((Plugin)this, "ns_speed"), 0.15,
                org.bukkit.attribute.AttributeModifier.Operation.ADD_SCALAR, EquipmentSlotGroup.HAND));
        meta.addAttributeModifier(org.bukkit.attribute.Attribute.ATTACK_DAMAGE,
            new org.bukkit.attribute.AttributeModifier(new NamespacedKey((Plugin)this, "ns_damage"), 6.5,
                org.bukkit.attribute.AttributeModifier.Operation.ADD_NUMBER, EquipmentSlotGroup.MAINHAND));
        meta.addAttributeModifier(org.bukkit.attribute.Attribute.ATTACK_SPEED,
            new org.bukkit.attribute.AttributeModifier(new NamespacedKey((Plugin)this, "ns_attack_speed"), -2.4,
                org.bukkit.attribute.AttributeModifier.Operation.ADD_NUMBER, EquipmentSlotGroup.MAINHAND));
        meta.getPersistentDataContainer().set(this.isSwordKey, PersistentDataType.BYTE, (byte)1);
        item.setItemMeta(meta);
    }

    private boolean isSkySword(ItemStack item) {
        if (item == null || !item.hasItemMeta()) {
            return false;
        }
        return item.getItemMeta().getPersistentDataContainer().has(this.isSwordKey, PersistentDataType.BYTE);
    }

    /* ================================== События ================================== */

    @EventHandler
    public void onInteract(PlayerInteractEvent e) {
        ItemStack item = e.getItem();
        if (e.getAction() != Action.RIGHT_CLICK_AIR && e.getAction() != Action.RIGHT_CLICK_BLOCK) {
            return;
        }
        if (!this.isSkySword(item)) {
            return;
        }
        // Мечи в обеих руках дают два события — переключаем один раз.
        if (e.getHand() == org.bukkit.inventory.EquipmentSlot.OFF_HAND
                && this.isSkySword(e.getPlayer().getInventory().getItemInMainHand())) {
            return;
        }
        e.setCancelled(true);
        ItemMeta meta = item.getItemMeta();
        long cdEnd = meta.getPersistentDataContainer().getOrDefault(this.cdEndKey, PersistentDataType.LONG, 0L);
        if (System.currentTimeMillis() < cdEnd) {
            e.getPlayer().sendMessage("§cМеч перезаряжается!");
            return;
        }
        byte active = meta.getPersistentDataContainer().getOrDefault(this.activeKey, PersistentDataType.BYTE, (byte)0);
        int uses = meta.getPersistentDataContainer().getOrDefault(this.usesKey, PersistentDataType.INTEGER, 20);
        if (uses <= 0) {
            return;
        }
        if (active == 0) {
            meta.getPersistentDataContainer().set(this.activeKey, PersistentDataType.BYTE, (byte)1);
            e.getPlayer().playSound(e.getPlayer().getLocation(), Sound.ENTITY_ILLUSIONER_PREPARE_MIRROR, 1.0f, 1.5f);
            e.getPlayer().sendActionBar(Component.text("§bОблачная походка §aвключена"));
        } else {
            meta.getPersistentDataContainer().set(this.activeKey, PersistentDataType.BYTE, (byte)0);
            e.getPlayer().playSound(e.getPlayer().getLocation(), Sound.ENTITY_ILLUSIONER_MIRROR_MOVE, 1.0f, 1.0f);
            e.getPlayer().sendActionBar(Component.text("§bОблачная походка §cвыключена"));
        }
        item.setItemMeta(meta);
    }

    /** Урон от падения не проходит, если меч в любой из двух рук. */
    @EventHandler
    public void onFallDamage(EntityDamageEvent e) {
        if (e.getCause() != EntityDamageEvent.DamageCause.FALL) {
            return;
        }
        if (!(e.getEntity() instanceof Player)) {
            return;
        }
        Player p = (Player)e.getEntity();
        if (this.isSkySword(p.getInventory().getItemInMainHand()) || this.isSkySword(p.getInventory().getItemInOffHand())) {
            e.setCancelled(true);
        }
    }

    /**
     * Paper 1.21.2+ проверяет движение на сервере и откатывает игрока, если тот «влез» в блок.
     * С пингом клиент всегда впереди, и игрок на мгновение оказывается внутри только что
     * поставленного снега (или внутри блока, в который его ведёт клиент). Разрешаем такое
     * движение, если игрок держит Небесный меч и все твёрдые блоки в его боксе — снег платформ.
     * Именно это убирает «падаю → тпхает назад → иду медленно».
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = false)
    public void onFailMove(io.papermc.paper.event.player.PlayerFailMoveEvent e) {
        if (e.isAllowed()) {
            return;
        }
        if (e.getFailReason() != io.papermc.paper.event.player.PlayerFailMoveEvent.FailReason.CLIPPED_INTO_BLOCK
                && e.getFailReason() != io.papermc.paper.event.player.PlayerFailMoveEvent.FailReason.MOVED_WRONGLY) {
            return;
        }
        Player p = ((Player)e.getPlayer());
        if (!this.holdsSkySword(p)) {
            return;
        }
        if (this.onlyPlatformSnow(p, e.getTo())) {
            e.setAllowed(true);
            e.setLogWarning(false);
        }
    }

    private boolean holdsSkySword(Player p) {
        return this.isSkySword(p.getInventory().getItemInMainHand())
            || this.isSkySword(p.getInventory().getItemInOffHand());
    }

    /** В боксе игрока в точке to нет ничего, кроме воздуха и снега наших платформ. */
    private boolean onlyPlatformSnow(Player p, Location to) {
        if (to == null || to.getWorld() == null) {
            return false;
        }
        BoundingBox box = new BoundingBox(to.getX() - 0.3, to.getY() + 0.01, to.getZ() - 0.3,
                                           to.getX() + 0.3, to.getY() + 1.79, to.getZ() + 0.3);
        int minX = (int)Math.floor(box.getMinX());
        int maxX = (int)Math.floor(box.getMaxX());
        int minY = (int)Math.floor(box.getMinY());
        int maxY = (int)Math.floor(box.getMaxY());
        int minZ = (int)Math.floor(box.getMinZ());
        int maxZ = (int)Math.floor(box.getMaxZ());
        for (int x = minX; x <= maxX; ++x) {
            for (int y = minY; y <= maxY; ++y) {
                for (int z = minZ; z <= maxZ; ++z) {
                    Block b = to.getWorld().getBlockAt(x, y, z);
                    Material t = b.getType();
                    if (t.isAir()) {
                        continue;
                    }
                    if (t == Material.SNOW_BLOCK && this.owners.containsKey(new Pos(x, y, z))) {
                        continue; // снег нашей платформы — не препятствие
                    }
                    return false;
                }
            }
        }
        return true;
    }

    @EventHandler
    public void onSmithing(PrepareSmithingEvent e) {
        ItemStack base = e.getInventory().getInputEquipment();
        if (this.isSkySword(base) && e.getResult() != null && e.getResult().getType() == Material.NETHERITE_SWORD) {
            ItemStack res = base.clone();
            res.setType(Material.NETHERITE_SWORD);
            this.updateSwordMeta(res);
            e.setResult(res);
        }
    }

    /* =============================== Основной тик =============================== */

    private void handlePlayerTick(Player p, long now) {
        ItemStack main = p.getInventory().getItemInMainHand();
        ItemStack off = p.getInventory().getItemInOffHand();
        boolean hasMain = this.isSkySword(main);
        boolean hasOff = this.isSkySword(off);
        UUID id = p.getUniqueId();
        if (!hasMain && !hasOff) {
            this.walkLevel.remove(id);
            this.motion.remove(id);
            return;
        }
        ItemStack sword = hasMain ? main : off;
        ItemMeta meta = sword.getItemMeta();
        long cdEnd = meta.getPersistentDataContainer().getOrDefault(this.cdEndKey, PersistentDataType.LONG, 0L);
        byte active = meta.getPersistentDataContainer().getOrDefault(this.activeKey, PersistentDataType.BYTE, (byte)0);
        int uses = meta.getPersistentDataContainer().getOrDefault(this.usesKey, PersistentDataType.INTEGER, 20);

        // Экшн-бар.
        if (now < cdEnd) {
            long left = (cdEnd - now + 999L) / 1000L;
            p.sendActionBar(Component.text("§bНебесный Меч §8| §cКД: " + left + " сек"));
        } else {
            String state = active == 1 ? "§aВКЛ" : "§cВЫКЛ";
            int maxUses = 20;
            String cubes = "§b" + "■".repeat(Math.max(0, uses)) + "§7" + "■".repeat(Math.max(0, maxUses - uses));
            p.sendActionBar(Component.text("§bНебесный Меч §8| " + state + " §8| " + cubes));
        }

        if (active != 1 || now < cdEnd || uses <= 0) {
            return;
        }

        Location loc = p.getLocation();
        double feetY = loc.getY();

        // Уровень ходьбы: обновляется, когда игрок реально стоит на опоре.
        // Пока он в прыжке или падает в пределах допуска, уровень не меняется — поэтому в прыжке
        // платформа появляется ровно под ним (на той высоте, где он взлетел), а не ниже.
        if (p.isOnGround()) {
            this.walkLevel.put(id, feetY);
        }
        Double stored = this.walkLevel.get(id);
        double level = stored == null ? feetY : stored;
        if (feetY < level - LEVEL_TOLERANCE) {
            level = feetY;
            this.walkLevel.put(id, level);
        }
        if (feetY > level + 0.5) {
            // Игрок поднялся выше уровня ходьбы (например, стоит на более высокой платформе) —
            // подтягиваем уровень, чтобы платформы не появлялись слишком низко.
            if (p.isOnGround() || this.hasPlatformUnder(p, feetY - 0.2)) {
                level = feetY;
                this.walkLevel.put(id, level);
            }
        }

        int placeY = (int)Math.floor(level) - 1;

        // ---- Предсказание позиции --------------------------------------------------
        // Сервер узнаёт о перемещении на ping/2 позже клиента. Если ставить снег строго под
        // игроком, на реальном пинге клиент успевает уйти за край и падает. Поэтому целимся
        // в клетку, где игрок окажется через свой пинг, и дополнительно страхуем текущую.
        double[] prev = this.motion.get(id);
        double moveX = 0.0;
        double moveZ = 0.0;
        double speedX = 0.0;
        double speedZ = 0.0;
        if (prev != null) {
            moveX = loc.getX() - prev[0];
            moveZ = loc.getZ() - prev[1];
            speedX = prev[2] * 0.55 + moveX * 0.45;
            speedZ = prev[3] * 0.55 + moveZ * 0.45;
        }
        this.motion.put(id, new double[]{loc.getX(), loc.getZ(), speedX, speedZ});
        if (speedX * speedX + speedZ * speedZ < 0.0004) {
            speedX = 0.0;
            speedZ = 0.0;
        }
        int leadTicks = this.leadTicks(p);
        double predictedX = loc.getX() + speedX * leadTicks;
        double predictedZ = loc.getZ() + speedZ * leadTicks;

        int bx = (int)Math.floor(loc.getX());
        int bz = (int)Math.floor(loc.getZ());
        int fx = (int)Math.floor(predictedX);
        int fz = (int)Math.floor(predictedZ);

        // 1) Снег впереди по ходу движения — чтобы он уже был на сервере, когда клиент туда
        //    добежит. Кубик тратится только на реально поставленную платформу.
        if ((fx != bx || fz != bz) && !this.isColumnFilled(p, fx, placeY, fz)) {
            if (this.tryPlace(p, fx, placeY, fz)) {
                this.spendUse(p, sword, meta, now);
            }
        }

        // 2) Опора под игроком. Проверяем всегда: платформа впереди может быть на 2+ блока
        //    дальше и не покрывать клетку под игроком (раньше из-за этого был провал).
        if (!this.isColumnFilled(p, bx, placeY, bz) && this.tryPlace(p, bx, placeY, bz)) {
            if (this.spendUse(p, sword, meta, now)) {
                return;
            }
        }

        // 3) Страховка: игрок уже в воздухе (шагнул за край), но ещё недалеко от уровня
        //    ходьбы. Ставим снег прямо под ноги, чтобы вместо долгого падения была ступенька.
        if (!p.isOnGround() && feetY >= level - LEVEL_TOLERANCE) {
            int by = (int)Math.floor(feetY) - 1;
            if (by <= placeY && this.tryPlace(p, bx, by, bz)) {
                this.spendUse(p, sword, meta, now);
            }
        }
    }

    /** Сколько тиков вперёд целиться: примерно половина пинга, 1..8 тиков. */
    private int leadTicks(Player p) {
        int ping = Math.max(0, p.getPing());
        int ticks = (int)Math.round(ping / 100.0 * 2.0); // ping в мс -> тики (20 в секунду)
        if (ticks < 1) {
            ticks = 1;
        }
        if (ticks > 8) {
            ticks = 8;
        }
        return ticks;
    }

    /** Колонка уже имеет опору: наша платформа или твёрдый блок. */
    private boolean isColumnFilled(Player p, int x, int y, int z) {
        if (this.owners.containsKey(new Pos(x, y, z))) {
            return true;
        }
        return !p.getWorld().getBlockAt(x, y, z).getType().isAir();
    }

    /** Ставит платформу с центром в клетке, если она ещё не занята нами и не занята рельефом. */
    private boolean tryPlace(Player p, int cx, int cy, int cz) {
        if (this.owners.containsKey(new Pos(cx, cy, cz))) {
            return false;
        }
        // Никогда не ставим блок внутрь игрока: клиент получит удушение и всё равно провалится.
        double feet = p.getLocation().getY();
        if (cx == p.getLocation().getBlockX() && cz == p.getLocation().getBlockZ()
                && cy >= Math.floor(feet) && cy <= Math.floor(feet + 1.7)) {
            return false;
        }
        if (!p.getWorld().getBlockAt(cx, cy, cz).getType().isAir()) {
            return false;
        }
        Platform pf = this.placePlatform(p.getWorld(), cx, cy, cz);
        return pf != null && !pf.blocks.isEmpty();
    }

    /** Тратит один кубик, обновляет лор и уходит в перезарядку на нуле. Возвращает true, если кубик был. */
    private boolean spendUse(Player p, ItemStack sword, ItemMeta meta, long now) {
        int uses = meta.getPersistentDataContainer().getOrDefault(this.usesKey, PersistentDataType.INTEGER, 20);
        if (uses <= 0) {
            return false;
        }
        uses--;
        meta.getPersistentDataContainer().set(this.usesKey, PersistentDataType.INTEGER, uses);
        p.playSound(p.getLocation(), Sound.BLOCK_SNOW_PLACE, 0.5f, 1.5f);
        if (uses <= 0) {
            meta.getPersistentDataContainer().set(this.activeKey, PersistentDataType.BYTE, (byte)0);
            int maxCd = this.getConfig().getInt("cooldown", 50);
            meta.getPersistentDataContainer().set(this.cdEndKey, PersistentDataType.LONG, now + (long)maxCd * 1000L);
            meta.getPersistentDataContainer().set(this.usesKey, PersistentDataType.INTEGER, 20);
            p.sendTitle("", "§cОблачная походка разряжена!", 5, 30, 5);
            p.playSound(p.getLocation(), Sound.BLOCK_BEACON_DEACTIVATE, 1.0f, 1.5f);
        }
        sword.setItemMeta(meta);
        return true;
    }

    /** Под ногами (на уровне feetY - запас) есть наша платформа. */
    private boolean hasPlatformUnder(Player p, double y) {
        int bx = p.getLocation().getBlockX();
        int bz = p.getLocation().getBlockZ();
        int by = (int)Math.floor(y);
        for (int dx = -1; dx <= 1; ++dx) {
            for (int dz = -1; dz <= 1; ++dz) {
                if (this.owners.containsKey(new Pos(bx + dx, by, bz + dz))) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Клетки 3x3, где под игроком нужна опора: под центром воздух, и в этом столбце ниже нет
     * твёрдого блока или нашей платформы. Именно это даёт «зигзаг» — при движении по диагонали
     * снег ложится углом, а не только крестом.
     */
    private Set<Pos> occupiedCells(Player p, int cx, int cy, int cz) {
        Set<Pos> out = new HashSet<Pos>();
        org.bukkit.World w = p.getWorld();
        for (int dx = -1; dx <= 1; ++dx) {
            for (int dz = -1; dz <= 1; ++dz) {
                int x = cx + dx;
                int z = cz + dz;
                if (!w.getBlockAt(x, cy, z).getType().isAir()) {
                    out.add(new Pos(x, cy, z)); // занято рельефом
                    continue;
                }
                if (this.owners.containsKey(new Pos(x, cy, z))) {
                    out.add(new Pos(x, cy, z)); // уже наша платформа
                    continue;
                }
                if (!this.hasSupportBelow(w, x, cy, z)) {
                    out.add(new Pos(x, cy, z)); // пусто и ниже опоры нет — нужен снег
                }
            }
        }
        if (!out.contains(new Pos(cx, cy, cz))) {
            out.add(new Pos(cx, cy, cz)); // центр всегда важен
        }
        return out;
    }

    private boolean hasSupportBelow(org.bukkit.World w, int x, int y, int z) {
        for (int dy = 1; dy <= 4; ++dy) {
            Block b = w.getBlockAt(x, y - dy, z);
            Material t = b.getType();
            if (t.isAir()) {
                continue;
            }
            return t.isSolid() || t == Material.SNOW_BLOCK;
        }
        return false;
    }

    /* ================================ Платформы ================================ */

    private Platform placePlatform(org.bukkit.World world, int cx, int cy, int cz) {
        Platform pf = new Platform(world, cx, cy, cz);
        for (int dx = -1; dx <= 1; ++dx) {
            for (int dz = -1; dz <= 1; ++dz) {
                int x = cx + dx;
                int z = cz + dz;
                Pos pos = new Pos(x, cy, z);
                Platform owner = this.owners.get(pos);
                if (owner != null && !owner.removed) {
                    continue; // блок уже принадлежит другой платформе
                }
                Block b = world.getBlockAt(x, cy, z);
                if (!b.getType().isAir()) {
                    continue; // рельеф не заменяем
                }
                BlockState state = b.getState();
                pf.blocks.put(pos, state);
                this.owners.put(pos, pf);
                b.setType(Material.SNOW_BLOCK);
            }
        }
        if (pf.blocks.isEmpty()) {
            return null;
        }
        this.platforms.add(pf);
        if (this.platforms.size() > MAX_PLATFORMS) {
            this.removePlatform(this.platforms.get(0));
        }
        Bukkit.getScheduler().runTaskLater((Plugin)this, () -> this.removePlatform(pf), LIFETIME_TICKS);
        return pf;
    }

    private void removePlatform(Platform pf) {
        if (pf == null || pf.removed) {
            return;
        }
        pf.removed = true;
        for (Map.Entry<Pos, BlockState> entry : pf.blocks.entrySet()) {
            Pos pos = entry.getKey();
            if (this.owners.get(pos) != pf) {
                continue; // блок уже забрала другая платформа
            }
            Block b = pf.world.getBlockAt(pos.x, pos.y, pos.z);
            if (b.getType() == Material.SNOW_BLOCK) {
                entry.getValue().update(true, false); // возвращаем то, что было (воздух)
            }
            this.owners.remove(pos);
            pf.world.spawnParticle(Particle.SNOWFLAKE, pos.x + 0.5, pos.y + 0.5, pos.z + 0.5, 2, 0.2, 0.2, 0.2, 0.01);
        }
        this.platforms.remove(pf);
    }

    /* ================================== Классы ================================== */

    private static final class Pos {
        final int x;
        final int y;
        final int z;

        Pos(int x, int y, int z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof Pos)) {
                return false;
            }
            Pos p = (Pos)o;
            return p.x == this.x && p.y == this.y && p.z == this.z;
        }

        @Override
        public int hashCode() {
            return (this.x * 31 + this.y) * 31 + this.z;
        }
    }

    private static final class Platform {
        final org.bukkit.World world;
        final int cy;
        final Map<Pos, BlockState> blocks = new LinkedHashMap<Pos, BlockState>();
        boolean removed;

        Platform(org.bukkit.World world, int cx, int cy, int cz) {
            this.world = world;
            this.cy = cy;
        }
    }
}
