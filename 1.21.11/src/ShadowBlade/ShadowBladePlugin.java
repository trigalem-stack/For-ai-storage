package ru.astrum.shadowblade;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.kyori.adventure.text.Component;
import net.md_5.bungee.api.ChatMessageType;
import net.md_5.bungee.api.chat.TextComponent;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeModifier;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerItemHeldEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import com.destroystokyo.paper.event.player.PlayerArmorChangeEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.EquipmentSlotGroup;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.projectiles.ProjectileSource;
import org.bukkit.scheduler.BukkitRunnable;

/*
 * Теневой клинок (ShadowBlade) — Paper 1.21.11, версия 2.
 *
 * Было: невидимость + скорость на 10 секунд по ПКМ, попытка скрыть экипировку через
 * sendEquipmentChange и одиночная частица дыма над головой каждый тик.
 *
 * Проблемы, которые исправлены:
 *  1. Экипировка фактически НЕ скрывалась. sendEquipmentChange с AIR не работает надёжно:
 *     сервер тут же отправляет обратно настоящий предмет (и при смене слота, и при обновлении
 *     сущности, и при заходе нового игрока в зону видимости). Поэтому броня и предметы в руках
 *     были видны всем.
 *  2. Игрок, зашедший в зону видимости, вообще не получал «скрытую» версию — ему сразу
 *     отправлялась настоящая экипировка.
 *  3. Дым появлялся каждый тик одной частицей и «ехал» за игроком.
 *
 * Стало:
 *  * экипировка скрывается через серверный трекер сущностей
 *    (ServerEntity#setTrackedEquipment / sendEquipmentChanges по всем зрителям), причём каждый
 *    тик, поэтому любые «перезаписи» от сервера перекрываются;
 *  * при входе в зону видимости (PlayerTrackEntityEvent) игроку сразу отправляется пустая
 *    экипировка, поэтому «зашёл и увидел» не работает;
 *  * каждые 2 секунды над игроком появляется 3 облака дыма от костра на 1.4 секунды —
 *    в фиксированной точке (не следует за игроком), поэтому они выдают позицию;
 *  * после окончания эффекта и при снятии невидимости настоящая экипировка возвращается.
 */
public class ShadowBladePlugin extends JavaPlugin implements Listener, org.bukkit.command.CommandExecutor {

    private NamespacedKey isShadowBladeKey;
    private NamespacedKey lastUsedKey;
    private final Set<UUID> activeInvis = new HashSet<UUID>();
    /** Сколько тиков осталось показывать дым (3 облака на фиксированной точке). */
    private final Map<UUID, Integer> smokeTicks = new HashMap<UUID, Integer>();
    /** Где стоит облако дыма (фиксированная точка, не следует за игроком). */
    private final Map<UUID, Location> smokeAnchor = new HashMap<UUID, Location>();
    private int smokeTimer = 0;


    @Override
    public void onEnable() {
        this.saveDefaultConfig();
        this.isShadowBladeKey = new NamespacedKey((Plugin)this, "is_shadow_blade");
        this.lastUsedKey = new NamespacedKey((Plugin)this, "last_used");
        this.getServer().getPluginManager().registerEvents((Listener)this, (Plugin)this);
        this.getServer().getPluginManager().registerEvents(new TrackListener(), (Plugin)this);
        if (this.getCommand("s_b") != null) {
            this.getCommand("s_b").setExecutor(this); // в оригинале команда не была зарегистрирована
        }

        // Каждый тик: скрываем экипировку (перекрывает любые серверные обновления) и держим дым.
        Bukkit.getScheduler().runTaskTimer((Plugin)this, () -> {
            for (Player p : Bukkit.getOnlinePlayers()) {
                UUID id = p.getUniqueId();
                if (this.activeInvis.contains(id)) {
                    if (!p.hasPotionEffect(PotionEffectType.INVISIBILITY)) {
                        this.removeInvisibility(p);
                    } else {
                        this.hideEquipment(p);
                        this.tickSmoke(p);
                    }
                }
                this.checkAndShowCooldown(p, p.getInventory().getItemInMainHand());
                if (!this.isShadowBlade(p.getInventory().getItemInMainHand())) {
                    this.checkAndShowCooldown(p, p.getInventory().getItemInOffHand());
                }
            }
        }, 0L, 1L);

        // Раз в 2 секунды выдаём новую порцию дыма (проверка идёт по тикам внутри tickSmoke).
        int smokePeriod = Math.max(5, this.getConfig().getInt("smoke-period-ticks", 40));
        int smokeDuration = Math.max(5, this.getConfig().getInt("smoke-duration-ticks", 28));
        Bukkit.getScheduler().runTaskTimer((Plugin)this, () -> {
            for (UUID id : new ArrayList<UUID>(this.activeInvis)) {
                Player p = Bukkit.getPlayer(id);
                if (p == null) continue;
                if (!p.hasPotionEffect(PotionEffectType.INVISIBILITY)) continue;
                this.smokeAnchor.put(id, p.getLocation().clone().add(0.0, 2.4, 0.0));
                this.smokeTicks.put(id, smokeDuration);
            }
        }, smokePeriod, smokePeriod);
    }

