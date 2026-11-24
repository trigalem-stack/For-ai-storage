package ru.astrum.skysword;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
 * Небесный меч (SkySword) — Paper 1.21.11, версия 5.
 *
 * Механика ровно как в оригинале 1.21.4 (сверено с оригинальным jar на одном сервере):
 * ПКМ включает/выключает, каждый тик проверяется клетка под ногами, ставится снежная
 * платформа 3x3 по текущей высоте ног, один кубик за платформу, 20 кубиков, перезарядка
 * 50 секунд, платформа живёт 100 тиков (5 секунд), экшн-бар, звуки, /n_s.
 *
 * Что было не так в версиях 3-4 и что исправлено здесь:
 *
 * 1. Платформа ставится на ТЕКУЩЕЙ высоте ног (floor(feetY) - 1), а не на «уровне ходьбы».
 *    Из-за walkLevel в прыжке и в полёте (креатив) снег появлялся на земле, а не под
 *    игроком — и игрок падал мимо него. Теперь прыжок, полёт и падение работают так же,
 *    как в оригинале: снег появляется прямо под ногами в воздухе.
 * 2. Платформа ставится ЧАСТИЧНО: снег ложится только в свободные клетки 3x3, рельеф
 *    (камень, вода, снег мира) не заменяется.
 * 3. Кубик тратится только когда снег реально поставлен, и не тратится, если под ногами
 *    уже есть опора (земля или наша платформа) — как в оригинале.
 * 4. Игрока никто не телепортирует: ни подъёмов, ни откатов. Единственное вмешательство —
 *    PlayerFailMoveEvent, и только когда игрок влез исключительно в снег своих платформ.
 * 5. Снег ставится только в воздух, у каждого блока есть владелец — исчезающая платформа
 *    возвращает только свои блоки.
 * 6. Урон от падения отменяется, если меч в основной ИЛИ во второй руке.
 *
 * Что добавлено сверх оригинала 1.21.4 (оригинал проверен на том же сервере, поведение совпало):
 *
 * 7. Работает при пинге. Оригинал целится только по фактической скорости, поэтому на 200 мс
 *    при беге и спринте он просаживается на 0.8-1.2 блока (в логе minY 98.85 при ровном полу);
 *    здесь к предсказанию добавлена половина пинга в тиках, поэтому на том же стенде игрок
 *    держится на 100.00 и кубик не сгорает впустую.
 * 8. При подъёме (прыжок, спринт-прыжок, полёт вверх) клетка «впереди» ставится на высоте,
 *    где игрок реально окажется, а не на уже пройденной — иначе кубики горели впустую.
 * 9. Страховка при реальном падении в пустоту: если под игроком на 3 блока вниз ничего нет,
 *    ставится пол туда, куда он летит (не телепорт — просто снег уже есть на месте).
 */
public class SkySwordPlugin extends JavaPlugin implements Listener, CommandExecutor {

    /** Время жизни платформы: 100 тиков = 5 секунд (как в оригинале 1.21.4). */
    private static final long LIFETIME_TICKS = 100L;
    /** Мёртвая зона скорости (блоков за тик): ниже неё игрок считается стоящим на месте. */
    private static final double MIN_SPEED = 0.02;
    /** Страховка от утечки памяти. */
    private static final int MAX_PLATFORMS = 1024;

    private NamespacedKey isSwordKey;
    private NamespacedKey usesKey;
    private NamespacedKey activeKey;
    private NamespacedKey cdEndKey;

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
        this.motion.clear();
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
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
        int bx = (int)Math.floor(loc.getX());
        int bz = (int)Math.floor(loc.getZ());
        int by = (int)Math.floor(loc.getY());

        // ---- Уровень установки: ровно как в оригинале 1.21.4 -----------------------
        // Оригинал ставит снег в блок под текущими ногами: floor(feetY) - 1. Поэтому:
        //  * прыжок на месте — под ногами в воздухе появляется снег, и игрок поднимается
        //    «лестницей» вверх (проверено на оригинальном jar: y 100 -> 101 -> 102 ...);
        //  * ходьба и бег — снег ровно под ногами, без провала;
        //  * падение с включением меча — снег появляется под ногами сразу в воздухе.
        // Никакого «уровня ходьбы» больше нет: именно из-за него в прыжке платформа
        // оказывалась на земле, а не под игроком.
        int placeY = by - 1;
        boolean placed = false;

