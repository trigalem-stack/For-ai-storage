const mineflayer = require('/tmp/bot/node_modules/mineflayer')
const PORT = parseInt(process.env.PORT || '25565', 10)
const bot = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:'BotTest', version:'1.21.11'})
bot.on('spawn', async () => {
  await bot.waitForTicks(80)
  bot.chat('!bh reset'); await bot.waitForTicks(25)
  bot.chat('!bh tp 208.5 100 207.5'); await bot.waitForTicks(10)
  bot.activateItem(); await bot.waitForTicks(6)
  bot.setControlState('jump', true); await bot.waitForTicks(12); bot.setControlState('jump', false)
  await bot.waitForTicks(20)
  const y0 = bot.entity.position.y
  console.log('after jump y=', y0.toFixed(2))
  // ждём 12 секунд без движения: платформа истекает, должна ставиться новая
  let min = 999
  for (let i=0;i<120;i++){ await bot.waitForTicks(2); const y=bot.entity.position.y; if (y<min) min=y }
  console.log('STAND 12s minY=', min.toFixed(2), 'endY=', bot.entity.position.y.toFixed(2))
  bot.quit()
})
