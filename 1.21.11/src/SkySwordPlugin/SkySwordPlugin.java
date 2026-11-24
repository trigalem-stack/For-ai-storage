/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.kyori.adventure.text.Component
 *  org.bukkit.Bukkit
 *  org.bukkit.Location
 *  org.bukkit.Material
 *  org.bukkit.NamespacedKey
 *  org.bukkit.Particle
 *  org.bukkit.Sound
 *  org.bukkit.attribute.Attribute
 *  org.bukkit.attribute.AttributeModifier
 *  org.bukkit.attribute.AttributeModifier$Operation
 *  org.bukkit.block.Block
 *  org.bukkit.command.Command
 *  org.bukkit.command.CommandExecutor
 *  org.bukkit.command.CommandSender
 *  org.bukkit.entity.Entity
 *  org.bukkit.entity.Player
 *  org.bukkit.event.EventHandler
 *  org.bukkit.event.Listener
 *  org.bukkit.event.block.Action
 *  org.bukkit.event.entity.EntityDamageEvent
 *  org.bukkit.event.entity.EntityDamageEvent$DamageCause
 *  org.bukkit.event.inventory.PrepareSmithingEvent
 *  org.bukkit.event.player.PlayerInteractEvent
 *  org.bukkit.event.player.PlayerQuitEvent
 *  org.bukkit.inventory.EquipmentSlotGroup
 *  org.bukkit.inventory.ItemFlag
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  org.bukkit.persistence.PersistentDataType
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.plugin.java.JavaPlugin
 */
package ru.astrum.skysword;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeModifier;
import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.inventory.PrepareSmithingEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.inventory.EquipmentSlotGroup;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.BoundingBox;
import org.bukkit.util.Vector;

