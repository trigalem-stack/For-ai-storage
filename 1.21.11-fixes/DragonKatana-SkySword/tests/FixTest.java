package test;

import java.lang.reflect.Method;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

public class FixTest extends JavaPlugin {
    public void onEnable() {
        Bukkit.getScheduler().runTaskLater(this, this::run, 60L);
    }

    private void log(String s) {
        this.getLogger().info("[TEST] " + s);
    }

    private void run() {
        try {
            World w = Bukkit.getWorlds().get(0);
            this.build(w);
            this.testKatana(w);
            this.testSky(w);
            this.log("ALL TESTS DONE");
        }
        catch (Throwable t) {
            this.log("FAILED: " + t);
            t.printStackTrace();
        }
    }

    private void build(World w) {
        int x;
        int z;
        for (x = -2; x <= 40; ++x) {
            for (int y = 240; y <= 265; ++y) {
                for (z = -2; z <= 14; ++z) {
                    w.getBlockAt(x, y, z).setType(Material.AIR);
                }
            }
        }
        for (x = 0; x <= 13; ++x) {
            for (z = 0; z <= 11; ++z) {
                w.getBlockAt(x, 249, z).setType(Material.STONE);
            }
        }
        for (x = 14; x <= 30; ++x) {
            for (z = 6; z <= 11; ++z) {
                w.getBlockAt(x, 246, z).setType(Material.STONE);
            }
        }
        for (z = 0; z <= 5; ++z) {
            w.getBlockAt(22, 250, z).setType(Material.STONE);
            w.getBlockAt(22, 251, z).setType(Material.STONE);
        }
        w.getBlockAt(5, 250, 5).setType(Material.STONE);
        for (x = 16; x <= 18; ++x) {
            for (z = 2; z <= 4; ++z) {
                w.getBlockAt(x, 249, z).setType(Material.SNOW_BLOCK);
            }
        }
    }

    private static Location eye(World w, double x, double y, double z, double dx, double dy, double dz) {
        return new Location(w, x, y, z).setDirection(new Vector(dx, dy, dz));
    }

    private void testKatana(World w) throws Exception {
        Plugin dk = Bukkit.getPluginManager().getPlugin("DragonKatana");
        Method m = dk.getClass().getDeclaredMethod("computeDestination", World.class, Location.class);
        m.setAccessible(true);
        this.kat(m, w, "K1 look straight down at floor", eye(w, 10.5, 251.62, 2.5, 0.0, -1.0, 0.0), "10.5/250/2.5");
        this.kat(m, w, "K2 look 45deg down +x (floor)", eye(w, 10.5, 251.62, 2.5, 1.0, -1.0, 0.0), "12.5/250/2.5");
        this.kat(m, w, "K3 look 20deg down +x into pit", eye(w, 10.5, 251.62, 2.5, 1.0, -0.364, 0.0), "air beyond pit");
        this.kat(m, w, "K4 look horizontal +x at barrier top edge", eye(w, 10.5, 251.62, 2.5, 1.0, 0.0, 0.0), "22.5/252/2.5 on top");
        this.kat(m, w, "K5 look at barrier side", eye(w, 18.5, 251.62, 2.5, 1.0, -0.364, 0.0), "21.5/.../2.5 in front");
        this.kat(m, w, "K6 lone block upper edge", eye(w, 8.5, 251.62, 5.5, -1.0, -0.3, 0.0), "5.5/251/5.5 on top");
        this.kat(m, w, "K7 lone block side", eye(w, 8.5, 251.62, 5.5, -1.0, -0.5, 0.0), "6.5/250/5.5 in front");
        this.kat(m, w, "K8 sky", eye(w, 10.5, 251.62, 2.5, 0.0, 1.0, 0.0), "10.5/265/2.5 air");
        this.kat(m, w, "K9 floor right in front", eye(w, 10.5, 251.62, 5.5, 0.6, -0.8, 0.0), "11.5/250/5.5");
        this.kat(m, w, "K10 from edge look 60deg down +x", eye(w, 13.5, 251.62, 2.5, 0.5, -0.866, 0.0), "air beyond pit");
        this.kat(m, w, "K11 low ground ahead", eye(w, 10.5, 251.62, 8.5, 1.0, -0.364, 0.0), "23.5/247/8.5");
        this.kat(m, w, "K12 look at underside of lone block? (from below)", eye(w, 5.5, 249.0, 5.5, 0.0, 1.0, 0.0), "null (no room) or 5.5/248.2/5.5");
        // 3-high wall at x=22..? use barrier 250..251: look at middle of upper block side (251.5)
        this.kat(m, w, "K13 barrier side, hit at 251.5 (0.5 below top)", eye(w, 18.5, 251.62, 2.5, 1.0, -0.0343, 0.0), "22.5/252/2.5 on top (or 21.5 in front)");
        this.kat(m, w, "K14 barrier lower block side, hit at 250.6", eye(w, 18.5, 251.62, 2.5, 1.0, -0.2914, 0.0), "21.5/250.6-1.62.. (air, void)");
        this.kat(m, w, "K15 lone block side, hit at 250.2 (just above floor)", eye(w, 8.5, 251.62, 5.5, 1.0, -0.568, 0.0), "6.5/250/5.5 in front on floor");
        this.kat(m, w, "K16 look at block 2 above floor (lone block at 250) from far, hit 250.9", eye(w, 20.5, 251.62, 5.5, -1.0, -0.06, 0.0), "6.5/250/5.5 in front on floor");
    }