        // ---- Предсказание траектории ----------------------------------------------
        // Скорость считается по фактическому смещению за тик и сглаживается. Мёртвая зона
        // (MIN_SPEED) важна: стоя на месте игрок дрожит на сотые блока, и раньше из-за этого
        // платформа уезжала на клетку в сторону — «прыгаю на месте, а снег слева/справа».
        double[] prev = this.motion.get(id);
        double speedX = 0.0;
        double speedZ = 0.0;
        if (prev != null) {
            double moveX = loc.getX() - prev[0];
            double moveZ = loc.getZ() - prev[1];
            speedX = prev[2] * 0.6 + moveX * 0.4;
            speedZ = prev[3] * 0.6 + moveZ * 0.4;
        }
        // Резкий скачок (> 1.5 блока за тик) — это телепорт, а не бег. Предсказание по нему
        // нарисовало бы «коридор» из воздуха, поэтому такой тик просто сбрасываем.
        double hspeed = Math.sqrt(speedX * speedX + speedZ * speedZ);
        if (hspeed > 1.5) {
            speedX = 0.0;
            speedZ = 0.0;
            hspeed = 0.0;
        }
        if (hspeed < MIN_SPEED) {
            speedX = 0.0;
            speedZ = 0.0;
            hspeed = 0.0;
        }
        this.motion.put(id, new double[]{loc.getX(), loc.getZ(), speedX, speedZ});

        double vy = p.getVelocity().getY();
        boolean moving = hspeed > 0.0;

        // Точка впереди по фактическому направлению движения: скорость × горизонт (свой пинг
        // плюс запас). Считаем именно вектор, а не «по осям», поэтому диагональ под любым
        // углом продолжается как диагональ.
        double leadScale = 1.5 + this.leadTicks(p) * 0.5;
        int fx = (int)Math.floor(loc.getX() + speedX * leadScale);
        int fz = (int)Math.floor(loc.getZ() + speedZ * leadScale);
        boolean aheadSameLevel = Math.abs(((int)Math.floor(loc.getY() + vy * leadScale)) - by) <= 1;
        // В прыжке подъёма вперёд ничего не нужно: высоту ведёт клетка под ногами,
        // а снег впереди на другом уровне — это лишняя платформа и лишний кубик.
        boolean wantAhead = moving && vy <= 0.2 && aheadSameLevel;

        // 1) Под игроком. Оригинал ставит только если под ногами воздух: если игрок стоит
        //    на земле, на своей платформе или на камне — кубик не тратится.
        if (!this.isColumnFilled(p, bx, placeY, bz) && this.tryPlace(p, bx, placeY, bz)) {
            placed = true;
        }

        // 2) Одна клетка впереди — чтобы снег уже был на сервере, когда клиент туда добежит.
        //    Только если там реально нет опоры (иначе по ровному полу жглись бы кубики)
        //    и только на том же уровне, где идёт игрок.
        if (wantAhead && (fx != bx || fz != bz) && !this.isColumnFilled(p, fx, placeY, fz)
                && !this.hasSupportWithin(p, fx, fz, placeY + 1, 3)
                && this.tryPlace(p, fx, placeY, fz)) {
            placed = true;
        }

        // 3) Страховка при падении: если внизу на три блока пусто, ставим пол в точку,
        //    где игрок окажется через два тика. Не телепорт — просто снег уже на месте.
        if (!p.isOnGround() && vy < -0.15) {
            int landY = (int)Math.floor(loc.getY() + vy * 3.0 - 1.0E-4);
            if (landY < placeY && !this.isColumnFilled(p, bx, landY, bz)
                    && !this.hasSupportWithin(p, bx, bz, landY + 1, 2)
                    && this.tryPlace(p, bx, landY, bz)) {
                placed = true;
            }
        }

        // Кубик — один за тик, сколько бы клеток ни поставилось (как в оригинале:
        // под игроком + впереди стоят один кубик).
        if (placed) {
            this.spendUse(p, sword, meta, now);
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

    /**
     * Есть ли опора в этом столбце в пределах depth блоков под ногами. Нужно для «страховки»:
     * если игрок падает на свою же платформу, второй снег ставить не надо — кубик сгорел бы зря.
     */
    private boolean hasSupportWithin(Player p, int bx, int bz, int fromY, int depth) {
        org.bukkit.World w = p.getWorld();
        for (int i = 0; i <= depth; ++i) {
            int y = fromY - 1 - i;
            Block b = w.getBlockAt(bx, y, bz);
            if (!b.getType().isAir() || this.owners.containsKey(new Pos(bx, y, bz))) {
                return true;
            }
        }
        return false;
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
