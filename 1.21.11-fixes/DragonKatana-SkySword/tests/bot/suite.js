// 6 тестов SkySword. Сравнивает версии 1:1 по maxY/конечной Y/падению/расходу кубиков.
const mineflayer = require('/tmp/bot/node_modules/mineflayer')
const PORT = parseInt(process.env.PORT || '25565', 10)
const WHICH = process.env.WHICH || 'v5'
const OUT = process.env.OUT || '/tmp/bot/result.json'
const fs = require('fs')
function log(...a){console.log(new Date().toISOString().slice(11,23), ...a)}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

async function run() {
  const bot = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
  bot.on('error', e=>log('ERR', e.message))
  const results = {}
  let ymax = 0, ymin = 999, fells = 0
  bot.on('spawn', async () => {
    try {
      await bot.waitForTicks(80)
      // отслеживаем падения и максимум высоты
      setInterval(() => {
        const p = bot.entity.position
        if (p.y > ymax) ymax = p.y
        if (p.y < ymin) ymin = p.y
      }, 50)

      const R = (name, o) => { results[name] = o; log('RESULT', name, JSON.stringify(o)) }
      const resetStats = () => { ymax = 0; ymin = 999; fells = 0 }
      const posY = () => round(bot.entity.position.y)

      function round(v){ return Math.round(v*100)/100 }

      async function gotoCmd(cmd, waitTicks=25){ bot.chat('!'+cmd); await bot.waitForTicks(waitTicks) }

      // ============ T1: прыжки на месте ============
      resetStats()
      await gotoCmd('bh reset', 30)
      bot.activateItem()
      await bot.waitForTicks(8)
      const startY1 = posY()
      bot.setControlState('jump', true)
      await bot.waitForTicks(180) // 9 s
      bot.setControlState('jump', false)
      await bot.waitForTicks(30)
      R('T1_jump_in_place', {startY: startY1, endY: posY(), maxY: round(ymax), gained: round(ymax-startY1)})
      bot.quit()
      await sleep(2500)

      // ============ T2: полёт в креативе ============
      const bot2 = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
      bot2.on('error', e=>log('ERR2', e.message))
      await new Promise(res => bot2.once('spawn', res))
      await bot2.waitForTicks(70)
      let ymax2 = 0
      const iv2 = setInterval(()=>{ ymax2 = Math.max(ymax2, bot2.entity.position.y) }, 50)
      bot2.chat('!bh reset'); await bot2.waitForTicks(30)
      bot2.chat('!bh creative'); await bot2.waitForTicks(20)
      bot2.activateItem(); await bot2.waitForTicks(10)
      const startY2 = round(bot2.entity.position.y)
      // вверх
      bot2.setControlState('jump', true)
      await bot2.waitForTicks(70)
      bot2.setControlState('jump', false)
      const midY2 = round(bot2.entity.position.y)
      // вперёд в полёте
      bot2.setControlState('forward', true)
      await bot2.waitForTicks(60)
      bot2.setControlState('forward', false)
      await bot2.waitForTicks(40)
      clearInterval(iv2)
      R('T2_creative_fly', {startY: startY2, afterUpY: midY2, endY: round(bot2.entity.position.y), maxY: round(ymax2), flying: bot2.entity.flying})
      bot2.quit()
      await sleep(2500)

      // ============ T3: резкое включение меча в падении ============
      // Серверный, детерминированный сценарий: телепорт на +25, активация через 7 тиков
      // (игрок уже в воздухе ~0.35 с), дальше смотрим минимальную Y и приземление.
      const bot3 = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
      bot3.on('error', e=>log('ERR3', e.message))
      await new Promise(res => bot3.once('spawn', res))
      await bot3.waitForTicks(70)
      let ymin3 = 999
      const iv3 = setInterval(()=>{ const y=bot3.entity.position.y; if(y<ymin3) ymin3=y }, 40)
      bot3.chat('!bh reset'); await bot3.waitForTicks(30)
      bot3.chat('!bh fallact 25 7'); await bot3.waitForTicks(70)
      await bot3.waitForTicks(40)
      clearInterval(iv3)
      R('T3_fall_late_activate', {minY: round(ymin3), endY: round(bot3.entity.position.y), fellBelow99: ymin3 < 99.4})
      bot3.quit()
      await sleep(2500)

      // ============ T4: ходьба ============
      const bot4 = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
      bot4.on('error', e=>log('ERR4', e.message))
      await new Promise(res => bot4.once('spawn', res))
      await bot4.waitForTicks(70)
      let ymin4 = 999
      const iv4 = setInterval(()=>{ const y=bot4.entity.position.y; if(y<ymin4) ymin4=y }, 50)
      bot4.chat('!bh reset'); await bot4.waitForTicks(30)
      bot4.activateItem(); await bot4.waitForTicks(8)
      bot4.setControlState('forward', true)
      await bot4.waitForTicks(150)
      bot4.setControlState('forward', false)
      await bot4.waitForTicks(10)
      clearInterval(iv4)
      R('T4_walk', {endX: round(bot4.entity.position.x), endY: round(bot4.entity.position.y), minY: round(ymin4)})
      bot4.quit()
      await sleep(2500)

      // ============ T5: бег ============
      const bot5 = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
      bot5.on('error', e=>log('ERR5', e.message))
      await new Promise(res => bot5.once('spawn', res))
      await bot5.waitForTicks(70)
      let ymin5 = 999
      const iv5 = setInterval(()=>{ const y=bot5.entity.position.y; if(y<ymin5) ymin5=y }, 50)
      bot5.chat('!bh reset'); await bot5.waitForTicks(30)
      bot5.activateItem(); await bot5.waitForTicks(8)
      bot5.setControlState('forward', true); bot5.setControlState('sprint', true)
      await bot5.waitForTicks(110)
      bot5.setControlState('forward', false); bot5.setControlState('sprint', false)
      await bot5.waitForTicks(10)
      clearInterval(iv5)
      R('T5_sprint', {endX: round(bot5.entity.position.x), endY: round(bot5.entity.position.y), minY: round(ymin5)})
      bot5.quit()
      await sleep(2500)

      // ============ T6: бег с прыжками ============
      const bot6 = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
      bot6.on('error', e=>log('ERR6', e.message))
      await new Promise(res => bot6.once('spawn', res))
      await bot6.waitForTicks(70)
      let ymin6 = 999, ymax6 = 0
      const iv6 = setInterval(()=>{ const y=bot6.entity.position.y; if(y<ymin6) ymin6=y; if(y>ymax6) ymax6=y }, 50)
      bot6.chat('!bh reset'); await bot6.waitForTicks(30)
      bot6.activateItem(); await bot6.waitForTicks(8)
      bot6.setControlState('forward', true); bot6.setControlState('sprint', true); bot6.setControlState('jump', true)
      await bot6.waitForTicks(110)
      bot6.setControlState('forward', false); bot6.setControlState('sprint', false); bot6.setControlState('jump', false)
      await bot6.waitForTicks(10)
      clearInterval(iv6)
      R('T6_sprintjump', {endX: round(bot6.entity.position.x), endY: round(bot6.entity.position.y), minY: round(ymin6), maxY: round(ymax6)})
      bot6.quit()

      fs.writeFileSync(OUT, JSON.stringify({which: WHICH, port: PORT, results}, null, 2))
      log('SUITE DONE', OUT)
      process.exit(0)
    } catch(e) { log('TESTERR', e.stack); process.exit(1) }
  })
}
run()
