/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.md_5.bungee.api.ChatMessageType
 *  net.md_5.bungee.api.chat.TextComponent
 *  org.bukkit.Bukkit
 *  org.bukkit.Material
 *  org.bukkit.NamespacedKey
 *  org.bukkit.Sound
 *  org.bukkit.command.Command
 *  org.bukkit.command.CommandSender
 *  org.bukkit.entity.Entity
 *  org.bukkit.entity.LivingEntity
 *  org.bukkit.entity.Player
 *  org.bukkit.event.EventHandler
 *  org.bukkit.event.Listener
 *  org.bukkit.event.block.Action
 *  org.bukkit.event.entity.EntityDamageEvent
 *  org.bukkit.event.entity.EntityDamageEvent$DamageCause
 *  org.bukkit.event.player.PlayerInteractEvent
 *  org.bukkit.event.player.PlayerItemHeldEvent
 *  org.bukkit.inventory.EquipmentSlot
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  org.bukkit.persistence.PersistentDataType
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.plugin.java.JavaPlugin
 *  org.bukkit.potion.PotionEffect
 *  org.bukkit.potion.PotionEffectType
 */
package ru.astrum.shadowblade;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import net.md_5.bungee.api.ChatMessageType;
import net.md_5.bungee.api.chat.TextComponent;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.NamespacedKey;
import org.bukkit.Sound;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.projectiles.ProjectileSource;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerItemHeldEvent;
import com.destroystokyo.paper.event.player.PlayerArmorChangeEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

