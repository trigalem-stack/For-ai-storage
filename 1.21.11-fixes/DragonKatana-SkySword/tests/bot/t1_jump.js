// T1: прыжки на месте (без движения) — платформа должна появляться под игроком в воздухе
const mineflayer = require('/tmp/bot/node_modules/mineflayer')
const PORT = parseInt(process.env.PORT || '25565', 10)
const DUR = parseFloat(process.env.DUR || '10')
const MODE = process.env.MODE || 'jump'
const bot = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
function log(...a){console.log(new Date().toISOString().slice(11,23), ...a)}
bot.on('error',e=>log('ERR',e.message))
bot.on('spawn', async () => {
  try{
    await bot.waitForTicks(80)
    log('READY', bot.entity.position.toString(), 'held=', bot.heldItem?bot.heldItem.name:'none')
    // reset stage and sword, then activate
    bot.chat('!bh reset'); await bot.waitForTicks(20)
    bot.activateItem(); await bot.waitForTicks(10)
    log('ACTIVATED')
    const t0 = Date.now()
    if (MODE === 'jump') bot.setControlState('jump', true)
    if (MODE === 'walk') bot.setControlState('forward', true)
    if (MODE === 'sprint') { bot.setControlState('forward', true); bot.setControlState('sprint', true) }
    if (MODE === 'sprintjump') { bot.setControlState('forward', true); bot.setControlState('sprint', true); bot.setControlState('jump', true) }
    if (MODE === 'walkjump') { bot.setControlState('forward', true); bot.setControlState('jump', true) }
    while ((Date.now()-t0)/1000 < DUR) {
      await bot.waitForTicks(2)
      const p = bot.entity.position
      if (Math.round((Date.now()-t0)/100)%5===0) log('POS', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'ground='+bot.entity.onGround, 'vy='+bot.entity.velocity.y.toFixed(2), 'hp='+(bot.health?bot.health.toFixed(1):'?'))
    }
    for (const c of ['forward','jump','sprint']) bot.setControlState(c, false)
    log('DONE', bot.entity.position.toString())
    bot.quit()
  } catch(e){ log('TESTERR', e.stack); bot.quit() }
})
