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
import org.bukkit.block.BlockFace;
import org.bukkit.util.RayTraceResult;
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
        if (dest.distanceSquared(p.getLocation()) < 1.0) {
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
        return this.computeDestination(p.getWorld(), p.getEyeLocation());
    }

    /*
     * Destination for a blink along the eye direction (up to 15 blocks):
     *  - no block hit   -> 15 blocks ahead, feet = eye - eyeHeight (1.62), then settled onto the surface below;
     *  - top face hit   -> stand on top of the hit block;
     *  - bottom face    -> stand under the hit block (feet 1.8 below its bottom);
     *  - side face      -> stand in the column in front of the face. The feet go on the floor of that
     *                      column when the hit point is at most eyeHeight + 1 above it (looking at a
     *                      block that stands on the ground), otherwise at hit.y - eyeHeight (air);
     *                      aiming at the upper edge (<= 0.5 below the top) counts as "on top";
     *  - settle() lifts the feet onto the surface if they end up inside/too close to a block and
     *    refuses (null) when there is not enough head room.
     * The old version stepped along the eye ray and stopped as soon as the projected feet entered a
     * block, so looking at the ground / a nearby block produced no destination at all.
     */
    private Location computeDestination(World world, Location eye) {
        Vector dir = eye.getDirection().normalize();
        double eyeHeight = 1.62;
        RayTraceResult ray = world.rayTraceBlocks(eye, dir, 15.0, FluidCollisionMode.NEVER, true);
        Location feet;
        if (ray == null || ray.getHitPosition() == null || ray.getHitBlock() == null) {
            feet = eye.clone().add(dir.clone().multiply(15.0));
            feet.setY(feet.getY() - eyeHeight);
            return this.settle(world, feet);
        }
        Block hb = ray.getHitBlock();
        BlockFace face = ray.getHitBlockFace();
        Vector hit = ray.getHitPosition();
        BoundingBox hbb = hb.getBoundingBox();
        double hx = (double)hb.getX() + 0.5;
        double hz = (double)hb.getZ() + 0.5;
        Location dest;
        if (face == BlockFace.UP) {
            dest = new Location(world, hx, hbb.getMaxY(), hz, eye.getYaw(), eye.getPitch());
        } else if (face == BlockFace.DOWN) {
            dest = new Location(world, hx, hbb.getMinY() - 1.8, hz, eye.getYaw(), eye.getPitch());
        } else if (hit.getY() >= hbb.getMaxY() - 0.5) {
            Location onTop = this.settle(world, new Location(world, hx, hbb.getMaxY(), hz, eye.getYaw(), eye.getPitch()));
            if (onTop != null) {
                return onTop;
            }
            return this.settle(world, this.sideDestination(world, hb, face, hit, eye, eyeHeight));
        } else {
            return this.settle(world, this.sideDestination(world, hb, face, hit, eye, eyeHeight));
        }
        return this.settle(world, dest);
    }

    /* Column in front of the hit face: on its floor when the hit point is close above the floor, else in the air at hit height - eye height. */
    private Location sideDestination(World world, Block hb, BlockFace face, Vector hit, Location eye, double eyeHeight) {
        Block front = hb.getRelative(face);
        double floorTop = this.columnFloorTop(world, front.getX(), front.getZ(), hit.getY());
        double feetY = hit.getY() - eyeHeight;
        if (!Double.isNaN(floorTop) && floorTop <= hit.getY() + 0.01 && hit.getY() - floorTop <= eyeHeight + 1.0) {
            feetY = floorTop;
        }
        return new Location(world, (double)front.getX() + 0.5, feetY, (double)front.getZ() + 0.5, eye.getYaw(), eye.getPitch());
    }

    /* Top face of the first solid block in the column at or below y (up to 4 blocks down), NaN if none. */
    private double columnFloorTop(World world, int bx, int bz, double y) {
        int base = (int)Math.floor(y);
        for (int i = 0; i >= -4; --i) {
            BoundingBox box = world.getBlockAt(bx, base + i, bz).getBoundingBox();
            if (box == null || box.getHeight() <= 0.0) continue;
            return box.getMaxY();
        }
        return Double.NaN;
    }

    private Location settle(World world, Location feet) {
        if (feet == null) {
            return null;
        }
        int bx = feet.getBlockX();
        int bz = feet.getBlockZ();
        double y = feet.getY();
        BoundingBox inside = world.getBlockAt(bx, (int)Math.floor(y), bz).getBoundingBox();
        if (inside != null && inside.getHeight() > 0.0 && inside.getMinY() <= y && inside.getMaxY() > y) {
            y = inside.getMaxY();
        }
        double top = this.groundTop(world, bx, bz, y);
        if (y - top < 1.0) {
            y = top;
        }
        if (this.freeHeight(world, bx, bz, y, 4) < 0.95) {
            return null;
        }
        return new Location(world, (double)bx + 0.5, y, (double)bz + 0.5, feet.getYaw(), feet.getPitch());
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
            if (box.getMinY() <= y) {
                return box.getMaxY();
            }
        }
        return y;
    }
}
