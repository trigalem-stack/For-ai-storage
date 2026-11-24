/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.kyori.adventure.text.Component
 *  org.bukkit.Bukkit
 *  org.bukkit.FluidCollisionMode
 *  org.bukkit.Location
 *  org.bukkit.Material
 *  org.bukkit.NamespacedKey
 *  org.bukkit.Sound
 *  org.bukkit.block.Block
 *  org.bukkit.command.Command
 *  org.bukkit.command.CommandExecutor
 *  org.bukkit.command.CommandSender
 *  org.bukkit.entity.Player
 *  org.bukkit.event.EventHandler
 *  org.bukkit.event.Listener
 *  org.bukkit.event.block.Action
 *  org.bukkit.event.player.PlayerInteractEvent
 *  org.bukkit.inventory.ItemFlag
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  org.bukkit.persistence.PersistentDataType
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.plugin.java.JavaPlugin
 *  org.bukkit.util.RayTraceResult
 *  org.bukkit.util.Vector
 */
package ru.astrum.dragonkatana;

import java.util.ArrayList;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.FluidCollisionMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.BoundingBox;
import org.bukkit.util.Vector;

public class DragonKatanaPlugin
extends JavaPlugin
implements Listener,
CommandExecutor {
    private NamespacedKey isKatanaKey;
    private NamespacedKey lastUseKey;

    public void onEnable() {
        this.saveDefaultConfig();
        this.isKatanaKey = new NamespacedKey((Plugin)this, "is_dragon_katana");
        this.lastUseKey = new NamespacedKey((Plugin)this, "dk_last_use");
        this.getServer().getPluginManager().registerEvents((Listener)this, (Plugin)this);
        this.getCommand("d_k").setExecutor((CommandExecutor)this);
        Bukkit.getScheduler().runTaskTimer((Plugin)this, this::displayCooldownTask, 0L, 2L);
    }

    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return false;
        }
        if (args[0].equalsIgnoreCase("give") && args.length == 2) {
            Player target = Bukkit.getPlayer((String)args[1]);
            if (target != null) {
                target.getInventory().addItem(new ItemStack[]{this.createKatana()});
                sender.sendMessage("\u00a7a\u041a\u0430\u0442\u0430\u043d\u0430 \u0414\u0440\u0430\u043a\u043e\u043d\u0430 \u0432\u044b\u0434\u0430\u043d\u0430 \u0438\u0433\u0440\u043e\u043a\u0443 " + target.getName());
            } else {
                sender.sendMessage("\u00a7c\u0418\u0433\u0440\u043e\u043a \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.");
            }
            return true;
        }
        if (args[0].equalsIgnoreCase("config") && args.length == 3 && args[1].equalsIgnoreCase("cooldown")) {
            try {
                int cd = Integer.parseInt(args[2]);
                this.getConfig().set("cooldown", cd);
                this.saveConfig();
                sender.sendMessage("\u00a7a\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430 \u041a\u0430\u0442\u0430\u043d\u044b \u0414\u0440\u0430\u043a\u043e\u043d\u0430 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0430 \u043d\u0430 " + cd + " \u0441\u0435\u043a.");
                this.updateAllKatanasOnline();
            }
            catch (NumberFormatException e) {
                sender.sendMessage("\u00a7c\u041e\u0448\u0438\u0431\u043a\u0430: \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0447\u0438\u0441\u043b\u043e.");
            }
            return true;
        }
        return false;
    }

    private void updateAllKatanasOnline() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            boolean updated = false;
            for (ItemStack item : p.getInventory().getContents()) {
                if (!this.isKatana(item)) continue;
                this.updateLore(item);
                updated = true;
            }
            if (!updated) continue;
            p.updateInventory();
        }
    }

    private ItemStack createKatana() {
        ItemStack item = new ItemStack(Material.NETHERITE_SWORD);
        this.updateLore(item);
        ItemMeta meta = item.getItemMeta();
        meta.setUnbreakable(true);
        meta.addItemFlags(new ItemFlag[]{ItemFlag.HIDE_UNBREAKABLE});
        meta.getPersistentDataContainer().set(this.isKatanaKey, PersistentDataType.BYTE, (byte)1);
        meta.getPersistentDataContainer().set(this.lastUseKey, PersistentDataType.LONG, 0L);
        try {
            meta.setItemModel(NamespacedKey.fromString((String)"astrum:battle_royale/dragon_katana"));
        }
        catch (Exception exception) {
            // empty catch block
        }
        item.setItemMeta(meta);
        return item;
    }

    private void updateLore(ItemStack item) {
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return;
        }
        meta.setDisplayName("\u00a75\u00a7l\u041a\u0430\u0442\u0430\u043d\u0430 \u0414\u0440\u0430\u043a\u043e\u043d\u0430");
        int cd = this.getConfig().getInt("cooldown", 12);
        ArrayList<String> lore = new ArrayList<String>();
        lore.add("");
        lore.add("\u00a7f\ud83d\uddb1 \u0421\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c \u00a75\u0442\u0435\u043b\u0435\u043f\u043e\u0440\u0442\u0430\u0446\u0438\u044f");
        lore.add("\u00a77\u041c\u0433\u043d\u043e\u0432\u0435\u043d\u043d\u043e \u043f\u0435\u0440\u0435\u043c\u0435\u0449\u0430\u0435\u0442 \u043d\u0430 \u00a7e15 \u0431\u043b\u043e\u043a\u043e\u0432");
        lore.add("\u00a77\u0417\u0430\u0440\u044f\u0434\u043e\u0432: \u00a7e1");
        lore.add("");
        lore.add("\u00a7e\u23f1 \u00a77\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430 \u00a7e" + cd + " \u0441\u0435\u043a");
        meta.setLore(lore);
        item.setItemMeta(meta);
    }

    private boolean isKatana(ItemStack item) {
        if (item == null || !item.hasItemMeta()) {
            return false;
        }
        return item.getItemMeta().getPersistentDataContainer().has(this.isKatanaKey, PersistentDataType.BYTE);
    }

    private void displayCooldownTask() {
        long cdMs = (long)this.getConfig().getInt("cooldown", 12) * 1000L;
        long now = System.currentTimeMillis();
        for (Player p : Bukkit.getOnlinePlayers()) {
            ItemStack mainHand = p.getInventory().getItemInMainHand();
            ItemStack offHand = p.getInventory().getItemInOffHand();
            ItemStack katana = null;
            if (this.isKatana(mainHand)) {
                katana = mainHand;
            } else if (this.isKatana(offHand)) {
                katana = offHand;
            }
            if (katana == null) continue;
            ItemMeta meta = katana.getItemMeta();
            long lastUse = (Long)meta.getPersistentDataContainer().getOrDefault(this.lastUseKey, PersistentDataType.LONG, 0L);
            if (now < lastUse + cdMs) {
                long left = (lastUse + cdMs - now) / 1000L + 1L;
                p.sendActionBar((Component)Component.text((String)("\u00a7c\u041a\u0430\u0442\u0430\u043d\u0430 \u0414\u0440\u0430\u043a\u043e\u043d\u0430 \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0436\u0430\u0435\u0442\u0441\u044f: " + left + " \u0441\u0435\u043a.")));
                continue;
            }
            p.sendActionBar((Component)Component.text((String)"\u00a7a\u2728 \u041a\u0430\u0442\u0430\u043d\u0430 \u0414\u0440\u0430\u043a\u043e\u043d\u0430 \u0433\u043e\u0442\u043e\u0432\u0430 \u043a \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044e!"));
        }
    }

    @EventHandler
    public void onInteract(PlayerInteractEvent e) {
        if (e.getAction() != Action.RIGHT_CLICK_AIR && e.getAction() != Action.RIGHT_CLICK_BLOCK) {
            return;
        }
        ItemStack item = e.getItem();
        if (!this.isKatana(item)) {
            return;
        }
        e.setCancelled(true);
        Player p = e.getPlayer();
        ItemMeta meta = item.getItemMeta();
        long lastUse = (Long)meta.getPersistentDataContainer().getOrDefault(this.lastUseKey, PersistentDataType.LONG, 0L);
        long cdMs = (long)this.getConfig().getInt("cooldown", 12) * 1000L;
        long now = System.currentTimeMillis();
        if (now < lastUse + cdMs) {
            return;
        }
        Location dest = this.findTeleportSpot(p);
        if (dest == null) {
            return;
        }
        if (this.needsSneak(p.getWorld(), dest)) {
            p.setSneaking(true);
            p.setPose(org.bukkit.entity.Pose.SNEAKING);
        }
        p.teleport(dest);
        p.playSound(p.getLocation(), Sound.ENTITY_ENDERMAN_TELEPORT, 1.0f, 1.0f);
        meta.getPersistentDataContainer().set(this.lastUseKey, PersistentDataType.LONG, now);
        item.setItemMeta(meta);
    }

    private boolean needsSneak(World world, Location l) {
        int bx = l.getBlockX();
        int bz = l.getBlockZ();
        int by = l.getBlockY();
        for (int i = 0; i <= 2; ++i) {
            BoundingBox box = world.getBlockAt(bx, by + i, bz).getBoundingBox();
            if (box != null && box.getHeight() > 0.0 && box.getMinY() >= l.getY()) {
                return box.getMinY() - l.getY() < 2.0;
            }
        }
        return false;
    }

    private Location findTeleportSpot(Player p) {
        Location eye = p.getEyeLocation();
        Vector dir = eye.getDirection().normalize();
        World world = p.getWorld();
        double eyeHeight = p.getEyeHeight();
        double maxDist = 15.0;
        double step = 0.2;
        Location best = null;
        for (double d = step; d <= maxDist + 1.0E-6; d += step) {
            double x = eye.getX() + dir.getX() * d;
            double y = eye.getY() + dir.getY() * d - eyeHeight;
            double z = eye.getZ() + dir.getZ() * d;
            int bx = (int)Math.floor(x);
            int bz = (int)Math.floor(z);
            double headroom = this.freeHeight(world, bx, bz, y, 4);
            if (headroom < 0.95) {
                break;
            }
            best = new Location(world, (double)bx + 0.5, y, (double)bz + 0.5, eye.getYaw(), eye.getPitch());
        }
        if (best == null) {
            return null;
        }
        double top = this.groundTop(world, best.getBlockX(), best.getBlockZ(), best.getY());
        if (best.getY() - top < 1.0) {
            best.setY(top);
        }
        return best;
    }

    private double freeHeight(World world, int bx, int bz, double y, int maxUp) {
        int base = (int)Math.floor(y);
        for (int i = 0; i <= maxUp; ++i) {
            BoundingBox box = world.getBlockAt(bx, base + i, bz).getBoundingBox();
            if (box == null || box.getHeight() <= 0.0) continue;
            if (box.getMinY() >= y) {
                return box.getMinY() - y;
            }
            if (box.getMaxY() > y) {
                return 0.0;
            }
        }
        return (double)maxUp;
    }

    private double groundTop(World world, int bx, int bz, double y) {
        int base = (int)Math.floor(y);
        for (int i = 0; i >= -3; --i) {
            BoundingBox box = world.getBlockAt(bx, base + i, bz).getBoundingBox();
            if (box == null || box.getHeight() <= 0.0) continue;
            if (box.getMaxY() <= y + 0.001) {
                return box.getMaxY();
            }
        }
        return y;
    }
}
