package test;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitRunnable;

/** Тестовый помощник: строит площадку, выдаёт меч, пишет в лог состояние бота. */
public class BotHelper extends JavaPlugin implements Listener, CommandExecutor {
    private static final NamespacedKey USES = new NamespacedKey("skyswordplugin", "sky_uses");
    private static final NamespacedKey ACTIVE = new NamespacedKey("skyswordplugin", "sky_active");
    private static final NamespacedKey CD = new NamespacedKey("skyswordplugin", "sky_cooldown_end");

    private final Map<UUID, Double> maxY = new HashMap<UUID, Double>();
    private final Map<UUID, Integer> tick = new HashMap<UUID, Integer>();
    private final Map<UUID, Boolean> fell = new HashMap<UUID, Boolean>();
    private final Map<UUID, Integer> peakSnow = new HashMap<UUID, Integer>();

    public void onEnable() {
        this.getServer().getPluginManager().registerEvents((Listener)this, (Plugin)this);
        this.getCommand("bh").setExecutor((CommandExecutor)this);
        this.getLogger().info("[BH] enabled");
        new BukkitRunnable() {
            public void run() {
                for (Player p : Bukkit.getOnlinePlayers()) {
                    if (!p.getName().startsWith("Bot")) continue;
                    UUID id = p.getUniqueId();
                    Integer t0 = BotHelper.this.tick.get(id);
                    int t = t0 == null ? 1 : t0 + 1;
                    BotHelper.this.tick.put(id, t);
                    double y = p.getLocation().getY();
                    Double m0 = BotHelper.this.maxY.get(id);
                    double m = m0 == null ? y : Math.max(m0, y);
                    BotHelper.this.maxY.put(id, m);
                    int snow = BotHelper.this.countSnow(p, 1);
                    Integer ps = BotHelper.this.peakSnow.get(id);
                    if (ps == null || snow > ps) BotHelper.this.peakSnow.put(id, snow);
                    if (t % 10 == 0) BotHelper.this.log(p, "T" + t);
                    if (t % 40 == 0) BotHelper.this.log(p, "SUMMARY t=" + t + " maxY=" + fmt(m) + " health=" + fmt(p.getHealth()) + " fell=" + BotHelper.this.fell.get(id) + " peakSnow=" + (ps == null ? 0 : ps) + " jumps=" + p.getStatistic(org.bukkit.Statistic.JUMP));
                    if (y < 99.4 && !Boolean.TRUE.equals(BotHelper.this.fell.get(id))) {
                        BotHelper.this.fell.put(id, true);
                        BotHelper.this.log(p, "*** FALL T" + t + " maxY=" + fmt(m));
                    }
                }
            }
        }.runTaskTimer((Plugin)this, 20L, 1L);
    }

    @EventHandler
    public void onChat(AsyncPlayerChatEvent e) {
        final String msg = e.getMessage();
        final boolean bh = msg.startsWith("!bh ");
        final boolean cmd = msg.startsWith("!cmd ");
        if (!bh && !cmd) return;
        e.setCancelled(true);
        final String full = cmd ? msg.substring(5) : msg.substring(1);
        Bukkit.getScheduler().runTask((Plugin)this, () -> Bukkit.dispatchCommand(Bukkit.getConsoleSender(), full));
    }

    @EventHandler
    public void onDamage(org.bukkit.event.entity.EntityDamageEvent e) {
        if (e.getEntity() instanceof Player && ((Player)e.getEntity()).getName().startsWith("Bot")) {
            this.getLogger().info("[BH] DAMAGE cause=" + e.getCause() + " amount=" + fmt(e.getDamage()) + " cancelled=" + e.isCancelled() + " health=" + fmt(((Player)e.getEntity()).getHealth()) + " difficulty=" + e.getEntity().getWorld().getDifficulty());
        }
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent e) {
        final Player p = e.getPlayer();
        if (!p.getName().startsWith("Bot")) return;
        Bukkit.getScheduler().runTaskLater((Plugin)this, () -> BotHelper.this.setup(p), 40L);
    }

