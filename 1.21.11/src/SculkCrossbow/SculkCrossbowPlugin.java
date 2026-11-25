/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.md_5.bungee.api.ChatMessageType
 *  net.md_5.bungee.api.chat.BaseComponent
 *  net.md_5.bungee.api.chat.TextComponent
 *  org.bukkit.Bukkit
 *  org.bukkit.Location
 *  org.bukkit.Material
 *  org.bukkit.NamespacedKey
 *  org.bukkit.Particle
 *  org.bukkit.Registry
 *  org.bukkit.Sound
 *  org.bukkit.World
 *  org.bukkit.block.Block
 *  org.bukkit.command.Command
 *  org.bukkit.command.CommandExecutor
 *  org.bukkit.command.CommandSender
 *  org.bukkit.enchantments.Enchantment
 *  org.bukkit.entity.Arrow
 *  org.bukkit.entity.Entity
 *  org.bukkit.entity.LivingEntity
 *  org.bukkit.entity.Player
 *  org.bukkit.entity.Projectile
 *  org.bukkit.event.EventHandler
 *  org.bukkit.event.Listener
 *  org.bukkit.event.entity.EntityDamageByEntityEvent
 *  org.bukkit.event.entity.EntityDamageEvent
 *  org.bukkit.event.entity.EntityDamageEvent$DamageCause
 *  org.bukkit.event.entity.EntityShootBowEvent
 *  org.bukkit.event.entity.ProjectileHitEvent
 *  org.bukkit.event.inventory.PrepareGrindstoneEvent
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  org.bukkit.persistence.PersistentDataType
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.plugin.java.JavaPlugin
 *  org.bukkit.scheduler.BukkitRunnable
 *  org.bukkit.util.Vector
 */
package com.example.sculkcrossbow;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.UUID;
import net.md_5.bungee.api.ChatMessageType;
import net.md_5.bungee.api.chat.BaseComponent;
import net.md_5.bungee.api.chat.TextComponent;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Registry;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.GameMode;
import org.bukkit.potion.PotionEffect;
import org.bukkit.entity.Arrow;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityShootBowEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.inventory.PrepareGrindstoneEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.PotionMeta;
import io.papermc.paper.datacomponent.DataComponentTypes;
import io.papermc.paper.datacomponent.item.ChargedProjectiles;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.util.Vector;

