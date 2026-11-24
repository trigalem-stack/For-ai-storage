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

    private int countSnow(World w, int x0, int x1, int y, int z0, int z1) {
        int n = 0;
        for (int x = x0; x <= x1; ++x) {
            for (int z = z0; z <= z1; ++z) {
                if (w.getBlockAt(x, y, z).getType() == Material.SNOW_BLOCK) ++n;
            }
        }
        return n;
    }

    /* Separate stage for the sky sword: floor top y=246, hole under the future platform. */
    private void buildSkyStage(World w) {
        for (int x = 30; x <= 38; ++x) {
            for (int y = 240; y <= 265; ++y) {
                for (int z = 0; z <= 4; ++z) {
                    w.getBlockAt(x, y, z).setType(Material.AIR);
                }
            }
        }
        for (int x = 30; x <= 38; ++x) {
            for (int z = 0; z <= 4; ++z) {
                w.getBlockAt(x, 245, z).setType(Material.STONE);
            }
        }
        for (int x = 33; x <= 35; ++x) {
            for (int z = 1; z <= 3; ++z) {
                w.getBlockAt(x, 245, z).setType(Material.AIR);
            }
        }
    }

    private void testSky(World w) throws Exception {
        this.buildSkyStage(w);
        Plugin ss = Bukkit.getPluginManager().getPlugin("SkySwordPlugin");
        Method gen = ss.getClass().getDeclaredMethod("generatePlatform", Location.class);
        gen.setAccessible(true);
        Method only = ss.getClass().getDeclaredMethod("onlySnowBlocks", World.class, Location.class, double.class, double.class);
        only.setAccessible(true);
        Location center = new Location(w, 34.0, 245.0, 2.0);
        Object placed = gen.invoke(ss, center);
        this.log("G1 generatePlatform at (34,245,2) -> " + placed + ", snow in 3x3 = " + this.countSnow(w, 33, 35, 245, 1, 3) + "   [true, 9]");
        Object again = gen.invoke(ss, center);
        this.log("G2 generatePlatform again same center -> " + again + "   [false: all 9 already snow]");
        Object o1 = only.invoke(ss, w, new Location(w, 34.5, 245.4, 2.5), 0.3, 1.8);
        this.log("O1 onlySnowBlocks feet 0.4 inside snow platform -> " + o1 + "   [true]");
        w.getBlockAt(34, 247, 2).setType(Material.STONE);
        Object o2 = only.invoke(ss, w, new Location(w, 34.5, 245.4, 2.5), 0.3, 1.8);
        this.log("O2 same + stone at head level (34,247,2) -> " + o2 + "   [false]");
        w.getBlockAt(34, 247, 2).setType(Material.AIR);
        Object o3 = only.invoke(ss, w, new Location(w, 36.5, 245.5, 2.5), 0.3, 1.8);
        this.log("O3 onlySnowBlocks feet inside stone floor (36,245,2) -> " + o3 + "   [false]");
        Object o4 = only.invoke(ss, w, new Location(w, 34.5, 250.0, 2.5), 0.3, 1.8);
        this.log("O4 onlySnowBlocks in free air -> " + o4 + "   [true]");
        Bukkit.getScheduler().runTaskLater(this, () -> {
            int left = this.countSnow(w, 33, 35, 245, 1, 3);
            this.log("G3 105 ticks later snow blocks left = " + left + "   [0: platform removed itself]");
            this.log("ALL TESTS DONE");
        }, 105L);
    }
}
