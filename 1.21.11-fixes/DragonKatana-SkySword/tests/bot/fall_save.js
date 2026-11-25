const mineflayer = require('/tmp/bot/node_modules/mineflayer')
const PORT = parseInt(process.env.PORT || '25566', 10)
const bot = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
// «внутри блока» = блочная форма пересекает бокс тела (прижат к полу = не считается)
function insideBody(p){
  for (const dy of [0.15, 0.6, 1.2, 1.6]) {
    const q = p.offset(0, dy, 0)
    const b = bot.blockAt(q)
    if (b && b.boundingBox === 'block') return dy
  }
  return false
}
async function sample(ticks){
  const r={minY:999,maxY:-999,inside:0,firstInside:null,endY:0}
  for(let i=0;i<ticks;i++){
    await bot.waitForTicks(1)
    const p=bot.entity.position
    r.minY=Math.min(r.minY,p.y); r.maxY=Math.max(r.maxY,p.y)
    const d=insideBody(p); if(d!==false){ r.inside++; if(r.firstInside===null) r.firstInside={dy:d,y:+p.y.toFixed(2)} }
  }
  r.endY=+bot.entity.position.y.toFixed(2); r.minY=+r.minY.toFixed(2); r.maxY=+r.maxY.toFixed(2)
  return r
}
bot.on('spawn', async () => {
  await bot.waitForTicks(100)
  const out={}
  bot.chat('!bh stage'); await bot.waitForTicks(40)
  bot.chat('!bh reset'); await bot.waitForTicks(20)
  bot.chat('!bh tp 218.5 125 207.5'); await bot.waitForTicks(6)
  bot.chat('!bh fallact 25 8'); await bot.waitForTicks(4)
  out.E_fall_save = await sample(70)
  bot.chat('!bh reset'); await bot.waitForTicks(20)
  bot.chat('!bh ledge 104'); await bot.waitForTicks(10)
  bot.chat('!bh tp 205.5 105 207.5'); await bot.waitForTicks(10)
  await bot.look(-Math.PI/2,0,true)
  bot.activateItem(); await bot.waitForTicks(6)
  bot.setControlState('forward',true); bot.setControlState('sprint',true)
  out.F_ledge = await sample(110)
  bot.setControlState('forward',false); bot.setControlState('sprint',false)
  console.log('V7C', JSON.stringify(out))
  bot.quit()
})