    private void setup(Player p) {
        World w = p.getWorld();
        this.buildStage(w);
        Location start = new Location(w, 205.5, 100.0, 207.5, -90.0f, 0.0f);
        p.teleport(start);
        p.setGameMode(org.bukkit.GameMode.SURVIVAL);
        p.setFallDistance(0.0f);
        this.stats(p);
        Bukkit.getScheduler().runTaskLater((Plugin)this, () -> {
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "n_s give " + p.getName());
            Bukkit.getScheduler().runTaskLater((Plugin)this, () -> {
                int slot = -1;
                for (int i = 0; i < 36; ++i) {
                    ItemStack it = p.getInventory().getItem(i);
                    if (it != null && it.hasItemMeta() && it.getItemMeta().getPersistentDataContainer().has(USES, PersistentDataType.INTEGER)) {
                        slot = i;
                        break;
                    }
                }
                if (slot > 0) {
                    ItemStack it = p.getInventory().getItem(slot);
                    p.getInventory().setItem(0, it);
                    p.getInventory().setItem(slot, null);
                }
                p.getInventory().setHeldItemSlot(0);
                p.updateInventory();
                this.resetSword(p);
                this.log(p, "STAGE READY (start 205.5/100/207.5, walk +x, edge at x=211) swordSlot=" + slot);
            }, 10L);
        }, 10L);
    }

    private void resetSword(Player p) {
        ItemStack it = p.getInventory().getItemInMainHand();
        if (!(it != null && it.hasItemMeta() && it.getItemMeta().getPersistentDataContainer().has(USES, PersistentDataType.INTEGER))) {
            it = p.getInventory().getItemInOffHand();
        }
        if (it == null || !it.hasItemMeta()) return;
        ItemMeta meta = it.getItemMeta();
        if (!meta.getPersistentDataContainer().has(USES, PersistentDataType.INTEGER)) return;
        meta.getPersistentDataContainer().set(USES, PersistentDataType.INTEGER, 20);
        meta.getPersistentDataContainer().set(ACTIVE, PersistentDataType.BYTE, (byte)0);
        meta.getPersistentDataContainer().set(CD, PersistentDataType.LONG, 0L);
        it.setItemMeta(meta);
    }

    private void stats(Player p) {
        UUID id = p.getUniqueId();
        this.maxY.put(id, 100.0);
        this.fell.put(id, false);
        this.peakSnow.put(id, 0);
        this.tick.put(id, 0);
    }

    private void buildStage(World w) {
        for (int x = 200; x <= 300; ++x) {
            for (int y = 90; y <= 118; ++y) {
                for (int z = 200; z <= 214; ++z) {
                    w.getBlockAt(x, y, z).setType(Material.AIR);
                }
            }
        }
        for (int x = 200; x <= 210; ++x) {
            for (int z = 200; z <= 214; ++z) {
                w.getBlockAt(x, 99, z).setType(Material.STONE);
            }
        }
    }

    private int countSnow(Player p, int dy) {
        World w = p.getWorld();
        Location l = p.getLocation();
        int n = 0;
        for (int dx = -2; dx <= 2; ++dx)
            for (int dz = -2; dz <= 2; ++dz)
                if (w.getBlockAt(l.getBlockX() + dx, l.getBlockY() - dy, l.getBlockZ() + dz).getType() == Material.SNOW_BLOCK) ++n;
        return n;
    }

    private void log(Player p, String prefix) {
        World w = p.getWorld();
        Location l = p.getLocation();
        int bx = l.getBlockX(), by = l.getBlockY(), bz = l.getBlockZ();
        Block under = w.getBlockAt(bx, by - 1, bz);
        Block at = w.getBlockAt(bx, by, bz);
        int snow = 0, snow2 = 0;
        for (int dx = -2; dx <= 2; ++dx) {
            for (int dz = -2; dz <= 2; ++dz) {
                if (w.getBlockAt(bx + dx, by - 1, bz + dz).getType() == Material.SNOW_BLOCK) ++snow;
                if (w.getBlockAt(bx + dx, by - 2, bz + dz).getType() == Material.SNOW_BLOCK) ++snow2;
            }
        }
        ItemStack hand = p.getInventory().getItemInMainHand();
        int uses = -1, active = -1;
        ItemStack sw = hand;
        if (!(sw != null && sw.hasItemMeta() && sw.getItemMeta().getPersistentDataContainer().has(USES, PersistentDataType.INTEGER))) {
            sw = p.getInventory().getItemInOffHand();
        }
        if (sw != null && sw.hasItemMeta()) {
            ItemMeta meta = sw.getItemMeta();
            Integer u = meta.getPersistentDataContainer().get(USES, PersistentDataType.INTEGER);
            Byte a = meta.getPersistentDataContainer().get(ACTIVE, PersistentDataType.BYTE);
            uses = u == null ? -1 : u;
            active = a == null ? -1 : a;
        }
        this.getLogger().info("[BH] " + prefix + " pos=" + fmt(l.getX()) + "/" + fmt(l.getY()) + "/" + fmt(l.getZ())
            + " ground=" + p.isOnGround() + " health=" + fmt(p.getHealth())
            + " under=" + under.getType() + " at=" + at.getType()
            + " snowUnder=" + snow + " snow2=" + snow2
            + " uses=" + uses + " active=" + active + " velY=" + fmt(p.getVelocity().getY()));
    }

    private ItemStack createSword(Player p) {
        // Берём меч у игрока, если есть; иначе выдаём через команду плагина.
        for (int i = 0; i < 36; ++i) {
            ItemStack it = p.getInventory().getItem(i);
            if (it != null && it.hasItemMeta() && it.getItemMeta().getPersistentDataContainer().has(USES, PersistentDataType.INTEGER)) {
                return it.clone();
            }
        }
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "n_s give " + p.getName());
        for (int i = 0; i < 36; ++i) {
            ItemStack it = p.getInventory().getItem(i);
            if (it != null && it.hasItemMeta() && it.getItemMeta().getPersistentDataContainer().has(USES, PersistentDataType.INTEGER)) {
                return it.clone();
            }
        }
        return null;
    }

    private void map(World w, int y) {
        StringBuilder sb = new StringBuilder();
        for (int z = 202; z <= 214; ++z) {
            sb.setLength(0);
            sb.append("[BH] MAP y=").append(y).append(" z=").append(z).append(" ");
            for (int x = 200; x <= 290; ++x) {
                Material m = w.getBlockAt(x, y, z).getType();
                char c = '.';
                if (m == Material.SNOW_BLOCK) c = 'S';
                else if (m == Material.STONE) c = '#';
                else if (m == Material.WATER) c = '~';
                else if (m == Material.LAVA) c = '!';
                else if (m != Material.AIR) c = 'x';
                sb.append(c);
            }
            this.getLogger().info(sb.toString());
        }
    }

    private Player bot() {
        for (Player p : Bukkit.getOnlinePlayers()) if (p.getName().startsWith("Bot")) return p;
        return null;
    }

    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        this.getLogger().info("[BH] CMD " + label + " args=" + java.util.Arrays.toString(args));
        if (args.length == 0) return false;
        Player p = this.bot();
        if (p == null) { sender.sendMessage("no bot"); return true; }
        String sub = args[0].toLowerCase();
        if (sub.equals("stage")) { this.setup(p); }
        else if (sub.equals("reset")) {
            this.buildStage(p.getWorld());
            p.teleport(new Location(p.getWorld(), 205.5, 100.0, 207.5, -90.0f, 0.0f));
            p.setFallDistance(0.0f);
            this.stats(p);
            this.resetSword(p);
            this.log(p, "RESET");
        }
        else if (sub.equals("map")) { this.map(p.getWorld(), args.length > 1 ? Integer.parseInt(args[1]) : 99); }
        else if (sub.equals("snow")) {
            // поставить обычный снег полосой z=206..208, x=214..222 на y=99
            for (int x = 214; x <= 222; ++x) for (int z = 206; z <= 208; ++z) p.getWorld().getBlockAt(x, 99, z).setType(Material.SNOW_BLOCK);
            this.getLogger().info("[BH] world snow strip placed 214..222/99/206..208");
        }
        else if (sub.equals("water")) {
            for (int x = 212; x <= 214; ++x) for (int z = 206; z <= 208; ++z) p.getWorld().getBlockAt(x, 99, z).setType(Material.WATER);
            this.getLogger().info("[BH] water 212..214/99/206..208");
        }
        else if (sub.equals("lava")) {
            for (int x = 212; x <= 214; ++x) for (int z = 206; z <= 208; ++z) p.getWorld().getBlockAt(x, 99, z).setType(Material.LAVA);
            this.getLogger().info("[BH] lava 212..214/99/206..208");
        }
        else if (sub.equals("pool") || sub.equals("lavapool")) {
            boolean lava = sub.equals("lavapool");
            Material fluid = lava ? Material.LAVA : Material.WATER;
            for (int x = 212; x <= 218; ++x) {
                for (int z = 205; z <= 210; ++z) {
                    p.getWorld().getBlockAt(x, 97, z).setType(Material.STONE);
                    p.getWorld().getBlockAt(x, 98, z).setType(fluid);
                    p.getWorld().getBlockAt(x, 99, z).setType(fluid);
                    p.getWorld().getBlockAt(x, 100, z).setType(fluid);
                }
            }
            this.getLogger().info("[BH] " + sub + " ready 212..218/97..100/205..210");
        }
        else if (sub.equals("offhand")) {
            ItemStack main = p.getInventory().getItemInMainHand();
            ItemStack off = p.getInventory().getItemInOffHand();
            p.getInventory().setItemInOffHand(main);
            p.getInventory().setItemInMainHand(off);
            p.updateInventory();
            this.getLogger().info("[BH] sword moved, main=" + p.getInventory().getItemInMainHand().getType() + " off=" + p.getInventory().getItemInOffHand().getType());
        }
        else if (sub.equals("mainhand")) {
            ItemStack main = p.getInventory().getItemInMainHand();
            ItemStack off = p.getInventory().getItemInOffHand();
            if (!(main != null && main.hasItemMeta() && main.getItemMeta().getPersistentDataContainer().has(USES, PersistentDataType.INTEGER))) {
                p.getInventory().setItemInMainHand(off);
                p.getInventory().setItemInOffHand(null);
                p.updateInventory();
            }
            this.getLogger().info("[BH] sword in main, main=" + p.getInventory().getItemInMainHand().getType());
        }
        else if (sub.equals("drop")) {
            Location l = p.getLocation();
            p.teleport(new Location(l.getWorld(), l.getX(), 115.0, l.getZ()));
            p.setFallDistance(0.0f);
            this.maxY.put(p.getUniqueId(), 115.0);
            this.fell.put(p.getUniqueId(), false);
            this.getLogger().info("[BH] dropped to y=115");
        }
        else if (sub.equals("eff")) {
            p.addPotionEffect(new PotionEffect(PotionEffectType.RESISTANCE, 20 * 600, 4));
            p.addPotionEffect(new PotionEffect(PotionEffectType.FIRE_RESISTANCE, 20 * 600, 0));
            this.getLogger().info("[BH] effects");
        }
        else if (sub.equals("log")) { this.log(p, "MANUAL"); }
        else if (sub.equals("tp") && args.length >= 4) {
            p.teleport(new Location(p.getWorld(), Double.parseDouble(args[1]), Double.parseDouble(args[2]), Double.parseDouble(args[3]), -90.0f, 0.0f));
            p.setFallDistance(0.0f);
            this.maxY.put(p.getUniqueId(), Double.parseDouble(args[2]));
            this.fell.put(p.getUniqueId(), false);
            p.setHealth(20.0);
            final UUID id = p.getUniqueId();
            Bukkit.getScheduler().runTaskLater((Plugin)this, () -> {
                double y0 = p.getLocation().getY();
                BotHelper.this.log(p, "TP+" + 40 + " (after fall, health should be 20)");
            }, 40L);
            this.log(p, "TP");
        }
        else if (sub.equals("fakefall")) {
            // Синтетическое событие урона от падения: проверяем, отменяет ли его SkySword.
            org.bukkit.event.entity.EntityDamageEvent ev = new org.bukkit.event.entity.EntityDamageEvent(
                p, org.bukkit.event.entity.EntityDamageEvent.DamageCause.FALL, 10.0);
            Bukkit.getPluginManager().callEvent(ev);
            ItemStack m = p.getInventory().getItemInMainHand();
            ItemStack o = p.getInventory().getItemInOffHand();
            this.getLogger().info("[BH] FAKEFALL main=" + m.getType() + " off=" + o.getType() + " cancelled=" + ev.isCancelled());
        }
        else if (sub.equals("nosword")) {
            for (int i = 0; i < 36; ++i) {
                ItemStack it = p.getInventory().getItem(i);
                if (it != null && it.hasItemMeta() && it.getItemMeta().getPersistentDataContainer().has(USES, PersistentDataType.INTEGER)) {
                    p.getInventory().setItem(i, null);
                    p.getInventory().setItemInOffHand(null);
                    this.getLogger().info("[BH] sword removed from slot " + i);
                    break;
                }
            }
            p.updateInventory();
            this.log(p, "NOSWORD");
        }
        else if (sub.equals("sword")) {
            ItemStack sw = this.createSword(p);
            p.getInventory().setItem(0, sw);
            p.getInventory().setHeldItemSlot(0);
            p.updateInventory();
            this.log(p, "SWORD");
        }
        else if (sub.equals("at") && args.length >= 5) {
            int x = Integer.parseInt(args[1]), y = Integer.parseInt(args[2]), z = Integer.parseInt(args[3]);
            this.getLogger().info("[BH] AT " + x + "/" + y + "/" + z + " = " + p.getWorld().getBlockAt(x, y, z).getType());
        }
        else if (sub.equals("scan")) {
            int x1 = 205, x2 = 300, y1 = 95, y2 = 103, z1 = 202, z2 = 213;
            java.util.Map<String, Integer> counts = new java.util.TreeMap<String, Integer>();
            for (int x = x1; x <= x2; ++x)
                for (int y = y1; y <= y2; ++y)
                    for (int z = z1; z <= z2; ++z) {
                        Material m = p.getWorld().getBlockAt(x, y, z).getType();
                        if (m == Material.AIR) continue;
                        String k = m.name() + "@y" + y;
                        Integer c = counts.get(k);
                        counts.put(k, c == null ? 1 : c + 1);
                    }
            this.getLogger().info("[BH] SCAN " + counts);
        }
        return true;
    }

    private static String fmt(double d) { return String.format("%.2f", d); }
}