    private void kat(Method m, World w, String name, Location e, String expect) {
        try {
            Location r = (Location)m.invoke(Bukkit.getPluginManager().getPlugin("DragonKatana"), w, e);
            this.log(name + " -> " + (r == null ? "null" : String.format("%.2f/%.2f/%.2f", r.getX(), r.getY(), r.getZ())) + "   [" + expect + "]");
        }
        catch (Exception ex) {
            this.log(name + " -> EX " + ex);
        }
    }

    private void testSky(World w) throws Exception {
        Plugin ss = Bukkit.getPluginManager().getPlugin("SkySwordPlugin");
        Method pm = ss.getClass().getDeclaredMethod("predict", World.class, double.class, double.class, double.class, double.class, double.class, double.class, boolean.class, int.class);
        pm.setAccessible(true);
        this.sky(pm, ss, w, "S1 far from edge", 9.0, 250.0, 2.5, 0.28, 0.0, 0.0, true, "supported");
        this.sky(pm, ss, w, "S2 1 block from edge (sprint)", 13.0, 250.0, 2.5, 0.28, 0.0, 0.0, true, "leaveTick 4, flush possible");
        this.sky(pm, ss, w, "S3 at edge (sprint)", 13.9, 250.0, 2.5, 0.28, 0.0, 0.0, true, "leaveTick 1, falling into pit");
        this.sky(pm, ss, w, "S4 at edge over low ground", 13.9, 250.0, 8.5, 0.28, 0.0, 0.0, true, "null (caught by low ground)");
        this.sky(pm, ss, w, "S5 airborne over pit", 20.5, 252.0, 2.5, 0.28, -0.5, 0.0, false, "falling, needs platform");
        this.sky(pm, ss, w, "S6 airborne over low ground", 20.5, 249.0, 8.5, 0.0, -0.3, 0.0, false, "null (caught)");
        this.sky(pm, ss, w, "S7 jump in place", 5.5, 250.0, 2.5, 0.0, 0.42, 0.0, true, "null (jump lands back)");
        this.sky(pm, ss, w, "S8 jump toward edge (airborne)", 13.0, 250.42, 2.5, 0.28, 0.37, 0.0, false, "falling, needs platform");
        this.sky(pm, ss, w, "S9 on cloud toward edge", 18.5, 250.0, 3.5, 0.28, 0.0, 0.0, true, "leaveTick 2, falling");
        this.sky(pm, ss, w, "S10 walking on flat ground", 5.0, 250.0, 2.5, 0.0, 0.0, 0.28, true, "supported (null leaveTick)");
        this.sky(pm, ss, w, "S11 sprinting on flat ground", 5.0, 250.0, 2.5, 0.28, 0.0, 0.0, true, "leaveTick 13 (edge at 14)");
        this.sky(pm, ss, w, "S12 falling fast over pit", 20.5, 255.0, 2.5, 0.0, -1.0, 0.0, false, "falling, needs platform");
        this.sky(pm, ss, w, "S7b jump in place (airborne, vy=0.42)", 5.5, 250.0, 2.5, 0.0, 0.42, 0.0, false, "null (lands back on floor)");
        this.sky(pm, ss, w, "S13 standing on cloud, sprint toward low-ground side (z-)", 17.5, 250.0, 2.6, 0.0, 0.0, -0.28, true, "leave 1-2, falls 3 -> caught by low ground? (void here z<6 -> platform)");
        this.sky(pm, ss, w, "S14 sprint toward edge on main floor from x=12", 12.0, 250.0, 2.5, 0.28, 0.0, 0.0, true, "leave 7 (>lead) -> no platform");
    }

    private void sky(Method m, Plugin ss, World w, String name, double x, double y, double z, double vx, double vy, double vz, boolean sup, String expect) {
        try {
            double[] r = (double[])m.invoke(ss, w, x, y, z, vx, vy, vz, sup, 4);
            this.log(name + " -> " + (r == null ? "null" : String.format("%.2f/%.2f/%.2f leave=%d", r[0], r[1], r[2], (int)r[3])) + "   [" + expect + "]");
        }
        catch (Exception ex) {
            this.log(name + " -> EX " + ex);
        }
    }
}
