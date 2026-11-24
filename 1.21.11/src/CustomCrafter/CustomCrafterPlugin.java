package com.example.crafter;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.Color;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Display;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Interaction;
import org.bukkit.entity.Item;
import org.bukkit.entity.ItemDisplay;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockExplodeEvent;
import org.bukkit.event.block.BlockPistonExtendEvent;
import org.bukkit.event.block.BlockPistonRetractEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.event.world.ChunkUnloadEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.util.Transformation;
import org.bukkit.util.Vector;
import org.bukkit.util.io.BukkitObjectInputStream;
import org.bukkit.util.io.BukkitObjectOutputStream;
import org.joml.AxisAngle4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

public class CustomCrafterPlugin
extends JavaPlugin
implements Listener {
    private static final String PEDESTAL_NAME = "\u00a76\u0410\u043b\u0442\u0430\u0440\u044c \u041a\u0440\u0430\u0444\u0442\u0430";
    private static final String TITLE_STEP1 = "\u00a7a\u041f\u043e\u043b\u043e\u0436\u0438\u0442\u0435 \u043f\u0440\u0435\u0434\u043c\u0435\u0442";
    private static final String TITLE_STEP2 = "\u00a7a\u041f\u043e\u043b\u043e\u0436\u0438\u0442\u0435 \u0438\u043d\u0433\u0440\u0435\u0434\u0438\u0435\u043d\u0442\u044b";
    private final Map<UUID, Location> pendingSetup = new HashMap<UUID, Location>();
    private final Map<UUID, ItemStack> pendingResult = new HashMap<UUID, ItemStack>();
    private final Map<Location, CrafterNode> nodes = new HashMap<Location, CrafterNode>();
    private final Map<Location, Float> rotationAngles = new HashMap<Location, Float>();
    private NamespacedKey tagKey;
    private NamespacedKey guiKey;
    private File dataFile;

    public void onEnable() {
        this.tagKey = new NamespacedKey((Plugin)this, "pedestal");
        this.guiKey = new NamespacedKey((Plugin)this, "gui_item");
        if (!this.getDataFolder().exists()) {
            this.getDataFolder().mkdirs();
        }
        this.dataFile = new File(this.getDataFolder(), "pedestals.yml");
        Bukkit.getPluginManager().registerEvents((Listener)this, (Plugin)this);
        new BukkitRunnable(){

            public void run() {
                for (CrafterNode node : new ArrayList<CrafterNode>(CustomCrafterPlugin.this.nodes.values())) {
                    if (node.itemDisplay == null || !node.itemDisplay.isValid()) continue;
                    Location loc = node.loc;
                    float angle = CustomCrafterPlugin.this.rotationAngles.getOrDefault(loc, Float.valueOf(0.0f)).floatValue();
                    if ((double)(angle += (float)Math.toRadians(3.0)) > Math.PI * 2) {
                        angle -= (float)Math.PI * 2;
                    }
                    CustomCrafterPlugin.this.rotationAngles.put(loc, Float.valueOf(angle));
                    float scale = 0.6f;
                    AxisAngle4f axisAngle = new AxisAngle4f(angle, 0.0f, 1.0f, 0.0f);
                    Quaternionf rotation = new Quaternionf(axisAngle);
                    Transformation old = node.itemDisplay.getTransformation();
                    node.itemDisplay.setTransformation(new Transformation(old.getTranslation(), rotation, new Vector3f(scale, scale, scale), old.getRightRotation()));
                    node.itemDisplay.setInterpolationDuration(1);
                    node.itemDisplay.setInterpolationDelay(0);
                }
            }
        }.runTaskTimer((Plugin)this, 0L, 1L);
        this.loadPedestals();
        this.getLogger().info("CustomCrafter enabled!");
    }

    public void onDisable() {
        this.savePedestals();
        for (CrafterNode node : this.nodes.values()) {
            this.despawnNode(node);
        }
        this.nodes.clear();
        this.rotationAngles.clear();
        this.pendingSetup.clear();
        this.pendingResult.clear();
    }

    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (cmd.getName().equalsIgnoreCase("pedestal")) {
            if (args.length == 2 && args[0].equalsIgnoreCase("give")) {
                Player target = Bukkit.getPlayer((String)args[1]);
                if (target != null) {
                    target.getInventory().addItem(new ItemStack[]{this.makePedestalItem()});
                    sender.sendMessage("\u00a7a\u0412\u044b\u0434\u0430\u043d \u0430\u043b\u0442\u0430\u0440\u044c \u043a\u0440\u0430\u0444\u0442\u0430 \u0438\u0433\u0440\u043e\u043a\u0443 " + target.getName());
                } else {
                    sender.sendMessage("\u00a7c\u0418\u0433\u0440\u043e\u043a \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.");
                }
            } else {
                sender.sendMessage("\u00a7c\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435: /pedestal give <\u043d\u0438\u043a>");
            }
            return true;
        }
        return false;
    }

    @EventHandler
    public void onPlace(BlockPlaceEvent e) {
        if (e.getBlock().getType() != Material.REINFORCED_DEEPSLATE) {
            return;
        }
        ItemStack hand = e.getItemInHand();
        if (!hand.hasItemMeta()) {
            return;
        }
        ItemMeta m = hand.getItemMeta();
        if (!m.hasDisplayName()) {
            return;
        }
        if (!m.getDisplayName().equals(PEDESTAL_NAME)) {
            return;
        }
        Player p = e.getPlayer();
        Inventory inv = Bukkit.createInventory(null, (int)9, (String)TITLE_STEP1);
        ItemStack pane = this.makePane();
        for (int i = 0; i < 9; ++i) {
            if (i == 4 || i == 8) continue;
            inv.setItem(i, pane);
        }
        p.openInventory(inv);
        this.pendingSetup.put(p.getUniqueId(), e.getBlock().getLocation());
    }

    @EventHandler
    public void onClick(InventoryClickEvent e) {
        Player p = (Player)e.getWhoClicked();
        String title = e.getView().getTitle();
        if (title.equals(TITLE_STEP1)) {
            this.handleStep1Click(e, p);
        } else if (title.equals(TITLE_STEP2)) {
            this.handleStep2Click(e, p);
        }
    }

    private void handleStep1Click(InventoryClickEvent e, Player p) {
        if (e.getClickedInventory() == e.getView().getTopInventory() && e.getSlot() != 4 && e.getSlot() != 8) {
            e.setCancelled(true);
        }
        Bukkit.getScheduler().runTask((Plugin)this, () -> {
            ItemStack target = e.getView().getTopInventory().getItem(4);
            if (target != null && target.getType() != Material.AIR) {
                e.getView().getTopInventory().setItem(8, this.makeButton(Material.LIME_CONCRETE, "\u00a7a\u0414\u0430\u043b\u0435\u0435"));
            } else {
                e.getView().getTopInventory().setItem(8, null);
            }
        });
        if (e.getClickedInventory() == e.getView().getTopInventory() && e.getSlot() == 8 && e.getCurrentItem() != null && e.getCurrentItem().getType() == Material.LIME_CONCRETE) {
            e.setCancelled(true);
            ItemStack target = e.getView().getTopInventory().getItem(4);
            if (target == null || target.getType() == Material.AIR) {
                return;
            }
            this.pendingResult.put(p.getUniqueId(), target.clone());
            Inventory inv2 = Bukkit.createInventory(null, (int)54, (String)TITLE_STEP2);
            ItemStack pane = this.makePane();
            for (int i = 45; i < 53; ++i) {
                inv2.setItem(i, pane);
            }
            inv2.setItem(53, this.makeButton(Material.LIME_CONCRETE, "\u00a7a\u0421\u043e\u0437\u0434\u0430\u0442\u044c"));
            p.openInventory(inv2);
        }
    }

    private void handleStep2Click(InventoryClickEvent e, Player p) {
        if (e.getClickedInventory() == e.getView().getTopInventory() && e.getSlot() >= 45) {
            e.setCancelled(true);
            if (e.getSlot() == 53) {
                Location loc = this.pendingSetup.remove(p.getUniqueId());
                ItemStack result = this.pendingResult.remove(p.getUniqueId());
                if (loc == null || result == null) {
                    return;
                }
                ArrayList<ItemStack> ingredients = new ArrayList<ItemStack>();
                for (int i = 0; i < 45; ++i) {
                    ItemStack item = e.getView().getTopInventory().getItem(i);
                    if (item == null || item.getType() == Material.AIR) continue;
                    ingredients.add(item.clone());
                }
                if (ingredients.isEmpty()) {
                    p.sendMessage("\u00a7c\u0418\u043d\u0433\u0440\u0435\u0434\u0438\u0435\u043d\u0442\u044b \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u044b.");
                    p.closeInventory();
                    return;
                }
                this.createPedestal(loc, result, ingredients);
                p.sendMessage("\u00a7a\u0421\u0431\u043e\u0440\u0449\u0438\u043a \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0441\u043e\u0437\u0434\u0430\u043d!");
                p.closeInventory();
            }
        } else {
            Bukkit.getScheduler().runTask((Plugin)this, () -> {
                e.getView().getTopInventory().setItem(53, this.makeButton(Material.LIME_CONCRETE, "\u00a7a\u0421\u043e\u0437\u0434\u0430\u0442\u044c"));
                ItemStack pane = this.makePane();
                for (int i = 45; i < 53; ++i) {
                    ItemStack cur = e.getView().getTopInventory().getItem(i);
                    if (cur != null && cur.getType() == Material.GRAY_STAINED_GLASS_PANE) continue;
                    e.getView().getTopInventory().setItem(i, pane);
                }
            });
        }
    }

    @EventHandler
    public void onClose(InventoryCloseEvent e) {
        if (!(e.getPlayer() instanceof Player)) {
            return;
        }
        final Player p = (Player)e.getPlayer();
        String title = e.getView().getTitle();
        if (!title.equals(TITLE_STEP1) && !title.equals(TITLE_STEP2)) {
            return;
        }
        final Inventory top = e.getView().getTopInventory();
        Bukkit.getScheduler().runTaskLater((Plugin)this, () -> {
            String open;
            if (this.pendingSetup.containsKey(p.getUniqueId()) && !(open = p.getOpenInventory().getTitle()).contains("\u041f\u043e\u043b\u043e\u0436\u0438\u0442\u0435")) {
                Location loc = this.pendingSetup.remove(p.getUniqueId());
                ItemStack target = this.pendingResult.remove(p.getUniqueId());
                if (loc != null && !this.nodes.containsKey(loc)) {
                    this.returnItems(p, top);
                    if (target != null) {
                        this.giveItem(p, target);
                    }
                    this.removeIncompletePedestal(p, loc);
                    p.sendMessage("\u00a7c\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u0430\u043b\u0442\u0430\u0440\u044f \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u043e.");
                }
            }
        }, 1L);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        Player p = e.getPlayer();
        Location loc = this.pendingSetup.remove(p.getUniqueId());
        ItemStack target = this.pendingResult.remove(p.getUniqueId());
        if (loc == null) {
            return;
        }
        if (this.nodes.containsKey(loc)) {
            if (target != null) {
                this.giveItem(p, target);
            }
            return;
        }
        Inventory top = p.getOpenInventory().getTopInventory();
        String openTitle = p.getOpenInventory().getTitle();
        if (top != null && (openTitle.equals(TITLE_STEP1) || openTitle.equals(TITLE_STEP2))) {
            this.returnItems(p, top);
        }
        if (target != null) {
            this.giveItem(p, target);
        }
        this.removeIncompletePedestal(p, loc);
    }

    private void createPedestal(Location loc, ItemStack result, List<ItemStack> ingredients) {
        CrafterNode old = this.nodes.get(loc);
        if (old != null) {
            this.despawnNode(old);
        }
        CrafterNode node = new CrafterNode(loc, result.clone(), ingredients, result.getType().isBlock());
        this.nodes.put(loc, node);
        this.rotationAngles.put(loc, Float.valueOf(0.0f));
        this.spawnNodeEntities(node);
        this.savePedestals();
    }

    private void spawnNodeEntities(CrafterNode node) {
        Location loc = node.loc;
        World w = loc.getWorld();
        if (w == null) {
            return;
        }
        ItemStack result = node.result;
        Location center = loc.clone().add(0.5, 0.0, 0.5);
        double itemY = 2.2;
        float scale = 1.2f;
        Location spawnLoc = center.clone().add(0.0, itemY, 0.0);
        ItemDisplay id = (ItemDisplay)w.spawn(spawnLoc, ItemDisplay.class);
        id.setItemStack(result.clone());
        id.setItemDisplayTransform(ItemDisplay.ItemDisplayTransform.NONE);
        Quaternionf identity = new Quaternionf();
        id.setTransformation(new Transformation(new Vector3f(0.0f, 0.0f, 0.0f), identity, new Vector3f(scale, scale, scale), identity));
        id.setBrightness(new Display.Brightness(15, 15));
        double textY = itemY + 0.5 + (double)scale / 2.0;
        TextDisplay td = (TextDisplay)w.spawn(center.clone().add(0.0, textY, 0.0), TextDisplay.class);
        td.setBillboard(Display.Billboard.CENTER);
        td.setAlignment(TextDisplay.TextAlignment.CENTER);
        td.setBackgroundColor(Color.fromARGB((int)160, (int)0, (int)0, (int)0));
        td.setShadowed(true);
        td.setText(this.buildNodeText(node));
        Interaction interaction = (Interaction)w.spawn(center.clone().add(0.0, 1.0, 0.0), Interaction.class);
        interaction.setInteractionWidth(3.0f);
        interaction.setInteractionHeight(3.0f);
        interaction.setResponsive(true);
        this.tag(id);
        this.tag(td);
        this.tag(interaction);
        node.itemDisplay = id;
        node.textDisplay = td;
        node.interaction = interaction;
    }

    private void tag(Entity entity) {
        entity.getPersistentDataContainer().set(this.tagKey, (PersistentDataType)PersistentDataType.BYTE, (Object)Byte.valueOf((byte)1));
        entity.setPersistent(true);
    }

    private boolean isTagged(Entity entity) {
        return entity.getPersistentDataContainer().has(this.tagKey, (PersistentDataType)PersistentDataType.BYTE);
    }

    private String buildNodeText(CrafterNode node) {
        StringBuilder text = new StringBuilder();
        text.append("\u00a76\u25b6 \u0418\u043d\u0433\u0440\u0435\u0434\u0438\u0435\u043d\u0442\u044b:\n");
        for (ItemStack ing : node.ingredients) {
            text.append("\u00a7f\u2022 ").append(ing.getAmount()).append("x ").append(this.getRussianName(ing)).append("\n");
        }
        String resName = node.result.hasItemMeta() && node.result.getItemMeta().hasDisplayName() ? node.result.getItemMeta().getDisplayName() : this.getRussianName(node.result);
        text.append("\u00a7e\u26a1 ").append(resName);
        return text.toString();
    }

    private void despawnNode(CrafterNode node) {
        if (node.itemDisplay != null) {
            node.itemDisplay.remove();
        }
        if (node.textDisplay != null) {
            node.textDisplay.remove();
        }
        if (node.interaction != null) {
            node.interaction.remove();
        }
        node.itemDisplay = null;
        node.textDisplay = null;
        node.interaction = null;
    }

    @EventHandler
    public void onBreak(BlockBreakEvent e) {
        if (e.getBlock().getType() != Material.REINFORCED_DEEPSLATE) {
            return;
        }
        Location loc = e.getBlock().getLocation();
        if (!this.nodes.containsKey(loc)) {
            return;
        }
        if (e.getPlayer().getGameMode() == GameMode.CREATIVE) {
            e.getBlock().setType(Material.AIR);
            this.cleanupNode(loc);
        } else {
            e.setCancelled(true);
        }
    }

    @EventHandler
    public void onExplode(EntityExplodeEvent e) {
        e.blockList().removeIf(b -> this.nodes.containsKey(b.getLocation()));
    }

    @EventHandler
    public void onBlockExplode(BlockExplodeEvent e) {
        e.blockList().removeIf(b -> this.nodes.containsKey(b.getLocation()));
    }

    @EventHandler
    public void onPistonExtend(BlockPistonExtendEvent e) {
        for (Block b : e.getBlocks()) {
            if (!this.nodes.containsKey(b.getLocation())) continue;
            e.setCancelled(true);
            return;
        }
    }

    @EventHandler
    public void onPistonRetract(BlockPistonRetractEvent e) {
        for (Block b : e.getBlocks()) {
            if (!this.nodes.containsKey(b.getLocation())) continue;
            e.setCancelled(true);
            return;
        }
    }

    @EventHandler
    public void onInteract(PlayerInteractEvent e) {
        if (e.getAction() != Action.RIGHT_CLICK_BLOCK) {
            return;
        }
        if (e.getClickedBlock() == null) {
            return;
        }
        if (e.getClickedBlock().getType() != Material.REINFORCED_DEEPSLATE) {
            return;
        }
        this.tryCraft(e.getPlayer(), e.getClickedBlock().getLocation());
    }

    @EventHandler
    public void onEntityInteract(PlayerInteractEntityEvent e) {
        if (!(e.getRightClicked() instanceof Interaction)) {
            return;
        }
        Interaction in = (Interaction)e.getRightClicked();
        for (Map.Entry<Location, CrafterNode> entry : this.nodes.entrySet()) {
            if (entry.getValue().interaction == null || !entry.getValue().interaction.equals((Object)in)) continue;
            this.tryCraft(e.getPlayer(), entry.getKey());
            return;
        }
    }

    private void tryCraft(final Player p, final Location loc) {
        final CrafterNode node = this.nodes.get(loc);
        if (node == null) {
            return;
        }
        Inventory testInv = Bukkit.createInventory(null, (int)36);
        testInv.setContents(p.getInventory().getStorageContents());
        LinkedHashMap<ItemStack, Integer> missing = new LinkedHashMap<ItemStack, Integer>();
        for (ItemStack itemStack : node.ingredients) {
            int needed = itemStack.getAmount();
            for (int i = 0; i < testInv.getSize(); ++i) {
                ItemStack pItem = testInv.getItem(i);
                if (pItem == null || !pItem.isSimilar(itemStack)) continue;
                if (pItem.getAmount() >= needed) {
                    pItem.setAmount(pItem.getAmount() - needed);
                    needed = 0;
                    break;
                }
                needed -= pItem.getAmount();
                testInv.setItem(i, null);
            }
            if (needed <= 0) continue;
            ItemStack miss = itemStack.clone();
            miss.setAmount(needed);
            missing.put(miss, needed);
        }
        if (!missing.isEmpty()) {
            p.sendMessage("\u00a7c\u0412\u0430\u043c \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442:");
            for (Map.Entry entry : missing.entrySet()) {
                p.sendMessage("\u00a7c- " + this.getRussianName((ItemStack)entry.getKey()) + " x" + String.valueOf(entry.getValue()));
            }
            return;
        }
        p.getInventory().setStorageContents(testInv.getContents());
        final World w = loc.getWorld();
        w.strikeLightningEffect(loc);
        loc.getBlock().setType(Material.AIR);
        this.cleanupNode(loc);
        new BukkitRunnable(){

            public void run() {
                Location dropLoc = loc.clone().add(0.5, 1.2, 0.5);
                Item droppedItem = (Item)w.spawn(dropLoc, Item.class);
                droppedItem.setItemStack(node.result);
                droppedItem.setVelocity(new Vector(0, 0, 0));
                droppedItem.setGravity(false);
                String name = node.result.hasItemMeta() && node.result.getItemMeta().hasDisplayName() ? node.result.getItemMeta().getDisplayName() : CustomCrafterPlugin.this.getRussianName(node.result);
                Bukkit.broadcastMessage((String)("\u00a7e\u0418\u0433\u0440\u043e\u043a " + p.getName() + " \u0441\u043a\u0440\u0430\u0444\u0442\u0438\u043b " + name + "!"));
            }
        }.runTaskLater((Plugin)this, 10L);
    }

    private void cleanupNode(Location loc) {
        CrafterNode node = this.nodes.remove(loc);
        this.rotationAngles.remove(loc);
        if (node != null) {
            this.despawnNode(node);
        }
        this.savePedestals();
    }

    private ItemStack makePane() {
        ItemStack pane = new ItemStack(Material.GRAY_STAINED_GLASS_PANE);
        ItemMeta m = pane.getItemMeta();
        m.setDisplayName(" ");
        pane.setItemMeta(m);
        return this.markGuiItem(pane);
    }

    private ItemStack makeButton(Material mat, String name) {
        ItemStack btn = new ItemStack(mat);
        ItemMeta m = btn.getItemMeta();
        m.setDisplayName(name);
        btn.setItemMeta(m);
        return this.markGuiItem(btn);
    }

    private ItemStack markGuiItem(ItemStack item) {
        ItemMeta m = item.getItemMeta();
        m.getPersistentDataContainer().set(this.guiKey, (PersistentDataType)PersistentDataType.BYTE, (Object)Byte.valueOf((byte)1));
        item.setItemMeta(m);
        return item;
    }

    private boolean isGuiItem(ItemStack item) {
        return item.hasItemMeta() && item.getItemMeta().getPersistentDataContainer().has(this.guiKey, (PersistentDataType)PersistentDataType.BYTE);
    }

    private ItemStack makePedestalItem() {
        ItemStack pedestal = new ItemStack(Material.REINFORCED_DEEPSLATE);
        ItemMeta meta = pedestal.getItemMeta();
        meta.setDisplayName(PEDESTAL_NAME);
        meta.setLore(Arrays.asList("\u00a77\u041f\u043e\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u044d\u0442\u043e\u0442 \u0431\u043b\u043e\u043a, \u0447\u0442\u043e\u0431\u044b", "\u00a77\u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u0431\u043e\u0440\u0449\u0438\u043a \u0432\u0435\u0449\u0435\u0439."));
        pedestal.setItemMeta(meta);
        return pedestal;
    }

    private void returnItems(Player p, Inventory top) {
        if (top == null) {
            return;
        }
        for (int i = 0; i < top.getSize(); ++i) {
            ItemStack it = top.getItem(i);
            if (it == null || it.getType() == Material.AIR) continue;
            if (this.isGuiItem(it)) continue;
            top.setItem(i, null);
            this.giveItem(p, it);
        }
    }

    private void giveItem(Player p, ItemStack item) {
        if (item == null || item.getType() == Material.AIR) {
            return;
        }
        if (p != null && p.isOnline()) {
            HashMap<Integer, ItemStack> left = p.getInventory().addItem(new ItemStack[]{item.clone()});
            for (ItemStack l : left.values()) {
                p.getWorld().dropItemNaturally(p.getLocation().add(0.0, 1.0, 0.0), l);
            }
        } else if (p != null) {
            p.getWorld().dropItemNaturally(p.getLocation().add(0.0, 1.0, 0.0), item);
        }
    }

    private void removeIncompletePedestal(Player p, Location loc) {
        Block b = loc.getBlock();
        if (b.getType() != Material.REINFORCED_DEEPSLATE) {
            return;
        }
        b.setType(Material.AIR);
        this.giveItem(p, this.makePedestalItem());
    }

    private boolean isChunkLoaded(Location loc) {
        World w = loc.getWorld();
        if (w == null) {
            return false;
        }
        return w.isChunkLoaded(loc.getBlockX() >> 4, loc.getBlockZ() >> 4);
    }

    private boolean isInChunk(Location loc, Chunk c) {
        if (loc == null || loc.getWorld() == null || loc.getWorld() != c.getWorld()) {
            return false;
        }
        return (loc.getBlockX() >> 4) == c.getX() && (loc.getBlockZ() >> 4) == c.getZ();
    }

    private void purgeTaggedEntities(Chunk c) {
        for (Entity en : new ArrayList<Entity>(Arrays.asList(c.getEntities()))) {
            if (this.isTagged(en)) {
                en.remove();
            }
        }
    }

    private void forgetChunkEntities(Chunk c) {
        for (CrafterNode node : this.nodes.values()) {
            if (!this.isInChunk(node.loc, c)) continue;
            node.itemDisplay = null;
            node.textDisplay = null;
            node.interaction = null;
        }
    }

    @EventHandler
    public void onChunkLoad(ChunkLoadEvent e) {
        Chunk c = e.getChunk();
        this.forgetChunkEntities(c);
        this.purgeTaggedEntities(c);
        boolean changed = false;
        for (CrafterNode node : new ArrayList<CrafterNode>(this.nodes.values())) {
            if (!this.isInChunk(node.loc, c)) continue;
            if (node.loc.getBlock().getType() != Material.REINFORCED_DEEPSLATE) {
                this.nodes.remove(node.loc);
                this.rotationAngles.remove(node.loc);
                changed = true;
                continue;
            }
            this.spawnNodeEntities(node);
        }
        if (changed) {
            this.savePedestals();
        }
    }

    @EventHandler
    public void onChunkUnload(ChunkUnloadEvent e) {
        this.forgetChunkEntities(e.getChunk());
    }
    private String getRussianName(ItemStack item) {
        if (item.hasItemMeta() && item.getItemMeta().hasDisplayName()) {
            return item.getItemMeta().getDisplayName();
        }
        Material mat = item.getType();
        switch (mat) {
            case DIAMOND: {
                return "\u0410\u043b\u043c\u0430\u0437";
            }
            case IRON_INGOT: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u044b\u0439 \u0441\u043b\u0438\u0442\u043e\u043a";
            }
            case GOLD_INGOT: {
                return "\u0417\u043e\u043b\u043e\u0442\u043e\u0439 \u0441\u043b\u0438\u0442\u043e\u043a";
            }
            case COPPER_INGOT: {
                return "\u041c\u0435\u0434\u043d\u044b\u0439 \u0441\u043b\u0438\u0442\u043e\u043a";
            }
            case NETHERITE_INGOT: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0439 \u0441\u043b\u0438\u0442\u043e\u043a";
            }
            case EMERALD: {
                return "\u0418\u0437\u0443\u043c\u0440\u0443\u0434";
            }
            case REDSTONE: {
                return "\u0420\u0435\u0434\u0441\u0442\u043e\u0443\u043d";
            }
            case LAPIS_LAZULI: {
                return "\u041b\u0430\u0437\u0443\u0440\u0438\u0442";
            }
            case COAL: {
                return "\u0423\u0433\u043e\u043b\u044c";
            }
            case CHARCOAL: {
                return "\u0414\u0440\u0435\u0432\u0435\u0441\u043d\u044b\u0439 \u0443\u0433\u043e\u043b\u044c";
            }
            case RAW_IRON: {
                return "\u0421\u044b\u0440\u043e\u0435 \u0436\u0435\u043b\u0435\u0437\u043e";
            }
            case RAW_GOLD: {
                return "\u0421\u044b\u0440\u043e\u0435 \u0437\u043e\u043b\u043e\u0442\u043e";
            }
            case RAW_COPPER: {
                return "\u0421\u044b\u0440\u0430\u044f \u043c\u0435\u0434\u044c";
            }
            case NETHERITE_SCRAP: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0439 \u043b\u043e\u043c";
            }
            case QUARTZ: {
                return "\u041a\u0432\u0430\u0440\u0446";
            }
            case AMETHYST_SHARD: {
                return "\u041e\u0441\u043a\u043e\u043b\u043e\u043a \u0430\u043c\u0435\u0442\u0438\u0441\u0442\u0430";
            }
            case STICK: {
                return "\u041f\u0430\u043b\u043a\u0430";
            }
            case STRING: {
                return "\u041d\u0438\u0442\u044c";
            }
            case FEATHER: {
                return "\u041f\u0435\u0440\u043e";
            }
            case GUNPOWDER: {
                return "\u041f\u043e\u0440\u043e\u0445";
            }
            case LEATHER: {
                return "\u041a\u043e\u0436\u0430";
            }
            case FLINT: {
                return "\u041a\u0440\u0435\u043c\u0435\u043d\u044c";
            }
            case CLAY_BALL: {
                return "\u041a\u043e\u043c\u043e\u043a \u0433\u043b\u0438\u043d\u044b";
            }
            case BRICK: {
                return "\u041a\u0438\u0440\u043f\u0438\u0447";
            }
            case NETHER_BRICK: {
                return "\u041d\u0435\u0437\u0435\u0440\u0441\u043a\u0438\u0439 \u043a\u0438\u0440\u043f\u0438\u0447";
            }
            case BLAZE_ROD: {
                return "\u0421\u0442\u0435\u0440\u0436\u0435\u043d\u044c \u0438\u0444\u0440\u0438\u0442\u0430";
            }
            case BLAZE_POWDER: {
                return "\u041e\u0433\u043d\u0435\u043d\u043d\u044b\u0439 \u043f\u043e\u0440\u043e\u0448\u043e\u043a";
            }
            case ENDER_PEARL: {
                return "\u042d\u043d\u0434\u0435\u0440-\u0436\u0435\u043c\u0447\u0443\u0433";
            }
            case ENDER_EYE: {
                return "\u041e\u043a\u043e \u042d\u043d\u0434\u0435\u0440\u0430";
            }
            case SLIME_BALL: {
                return "\u0421\u0433\u0443\u0441\u0442\u043e\u043a \u0441\u043b\u0438\u0437\u0438";
            }
            case MAGMA_CREAM: {
                return "\u0421\u0433\u0443\u0441\u0442\u043e\u043a \u043c\u0430\u0433\u043c\u044b";
            }
            case BONE: {
                return "\u041a\u043e\u0441\u0442\u044c";
            }
            case GHAST_TEAR: {
                return "\u0421\u043b\u0435\u0437\u0430 \u0433\u0430\u0441\u0442\u0430";
            }
            case PHANTOM_MEMBRANE: {
                return "\u041c\u0435\u043c\u0431\u0440\u0430\u043d\u0430 \u0444\u0430\u043d\u0442\u043e\u043c\u0430";
            }
            case ROTTEN_FLESH: {
                return "\u0413\u043d\u0438\u043b\u0430\u044f \u043f\u043b\u043e\u0442\u044c";
            }
            case SPIDER_EYE: {
                return "\u041f\u0430\u0443\u0447\u0438\u0439 \u0433\u043b\u0430\u0437";
            }
            case FERMENTED_SPIDER_EYE: {
                return "\u041c\u0430\u0440\u0438\u043d\u043e\u0432\u0430\u043d\u043d\u044b\u0439 \u043f\u0430\u0443\u0447\u0438\u0439 \u0433\u043b\u0430\u0437";
            }
            case RABBIT_FOOT: {
                return "\u041a\u0440\u043e\u043b\u0438\u0447\u044c\u044f \u043b\u0430\u043f\u043a\u0430";
            }
            case RABBIT_HIDE: {
                return "\u041a\u0440\u043e\u043b\u0438\u0447\u044c\u044f \u0448\u043a\u0443\u0440\u043a\u0430";
            }
            case PAPER: {
                return "\u0411\u0443\u043c\u0430\u0433\u0430";
            }
            case BOOK: {
                return "\u041a\u043d\u0438\u0433\u0430";
            }
            case SUGAR: {
                return "\u0421\u0430\u0445\u0430\u0440";
            }
            case GLOWSTONE_DUST: {
                return "\u0421\u0432\u0435\u0442\u043e\u043f\u044b\u043b\u044c";
            }
            case NETHER_STAR: {
                return "\u0417\u0432\u0435\u0437\u0434\u0430 \u041d\u0435\u0437\u0435\u0440\u0430";
            }
            case TOTEM_OF_UNDYING: {
                return "\u0422\u043e\u0442\u0435\u043c \u0431\u0435\u0441\u0441\u043c\u0435\u0440\u0442\u0438\u044f";
            }
            case ELYTRA: {
                return "\u042d\u043b\u0438\u0442\u0440\u044b";
            }
            case SHULKER_SHELL: {
                return "\u041f\u0430\u043d\u0446\u0438\u0440\u044c \u0448\u0430\u043b\u043a\u0435\u0440\u0430";
            }
            case WHEAT: {
                return "\u041f\u0448\u0435\u043d\u0438\u0446\u0430";
            }
            case CARROT: {
                return "\u041c\u043e\u0440\u043a\u043e\u0432\u044c";
            }
            case POTATO: {
                return "\u041a\u0430\u0440\u0442\u043e\u0444\u0435\u043b\u044c";
            }
            case BAKED_POTATO: {
                return "\u0417\u0430\u043f\u0435\u0447\u0435\u043d\u043d\u044b\u0439 \u043a\u0430\u0440\u0442\u043e\u0444\u0435\u043b\u044c";
            }
            case APPLE: {
                return "\u042f\u0431\u043b\u043e\u043a\u043e";
            }
            case BREAD: {
                return "\u0425\u043b\u0435\u0431";
            }
            case BEEF: {
                return "\u0421\u044b\u0440\u0430\u044f \u0433\u043e\u0432\u044f\u0434\u0438\u043d\u0430";
            }
            case COOKED_BEEF: {
                return "\u0421\u0442\u0435\u0439\u043a";
            }
            case PORKCHOP: {
                return "\u0421\u044b\u0440\u0430\u044f \u0441\u0432\u0438\u043d\u0438\u043d\u0430";
            }
            case COOKED_PORKCHOP: {
                return "\u0416\u0430\u0440\u0435\u043d\u0430\u044f \u0441\u0432\u0438\u043d\u0438\u043d\u0430";
            }
            case CHICKEN: {
                return "\u0421\u044b\u0440\u0430\u044f \u043a\u0443\u0440\u0438\u0446\u0430";
            }
            case COOKED_CHICKEN: {
                return "\u0416\u0430\u0440\u0435\u043d\u0430\u044f \u043a\u0443\u0440\u0438\u0446\u0430";
            }
            case MUTTON: {
                return "\u0421\u044b\u0440\u0430\u044f \u0431\u0430\u0440\u0430\u043d\u0438\u043d\u0430";
            }
            case COOKED_MUTTON: {
                return "\u0416\u0430\u0440\u0435\u043d\u0430\u044f \u0431\u0430\u0440\u0430\u043d\u0438\u043d\u0430";
            }
            case RABBIT: {
                return "\u0421\u044b\u0440\u0430\u044f \u043a\u0440\u043e\u043b\u044c\u0447\u0430\u0442\u0438\u043d\u0430";
            }
            case COOKED_RABBIT: {
                return "\u0416\u0430\u0440\u0435\u043d\u0430\u044f \u043a\u0440\u043e\u043b\u044c\u0447\u0430\u0442\u0438\u043d\u0430";
            }
            case COD: {
                return "\u0421\u044b\u0440\u0430\u044f \u0442\u0440\u0435\u0441\u043a\u0430";
            }
            case COOKED_COD: {
                return "\u0416\u0430\u0440\u0435\u043d\u0430\u044f \u0442\u0440\u0435\u0441\u043a\u0430";
            }
            case SALMON: {
                return "\u0421\u044b\u0440\u043e\u0439 \u043b\u043e\u0441\u043e\u0441\u044c";
            }
            case COOKED_SALMON: {
                return "\u0416\u0430\u0440\u0435\u043d\u044b\u0439 \u043b\u043e\u0441\u043e\u0441\u044c";
            }
            case GOLDEN_APPLE: {
                return "\u0417\u043e\u043b\u043e\u0442\u043e\u0435 \u044f\u0431\u043b\u043e\u043a\u043e";
            }
            case ENCHANTED_GOLDEN_APPLE: {
                return "\u0417\u0430\u0447\u0430\u0440\u043e\u0432\u0430\u043d\u043d\u043e\u0435 \u044f\u0431\u043b\u043e\u043a\u043e";
            }
            case GOLDEN_CARROT: {
                return "\u0417\u043e\u043b\u043e\u0442\u0430\u044f \u043c\u043e\u0440\u043a\u043e\u0432\u044c";
            }
            case MELON_SLICE: {
                return "\u041b\u043e\u043c\u0442\u0438\u043a \u0430\u0440\u0431\u0443\u0437\u0430";
            }
            case SWEET_BERRIES: {
                return "\u0421\u043b\u0430\u0434\u043a\u0438\u0435 \u044f\u0433\u043e\u0434\u044b";
            }
            case GLOW_BERRIES: {
                return "\u0421\u0432\u0435\u0442\u044f\u0449\u0438\u0435\u0441\u044f \u044f\u0433\u043e\u0434\u044b";
            }
            case DIAMOND_HELMET: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u044b\u0439 \u0448\u043b\u0435\u043c";
            }
            case DIAMOND_CHESTPLATE: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u044b\u0439 \u043d\u0430\u0433\u0440\u0443\u0434\u043d\u0438\u043a";
            }
            case DIAMOND_LEGGINGS: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u044b\u0435 \u043f\u043e\u043d\u043e\u0436\u0438";
            }
            case DIAMOND_BOOTS: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u044b\u0435 \u0431\u043e\u0442\u0438\u043d\u043a\u0438";
            }
            case IRON_HELMET: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u044b\u0439 \u0448\u043b\u0435\u043c";
            }
            case IRON_CHESTPLATE: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u044b\u0439 \u043d\u0430\u0433\u0440\u0443\u0434\u043d\u0438\u043a";
            }
            case IRON_LEGGINGS: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u044b\u0435 \u043f\u043e\u043d\u043e\u0436\u0438";
            }
            case IRON_BOOTS: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u044b\u0435 \u0431\u043e\u0442\u0438\u043d\u043a\u0438";
            }
            case GOLDEN_HELMET: {
                return "\u0417\u043e\u043b\u043e\u0442\u043e\u0439 \u0448\u043b\u0435\u043c";
            }
            case GOLDEN_CHESTPLATE: {
                return "\u0417\u043e\u043b\u043e\u0442\u043e\u0439 \u043d\u0430\u0433\u0440\u0443\u0434\u043d\u0438\u043a";
            }
            case GOLDEN_LEGGINGS: {
                return "\u0417\u043e\u043b\u043e\u0442\u044b\u0435 \u043f\u043e\u043d\u043e\u0436\u0438";
            }
            case GOLDEN_BOOTS: {
                return "\u0417\u043e\u043b\u043e\u0442\u044b\u0435 \u0431\u043e\u0442\u0438\u043d\u043a\u0438";
            }
            case NETHERITE_HELMET: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0439 \u0448\u043b\u0435\u043c";
            }
            case NETHERITE_CHESTPLATE: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0439 \u043d\u0430\u0433\u0440\u0443\u0434\u043d\u0438\u043a";
            }
            case NETHERITE_LEGGINGS: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0435 \u043f\u043e\u043d\u043e\u0436\u0438";
            }
            case NETHERITE_BOOTS: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0435 \u0431\u043e\u0442\u0438\u043d\u043a\u0438";
            }
            case LEATHER_HELMET: {
                return "\u041a\u043e\u0436\u0430\u043d\u044b\u0439 \u0448\u043b\u0435\u043c";
            }
            case LEATHER_CHESTPLATE: {
                return "\u041a\u043e\u0436\u0430\u043d\u0430\u044f \u043a\u0443\u0440\u0442\u043a\u0430";
            }
            case LEATHER_LEGGINGS: {
                return "\u041a\u043e\u0436\u0430\u043d\u044b\u0435 \u0448\u0442\u0430\u043d\u044b";
            }
            case LEATHER_BOOTS: {
                return "\u041a\u043e\u0436\u0430\u043d\u044b\u0435 \u0431\u043e\u0442\u0438\u043d\u043a\u0438";
            }
            case DIAMOND_SWORD: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u044b\u0439 \u043c\u0435\u0447";
            }
            case IRON_SWORD: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u044b\u0439 \u043c\u0435\u0447";
            }
            case NETHERITE_SWORD: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0439 \u043c\u0435\u0447";
            }
            case GOLDEN_SWORD: {
                return "\u0417\u043e\u043b\u043e\u0442\u043e\u0439 \u043c\u0435\u0447";
            }
            case STONE_SWORD: {
                return "\u041a\u0430\u043c\u0435\u043d\u043d\u044b\u0439 \u043c\u0435\u0447";
            }
            case WOODEN_SWORD: {
                return "\u0414\u0435\u0440\u0435\u0432\u044f\u043d\u043d\u044b\u0439 \u043c\u0435\u0447";
            }
            case BOW: {
                return "\u041b\u0443\u043a";
            }
            case CROSSBOW: {
                return "\u0410\u0440\u0431\u0430\u043b\u0435\u0442";
            }
            case MACE: {
                return "\u0411\u0443\u043b\u0430\u0432\u0430";
            }
            case TRIDENT: {
                return "\u0422\u0440\u0435\u0437\u0443\u0431\u0435\u0446";
            }
            case SHIELD: {
                return "\u0429\u0438\u0442";
            }
            case DIAMOND_PICKAXE: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u0430\u044f \u043a\u0438\u0440\u043a\u0430";
            }
            case DIAMOND_AXE: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u044b\u0439 \u0442\u043e\u043f\u043e\u0440";
            }
            case DIAMOND_SHOVEL: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u0430\u044f \u043b\u043e\u043f\u0430\u0442\u0430";
            }
            case DIAMOND_HOE: {
                return "\u0410\u043b\u043c\u0430\u0437\u043d\u0430\u044f \u043c\u043e\u0442\u044b\u0433\u0430";
            }
            case IRON_PICKAXE: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u0430\u044f \u043a\u0438\u0440\u043a\u0430";
            }
            case IRON_AXE: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u044b\u0439 \u0442\u043e\u043f\u043e\u0440";
            }
            case IRON_SHOVEL: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u0430\u044f \u043b\u043e\u043f\u0430\u0442\u0430";
            }
            case IRON_HOE: {
                return "\u0416\u0435\u043b\u0435\u0437\u043d\u0430\u044f \u043c\u043e\u0442\u044b\u0433\u0430";
            }
            case NETHERITE_PICKAXE: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u0430\u044f \u043a\u0438\u0440\u043a\u0430";
            }
            case NETHERITE_AXE: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u044b\u0439 \u0442\u043e\u043f\u043e\u0440";
            }
            case NETHERITE_SHOVEL: {
                return "\u041d\u0435\u0437\u0435\u0440\u0438\u0442\u043e\u0432\u0430\u044f \u043b\u043e\u043f\u0430\u0442\u0430";
            }
            case DIRT: {
                return "\u0417\u0435\u043c\u043b\u044f";
            }
            case GRASS_BLOCK: {
                return "\u0411\u043b\u043e\u043a \u0442\u0440\u0430\u0432\u044b";
            }
            case STONE: {
                return "\u041a\u0430\u043c\u0435\u043d\u044c";
            }
            case COBBLESTONE: {
                return "\u0411\u0443\u043b\u044b\u0436\u043d\u0438\u043a";
            }
            case SAND: {
                return "\u041f\u0435\u0441\u043e\u043a";
            }
            case GRAVEL: {
                return "\u0413\u0440\u0430\u0432\u0438\u0439";
            }
            case GLASS: {
                return "\u0421\u0442\u0435\u043a\u043b\u043e";
            }
            case OAK_LOG: {
                return "\u0414\u0443\u0431\u043e\u0432\u043e\u0435 \u0431\u0440\u0435\u0432\u043d\u043e";
            }
            case OAK_PLANKS: {
                return "\u0414\u0443\u0431\u043e\u0432\u044b\u0435 \u0434\u043e\u0441\u043a\u0438";
            }
            case SPRUCE_LOG: {
                return "\u0415\u043b\u043e\u0432\u043e\u0435 \u0431\u0440\u0435\u0432\u043d\u043e";
            }
            case SPRUCE_PLANKS: {
                return "\u0415\u043b\u043e\u0432\u044b\u0435 \u0434\u043e\u0441\u043a\u0438";
            }
            case BIRCH_LOG: {
                return "\u0411\u0435\u0440\u0435\u0437\u043e\u0432\u043e\u0435 \u0431\u0440\u0435\u0432\u043d\u043e";
            }
            case BIRCH_PLANKS: {
                return "\u0411\u0435\u0440\u0435\u0437\u043e\u0432\u044b\u0435 \u0434\u043e\u0441\u043a\u0438";
            }
            case JUNGLE_LOG: {
                return "\u0422\u0440\u043e\u043f\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u0431\u0440\u0435\u0432\u043d\u043e";
            }
            case JUNGLE_PLANKS: {
                return "\u0422\u0440\u043e\u043f\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u0434\u043e\u0441\u043a\u0438";
            }
            case ACACIA_LOG: {
                return "\u0410\u043a\u0430\u0446\u0438\u0435\u0432\u043e\u0435 \u0431\u0440\u0435\u0432\u043d\u043e";
            }
            case ACACIA_PLANKS: {
                return "\u0410\u043a\u0430\u0446\u0438\u0435\u0432\u044b\u0435 \u0434\u043e\u0441\u043a\u0438";
            }
            case DARK_OAK_LOG: {
                return "\u0411\u0440\u0435\u0432\u043d\u043e \u0442\u0435\u043c\u043d\u043e\u0433\u043e \u0434\u0443\u0431\u0430";
            }
            case DARK_OAK_PLANKS: {
                return "\u0414\u043e\u0441\u043a\u0438 \u0438\u0437 \u0442\u0435\u043c\u043d\u043e\u0433\u043e \u0434\u0443\u0431\u0430";
            }
            case MANGROVE_LOG: {
                return "\u041c\u0430\u043d\u0433\u0440\u043e\u0432\u043e\u0435 \u0431\u0440\u0435\u0432\u043d\u043e";
            }
            case MANGROVE_PLANKS: {
                return "\u041c\u0430\u043d\u0433\u0440\u043e\u0432\u044b\u0435 \u0434\u043e\u0441\u043a\u0438";
            }
            case CHERRY_LOG: {
                return "\u0412\u0438\u0448\u043d\u0435\u0432\u043e\u0435 \u0431\u0440\u0435\u0432\u043d\u043e";
            }
            case CHERRY_PLANKS: {
                return "\u0412\u0438\u0448\u043d\u0435\u0432\u044b\u0435 \u0434\u043e\u0441\u043a\u0438";
            }
            case REINFORCED_DEEPSLATE: {
                return "\u0423\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u044b\u0439 \u0433\u043b\u0443\u0431\u0438\u043d\u043d\u044b\u0439 \u0441\u043b\u0430\u043d\u0435\u0446";
            }
            case DEEPSLATE: {
                return "\u0413\u043b\u0443\u0431\u0438\u043d\u043d\u044b\u0439 \u0441\u043b\u0430\u043d\u0435\u0446";
            }
            case COBBLED_DEEPSLATE: {
                return "\u0414\u0440\u043e\u0431\u043b\u0435\u043d\u044b\u0439 \u0433\u043b\u0443\u0431\u0438\u043d\u043d\u044b\u0439 \u0441\u043b\u0430\u043d\u0435\u0446";
            }
            case OBSIDIAN: {
                return "\u041e\u0431\u0441\u0438\u0434\u0438\u0430\u043d";
            }
            case CRYING_OBSIDIAN: {
                return "\u041f\u043b\u0430\u0447\u0443\u0449\u0438\u0439 \u043e\u0431\u0441\u0438\u0434\u0438\u0430\u043d";
            }
            case NETHERRACK: {
                return "\u041d\u0435\u0437\u0435\u0440\u0430\u043a";
            }
            case SOUL_SAND: {
                return "\u041f\u0435\u0441\u043e\u043a \u0434\u0443\u0448";
            }
            case SOUL_SOIL: {
                return "\u041f\u043e\u0447\u0432\u0430 \u0434\u0443\u0448";
            }
            case GLOWSTONE: {
                return "\u0421\u0432\u0435\u0442\u043e\u043a\u0430\u043c\u0435\u043d\u044c";
            }
            case MAGMA_BLOCK: {
                return "\u0411\u043b\u043e\u043a \u043c\u0430\u0433\u043c\u044b";
            }
            case WATER_BUCKET: {
                return "\u0412\u0435\u0434\u0440\u043e \u0432\u043e\u0434\u044b";
            }
            case LAVA_BUCKET: {
                return "\u0412\u0435\u0434\u0440\u043e \u043b\u0430\u0432\u044b";
            }
            case MILK_BUCKET: {
                return "\u0412\u0435\u0434\u0440\u043e \u043c\u043e\u043b\u043e\u043a\u0430";
            }
            case BUCKET: {
                return "\u041f\u0443\u0441\u0442\u043e\u0435 \u0432\u0435\u0434\u0440\u043e";
            }
            case EXPERIENCE_BOTTLE: {
                return "\u041f\u0443\u0437\u044b\u0440\u0451\u043a \u043e\u043f\u044b\u0442\u0430";
            }
        }
        String[] words = mat.name().toLowerCase().split("_");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) continue;
            sb.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1)).append(" ");
        }
        return sb.toString().trim();
    }


    private void savePedestals() {
        YamlConfiguration cfg = new YamlConfiguration();
        int i = 0;
        for (Map.Entry<Location, CrafterNode> en : this.nodes.entrySet()) {
            Location loc = en.getKey();
            CrafterNode node = en.getValue();
            String base = "pedestals.p" + i++;
            cfg.set(base + ".world", loc.getWorld() == null ? "" : loc.getWorld().getName());
            cfg.set(base + ".x", Integer.valueOf(loc.getBlockX()));
            cfg.set(base + ".y", Integer.valueOf(loc.getBlockY()));
            cfg.set(base + ".z", Integer.valueOf(loc.getBlockZ()));
            cfg.set(base + ".result", this.itemToBase64(node.result));
            ArrayList<String> ing = new ArrayList<String>();
            for (ItemStack it : node.ingredients) {
                String b = this.itemToBase64(it);
                if (b != null) {
                    ing.add(b);
                }
            }
            cfg.set(base + ".ingredients", ing);
        }
        try {
            cfg.save(this.dataFile);
        }
        catch (IOException ex) {
            this.getLogger().severe("Could not save pedestals.yml: " + ex.getMessage());
        }
    }

    private void loadPedestals() {
        this.nodes.clear();
        this.rotationAngles.clear();
        if (this.dataFile.exists()) {
            YamlConfiguration cfg = YamlConfiguration.loadConfiguration(this.dataFile);
            ConfigurationSection sec = cfg.getConfigurationSection("pedestals");
            if (sec != null) {
                for (String key : sec.getKeys(false)) {
                    ConfigurationSection s = sec.getConfigurationSection(key);
                    if (s == null) continue;
                    World w = Bukkit.getWorld(s.getString("world", ""));
                    if (w == null) {
                        this.getLogger().warning("Pedestal skipped: unknown world '" + s.getString("world", "") + "'");
                        continue;
                    }
                    Location loc = new Location(w, (double)s.getInt("x"), (double)s.getInt("y"), (double)s.getInt("z"));
                    ItemStack result = this.itemFromBase64(s.getString("result"));
                    ArrayList<ItemStack> ingredients = new ArrayList<ItemStack>();
                    for (String b : s.getStringList("ingredients")) {
                        ItemStack it = this.itemFromBase64(b);
                        if (it != null) {
                            ingredients.add(it);
                        }
                    }
                    if (result == null || result.getType() == Material.AIR || ingredients.isEmpty()) {
                        this.getLogger().warning("Pedestal skipped: broken recipe at " + loc.getBlockX() + "," + loc.getBlockY() + "," + loc.getBlockZ());
                        continue;
                    }
                    this.nodes.put(loc, new CrafterNode(loc, result, ingredients, result.getType().isBlock()));
                    this.rotationAngles.put(loc, Float.valueOf(0.0f));
                }
            }
        }
        for (World w : Bukkit.getWorlds()) {
            for (Chunk c : w.getLoadedChunks()) {
                this.forgetChunkEntities(c);
                this.purgeTaggedEntities(c);
            }
        }
        int restored = 0;
        int dropped = 0;
        for (CrafterNode node : new ArrayList<CrafterNode>(this.nodes.values())) {
            if (!this.isChunkLoaded(node.loc)) continue;
            if (node.loc.getBlock().getType() != Material.REINFORCED_DEEPSLATE) {
                this.nodes.remove(node.loc);
                this.rotationAngles.remove(node.loc);
                ++dropped;
                continue;
            }
            this.spawnNodeEntities(node);
            ++restored;
        }
        this.getLogger().info("Pedestals: " + this.nodes.size() + " known, " + restored + " restored, " + dropped + " removed");
        this.savePedestals();
    }

    private String itemToBase64(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) {
            return null;
        }
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            BukkitObjectOutputStream oos = new BukkitObjectOutputStream(baos);
            oos.writeObject((Object)item);
            oos.flush();
            oos.close();
            return Base64.getEncoder().encodeToString(baos.toByteArray());
        }
        catch (IOException ex) {
            this.getLogger().warning("Could not serialize item: " + ex.getMessage());
            return null;
        }
    }

    private ItemStack itemFromBase64(String base64) {
        if (base64 == null || base64.isEmpty()) {
            return null;
        }
        try {
            ByteArrayInputStream bais = new ByteArrayInputStream(Base64.getDecoder().decode(base64));
            BukkitObjectInputStream ois = new BukkitObjectInputStream(bais);
            Object o = ois.readObject();
            ois.close();
            if (o instanceof ItemStack) {
                return (ItemStack)o;
            }
            return null;
        }
        catch (Exception ex) {
            this.getLogger().warning("Could not deserialize item: " + ex.getMessage());
            return null;
        }
    }

    static class CrafterNode {
        Location loc;
        ItemStack result;
        List<ItemStack> ingredients;
        ItemDisplay itemDisplay;
        TextDisplay textDisplay;
        Interaction interaction;
        boolean isBlock;

        public CrafterNode(Location loc, ItemStack res, List<ItemStack> ing, boolean isBlock) {
            this.loc = loc;
            this.result = res;
            this.ingredients = ing;
            this.isBlock = isBlock;
        }
    }
}