public class SkySwordPlugin
extends JavaPlugin
implements Listener,
CommandExecutor {
    private NamespacedKey isSwordKey;
    private NamespacedKey usesKey;
    private NamespacedKey activeKey;
    private NamespacedKey cdEndKey;
    private final Map<UUID, Location> lastPlatformLoc = new HashMap<UUID, Location>();
    /* 0 vx, 1 vy, 2 vz (blocks/tick, smoothed), 3 last raw dy, 4 last move time ms */
    private final Map<UUID, double[]> track = new HashMap<UUID, double[]>();

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

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        this.lastPlatformLoc.remove(e.getPlayer().getUniqueId());
        this.track.remove(e.getPlayer().getUniqueId());
    }

    /*
     * Player#getVelocity() on the server is not updated by client movement (the server does not simulate
     * player physics), so we measure the real per-tick movement from move packets ourselves.
     */
    @EventHandler(ignoreCancelled = true, priority = EventPriority.MONITOR)
    public void onMove(PlayerMoveEvent e) {
        if (e instanceof PlayerTeleportEvent) {
            return;
        }
        Location from = e.getFrom();
        Location to = e.getTo();
        double dx = to.getX() - from.getX();
        double dy = to.getY() - from.getY();
        double dz = to.getZ() - from.getZ();
        if (Math.abs(dx) > 1.5 || Math.abs(dz) > 1.5 || Math.abs(dy) > 4.5) {
            return;
        }
        double[] t = this.track.computeIfAbsent(e.getPlayer().getUniqueId(), k -> new double[5]);
        t[0] = t[0] * 0.4 + dx * 0.6;
        t[1] = t[1] * 0.4 + dy * 0.6;
        t[2] = t[2] * 0.4 + dz * 0.6;
        t[3] = dy;
        t[4] = System.currentTimeMillis();
    }

    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return false;
        }
        if (args[0].equalsIgnoreCase("give") && args.length == 2) {
            Player target = Bukkit.getPlayer((String)args[1]);
            if (target != null) {
                target.getInventory().addItem(new ItemStack[]{this.createSword(Material.DIAMOND_SWORD)});
                sender.sendMessage("\u00a7a\u041d\u0435\u0431\u0435\u0441\u043d\u044b\u0439 \u041c\u0435\u0447 \u0432\u044b\u0434\u0430\u043d \u0438\u0433\u0440\u043e\u043a\u0443 " + target.getName());
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
                sender.sendMessage("\u00a7a\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430 \u041d\u0435\u0431\u0435\u0441\u043d\u043e\u0433\u043e \u043c\u0435\u0447\u0430 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0430 \u043d\u0430 " + cd + " \u0441\u0435\u043a.");
            }
            catch (NumberFormatException e) {
                sender.sendMessage("\u00a7c\u041e\u0448\u0438\u0431\u043a\u0430: \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0447\u0438\u0441\u043b\u043e.");
            }
            return true;
        }
        return false;
    }

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
        meta.setDisplayName("\u00a7b\u00a7l\u041d\u0435\u0431\u0435\u0441\u043d\u044b\u0439 \u041c\u0435\u0447");
        meta.setUnbreakable(true);
        meta.addItemFlags(new ItemFlag[]{ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_UNBREAKABLE});
        int cd = this.getConfig().getInt("cooldown", 50);
        ArrayList<String> lore = new ArrayList<String>();
        lore.add("");
        lore.add("\u00a77 \u0421\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c \u00a7b\u043e\u0431\u043b\u0430\u0447\u043d\u0430\u044f \u043f\u043e\u0445\u043e\u0434\u043a\u0430");
        lore.add("\u00a77 \u0421\u043e\u0437\u0434\u0430\u0435\u0442 \u043f\u043e\u0434 \u043d\u043e\u0433\u0430\u043c\u0438 \u0440\u044b\u0445\u043b\u044b\u0439 \u0441\u043d\u0435\u0433 \u0434\u043b\u044f");
        lore.add("\u00a77 \u0445\u043e\u0434\u044c\u0431\u044b \u043f\u043e \u0432\u043e\u0437\u0434\u0443\u0445\u0443");
        lore.add("");
        lore.add("\u00a77 \u041b\u0438\u043c\u0438\u0442 \u043a\u0443\u0431\u0438\u043a\u043e\u0432 \u00a7e20 \u0448\u0442");
        lore.add("\u00a77 \u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430 \u00a7e" + cd + " \u0441\u0435\u043a");
        lore.add("");
        lore.add("\u00a77 \u041f\u0430\u0441\u0441\u0438\u0432\u043d\u0430\u044f \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c \u00a7b\u043f\u0435\u0440\u043e");
        lore.add("\u00a77 \u041f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0437\u0430\u0449\u0438\u0449\u0430\u0435\u0442 \u043e\u0442 \u0443\u0440\u043e\u043d\u0430 \u043f\u0440\u0438 \u043f\u0430\u0434\u0435\u043d\u0438\u0438,");
        lore.add("\u00a77 \u0435\u0441\u043b\u0438 \u043c\u0435\u0447 \u0432 \u043e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u0440\u0443\u043a\u0435");
        lore.add("");
        lore.add("\u00a77\u041a\u043e\u0433\u0434\u0430 \u044d\u043a\u0438\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e:");
        lore.add("\u00a79 \u0421\u043a\u043e\u0440\u043e\u0441\u0442\u044c: +15%");
        lore.add("");
        lore.add("\u00a77\u041a\u043e\u0433\u0434\u0430 \u0432 \u0432\u0435\u0434\u0443\u0449\u0435\u0439 \u0440\u0443\u043a\u0435:");
        lore.add("\u00a7a \u0421\u043a\u043e\u0440\u043e\u0441\u0442\u044c \u0430\u0442\u0430\u043a\u0438: 1.6");
        lore.add("\u00a7a \u0423\u0440\u043e\u043d \u043f\u0440\u0438 \u0430\u0442\u0430\u043a\u0435: 7.5");
        meta.setLore(lore);
        try {
            meta.setItemModel(NamespacedKey.fromString((String)"astrum:battle_royale/cloud_sword"));
        }
        catch (Exception exception) {
            // empty catch block
        }
        meta.removeAttributeModifier(Attribute.MOVEMENT_SPEED);
        meta.removeAttributeModifier(Attribute.ATTACK_DAMAGE);
        meta.removeAttributeModifier(Attribute.ATTACK_SPEED);
        NamespacedKey speedKey = new NamespacedKey((Plugin)this, "ns_speed");
        meta.addAttributeModifier(Attribute.MOVEMENT_SPEED, new AttributeModifier(speedKey, 0.15, AttributeModifier.Operation.ADD_SCALAR, EquipmentSlotGroup.HAND));
        NamespacedKey dmgKey = new NamespacedKey((Plugin)this, "ns_damage");
        meta.addAttributeModifier(Attribute.ATTACK_DAMAGE, new AttributeModifier(dmgKey, 6.5, AttributeModifier.Operation.ADD_NUMBER, EquipmentSlotGroup.MAINHAND));
        NamespacedKey spdKey = new NamespacedKey((Plugin)this, "ns_attack_speed");
        meta.addAttributeModifier(Attribute.ATTACK_SPEED, new AttributeModifier(spdKey, -2.4, AttributeModifier.Operation.ADD_NUMBER, EquipmentSlotGroup.MAINHAND));
        meta.getPersistentDataContainer().set(this.isSwordKey, PersistentDataType.BYTE, (byte)1);
        item.setItemMeta(meta);
    }

    private boolean isSkySword(ItemStack item) {
        if (item == null || !item.hasItemMeta()) {
            return false;
        }
        return item.getItemMeta().getPersistentDataContainer().has(this.isSwordKey, PersistentDataType.BYTE);
    }

    @EventHandler
    public void onInteract(PlayerInteractEvent e) {
        ItemStack item;
        if ((e.getAction() == Action.RIGHT_CLICK_AIR || e.getAction() == Action.RIGHT_CLICK_BLOCK) && this.isSkySword(item = e.getItem())) {
            e.setCancelled(true);
            ItemMeta meta = item.getItemMeta();
            long cdEnd = (Long)meta.getPersistentDataContainer().getOrDefault(this.cdEndKey, PersistentDataType.LONG, 0L);
            if (System.currentTimeMillis() < cdEnd) {
                e.getPlayer().sendMessage("\u00a7c\u041c\u0435\u0447 \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0436\u0430\u0435\u0442\u0441\u044f!");
                return;
            }
            byte active = (Byte)meta.getPersistentDataContainer().getOrDefault(this.activeKey, PersistentDataType.BYTE, (byte)0);
            int uses = (Integer)meta.getPersistentDataContainer().getOrDefault(this.usesKey, PersistentDataType.INTEGER, 20);
            if (uses <= 0) {
                return;
            }
            if (active == 0) {
                meta.getPersistentDataContainer().set(this.activeKey, PersistentDataType.BYTE, (byte)1);
                e.getPlayer().playSound(e.getPlayer().getLocation(), Sound.ENTITY_ILLUSIONER_PREPARE_MIRROR, 1.0f, 1.5f);
            } else {
                meta.getPersistentDataContainer().set(this.activeKey, PersistentDataType.BYTE, (byte)0);
                e.getPlayer().playSound(e.getPlayer().getLocation(), Sound.ENTITY_ILLUSIONER_MIRROR_MOVE, 1.0f, 1.0f);
                this.lastPlatformLoc.remove(e.getPlayer().getUniqueId());
            }
            item.setItemMeta(meta);
        }
    }

    @EventHandler
    public void onFallDamage(EntityDamageEvent e) {
        Entity entity = e.getEntity();
        if (entity instanceof Player) {
            Player p = (Player)entity;
            if (e.getCause() == EntityDamageEvent.DamageCause.FALL && this.isSkySword(p.getInventory().getItemInMainHand())) {
                e.setCancelled(true);
            }
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

    private void handlePlayerTick(Player p, long now) {
        ItemStack main = p.getInventory().getItemInMainHand();
        ItemStack off = p.getInventory().getItemInOffHand();
        boolean hasMain = this.isSkySword(main);
        boolean hasOff = this.isSkySword(off);
        if (!hasMain && !hasOff) {
            return;
        }
        ItemStack sword = hasMain ? main : off;
        ItemMeta meta = sword.getItemMeta();
        long cdEnd = (Long)meta.getPersistentDataContainer().getOrDefault(this.cdEndKey, PersistentDataType.LONG, 0L);
        byte active = (Byte)meta.getPersistentDataContainer().getOrDefault(this.activeKey, PersistentDataType.BYTE, (byte)0);
        int uses = (Integer)meta.getPersistentDataContainer().getOrDefault(this.usesKey, PersistentDataType.INTEGER, 20);
        if (now < cdEnd) {
            long left = (cdEnd - now) / 1000L;
            p.sendActionBar((Component)Component.text((String)("\u00a7b\u041d\u0435\u0431\u0435\u0441\u043d\u044b\u0439 \u041c\u0435\u0447 \u00a78| \u00a7c\u041a\u0414: " + left + " \u0441\u0435\u043a")));
        } else {
            String state = active == 1 ? "\u00a7a\u0412\u041a\u041b" : "\u00a7c\u0412\u042b\u041a\u041b";
            int maxUses = 20;
            String cubesVisual = "\u00a7b" + "\u25a0".repeat(Math.max(0, uses)) + "\u00a77" + "\u25a0".repeat(Math.max(0, maxUses - uses));
            p.sendActionBar((Component)Component.text((String)("\u00a7b\u041d\u0435\u0431\u0435\u0441\u043d\u044b\u0439 \u041c\u0435\u0447 \u00a78| " + state + " \u00a78| " + cubesVisual)));
        }
        if (active == 1 && now >= cdEnd && uses > 0) {
            if (!this.tryPlacePlatform(p, now)) {
                return;
            }
            meta.getPersistentDataContainer().set(this.usesKey, PersistentDataType.INTEGER, --uses);
            p.playSound(p.getLocation(), Sound.BLOCK_SNOW_PLACE, 0.5f, 1.5f);
            if (uses <= 0) {
                meta.getPersistentDataContainer().set(this.activeKey, PersistentDataType.BYTE, (byte)0);
                int maxCd = this.getConfig().getInt("cooldown", 50);
                meta.getPersistentDataContainer().set(this.cdEndKey, PersistentDataType.LONG, now + (long)maxCd * 1000L);
                meta.getPersistentDataContainer().set(this.usesKey, PersistentDataType.INTEGER, 20);
                this.lastPlatformLoc.remove(p.getUniqueId());
                p.sendTitle("", "\u00a7c\u041e\u0431\u043b\u0430\u0447\u043d\u0430\u044f \u043f\u043e\u0445\u043e\u0434\u043a\u0430 \u0440\u0430\u0437\u0440\u044f\u0436\u0435\u043d\u0430!", 5, 30, 5);
                p.playSound(p.getLocation(), Sound.BLOCK_BEACON_DEACTIVATE, 1.0f, 1.5f);
            }
            sword.setItemMeta(meta);
        }
    }

    /*
     * Predicts where the player will be when the block update reaches the client and places the
     * snow platform there BEFORE the player arrives. Returns true when at least one block was placed.
     *
     *  - The server only sees the player's position ping/2 late and the client only learns about a
     *    placed block ping/2 later, so the platform is aimed `lead` = ping/50 + 2 ticks ahead.
     *  - While the player still has enough solid ground ahead of them (they leave support no sooner
     *    than ping/50 + 2 ticks from now) the platform is placed flush with the current floor level,
     *    so walking off an edge does not drop a block at all.
     *  - When the player is already falling (or about to fall too soon), the platform is placed
     *    one block below the predicted landing feet, so the client never clips into it (that clip
     *    is what made the server rubber-band the player back).
     *  - If the simulated trajectory already lands on an existing block (ground or an earlier
     *    platform) within the lead window, nothing is placed and no use is consumed.
     */
    private boolean tryPlacePlatform(Player p, long now) {
        if (p.isInsideVehicle() || p.isGliding() || p.isSwimming()
            || (p.getAllowFlight() && p.isFlying())
            || p.hasPotionEffect(PotionEffectType.LEVITATION) || p.hasPotionEffect(PotionEffectType.SLOW_FALLING)) {
            return false;
        }
        Location feet = p.getLocation();
        World world = p.getWorld();
        Material feetMat = feet.getBlock().getType();
        if (feet.getBlock().isLiquid() || p.getEyeLocation().getBlock().isLiquid()) {
            return false;
        }
        if (feetMat == Material.LADDER || feetMat == Material.SCAFFOLDING || feetMat.name().endsWith("VINES") || feetMat.name().endsWith("VINE_PLANT")) {
            return false;
        }
        double[] t = this.track.computeIfAbsent(p.getUniqueId(), k -> new double[5]);
        if (now - t[4] > 150L) {
            t[0] *= 0.5;
            t[1] *= 0.5;
            t[2] *= 0.5;
            t[3] *= 0.5;
        }
        double vx = t[0];
        double vz = t[2];
        double hspeed = Math.sqrt(vx * vx + vz * vz);
        if (hspeed > 0.6) {
            double k = 0.6 / hspeed;
            vx *= k;
            vz *= k;
        }
        boolean onGround = p.isOnGround();
        double vy = onGround ? 0.0 : Math.min(t[1], t[3]);
        int pingTicks = (int)Math.ceil(Math.max(0, p.getPing()) / 50.0);
        int lead = Math.min(8, Math.max(2, pingTicks + 2));
        double[] r = this.predict(world, feet.getX(), feet.getY(), feet.getZ(), vx, vy, vz, onGround, lead);
        if (r == null) {
            return false;
        }
        int leaveTick = (int)r[3];
        if (leaveTick < 0 || leaveTick > lead) {
            return false;
        }
        int bx;
        int bz;
        int by;
        if (onGround && leaveTick >= pingTicks + 2) {
            int ahead = Math.min(lead, leaveTick + 1);
            bx = (int)Math.floor(feet.getX() + vx * (double)ahead);
            bz = (int)Math.floor(feet.getZ() + vz * (double)ahead);
            by = feet.getBlockY() - 1;
        } else {
            bx = (int)Math.floor(r[0]);
            bz = (int)Math.floor(r[2]);
            by = (int)Math.floor(r[1]) - 1;
        }
        if (by <= world.getMinHeight() || by >= world.getMaxHeight()) {
            return false;
        }
        Block center = world.getBlockAt(bx, by, bz);
        if (center.getType() == Material.SNOW_BLOCK) {
            return false;
        }
        if (!this.generatePlatform(center)) {
            return false;
        }
        this.lastPlatformLoc.put(p.getUniqueId(), new Location(world, (double)bx, (double)by, (double)bz));
        return true;
    }

    /*
     * Simulates the player's movement (Minecraft air physics, constant horizontal speed) for
     * max(lead + 2, 14) ticks. Returns {x, y, z, leaveTick} for tick `lead`, where leaveTick is the
     * tick at which the player loses support (0 = already airborne, -1 = stays supported), or null
     * when the trajectory hits a wall or lands on an existing block within the horizon (a normal
     * jump, a small drop or an earlier platform: nothing needs to be placed).
     */
    private double[] predict(World world, double x, double y, double z, double vx, double vy, double vz, boolean supported, int lead) {
        double sy = vy;
        int leaveTick = supported ? -1 : 0;
        double[] result = null;
        int horizon = Math.max(lead + 2, 14);
        for (int tick = 1; tick <= horizon; ++tick) {
            x += vx;
            z += vz;
            double yPrev = y;
            sy = supported ? -0.0784 : (sy - 0.08) * 0.98;
            y = yPrev + sy;
            double top = this.surfaceTop(world, x, yPrev, y, z);
            if (!Double.isNaN(top)) {
                if (top > yPrev + 0.6) {
                    return null;
                }
                if (!supported) {
                    return null;
                }
                y = top;
            } else if (supported) {
                supported = false;
                leaveTick = tick;
            }
            if (tick == lead) {
                result = new double[]{x, y, z, (double)leaveTick};
            }
        }
        return result;
    }

    /* Top face of the first solid block in the column between the old and the new feet position, NaN if none. */
    private double surfaceTop(World world, double x, double yPrev, double y, double z) {
        int bx = (int)Math.floor(x);
        int bz = (int)Math.floor(z);
        int from = (int)Math.floor(yPrev);
        int to = (int)Math.floor(y);
        for (int by = from; by >= to; --by) {
            if (by <= world.getMinHeight() || by >= world.getMaxHeight()) {
                continue;
            }
            BoundingBox box = world.getBlockAt(bx, by, bz).getBoundingBox();
            if (box == null || box.getHeight() <= 0.0) {
                continue;
            }
            return box.getMaxY();
        }
        return Double.NaN;
    }

    private boolean generatePlatform(Block center) {
        boolean placedAny = false;
        World world = center.getWorld();
        for (int x = -1; x <= 1; ++x) {
            for (int z = -1; z <= 1; ++z) {
                Block b = world.getBlockAt(center.getX() + x, center.getY(), center.getZ() + z);
                if (!b.getType().isAir()) continue;
                b.setType(Material.SNOW_BLOCK);
                placedAny = true;
                Bukkit.getScheduler().runTaskLater((Plugin)this, () -> {
                    if (b.getType() == Material.SNOW_BLOCK) {
                        b.setType(Material.AIR);
                        b.getWorld().spawnParticle(Particle.SNOWFLAKE, b.getLocation().add(0.5, 0.5, 0.5), 5, 0.3, 0.3, 0.3, 0.01);
                    }
                }, 100L);
            }
        }
        return placedAny;
    }
}

