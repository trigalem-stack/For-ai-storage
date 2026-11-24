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

/*
 * Небесный меч (SkySword) — Paper 1.21.11.
 *
 * Механика оригинала 1.21.4 сохранена: ПКМ включает/выключает способность, каждый тик
 * проверяется блок под ногами — если это воздух, под игроком ставится платформа 3x3 из снега.
 * Одна платформа = один кубик, всего 20 кубиков, после них перезарядка 50 секунд.
 * Платформа живёт 100 тиков (5 секунд) — как в плагине 1.21.4.
 *
 * Что переписано по сравнению с оригиналом/портом (баги, из-за которых игрок проваливался):
 *  1. Платформа ставится на уровне, на котором игрок шёл (walkLevel), а не на уровне его
 *     текущей высоты. Иначе, как только игрок чуть-чуть просел (на 0.2 блока из-за границы
 *     блока или задержки пакетов), платформа ставилась на блок ниже — и игрок проваливался
 *     на 1 блок, потом ещё на 1 и т.д.
 *  2. Новая платформа не ставится, если под центром игрока уже есть наша платформа —
 *     поэтому кубики не тратятся впустую, пока игрок идёт по платформе.
 *  3. Кубик тратится ТОЛЬКО когда платформа реально поставлена: если под ногами блок,
 *     вода или лава — ничего не ставится и ничего не тратится.
 *  4. Каждая платформа помнит, какие блоки она заменила, и при исчезновении восстанавливает
 *     именно их. У каждого блока-платформы есть владелец, поэтому чужие платформы никогда
 *     не удаляются и не восстанавливаются чужой платформой. Ставится снег только в воздух,
 *     так что обычный снег мира (и любой другой блок) невозможно испортить.
 *  5. Урон от падения отменяется, если меч в основной ИЛИ во второй руке (в оригинале — только
 *     в основной).
 */
public class SkySwordPlugin extends JavaPlugin implements Listener, CommandExecutor {

    /** Время жизни платформы: 100 тиков = 5 секунд (как в оригинале 1.21.4). */
    private static final long LIFETIME_TICKS = 100L;
    /** Насколько блоков ниже уровня ходьбы ещё ставим платформу на уровне ходьбы. */
    private static final double LEVEL_TOLERANCE = 1.0;
    /** Страховка от утечки памяти. */
    private static final int MAX_PLATFORMS = 1024;

    private NamespacedKey isSwordKey;
    private NamespacedKey usesKey;
    private NamespacedKey activeKey;
    private NamespacedKey cdEndKey;

    /** Уровень, на котором игрок последний раз стоял на земле/платформе. */
    private final Map<UUID, Double> walkLevel = new HashMap<UUID, Double>();
    /** Владелец каждого блока платформы. */
    private final Map<Pos, Platform> owners = new HashMap<Pos, Platform>();
    /** Все живые платформы. */
    private final List<Platform> platforms = new ArrayList<Platform>();

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
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        this.walkLevel.remove(e.getPlayer().getUniqueId());
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
            // модель опциональна — если ключ невалидный, просто не ставим
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
        // Если мечи в обеих руках, событие приходит дважды (по одному на руку) — переключаем один раз.
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

        // Уровень ходьбы обновляется, только когда игрок реально стоит на поверхности
        // (на земле или на нашей платформе). Пока он в прыжке/падении — уровень не меняется,
        // поэтому платформа всегда появляется ровно там, где он шёл, а не на блок ниже.
        if (p.isOnGround()) {
            this.walkLevel.put(id, feetY);
        }
        Double stored = this.walkLevel.get(id);
        double level = stored == null ? feetY : stored;
        // Если игрок оказался более чем на блок ниже уровня ходьбы (например, упал до включения
        // способности) — пересчитываем уровень, чтобы платформы не появлялись над головой.
        if (feetY < level - LEVEL_TOLERANCE) {
            level = feetY;
            this.walkLevel.put(id, level);
        }

        int bx = loc.getBlockX();
        int bz = loc.getBlockZ();
        int placeY = (int)Math.floor(level) - 1;
        Block under = p.getWorld().getBlockAt(bx, placeY, bz);

        // Если под игроком не воздух (блок, вода, лава) — ничего не ставим и кубик не тратим.
        if (!under.getType().isAir()) {
            return;
        }
        // Под игроком уже наша платформа — тоже ничего не ставим и не тратим.
        if (this.owners.containsKey(new Pos(bx, placeY, bz))) {
            return;
        }

        Platform pf = this.placePlatform(p.getWorld(), bx, placeY, bz);
        if (pf == null) {
            return; // некуда ставить — кубик не тратим
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

        // Если игрок оказался внутри только что поставленной платформы (например, из-за
        // задержки пакетов его позиция уже ниже) — аккуратно поднимаем его на верх платформы.
        if (feetY < pf.topY - 0.05 && pf.topY - feetY <= LEVEL_TOLERANCE) {
            p.teleport(new Location(loc.getWorld(), loc.getX(), pf.topY, loc.getZ(), loc.getYaw(), loc.getPitch()));
            p.setFallDistance(0.0f);
        }
    }

    /* ================================ Платформы ================================ */

    private Platform placePlatform(org.bukkit.World world, int cx, int cy, int cz) {
        Platform pf = new Platform(world, cx, cy, cz);
        boolean placedAny = false;
        for (int dx = -1; dx <= 1; ++dx) {
            for (int dz = -1; dz <= 1; ++dz) {
                int x = cx + dx;
                int z = cz + dz;
                Pos pos = new Pos(x, cy, z);
                Platform owner = this.owners.get(pos);
                if (owner != null && owner != pf && !owner.removed) {
                    continue; // блок уже принадлежит другой платформе — не отбираем
                }
                Block b = world.getBlockAt(x, cy, z);
                // Только воздух: снег мира, снег другой платформы, вода и т.д. не заменяются.
                if (!b.getType().isAir()) {
                    continue;
                }
                BlockState state = b.getState();
                pf.blocks.put(pos, state);
                this.owners.put(pos, pf);
                b.setType(Material.SNOW_BLOCK);
                placedAny = true;
            }
        }
        if (!placedAny) {
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
                continue; // блок уже забрала другая платформа — он не наш
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
        final int topY;
        final Map<Pos, BlockState> blocks = new LinkedHashMap<Pos, BlockState>();
        boolean removed;

        Platform(org.bukkit.World world, int cx, int cy, int cz) {
            this.world = world;
            this.cy = cy;
            this.topY = cy + 1;
        }
    }
}