public class ShadowBladePlugin
extends JavaPlugin
implements Listener {
    private NamespacedKey isShadowBladeKey;
    private NamespacedKey lastUsedKey;
    private final Set<UUID> activeInvis = new HashSet<UUID>();

    public void onEnable() {
        this.saveDefaultConfig();
        this.isShadowBladeKey = new NamespacedKey((Plugin)this, "is_shadow_blade");
        this.lastUsedKey = new NamespacedKey((Plugin)this, "last_used");
        this.getServer().getPluginManager().registerEvents((Listener)this, (Plugin)this);
        Bukkit.getScheduler().runTaskTimer((Plugin)this, () -> {
            for (Player p : Bukkit.getOnlinePlayers()) {
                if (this.activeInvis.contains(p.getUniqueId())) {
                    if (!p.hasPotionEffect(PotionEffectType.INVISIBILITY)) {
                        this.removeInvisibility(p);
                    } else {
                        this.hideEquipment(p);
                        this.spawnSmoke(p);
                    }
                }
                this.checkAndShowCooldown(p, p.getInventory().getItemInMainHand());
                if (this.isShadowBlade(p.getInventory().getItemInMainHand())) continue;
                this.checkAndShowCooldown(p, p.getInventory().getItemInOffHand());
            }
        }, 0L, 1L);
    }

    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return false;
        }
        if (args[0].equalsIgnoreCase("give") && args.length >= 2) {
            if (!sender.hasPermission("shadowblade.admin")) {
                return true;
            }
            Player target = Bukkit.getPlayer((String)args[1]);
            if (target != null) {
                target.getInventory().addItem(new ItemStack[]{this.createShadowBlade()});
                sender.sendMessage("\u00a7a\u0422\u0435\u043d\u0435\u0432\u043e\u0439 \u043a\u043b\u0438\u043d\u043e\u043a \u0432\u044b\u0434\u0430\u043d " + target.getName());
            } else {
                sender.sendMessage("\u00a7c\u0418\u0433\u0440\u043e\u043a \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.");
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
                sender.sendMessage("\u00a7a\u041a\u0443\u043b\u0434\u0430\u0443\u043d \u0438\u0437\u043c\u0435\u043d\u0435\u043d \u043d\u0430 " + newCd + " \u0441\u0435\u043a. \u041b\u043e\u0440 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d \u0443 \u0432\u0441\u0435\u0445 \u043e\u043d\u043b\u0430\u0439\u043d \u0438\u0433\u0440\u043e\u043a\u043e\u0432.");
            }
            catch (NumberFormatException e) {
                sender.sendMessage("\u00a7c\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0447\u0438\u0441\u043b\u043e \u0434\u043b\u044f \u043a\u0443\u043b\u0434\u0430\u0443\u043d\u0430.");
            }
            return true;
        }
        return false;
    }

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
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return;
        }
        long lastUsed = (Long)meta.getPersistentDataContainer().getOrDefault(this.lastUsedKey, PersistentDataType.LONG, 0L);
        int cooldownSec = this.getConfig().getInt("cooldown", 45);
        long now = System.currentTimeMillis();
        if (now - lastUsed < (long)cooldownSec * 1000L) {
            return;
        }
        meta.getPersistentDataContainer().set(this.lastUsedKey, PersistentDataType.LONG, now);
        item.setItemMeta(meta);
        p.addPotionEffect(new PotionEffect(PotionEffectType.SPEED, 200, 2, false, false));
        p.addPotionEffect(new PotionEffect(PotionEffectType.INVISIBILITY, 200, 0, false, false));
        p.playSound(p.getLocation(), Sound.ENTITY_ILLUSIONER_MIRROR_MOVE, 1.0f, 1.0f);
        this.activeInvis.add(p.getUniqueId());
        Bukkit.getScheduler().runTaskLater((Plugin)this, () -> this.hideEquipment(p), 1L);
    }

    @EventHandler
    public void onItemSwitch(PlayerItemHeldEvent e) {
        if (this.activeInvis.contains(e.getPlayer().getUniqueId())) {
            Bukkit.getScheduler().runTaskLater((Plugin)this, () -> this.hideEquipment(e.getPlayer()), 1L);
        }
    }

    @EventHandler
    public void onArmorSwitch(PlayerArmorChangeEvent e) {
        if (this.activeInvis.contains(e.getPlayer().getUniqueId())) {
            Bukkit.getScheduler().runTaskLater((Plugin)this, () -> this.hideEquipment(e.getPlayer()), 1L);
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
            this.restoreEquipment(p);
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
        meta.setDisplayName("\u00a75\u0422\u0435\u043d\u0435\u0432\u043e\u0439 \u041a\u043b\u0438\u043d\u043e\u043a");
        meta.setUnbreakable(true);
        try {
            NamespacedKey modelKey = NamespacedKey.fromString((String)"astrum:battle_royale/shadow_blade");
            if (modelKey != null) {
                meta.setItemModel(modelKey);
            }
        }
        catch (Exception modelKey) {
            // empty catch block
        }
        int cd = this.getConfig().getInt("cooldown", 45);
        ArrayList<String> lore = new ArrayList<String>();
        lore.add("\u00a78 ");
        lore.add("\u00a7f \u0421\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c \u00a75\u0443\u0445\u043e\u0434 \u0432 \u0442\u0435\u043d\u044c");
        lore.add("\u00a77 \u0414\u0430\u0435\u0442 \u043d\u0435\u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c \u0438 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u044c");
        lore.add("\u00a77 \u0411\u0440\u043e\u043d\u044f \u0438 \u043e\u0440\u0443\u0436\u0438\u0435 \u0441\u043a\u0440\u044b\u0432\u0430\u044e\u0442\u0441\u044f");
        lore.add("\u00a77 \u042d\u0444\u0444\u0435\u043a\u0442 \u0441\u043f\u0430\u0434\u0430\u0435\u0442 \u043f\u0440\u0438 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0438\u0438 \u0443\u0440\u043e\u043d\u0430");
        lore.add("\u00a78 ");
        lore.add("\u00a7c \u231b \u00a77\u0414\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u00a7e10 \u0441\u0435\u043a");
        lore.add("\u00a76 \u2742 \u00a77\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430 \u00a7e" + cd + " \u0441\u0435\u043a");
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

    private void spawnSmoke(Player p) {
        Location loc = p.getEyeLocation().add(0.0, 0.35, 0.0);
        p.getWorld().spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, loc, 1, 0.0, 0.0, 0.0, 0.0);
    }

    private void hideEquipment(Player p) {
        ItemStack air = new ItemStack(Material.AIR);
        for (Player online : Bukkit.getOnlinePlayers()) {
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HEAD, air);
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.CHEST, air);
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.LEGS, air);
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.FEET, air);
            if (online.equals((Object)p)) continue;
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HAND, air);
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.OFF_HAND, air);
        }
    }

    private void restoreEquipment(Player p) {
        for (Player online : Bukkit.getOnlinePlayers()) {
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HEAD, p.getInventory().getHelmet() != null ? p.getInventory().getHelmet() : new ItemStack(Material.AIR));
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.CHEST, p.getInventory().getChestplate() != null ? p.getInventory().getChestplate() : new ItemStack(Material.AIR));
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.LEGS, p.getInventory().getLeggings() != null ? p.getInventory().getLeggings() : new ItemStack(Material.AIR));
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.FEET, p.getInventory().getBoots() != null ? p.getInventory().getBoots() : new ItemStack(Material.AIR));
            if (online.equals((Object)p)) continue;
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.HAND, p.getInventory().getItemInMainHand());
            online.sendEquipmentChange((LivingEntity)p, EquipmentSlot.OFF_HAND, p.getInventory().getItemInOffHand());
        }
    }

    private void checkAndShowCooldown(Player p, ItemStack item) {
        int cdSeconds;
        if (!this.isShadowBlade(item)) {
            return;
        }
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return;
        }
        long lastUsed = (Long)meta.getPersistentDataContainer().getOrDefault(this.lastUsedKey, PersistentDataType.LONG, 0L);
        long timeLeft = lastUsed + (long)(cdSeconds = this.getConfig().getInt("cooldown", 45)) * 1000L - System.currentTimeMillis();
        if (timeLeft > 0L) {
            String formatted = String.format("%.1f", (double)timeLeft / 1000.0);
            p.spigot().sendMessage(ChatMessageType.ACTION_BAR, TextComponent.fromLegacyText((String)("\u00a7c\u23f3 \u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430 \u043a\u043b\u0438\u043d\u043a\u0430: \u00a7e" + formatted + " \u0441\u0435\u043a.")));
        } else if (timeLeft > -2000L && timeLeft <= 0L) {
            p.spigot().sendMessage(ChatMessageType.ACTION_BAR, TextComponent.fromLegacyText((String)"\u00a7a\u2728 \u0422\u0435\u043d\u0435\u0432\u043e\u0439 \u043a\u043b\u0438\u043d\u043e\u043a \u0433\u043e\u0442\u043e\u0432 \u043a \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044e!"));
        }
    }
}

