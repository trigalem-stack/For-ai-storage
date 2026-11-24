/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.kyori.adventure.text.Component
 *  org.bukkit.Bukkit
 *  org.bukkit.Location
 *  org.bukkit.Material
 *  org.bukkit.NamespacedKey
 *  org.bukkit.OfflinePlayer
 *  org.bukkit.Particle
 *  org.bukkit.Sound
 *  org.bukkit.World
 *  org.bukkit.block.Block
 *  org.bukkit.block.BlockFace
 *  org.bukkit.command.Command
 *  org.bukkit.command.CommandExecutor
 *  org.bukkit.command.CommandSender
 *  org.bukkit.entity.Entity
 *  org.bukkit.entity.EntityType
 *  org.bukkit.entity.LivingEntity
 *  org.bukkit.entity.Mob
 *  org.bukkit.entity.Player
 *  org.bukkit.entity.Projectile
 *  org.bukkit.entity.Zombie
 *  org.bukkit.event.EventHandler
 *  org.bukkit.event.Listener
 *  org.bukkit.event.block.Action
 *  org.bukkit.event.enchantment.EnchantItemEvent
 *  org.bukkit.event.entity.EntityDamageByEntityEvent
 *  org.bukkit.event.entity.EntityTargetEvent
 *  org.bukkit.event.inventory.PrepareAnvilEvent
 *  org.bukkit.event.player.PlayerInteractEvent
 *  org.bukkit.event.player.PlayerJoinEvent
 *  org.bukkit.event.world.ChunkLoadEvent
 *  org.bukkit.inventory.EquipmentSlot
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  org.bukkit.persistence.PersistentDataType
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.plugin.java.JavaPlugin
 *  org.bukkit.potion.PotionEffect
 *  org.bukkit.potion.PotionEffectType
 *  org.bukkit.projectiles.ProjectileSource
 *  org.bukkit.scheduler.BukkitRunnable
 *  org.bukkit.scoreboard.Team
 */
package com.example.undeadstaff;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.OfflinePlayer;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.entity.Zombie;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.enchantment.EnchantItemEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityTargetEvent;
import org.bukkit.event.inventory.PrepareAnvilEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.projectiles.ProjectileSource;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.scoreboard.Team;

