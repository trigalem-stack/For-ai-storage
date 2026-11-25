const mineflayer = require('/tmp/bot/node_modules/mineflayer')
const PORT = parseInt(process.env.PORT || '25566', 10)
const bot = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
function insideBody(p){ for (const dy of [0.15,0.6,1.2,1.6]) { const b=bot.blockAt(p.offset(0,dy,0)); if (b&&b.boundingBox==='block') return dy } return false }
async function sample(n){ const r={minY:999,maxY:-999,inside:0,endY:0}
  for(let i=0;i<n;i++){ await bot.waitForTicks(1); const p=bot.entity.position
    r.minY=Math.min(r.minY,p.y); r.maxY=Math.max(r.maxY,p.y); if(insideBody(p)!==false) r.inside++ }
  r.endY=+bot.entity.position.y.toFixed(2); r.minY=+r.minY.toFixed(2); r.maxY=+r.maxY.toFixed(2); return r }
bot.on('spawn', async () => {
  await bot.waitForTicks(100); const out={}
  // H: ходьба с края, БЕЗ спринта (как в игре), пинговая задержка
  bot.chat('!bh stage'); await bot.waitForTicks(40)
  bot.chat('!bh reset'); await bot.waitForTicks(15)
  bot.chat('!bh tp 205.5 100 207.5'); await bot.waitForTicks(10)
  await bot.look(-Math.PI/2,0,true); bot.activateItem(); await bot.waitForTicks(6)
  bot.setControlState('forward',true)
  out.H_walk_edge = await sample(90)
  bot.setControlState('forward',false); await bot.waitForTicks(20)
  // I: бег с края
  bot.chat('!bh stage'); await bot.waitForTicks(40)
  bot.chat('!bh reset'); await bot.waitForTicks(15)
  bot.chat('!bh tp 205.5 100 207.5'); await bot.waitForTicks(10)
  await bot.look(-Math.PI/2,0,true); bot.activateItem(); await bot.waitForTicks(6)
  bot.setControlState('forward',true); bot.setControlState('sprint',true)
  out.I_sprint_edge = await sample(90)
  bot.setControlState('forward',false); bot.setControlState('sprint',false); await bot.waitForTicks(20)
  // J: лёд
  bot.chat('!bh stage'); await bot.waitForTicks(40)
  bot.chat('!bh reset'); await bot.waitForTicks(15)
  bot.chat('!bh ice'); await bot.waitForTicks(8)
  bot.chat('!bh tp 206.5 100 207.5'); await bot.waitForTicks(10)
  await bot.look(-Math.PI/2,0,true); bot.activateItem(); await bot.waitForTicks(6)
  bot.setControlState('forward',true); bot.setControlState('sprint',true)
  out.J_ice_sprint = await sample(70)
  bot.setControlState('forward',false); bot.setControlState('sprint',false)
  console.log('V8', JSON.stringify(out)); bot.quit()
})