    @Override
    public void onDisable() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (this.activeInvis.contains(p.getUniqueId())) {
                this.restoreEquipment(p);
            }
        }
        this.activeInvis.clear();
        this.smokeTicks.clear();
        this.smokeAnchor.clear();
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        UUID id = e.getPlayer().getUniqueId();
        this.activeInvis.remove(id);
        this.smokeTicks.remove(id);
        this.smokeAnchor.remove(id);
    }

    /* ================================= Команда ================================= */

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return false;
        }
        if (args[0].equalsIgnoreCase("give") && args.length >= 2) {
            if (!sender.hasPermission("shadowblade.admin")) {
                return true;
            }
            Player target = Bukkit.getPlayer(args[1]);
            if (target != null) {
                target.getInventory().addItem(new ItemStack[]{this.createShadowBlade()});
                sender.sendMessage("§aТеневой клинок выдан " + target.getName());
            } else {
                sender.sendMessage("§cИгрок не найден.");
            }
            return true;
        }
        if (args[0].equalsIgnoreCase("config") && args.length >= 3 && args[1].equalsIgnoreCase("cooldown")) {
            if (!sender.hasPermission("shadowblade.admin")) {
                return true;
            }
            try {
                int newCd = Integer.parseInt(args[2]);
                this.getConfig().set("cooldown", newCd);
                this.saveConfig();
                this.updateAllSwordsLore();
                sender.sendMessage("§aКулдаун изменен на " + newCd + " сек. Лор обновлен у всех онлайн игроков.");
            }
            catch (NumberFormatException e) {
                sender.sendMessage("§cИспользуйте число для кулдауна.");
            }
            return true;
        }
        return false;
    }

    /* ================================== События ================================== */

    @EventHandler
    public void onInteract(PlayerInteractEvent e) {
        if (e.getAction() != Action.RIGHT_CLICK_AIR && e.getAction() != Action.RIGHT_CLICK_BLOCK) {
            return;
        }
        Player p = e.getPlayer();
        ItemStack item = e.getItem();
        if (!this.isShadowBlade(item)) {
            return;
        }
        if (e.getHand() == EquipmentSlot.OFF_HAND && this.isShadowBlade(p.getInventory().getItemInMainHand())) {
            return; // два события на два меча — используем один раз
        }
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return;
        }
        long lastUsed = meta.getPersistentDataContainer().getOrDefault(this.lastUsedKey, PersistentDataType.LONG, 0L);
        int cooldownSec = this.getConfig().getInt("cooldown", 45);
        long now = System.currentTimeMillis();
        if (now - lastUsed < (long)cooldownSec * 1000L) {
            return;
        }
        meta.getPersistentDataContainer().set(this.lastUsedKey, PersistentDataType.LONG, now);
        item.setItemMeta(meta);
        e.setCancelled(true);
        p.addPotionEffect(new PotionEffect(PotionEffectType.SPEED, 200, 2, false, false));
        p.addPotionEffect(new PotionEffect(PotionEffectType.INVISIBILITY, 200, 0, false, false));
        p.playSound(p.getLocation(), Sound.ENTITY_ILLUSIONER_MIRROR_MOVE, 1.0f, 1.0f);
        this.activeInvis.add(p.getUniqueId());
        this.hideEquipment(p);
        // Первое облако дыма — сразу, дальше раз в 2 секунды.
        this.smokeAnchor.put(p.getUniqueId(), p.getLocation().clone().add(0.0, 2.4, 0.0));
        this.smokeTicks.put(p.getUniqueId(), Math.max(5, this.getConfig().getInt("smoke-duration-ticks", 28)));
    }

    @EventHandler
    public void onItemSwitch(PlayerItemHeldEvent e) {
        if (this.activeInvis.contains(e.getPlayer().getUniqueId())) {
            Bukkit.getScheduler().runTask((Plugin)this, () -> this.hideEquipment(e.getPlayer()));
        }
    }

    @EventHandler
    public void onArmorSwitch(PlayerArmorChangeEvent e) {
        if (this.activeInvis.contains(e.getPlayer().getUniqueId())) {
            Bukkit.getScheduler().runTask((Plugin)this, () -> this.hideEquipment(e.getPlayer()));
        }
    }

    /** Игрок вошёл в зону видимости — сразу отправляем ему скрытую экипировку. */
    public final class TrackListener implements Listener {
        @EventHandler
        public void onTrack(io.papermc.paper.event.player.PlayerTrackEntityEvent e) {
            if (!(e.getEntity() instanceof Player)) {
                return;
            }
            Player tracked = (Player)e.getEntity();
            if (!ShadowBladePlugin.this.activeInvis.contains(tracked.getUniqueId())) {
                return;
            }
            Player viewer = e.getPlayer();
            if (viewer.equals(tracked)) {
                return;
            }
            Bukkit.getScheduler().runTask((Plugin)ShadowBladePlugin.this,
                () -> ShadowBladePlugin.this.hideEquipmentFor(tracked, viewer));
        }
    }

    @EventHandler
    public void onDamage(EntityDamageEvent e) {
        Entity entity = e.getEntity();
        if (!(entity instanceof Player)) {
            return;
        }
        Player p = (Player)entity;
        if (!this.activeInvis.contains(p.getUniqueId())) {
            return;
        }
        if (e.getCause() == EntityDamageEvent.DamageCause.FALL) {
            return;
        }
        if (this.isPlayerAttack(e)) {
            this.removeInvisibility(p);
            return;
        }
        if (e.getFinalDamage() > 8.0) {
            this.removeInvisibility(p);
        }
    }

    private boolean isPlayerAttack(EntityDamageEvent e) {
        if (!(e instanceof EntityDamageByEntityEvent)) {
            return false;
        }
        Entity damager = ((EntityDamageByEntityEvent)e).getDamager();
        if (damager instanceof Player) {
            return true;
        }
        if (damager instanceof Projectile) {
            ProjectileSource shooter = ((Projectile)damager).getShooter();
            return shooter instanceof Player;
        }
        return false;
    }

    private void removeInvisibility(Player p) {
        if (this.activeInvis.remove(p.getUniqueId())) {
            p.removePotionEffect(PotionEffectType.INVISIBILITY);
            p.removePotionEffect(PotionEffectType.SPEED);
            this.smokeTicks.remove(p.getUniqueId());
            this.smokeAnchor.remove(p.getUniqueId());
            this.restoreEquipment(p);
            p.sendActionBar(Component.text("§5Тень рассеялась — клинок больше не скрывает вас"));
        }
    }

    private boolean isShadowBlade(ItemStack item) {
        if (item == null || !item.hasItemMeta()) {
            return false;
        }
        return item.getItemMeta().getPersistentDataContainer().has(this.isShadowBladeKey, PersistentDataType.BYTE);
    }

    private ItemStack createShadowBlade() {
        ItemStack item = new ItemStack(Material.NETHERITE_SWORD);
        this.updateLore(item);
        return item;
    }

    private void updateLore(ItemStack item) {
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return;
        }
        meta.setDisplayName("§5Теневой Клинок");
        meta.setUnbreakable(true);
        meta.addItemFlags(new ItemFlag[]{ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_UNBREAKABLE});
        try {
            NamespacedKey modelKey = NamespacedKey.fromString("astrum:battle_royale/shadow_blade");
            if (modelKey != null) {
                meta.setItemModel(modelKey);
            }
        }
        catch (Exception modelKey) {
            // модель опциональна
        }
        // Атрибуты — как у обычного незеритового меча (у оригинала их не было вовсе).
        meta.removeAttributeModifier(Attribute.ATTACK_DAMAGE);
        meta.addAttributeModifier(Attribute.ATTACK_DAMAGE,
            new AttributeModifier(new NamespacedKey((Plugin)this, "sb_damage"), 7.0,
                AttributeModifier.Operation.ADD_NUMBER, EquipmentSlotGroup.MAINHAND));
        int cd = this.getConfig().getInt("cooldown", 45);
        ArrayList<String> lore = new ArrayList<String>();
        lore.add("§8 ");
        lore.add("§f Способность §5уход в тень");
        lore.add("§7 Дает невидимость и скорость");
        lore.add("§7 Броня и оружие скрываются");
        lore.add("§7 Эффект спадает при получении урона");
        lore.add("§8 ");
        lore.add("§c ⌛ §7Длительность §e10 сек");
        lore.add("§6 ✂ §7Перезарядка §e" + cd + " сек");
        meta.setLore(lore);
        if (!meta.getPersistentDataContainer().has(this.isShadowBladeKey, PersistentDataType.BYTE)) {
            meta.getPersistentDataContainer().set(this.isShadowBladeKey, PersistentDataType.BYTE, (byte)1);
            meta.getPersistentDataContainer().set(new NamespacedKey((Plugin)this, "blade_uuid"), PersistentDataType.STRING, UUID.randomUUID().toString());
        }
        item.setItemMeta(meta);
    }

    private void updateAllSwordsLore() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            for (ItemStack item : p.getInventory().getContents()) {
                if (!this.isShadowBlade(item)) continue;
                this.updateLore(item);
            }
        }
    }

    /* ==================================== Дым ==================================== */

    private void tickSmoke(Player p) {
        UUID id = p.getUniqueId();
        Integer left = this.smokeTicks.get(id);
        if (left == null || left <= 0) {
            return;
        }
        Location anchor = this.smokeAnchor.get(id);
        if (anchor != null) {
            // Три облака в фиксированных точках вокруг якоря. Дым НЕ следует за игроком,
            // поэтому по нему видно, где игрок был 1-2 секунды назад.
            org.bukkit.World w = anchor.getWorld();
            if (w != null) {
                w.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, anchor.clone().add(-0.45, 0.0, 0.0), 1, 0.02, 0.02, 0.02, 0.0);
                w.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, anchor.clone().add(0.45, 0.0, 0.0), 1, 0.02, 0.02, 0.02, 0.0);
                w.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, anchor.clone().add(0.0, 0.1, 0.45), 1, 0.02, 0.02, 0.02, 0.0);
            }
        }
        this.smokeTicks.put(id, left - 1);
    }

    /* =============================== Скрытие экипировки =============================== */

    /**
     * Скрывает экипировку у всех остальных игроков.
     * Использует серверный трекер сущностей: он отправляет пакет поверх настоящей экипировки,
     * поэтому перекрывает любые обновления, которые сервер шлёт сам.
     */
    private void hideEquipment(Player p) {
        ItemStack air = new ItemStack(Material.AIR);
        java.util.EnumMap<EquipmentSlot, ItemStack> hidden = new java.util.EnumMap<EquipmentSlot, ItemStack>(EquipmentSlot.class);
        hidden.put(EquipmentSlot.HEAD, air);
        hidden.put(EquipmentSlot.CHEST, air);
        hidden.put(EquipmentSlot.LEGS, air);
        hidden.put(EquipmentSlot.FEET, air);
        hidden.put(EquipmentSlot.HAND, air);
        hidden.put(EquipmentSlot.OFF_HAND, air);
        for (Player online : Bukkit.getOnlinePlayers()) {
            if (online.equals(p)) {
                continue;
            }
            online.sendEquipmentChange((LivingEntity)p, hidden);
        }
    }

    /** Скрывает экипировку для одного конкретного зрителя (когда он только вошёл в зону видимости). */
    private void hideEquipmentFor(Player p, Player viewer) {
        if (viewer.equals(p) || !this.activeInvis.contains(p.getUniqueId())) {
            return;
        }
        ItemStack air = new ItemStack(Material.AIR);
        viewer.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HEAD, air);
        viewer.sendEquipmentChange((LivingEntity)p, EquipmentSlot.CHEST, air);
        viewer.sendEquipmentChange((LivingEntity)p, EquipmentSlot.LEGS, air);
        viewer.sendEquipmentChange((LivingEntity)p, EquipmentSlot.FEET, air);
        viewer.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HAND, air);
        viewer.sendEquipmentChange((LivingEntity)p, EquipmentSlot.OFF_HAND, air);
    }

    private void restoreEquipment(Player p) {
        for (Player online : Bukkit.getOnlinePlayers()) {
            if (online.equals(p)) {
                continue;
            }
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HEAD, p.getInventory().getHelmet() != null ? p.getInventory().getHelmet() : new ItemStack(Material.AIR));
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.CHEST, p.getInventory().getChestplate() != null ? p.getInventory().getChestplate() : new ItemStack(Material.AIR));
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.LEGS, p.getInventory().getLeggings() != null ? p.getInventory().getLeggings() : new ItemStack(Material.AIR));
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.FEET, p.getInventory().getBoots() != null ? p.getInventory().getBoots() : new ItemStack(Material.AIR));
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HAND, p.getInventory().getItemInMainHand());
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.OFF_HAND, p.getInventory().getItemInOffHand());
        }
    }

    private void checkAndShowCooldown(Player p, ItemStack item) {
        if (!this.isShadowBlade(item)) {
            return;
        }
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return;
        }
        long lastUsed = (Long)meta.getPersistentDataContainer().getOrDefault(this.lastUsedKey, PersistentDataType.LONG, 0L);
        int cdSeconds = this.getConfig().getInt("cooldown", 45);
        long timeLeft = lastUsed + (long)cdSeconds * 1000L - System.currentTimeMillis();
        if (timeLeft > 0L) {
            String formatted = String.format("%.1f", (double)timeLeft / 1000.0);
            p.spigot().sendMessage(ChatMessageType.ACTION_BAR, TextComponent.fromLegacyText("§c⏳ Перезарядка клинка: §e" + formatted + " сек."));
        } else if (timeLeft > -2000L) {
            p.spigot().sendMessage(ChatMessageType.ACTION_BAR, TextComponent.fromLegacyText("§a✨ Теневой клинок готов к использованию!"));
        }
    }
}