public class UndeadStaffPlugin
extends JavaPlugin
implements Listener,
CommandExecutor {
    private final HashMap<UUID, Long> cooldowns = new HashMap();
    private final HashMap<UUID, List<Mob>> playerMinions = new HashMap();
    private final NamespacedKey staffKey = new NamespacedKey((Plugin)this, "undead_staff");
    private final NamespacedKey minionKey = new NamespacedKey((Plugin)this, "undead_minion");
    private final NamespacedKey expireKey = new NamespacedKey((Plugin)this, "minion_expire");
    private final NamespacedKey teleportKey = new NamespacedKey((Plugin)this, "minion_teleport");

    public void onEnable() {
        this.saveDefaultConfig();
        this.getServer().getPluginManager().registerEvents((Listener)this, (Plugin)this);
        if (this.getCommand("p_n") != null) {
            this.getCommand("p_n").setExecutor((CommandExecutor)this);
        }
        this.restoreMinionsOnEnable();
        new BukkitRunnable(){

            public void run() {
                for (Player p : Bukkit.getOnlinePlayers()) {
                    ItemStack main = p.getInventory().getItemInMainHand();
                    ItemStack off = p.getInventory().getItemInOffHand();
                    if (!UndeadStaffPlugin.this.isStaff(main) && !UndeadStaffPlugin.this.isStaff(off)) continue;
                    long left = (UndeadStaffPlugin.this.cooldowns.getOrDefault(p.getUniqueId(), 0L) - System.currentTimeMillis()) / 1000L;
                    if (left > 0L) {
                        p.sendActionBar((Component)Component.text((String)("\u00a7c\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430: " + left + " \u0441\u0435\u043a")));
                        continue;
                    }
                    p.sendActionBar((Component)Component.empty());
                }
            }
        }.runTaskTimer((Plugin)this, 0L, 5L);
        new BukkitRunnable(){

            public void run() {
                long now = System.currentTimeMillis();
                for (Map.Entry<UUID, List<Mob>> entry : UndeadStaffPlugin.this.playerMinions.entrySet()) {
                    UUID ownerUUID = entry.getKey();
                    Player owner = Bukkit.getPlayer((UUID)ownerUUID);
                    List<Mob> minions = entry.getValue();
                    minions.removeIf(minion -> {
                        if (minion.isDead() || !minion.isValid()) {
                            return true;
                        }
                        Long expireTime = (Long)minion.getPersistentDataContainer().get(UndeadStaffPlugin.this.expireKey, PersistentDataType.LONG);
                        if (expireTime != null && now > expireTime) {
                            minion.getWorld().spawnParticle(Particle.SMOKE, minion.getLocation().add(0.0, 1.0, 0.0), 10, 0.2, 0.2, 0.2, 0.0);
                            minion.remove();
                            return true;
                        }
                        return false;
                    });
                    if (minions.isEmpty()) continue;
                    if (owner == null || !owner.isOnline()) {
                        for (Mob minion22 : minions) {
                            LivingEntity currentTarget = minion22.getTarget();
                            if (currentTarget == null || !UndeadStaffPlugin.this.isValidTarget((Entity)currentTarget, ownerUUID)) {
                                double closestDist = Double.MAX_VALUE;
                                LivingEntity newTarget = null;
                                for (Entity ent : minion22.getNearbyEntities(15.0, 8.0, 15.0)) {
                                    double dist;
                                    if (!UndeadStaffPlugin.this.isValidTarget(ent, ownerUUID) || !((dist = ent.getLocation().distanceSquared(minion22.getLocation())) < closestDist)) continue;
                                    closestDist = dist;
                                    newTarget = (LivingEntity)ent;
                                }
                                minion22.setTarget(newTarget);
                            }
                            if (minion22.getTarget() == null || !(minion22.getLocation().distanceSquared(minion22.getTarget().getLocation()) > 4.0)) continue;
                            minion22.getPathfinder().moveTo(minion22.getTarget(), 1.3);
                        }
                        continue;
                    }
                    LivingEntity commonTarget = null;
                    double closestDist = Double.MAX_VALUE;
                    for (Entity ent : owner.getNearbyEntities(15.0, 8.0, 15.0)) {
                        if (!UndeadStaffPlugin.this.isValidTarget(ent, ownerUUID)) continue;
                        double dist = ent.getLocation().distanceSquared(owner.getLocation());
                        if (dist >= closestDist) continue;
                        closestDist = dist;
                        commonTarget = (LivingEntity)ent;
                    }
                    for (Mob minion3 : minions) {
                        if (commonTarget != null) {
                            if (minion3.getTarget() != commonTarget) {
                                minion3.setTarget(commonTarget);
                            }
                            if (!(minion3.getLocation().distanceSquared(commonTarget.getLocation()) > 4.0)) continue;
                            minion3.getPathfinder().moveTo(commonTarget, 1.3);
                            continue;
                        }
                        if (minion3.getTarget() != null) {
                            minion3.setTarget(null);
                        }
                        double ownerDistSq = minion3.getWorld().equals((Object)owner.getWorld()) ? minion3.getLocation().distanceSquared(owner.getLocation()) : Double.MAX_VALUE;
                        if (ownerDistSq > 36.0) {
                            Long lastTp = (Long)minion3.getPersistentDataContainer().get(UndeadStaffPlugin.this.teleportKey, PersistentDataType.LONG);
                            if (lastTp == null || now - lastTp.longValue() > 2000L) {
                                minion3.getPersistentDataContainer().set(UndeadStaffPlugin.this.teleportKey, PersistentDataType.LONG, now);
                                UndeadStaffPlugin.this.teleportSafely(minion3, owner.getLocation(), 4.0);
                            }
                            continue;
                        }
                        if (minion3.getLocation().distanceSquared(owner.getLocation()) > 25.0) {
                            minion3.getPathfinder().moveTo((LivingEntity)owner, 1.3);
                            continue;
                        }
                        minion3.getPathfinder().stopPathfinding();
                    }
                }
            }
        }.runTaskTimer((Plugin)this, 0L, 10L);
    }

    private void restoreMinionsOnEnable() {
        for (World world : Bukkit.getWorlds()) {
            for (LivingEntity entity : world.getLivingEntities()) {
                String uuidStr;
                Mob mob;
                if (!(entity instanceof Mob) || !(mob = (Mob)entity).getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING) || (uuidStr = (String)mob.getPersistentDataContainer().get(this.minionKey, PersistentDataType.STRING)) == null) continue;
                UUID ownerUUID = UUID.fromString(uuidStr);
                this.playerMinions.computeIfAbsent(ownerUUID, k -> new ArrayList()).add(mob);
            }
        }
    }

    @EventHandler
    public void onChunkLoad(ChunkLoadEvent e) {
        for (Entity entity : e.getChunk().getEntities()) {
            UUID ownerUUID;
            List list;
            String uuidStr;
            Mob mob;
            if (!(entity instanceof Mob) || !(mob = (Mob)entity).getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING) || (uuidStr = (String)mob.getPersistentDataContainer().get(this.minionKey, PersistentDataType.STRING)) == null || (list = this.playerMinions.computeIfAbsent(ownerUUID = UUID.fromString(uuidStr), k -> new ArrayList())).contains(mob)) continue;
            list.add(mob);
        }
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent e) {
        Player p = e.getPlayer();
        List<Mob> minions = this.playerMinions.get(p.getUniqueId());
        if (minions != null) {
            for (Mob minion : minions) {
                if (!minion.isValid() || minion.isDead()) continue;
                this.teleportSafely(minion, p.getLocation(), 4.0);
            }
        }
    }

    private boolean isValidTarget(Entity target, UUID ownerUUID) {
        String targetOwnerUUIDStr;
        if (!(target instanceof LivingEntity)) {
            return false;
        }
        LivingEntity livingTarget = (LivingEntity)target;
        if (livingTarget.isDead() || !livingTarget.isValid()) {
            return false;
        }
        if (livingTarget.getUniqueId().equals(ownerUUID)) {
            return false;
        }
        Player owner = Bukkit.getPlayer((UUID)ownerUUID);
        if (livingTarget instanceof Player) {
            Player targetPlayer = (Player)livingTarget;
            if (!this.getConfig().getBoolean("target-players")) {
                return false;
            }
            if (owner != null && this.areTeammates(owner, targetPlayer)) {
                return false;
            }
        } else if (livingTarget instanceof Mob) {
            if (!this.getConfig().getBoolean("target-mobs")) {
                return false;
            }
        } else {
            return false;
        }
        if (livingTarget.getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING) && (targetOwnerUUIDStr = (String)livingTarget.getPersistentDataContainer().get(this.minionKey, PersistentDataType.STRING)) != null) {
            if (targetOwnerUUIDStr.equals(ownerUUID.toString())) {
                return false;
            }
            Player targetOwner = Bukkit.getPlayer((UUID)UUID.fromString(targetOwnerUUIDStr));
            if (owner != null && targetOwner != null && this.areTeammates(owner, targetOwner)) {
                return false;
            }
        }
        return true;
    }

    private void teleportSafely(Mob minion, Location center, double radius) {
        Location spot = this.findSafeSpot(center, radius);
        minion.teleport(spot);
    }

    private Location findSafeSpot(Location center, double radius) {
        World world = center.getWorld();
        if (world == null) {
            return center;
        }
        double cx = center.getX();
        double cz = center.getZ();
        int baseY = center.getBlockY();
        Location exact = new Location(world, cx, (double)baseY, cz);
        if (this.isSafeLocation(exact)) {
            return exact;
        }
        int rings = Math.max(1, (int)Math.ceil(radius));
        for (int ring = 1; ring <= rings; ++ring) {
            int steps = Math.max(8, ring * 8);
            for (int s = 0; s < steps; ++s) {
                double angle = 6.283185307179586 * (double)s / (double)steps;
                int blockX = (int)Math.floor(cx + (double)ring * Math.cos(angle));
                int blockZ = (int)Math.floor(cz + (double)ring * Math.sin(angle));
                for (int dy = 3; dy >= -4; --dy) {
                    Location checkLoc = new Location(world, (double)blockX + 0.5, (double)(baseY + dy), (double)blockZ + 0.5);
                    if (!this.isSafeLocation(checkLoc)) continue;
                    return checkLoc;
                }
            }
        }
        for (int dy = 0; dy <= 4; ++dy) {
            Location l = new Location(world, cx, (double)(baseY + dy), cz);
            Block feet = l.getBlock();
            Block head = feet.getRelative(BlockFace.UP);
            if (feet.isPassable() && feet.getType() != Material.WATER && feet.getType() != Material.LAVA
                && head.isPassable() && head.getType() != Material.WATER && head.getType() != Material.LAVA) {
                return l;
            }
        }
        return center;
    }

    private boolean isSafeLocation(Location loc) {
        Block feet = loc.getBlock();
        Block head = feet.getRelative(BlockFace.UP);
        Block ground = feet.getRelative(BlockFace.DOWN);
        return ground.getType().isSolid() && feet.isPassable() && feet.getType() != Material.WATER && feet.getType() != Material.LAVA && head.isPassable() && head.getType() != Material.WATER && head.getType() != Material.LAVA;
    }

    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return false;
        }
        if (args[0].equalsIgnoreCase("give") && args.length == 2) {
            Player target = Bukkit.getPlayer((String)args[1]);
            if (target != null) {
                target.getInventory().addItem(new ItemStack[]{this.getStaffItem()});
                sender.sendMessage("\u00a7a\u041f\u043e\u0441\u043e\u0445 \u0432\u044b\u0434\u0430\u043d \u0438\u0433\u0440\u043e\u043a\u0443 " + target.getName());
            } else {
                sender.sendMessage("\u00a7c\u0418\u0433\u0440\u043e\u043a \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.");
            }
            return true;
        }
        if (args[0].equalsIgnoreCase("config") && args.length == 3) {
            String param = args[1].toLowerCase();
            String value = args[2].toLowerCase();
            switch (param) {
                case "cooldown": {
                    try {
                        this.getConfig().set("cooldown", (Object)Integer.parseInt(value));
                        this.saveConfig();
                        this.updateAllStaffs();
                        sender.sendMessage("\u00a7a\u041a\u0443\u043b\u0434\u0430\u0443\u043d \u0438\u0437\u043c\u0435\u043d\u0451\u043d \u043d\u0430 " + value);
                    }
                    catch (NumberFormatException e) {
                        sender.sendMessage("\u00a7c\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0447\u0438\u0441\u043b\u043e.");
                    }
                    break;
                }
                case "player": {
                    this.getConfig().set("target-players", (Object)Boolean.parseBoolean(value));
                    this.saveConfig();
                    sender.sendMessage("\u00a7a\u0410\u0442\u0430\u043a\u0430 \u0438\u0433\u0440\u043e\u043a\u043e\u0432: " + value);
                    break;
                }
                case "mob": {
                    this.getConfig().set("target-mobs", (Object)Boolean.parseBoolean(value));
                    this.saveConfig();
                    sender.sendMessage("\u00a7a\u0410\u0442\u0430\u043a\u0430 \u043c\u043e\u0431\u043e\u0432: " + value);
                }
            }
            return true;
        }
        return false;
    }

    private void updateAllStaffs() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            for (ItemStack item : p.getInventory().getContents()) {
                if (!this.isStaff(item)) continue;
                ItemMeta meta = item.getItemMeta();
                meta.setLore(this.getStaffLore());
                item.setItemMeta(meta);
            }
        }
    }

    private boolean isStaff(ItemStack item) {
        return item != null && item.hasItemMeta() && item.getItemMeta().getPersistentDataContainer().has(this.staffKey, PersistentDataType.BYTE);
    }

    private ItemStack getStaffItem() {
        ItemStack item = new ItemStack(Material.WOODEN_SWORD);
        ItemMeta meta = item.getItemMeta();
        meta.displayName((Component)Component.text((String)"\u00a75\u041f\u043e\u0441\u043e\u0445 \u041d\u0435\u0436\u0438\u0442\u0438"));
        meta.setLore(this.getStaffLore());
        meta.setUnbreakable(true);
        meta.getPersistentDataContainer().set(this.staffKey, PersistentDataType.BYTE, (byte)1);
        try {
            meta.setItemModel(NamespacedKey.fromString((String)"astrum:battle_royale/undead_staff"));
        }
        catch (Exception exception) {
            // empty catch block
        }
        item.setItemMeta(meta);
        return item;
    }

    private List<String> getStaffLore() {
        int cd = this.getConfig().getInt("cooldown", 50);
        ArrayList<String> lore = new ArrayList<String>();
        lore.add("");
        lore.add("\u00a77\u0421\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c \u00a75\u043d\u0435\u043a\u0440\u043e\u043c\u0430\u043d\u0442\u0438\u044f");
        lore.add("\u00a77\u041f\u0440\u0438\u0437\u044b\u0432\u0430\u0435\u0442 4 \u0437\u043e\u043c\u0431\u0438 \u0438 2 \u0441\u043a\u0435\u043b\u0435\u0442\u0430");
        lore.add("\u00a77\u041c\u043e\u0431\u044b \u0430\u0442\u0430\u043a\u0443\u044e\u0442 \u0432\u0440\u0430\u0433\u043e\u0432 \u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0442 \u0437\u0430 \u0432\u0430\u043c\u0438");
        lore.add("\u00a77\u0412\u0440\u0435\u043c\u044f \u0436\u0438\u0437\u043d\u0438: 35 \u0441\u0435\u043a");
        lore.add("");
        lore.add("\u00a77\u0422\u0430\u043a \u0436\u0435 \u043d\u0430\u043a\u043b\u0430\u0434\u044b\u0432\u0430\u0435\u0442 \u043d\u0430 \u0432\u0441\u0435\u0445 \u0432\u0440\u0430\u0433\u043e\u0432");
        lore.add("\u00a77\u0432 \u0440\u0430\u0434\u0438\u0443\u0441\u0435 10 \u0431\u043b\u043e\u043a\u043e\u0432 \u00a75\u0413\u043e\u043b\u043e\u0434 I \u00a77\u043d\u0430 10 \u0441\u0435\u043a");
        lore.add("");
        lore.add("\u00a7e\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430 " + cd + " \u0441\u0435\u043a");
        return lore;
    }

    @EventHandler
    public void onUse(PlayerInteractEvent e) {
        int i;
        if (e.getAction() != Action.RIGHT_CLICK_AIR && e.getAction() != Action.RIGHT_CLICK_BLOCK) {
            return;
        }
        if (e.getHand() != EquipmentSlot.HAND && e.getHand() != EquipmentSlot.OFF_HAND) {
            return;
        }
        Player p = e.getPlayer();
        ItemStack item = e.getItem();
        if (!this.isStaff(item)) {
            return;
        }
        e.setCancelled(true);
        long cdLeft = this.cooldowns.getOrDefault(p.getUniqueId(), 0L) - System.currentTimeMillis();
        if (cdLeft > 0L) {
            return;
        }
        int cdTime = this.getConfig().getInt("cooldown", 50);
        this.cooldowns.put(p.getUniqueId(), System.currentTimeMillis() + (long)cdTime * 1000L);
        p.getWorld().playSound(p.getLocation(), Sound.ENTITY_EVOKER_PREPARE_SUMMON, 1.0f, 1.0f);
        p.getWorld().spawnParticle(Particle.WITCH, p.getLocation().add(0.0, 1.0, 0.0), 40, 1.0, 0.5, 1.0, 0.05);
        for (i = 0; i < 4; ++i) {
            this.spawnMinion(p, EntityType.ZOMBIE);
        }
        for (i = 0; i < 2; ++i) {
            this.spawnMinion(p, EntityType.SKELETON);
        }
        for (Entity ent : p.getNearbyEntities(10.0, 10.0, 10.0)) {
            if (!(ent instanceof LivingEntity) || ent == p || ent instanceof Player && this.areTeammates(p, (Player)ent) || ent.getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING)) continue;
            ((LivingEntity)ent).addPotionEffect(new PotionEffect(PotionEffectType.HUNGER, 200, 0));
        }
    }

    private void spawnMinion(Player owner, EntityType type) {
        double angle = Math.random() * 2.0 * Math.PI;
        double radius = 2.0;
        double x = owner.getLocation().getX() + radius * Math.cos(angle);
        double z = owner.getLocation().getZ() + radius * Math.sin(angle);
        Location spawnLoc = this.findSafeSpot(owner.getLocation(), 3.0);
        Mob minion = (Mob)owner.getWorld().spawnEntity(spawnLoc, type);
        minion.getPersistentDataContainer().set(this.minionKey, PersistentDataType.STRING, owner.getUniqueId().toString());
        long expireTime = System.currentTimeMillis() + 35000L;
        minion.getPersistentDataContainer().set(this.expireKey, PersistentDataType.LONG, expireTime);
        minion.setGlowing(true);
        if (minion instanceof Zombie) {
            Zombie zombie = (Zombie)minion;
            zombie.setBaby(false);
        }
        minion.addPotionEffect(new PotionEffect(PotionEffectType.SPEED, 700, 0, false, false, false));
        ItemStack helmet = new ItemStack(Material.LEATHER_HELMET);
        ItemMeta hMeta = helmet.getItemMeta();
        hMeta.setUnbreakable(true);
        helmet.setItemMeta(hMeta);
        ItemStack chest = new ItemStack(Material.CHAINMAIL_CHESTPLATE);
        ItemMeta cMeta = chest.getItemMeta();
        cMeta.setUnbreakable(true);
        chest.setItemMeta(cMeta);
        if (minion.getEquipment() != null) {
            minion.getEquipment().setHelmet(helmet);
            minion.getEquipment().setHelmetDropChance(0.0f);
            minion.getEquipment().setChestplate(chest);
            minion.getEquipment().setChestplateDropChance(0.0f);
        }
        this.playerMinions.computeIfAbsent(owner.getUniqueId(), k -> new ArrayList()).add(minion);
    }

    @EventHandler
    public void onEnchant(EnchantItemEvent e) {
        if (this.isStaff(e.getItem())) {
            e.setCancelled(true);
        }
    }

    @EventHandler
    public void onAnvil(PrepareAnvilEvent e) {
        if (e.getInventory().getItem(0) != null && this.isStaff(e.getInventory().getItem(0))) {
            e.setResult(null);
        }
        if (e.getInventory().getItem(1) != null && this.isStaff(e.getInventory().getItem(1))) {
            e.setResult(null);
        }
    }

    @EventHandler
    public void onTarget(EntityTargetEvent e) {
        if (!e.getEntity().getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING)) {
            return;
        }
        if (e.getTarget() == null) {
            return;
        }
        String ownerUUIDStr = (String)e.getEntity().getPersistentDataContainer().get(this.minionKey, PersistentDataType.STRING);
        if (ownerUUIDStr == null) {
            return;
        }
        UUID ownerUUID = UUID.fromString(ownerUUIDStr);
        Entity target = e.getTarget();
        if (target.getUniqueId().equals(ownerUUID)) {
            e.setCancelled(true);
            return;
        }
        if (target.getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING)) {
            e.setCancelled(true);
            return;
        }
        if (target instanceof Player) {
            Player targetPlayer = (Player)target;
            if (!this.getConfig().getBoolean("target-players")) {
                e.setCancelled(true);
                return;
            }
            Player owner = Bukkit.getPlayer((UUID)ownerUUID);
            if (owner != null && this.areTeammates(owner, targetPlayer)) {
                e.setCancelled(true);
            }
        } else if (target instanceof Mob && !this.getConfig().getBoolean("target-mobs")) {
            e.setCancelled(true);
        }
    }

    @EventHandler
    public void onDamage(EntityDamageByEntityEvent e) {
        Projectile proj;
        ProjectileSource projectileSource;
        Entity damager = e.getDamager();
        Entity victim = e.getEntity();
        if (damager instanceof Projectile && (projectileSource = (proj = (Projectile)damager).getShooter()) instanceof Entity) {
            Entity shooter;
            damager = shooter = (Entity)projectileSource;
        }
        boolean damagerIsMinion = damager.getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING);
        boolean victimIsMinion = victim.getPersistentDataContainer().has(this.minionKey, PersistentDataType.STRING);
        if (damagerIsMinion && victimIsMinion) {
            e.setCancelled(true);
            return;
        }
        if (damagerIsMinion) {
            String ownerUUIDStr = (String)damager.getPersistentDataContainer().get(this.minionKey, PersistentDataType.STRING);
            if (ownerUUIDStr == null) {
                return;
            }
            UUID ownerUUID = UUID.fromString(ownerUUIDStr);
            if (victim.getUniqueId().equals(ownerUUID)) {
                e.setCancelled(true);
                return;
            }
            if (victim instanceof Player) {
                Player victimPlayer = (Player)victim;
                Player owner = Bukkit.getPlayer((UUID)ownerUUID);
                if (owner != null && this.areTeammates(owner, victimPlayer)) {
                    e.setCancelled(true);
                }
            }
        }
    }

    private boolean areTeammates(Player p1, Player p2) {
        if (p1 == null || p2 == null) {
            return false;
        }
        Team t1 = p1.getScoreboard().getPlayerTeam((OfflinePlayer)p1);
        Team t2 = p2.getScoreboard().getPlayerTeam((OfflinePlayer)p2);
        return t1 != null && t2 != null && t1.equals((Object)t2);
    }
}