public class SculkCrossbowPlugin
extends JavaPlugin
implements Listener,
CommandExecutor {
    private HashMap<UUID, Long> cooldowns = new HashMap();
    private NamespacedKey crossbowKey;
    private NamespacedKey arrowKey;
    private boolean isCustomExploding = false;

    public void onEnable() {
        this.saveDefaultConfig();
        this.crossbowKey = new NamespacedKey((Plugin)this, "is_sculk_crossbow");
        this.arrowKey = new NamespacedKey((Plugin)this, "sculk_arrow");
        this.getServer().getPluginManager().registerEvents((Listener)this, (Plugin)this);
        this.getCommand("s_c").setExecutor((CommandExecutor)this);
        new BukkitRunnable(){

            public void run() {
                long cdSec = SculkCrossbowPlugin.this.getConfig().getInt("cooldown", 22);
                long cdMs = cdSec * 1000L;
                long current = System.currentTimeMillis();
                for (Player p : Bukkit.getOnlinePlayers()) {
                    if (!SculkCrossbowPlugin.this.isSculk(p.getInventory().getItemInMainHand()) && !SculkCrossbowPlugin.this.isSculk(p.getInventory().getItemInOffHand())) continue;
                    long last = SculkCrossbowPlugin.this.cooldowns.getOrDefault(p.getUniqueId(), 0L);
                    long left = last + cdMs - current;
                    if (left > 0L) {
                        p.spigot().sendMessage(ChatMessageType.ACTION_BAR, (BaseComponent)new TextComponent("\u00a7c\u23f3 \u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430: " + left / 1000L + "\u0441"));
                        continue;
                    }
                    p.spigot().sendMessage(ChatMessageType.ACTION_BAR, (BaseComponent)new TextComponent("\u00a7a\u2728 \u0421\u043a\u0430\u043b\u043a\u043e\u0432\u044b\u0439 \u0430\u0440\u0431\u0430\u043b\u0435\u0442 \u0433\u043e\u0442\u043e\u0432!"));
                }
            }
        }.runTaskTimer((Plugin)this, 0L, 5L);
    }

    private boolean isSculk(ItemStack item) {
        return item != null && item.hasItemMeta() ? item.getItemMeta().getPersistentDataContainer().has(this.crossbowKey, PersistentDataType.BYTE) : false;
    }

    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return false;
        }
        if (args[0].equalsIgnoreCase("config") && args.length >= 3 && args[1].equalsIgnoreCase("cooldown")) {
            if (!sender.hasPermission("sculkcrossbow.admin")) {
                return true;
            }
            try {
                int cd = Integer.parseInt(args[2]);
                this.getConfig().set("cooldown", cd);
                this.saveConfig();
                sender.sendMessage("\u00a7a\u041a\u0414 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e \u043d\u0430 " + cd + " \u0441\u0435\u043a\u0443\u043d\u0434.");
            }
            catch (Exception e) {
                sender.sendMessage("\u00a7c\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0447\u0438\u0441\u043b\u043e!");
            }
            return true;
        }
        if (!args[0].equalsIgnoreCase("give") || args.length < 2) {
            return false;
        }
        if (!sender.hasPermission("sculkcrossbow.admin")) {
            return true;
        }
        Player target = Bukkit.getPlayer((String)args[1]);
        if (target == null) {
            sender.sendMessage("\u00a7c\u0418\u0433\u0440\u043e\u043a \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d!");
            return true;
        }
        int cmd = 5;
        if (args.length >= 3) {
            try {
                cmd = Integer.parseInt(args[2]);
            }
            catch (Exception exception) {
                // empty catch block
            }
        }
        ItemStack item = new ItemStack(Material.CROSSBOW);
        ItemMeta meta = item.getItemMeta();
        meta.setDisplayName("\u00a7b\u0421\u043a\u0430\u043b\u043a\u043e\u0432\u044b\u0439 \u0430\u0440\u0431\u0430\u043b\u0435\u0442");
        ArrayList<String> lore = new ArrayList<String>();
        lore.add("\u00a77Ability:");
        lore.add("\u00a77SHOOT to lauch a sonic arrow, creating");
        lore.add("\u00a77a large sculk explosion on impact that");
        lore.add("\u00a77knocks players away and deals true damage.");
        lore.add("\u00a7e" + this.getConfig().getInt("cooldown", 22) + "s Cooldown");
        meta.setLore(lore);
        meta.setUnbreakable(true);
        Enchantment qc = (Enchantment)Registry.ENCHANTMENT.get(NamespacedKey.minecraft((String)"quick_charge"));
        if (qc != null) {
            meta.addEnchant(qc, 1, true);
        }
        meta.setCustomModelData(Integer.valueOf(cmd));
        meta.getPersistentDataContainer().set(this.crossbowKey, PersistentDataType.BYTE, (byte)1);
        item.setItemMeta(meta);
        target.getInventory().addItem(new ItemStack[]{item});
        sender.sendMessage("\u00a7a\u0410\u0440\u0431\u0430\u043b\u0435\u0442 \u0432\u044b\u0434\u0430\u043d " + target.getName());
        return true;
    }

    @EventHandler
    public void onShoot(EntityShootBowEvent e) {
        LivingEntity livingEntity = e.getEntity();
        if (livingEntity instanceof Player) {
            Player p = (Player)livingEntity;
            if (this.isSculk(e.getBow())) {
                long current = System.currentTimeMillis();
                long cdMs = (long)this.getConfig().getInt("cooldown", 22) * 1000L;
                long last = this.cooldowns.getOrDefault(p.getUniqueId(), 0L);
                if (current - last < cdMs) {
                    e.setCancelled(true);
                    p.sendMessage("\u00a7c\u0410\u0440\u0431\u0430\u043b\u0435\u0442 \u0435\u0449\u0435 \u043d\u0430 \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0435!");
                    this.compensateBlockedShot(e, p);
                    Bukkit.getScheduler().runTaskLater((Plugin)this, () -> p.updateInventory(), 1L);
                    return;
                }
                this.cooldowns.put(p.getUniqueId(), current);
                final Entity projectile = e.getProjectile();
                projectile.getPersistentDataContainer().set(this.arrowKey, PersistentDataType.STRING, p.getUniqueId().toString());
                new BukkitRunnable(){

                    public void run() {
                        if (projectile.isValid() && !projectile.isDead() && !projectile.isOnGround()) {
                            Location loc = projectile.getLocation();
                            World w = loc.getWorld();
                            w.spawnParticle(Particle.SONIC_BOOM, loc, 3, 0.1, 0.1, 0.1, 0.02);
                            w.spawnParticle(Particle.SONIC_BOOM, loc, 1, 0.1, 0.1, 0.1, 0.05);
                        } else {
                            this.cancel();
                        }
                    }
                }.runTaskTimer((Plugin)this, 1L, 1L);
            }
        }
    }

    private void compensateBlockedShot(EntityShootBowEvent e, Player p) {
        if (this.restoreCharge(e)) {
            return;
        }
        if (p.getGameMode() != GameMode.SURVIVAL) {
            return;
        }
        ItemStack ammo = e.getConsumable();
        if (ammo == null || ammo.getType().isAir() || !e.shouldConsumeItem()) {
            return;
        }
        ItemStack refund = this.copyArrow(ammo);
        HashMap<Integer, ItemStack> leftover = p.getInventory().addItem(new ItemStack[]{refund});
        for (ItemStack drop : leftover.values()) {
            p.getWorld().dropItemNaturally(p.getLocation(), drop);
        }
    }

    private boolean restoreCharge(EntityShootBowEvent e) {
        ItemStack bow = e.getBow();
        ItemStack ammo = e.getConsumable();
        if (bow == null || bow.getType() != Material.CROSSBOW || ammo == null || ammo.getType().isAir()) {
            return false;
        }
        try {
            ChargedProjectiles charged = ChargedProjectiles.chargedProjectiles().add(ammo.clone()).build();
            bow.setData(DataComponentTypes.CHARGED_PROJECTILES, charged);
            return bow.hasData(DataComponentTypes.CHARGED_PROJECTILES);
        }
        catch (Throwable throwable) {
            return false;
        }
    }

    private ItemStack copyArrow(ItemStack ammo) {
        ItemStack refund = new ItemStack(ammo.getType(), 1);
        if (ammo.getType() == Material.TIPPED_ARROW && ammo.getItemMeta() instanceof PotionMeta) {
            PotionMeta src = (PotionMeta)ammo.getItemMeta();
            PotionMeta dst = (PotionMeta)refund.getItemMeta();
            dst.setBasePotionType(src.getBasePotionType());
            for (PotionEffect effect : src.getCustomEffects()) {
                dst.addCustomEffect(effect, true);
            }
            dst.setColor(src.getColor());
            refund.setItemMeta(dst);
        }
        return refund;
    }

    @EventHandler
    public void onHit(ProjectileHitEvent e) {
        Arrow arrow;
        Projectile projectile = e.getEntity();
        if (projectile instanceof Arrow && (arrow = (Arrow)projectile).getPersistentDataContainer().has(this.arrowKey, PersistentDataType.STRING)) {
            String shooterStr = (String)arrow.getPersistentDataContainer().get(this.arrowKey, PersistentDataType.STRING);
            Location loc = arrow.getLocation();
            World w = loc.getWorld();
            w.spawnParticle(Particle.SONIC_BOOM, loc, 1);
            w.playSound(loc, Sound.ENTITY_WARDEN_SONIC_BOOM, 3.0f, 1.0f);
            this.isCustomExploding = true;
            w.createExplosion(loc, 3.0f, false, true);
            this.isCustomExploding = false;
            for (Entity ent : w.getNearbyEntities(loc, 8.0, 8.0, 8.0)) {
                Vector kb;
                LivingEntity target;
                double dist;
                if (!(ent instanceof LivingEntity) || !((dist = (target = (LivingEntity)ent).getLocation().distance(loc)) <= 8.0)) continue;
                boolean isShooter = target.getUniqueId().toString().equals(shooterStr);
                if (!isShooter) {
                    double dmg;
                    double d = dmg = dist <= 4.0 ? 26.0 : 13.0;
                    if (target.getHealth() <= dmg) {
                        target.setHealth(0.1);
                        target.damage(1000000.0);
                    } else {
                        target.setHealth(target.getHealth() - dmg);
                        target.damage(1.0E-4);
                    }
                }
                if ((kb = target.getLocation().toVector().subtract(loc.toVector())).lengthSquared() == 0.0) {
                    kb = new Vector(0, 1, 0);
                }
                kb.normalize().multiply(2.5).setY(1.2);
                target.setVelocity(kb);
            }
            int r = 3;
            for (int x = -r; x <= r; ++x) {
                for (int y = -r; y <= r; ++y) {
                    for (int z = -r; z <= r; ++z) {
                        Block b = loc.clone().add((double)x, (double)y, (double)z).getBlock();
                        if (b.getType().isAir() || !(b.getType().getHardness() >= 0.0f) || this.isProtectedBlockSafeguardForSizeConstraint(b.getType())) continue;
                        b.setType(Material.SCULK);
                    }
                }
            }
            arrow.remove();
        }
    }

    @EventHandler
    public void onDamage(EntityDamageByEntityEvent e) {
        Arrow arrow;
        Entity entity = e.getDamager();
        if (entity instanceof Arrow && (arrow = (Arrow)entity).getPersistentDataContainer().has(this.arrowKey, PersistentDataType.STRING)) {
            e.setCancelled(true);
        }
    }

    @EventHandler
    public void onExplosionDamage(EntityDamageEvent e) {
        if (this.isCustomExploding && (e.getCause() == EntityDamageEvent.DamageCause.BLOCK_EXPLOSION || e.getCause() == EntityDamageEvent.DamageCause.ENTITY_EXPLOSION)) {
            e.setCancelled(true);
        }
    }

    @EventHandler
    public void onGrindstone(PrepareGrindstoneEvent e) {
        for (ItemStack item : e.getInventory().getContents()) {
            if (!this.isSculk(item)) continue;
            e.setResult(null);
            return;
        }
    }

    private boolean isProtectedBlockSafeguardForSizeConstraint(Material m) {
        switch (m) {
            case BEDROCK: 
            case OBSIDIAN: 
            case CRYING_OBSIDIAN: 
            case BARRIER: 
            case COMMAND_BLOCK: 
            case CHAIN_COMMAND_BLOCK: 
            case REPEATING_COMMAND_BLOCK: 
            case COMMAND_BLOCK_MINECART: 
            case JIGSAW: 
            case STRUCTURE_BLOCK: 
            case STRUCTURE_VOID: 
            case LIGHT: 
            case END_PORTAL: 
            case END_PORTAL_FRAME: 
            case END_GATEWAY: 
            case NETHER_PORTAL: 
            case DRAGON_EGG: 
            case SPAWNER: 
            case CHEST: 
            case TRAPPED_CHEST: 
            case ENDER_CHEST: 
            case SHULKER_BOX: 
            case WHITE_SHULKER_BOX: 
            case ORANGE_SHULKER_BOX: 
            case MAGENTA_SHULKER_BOX: 
            case LIGHT_BLUE_SHULKER_BOX: 
            case YELLOW_SHULKER_BOX: 
            case LIME_SHULKER_BOX: 
            case PINK_SHULKER_BOX: 
            case GRAY_SHULKER_BOX: 
            case LIGHT_GRAY_SHULKER_BOX: 
            case CYAN_SHULKER_BOX: 
            case PURPLE_SHULKER_BOX: 
            case BLUE_SHULKER_BOX: 
            case BROWN_SHULKER_BOX: 
            case GREEN_SHULKER_BOX: 
            case RED_SHULKER_BOX: 
            case BLACK_SHULKER_BOX: 
            case FURNACE: 
            case BLAST_FURNACE: 
            case SMOKER: 
            case DISPENSER: 
            case DROPPER: 
            case HOPPER: 
            case BEACON: 
            case ENCHANTING_TABLE: 
            case ANVIL: 
            case CHIPPED_ANVIL: 
            case DAMAGED_ANVIL: 
            case BREWING_STAND: 
            case CAULDRON: 
            case WATER_CAULDRON: 
            case LAVA_CAULDRON: 
            case POWDER_SNOW_CAULDRON: 
            case BELL: 
            case CAMPFIRE: 
            case SOUL_CAMPFIRE: 
            case LODESTONE: 
            case RESPAWN_ANCHOR: 
            case CONDUIT: 
            case BARREL: 
            case CARTOGRAPHY_TABLE: 
            case FLETCHING_TABLE: 
            case GRINDSTONE: 
            case LECTERN: 
            case SMITHING_TABLE: 
            case STONECUTTER: 
            case LOOM: 
            case COMPOSTER: 
            case CRAFTING_TABLE: 
            case NOTE_BLOCK: 
            case JUKEBOX: 
            case DAYLIGHT_DETECTOR: 
            case TARGET: 
            case LEVER: 
            case OAK_BUTTON: 
            case SPRUCE_BUTTON: 
            case BIRCH_BUTTON: 
            case JUNGLE_BUTTON: 
            case ACACIA_BUTTON: 
            case DARK_OAK_BUTTON: 
            case MANGROVE_BUTTON: 
            case CHERRY_BUTTON: 
            case BAMBOO_BUTTON: 
            case CRIMSON_BUTTON: 
            case WARPED_BUTTON: 
            case STONE_BUTTON: 
            case POLISHED_BLACKSTONE_BUTTON: 
            case OAK_PRESSURE_PLATE: 
            case SPRUCE_PRESSURE_PLATE: 
            case BIRCH_PRESSURE_PLATE: 
            case JUNGLE_PRESSURE_PLATE: 
            case ACACIA_PRESSURE_PLATE: 
            case DARK_OAK_PRESSURE_PLATE: 
            case MANGROVE_PRESSURE_PLATE: 
            case CHERRY_PRESSURE_PLATE: 
            case BAMBOO_PRESSURE_PLATE: 
            case CRIMSON_PRESSURE_PLATE: 
            case WARPED_PRESSURE_PLATE: 
            case STONE_PRESSURE_PLATE: 
            case POLISHED_BLACKSTONE_PRESSURE_PLATE: 
            case HEAVY_WEIGHTED_PRESSURE_PLATE: 
            case LIGHT_WEIGHTED_PRESSURE_PLATE: 
            case OAK_DOOR: 
            case SPRUCE_DOOR: 
            case BIRCH_DOOR: 
            case JUNGLE_DOOR: 
            case ACACIA_DOOR: 
            case DARK_OAK_DOOR: 
            case MANGROVE_DOOR: 
            case CHERRY_DOOR: 
            case BAMBOO_DOOR: 
            case CRIMSON_DOOR: 
            case WARPED_DOOR: 
            case IRON_DOOR: 
            case OAK_TRAPDOOR: 
            case SPRUCE_TRAPDOOR: 
            case BIRCH_TRAPDOOR: 
            case JUNGLE_TRAPDOOR: 
            case ACACIA_TRAPDOOR: 
            case DARK_OAK_TRAPDOOR: 
            case MANGROVE_TRAPDOOR: 
            case CHERRY_TRAPDOOR: 
            case BAMBOO_TRAPDOOR: 
            case CRIMSON_TRAPDOOR: 
            case WARPED_TRAPDOOR: 
            case IRON_TRAPDOOR: 
            case OAK_FENCE_GATE: 
            case SPRUCE_FENCE_GATE: 
            case BIRCH_FENCE_GATE: 
            case JUNGLE_FENCE_GATE: 
            case ACACIA_FENCE_GATE: 
            case DARK_OAK_FENCE_GATE: 
            case MANGROVE_FENCE_GATE: 
            case CHERRY_FENCE_GATE: 
            case BAMBOO_FENCE_GATE: 
            case CRIMSON_FENCE_GATE: 
            case WARPED_FENCE_GATE: 
            case REPEATER: 
            case COMPARATOR: 
            case REDSTONE_WIRE: 
            case REDSTONE_TORCH: 
            case REDSTONE_WALL_TORCH: 
            case REDSTONE_LAMP: 
            case PISTON: 
            case STICKY_PISTON: 
            case PISTON_HEAD: 
            case SLIME_BLOCK: 
            case HONEY_BLOCK: 
            case OBSERVER: 
            case TRIPWIRE_HOOK: 
            case TRIPWIRE: 
            case OAK_SIGN: 
            case SPRUCE_SIGN: 
            case BIRCH_SIGN: 
            case JUNGLE_SIGN: 
            case ACACIA_SIGN: 
            case DARK_OAK_SIGN: 
            case MANGROVE_SIGN: 
            case CHERRY_SIGN: 
            case BAMBOO_SIGN: 
            case CRIMSON_SIGN: 
            case WARPED_SIGN: 
            case OAK_WALL_SIGN: 
            case SPRUCE_WALL_SIGN: 
            case BIRCH_WALL_SIGN: 
            case JUNGLE_WALL_SIGN: 
            case ACACIA_WALL_SIGN: 
            case DARK_OAK_WALL_SIGN: 
            case MANGROVE_WALL_SIGN: 
            case CHERRY_WALL_SIGN: 
            case BAMBOO_WALL_SIGN: 
            case CRIMSON_WALL_SIGN: 
            case WARPED_WALL_SIGN: 
            case OAK_HANGING_SIGN: 
            case SPRUCE_HANGING_SIGN: 
            case BIRCH_HANGING_SIGN: 
            case JUNGLE_HANGING_SIGN: 
            case ACACIA_HANGING_SIGN: 
            case DARK_OAK_HANGING_SIGN: 
            case MANGROVE_HANGING_SIGN: 
            case CHERRY_HANGING_SIGN: 
            case BAMBOO_HANGING_SIGN: 
            case CRIMSON_HANGING_SIGN: 
            case WARPED_HANGING_SIGN: 
            case OAK_WALL_HANGING_SIGN: 
            case SPRUCE_WALL_HANGING_SIGN: 
            case BIRCH_WALL_HANGING_SIGN: 
            case JUNGLE_WALL_HANGING_SIGN: 
            case ACACIA_WALL_HANGING_SIGN: 
            case DARK_OAK_WALL_HANGING_SIGN: 
            case MANGROVE_WALL_HANGING_SIGN: 
            case CHERRY_WALL_HANGING_SIGN: 
            case BAMBOO_WALL_HANGING_SIGN: 
            case CRIMSON_WALL_HANGING_SIGN: 
            case WARPED_WALL_HANGING_SIGN: 
            case WATER: 
            case LAVA: 
            case LADDER: 
            case VINE: 
            case GLOW_LICHEN: 
            case SCULK_VEIN: 
            case SCULK_SENSOR: 
            case SCULK_SHRIEKER: 
            case SCULK_CATALYST: 
            case COBWEB: 
            case WEEPING_VINES: 
            case WEEPING_VINES_PLANT: 
            case TWISTING_VINES: 
            case TWISTING_VINES_PLANT: 
            case KELP: 
            case KELP_PLANT: 
            case SEAGRASS: 
            case TALL_SEAGRASS: 
            case TORCH: 
            case WALL_TORCH: 
            case SOUL_TORCH: 
            case SOUL_WALL_TORCH: 
            case LANTERN: 
            case SOUL_LANTERN: 
            case MINECART: 
            case CHEST_MINECART: 
            case FURNACE_MINECART: 
            case HOPPER_MINECART: 
            case TNT_MINECART: 
            case OAK_BOAT: 
            case SPRUCE_BOAT: 
            case BIRCH_BOAT: 
            case JUNGLE_BOAT: 
            case ACACIA_BOAT: 
            case DARK_OAK_BOAT: 
            case MANGROVE_BOAT: 
            case CHERRY_BOAT: 
            case BAMBOO_RAFT: 
            case OAK_CHEST_BOAT: 
            case SPRUCE_CHEST_BOAT: 
            case BIRCH_CHEST_BOAT: 
            case JUNGLE_CHEST_BOAT: 
            case ACACIA_CHEST_BOAT: 
            case DARK_OAK_CHEST_BOAT: 
            case MANGROVE_CHEST_BOAT: 
            case CHERRY_CHEST_BOAT: 
            case BAMBOO_CHEST_RAFT: 
            case ITEM_FRAME: 
            case GLOW_ITEM_FRAME: 
            case PAINTING: 
            case ARMOR_STAND: 
            case END_CRYSTAL: 
            case WHITE_BED: 
            case ORANGE_BED: 
            case MAGENTA_BED: 
            case LIGHT_BLUE_BED: 
            case YELLOW_BED: 
            case LIME_BED: 
            case PINK_BED: 
            case GRAY_BED: 
            case LIGHT_GRAY_BED: 
            case CYAN_BED: 
            case PURPLE_BED: 
            case BLUE_BED: 
            case BROWN_BED: 
            case GREEN_BED: 
            case RED_BED: 
            case BLACK_BED: 
            case CREEPER_HEAD: 
            case CREEPER_WALL_HEAD: 
            case ZOMBIE_HEAD: 
            case ZOMBIE_WALL_HEAD: 
            case SKELETON_SKULL: 
            case SKELETON_WALL_SKULL: 
            case WITHER_SKELETON_SKULL: 
            case WITHER_SKELETON_WALL_SKULL: 
            case DRAGON_HEAD: 
            case DRAGON_WALL_HEAD: 
            case PIGLIN_HEAD: 
            case PIGLIN_WALL_HEAD: 
            case PLAYER_HEAD: 
            case PLAYER_WALL_HEAD: 
            case FLOWER_POT: 
            case POTTED_OAK_SAPLING: 
            case POTTED_SPRUCE_SAPLING: 
            case POTTED_BIRCH_SAPLING: 
            case POTTED_JUNGLE_SAPLING: 
            case POTTED_ACACIA_SAPLING: 
            case POTTED_DARK_OAK_SAPLING: 
            case POTTED_MANGROVE_PROPAGULE: 
            case POTTED_CHERRY_SAPLING: 
            case POTTED_FERN: 
            case POTTED_DANDELION: 
            case POTTED_POPPY: 
            case POTTED_BLUE_ORCHID: 
            case POTTED_ALLIUM: 
            case POTTED_AZURE_BLUET: 
            case POTTED_RED_TULIP: 
            case POTTED_ORANGE_TULIP: 
            case POTTED_WHITE_TULIP: 
            case POTTED_PINK_TULIP: 
            case POTTED_OXEYE_DAISY: 
            case POTTED_CORNFLOWER: 
            case POTTED_LILY_OF_THE_VALLEY: 
            case POTTED_WITHER_ROSE: 
            case POTTED_RED_MUSHROOM: 
            case POTTED_BROWN_MUSHROOM: 
            case POTTED_DEAD_BUSH: 
            case POTTED_CACTUS: 
            case POTTED_BAMBOO: 
            case POTTED_CRIMSON_FUNGUS: 
            case POTTED_WARPED_FUNGUS: 
            case POTTED_CRIMSON_ROOTS: 
            case POTTED_WARPED_ROOTS: 
            case POTTED_AZALEA_BUSH: 
            case POTTED_FLOWERING_AZALEA_BUSH: 
            case DECORATED_POT: {
                return true;
            }
        }
        return false;
    }
}

