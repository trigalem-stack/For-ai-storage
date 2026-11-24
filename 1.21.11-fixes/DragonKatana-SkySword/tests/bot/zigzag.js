// Zig-zag runner: walks forward while turning 90° every TURN_MS milliseconds,
// so the path is a diagonal zig-zag (as a player running zig-zag would move).
const mineflayer = require('/tmp/bot/node_modules/mineflayer')

const DURATION = parseFloat(process.argv[2] || '20')
const TURN_MS = parseInt(process.env.TURN_MS || '900', 10)
const PORT = parseInt(process.env.PORT || '25565', 10)
const YAWS = [0, 45, 90, 135, 180, 225, 270, 315]

const bot = mineflayer.createBot({ host: '127.0.0.1', port: PORT, username: 'BotTest', version: '1.21.11' })
const t0 = Date.now()
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)

bot.on('error', e => log('ERR', e.message))
bot.on('kicked', r => log('KICKED', String(r).slice(0, 200)))

bot.on('spawn', async () => {
  await bot.waitForTicks(80)
  log('READY', bot.entity.position.toString())
  bot.activateItem()
  await bot.waitForTicks(6)
  let idx = 0
  await bot.look(YAWS[idx] * Math.PI / 180, 0, true)
  bot.setControlState('forward', true)
  let nextTurn = Date.now() + TURN_MS
  const end = Date.now() + DURATION * 1000
  let i = 0
  while (Date.now() < end) {
    if (Date.now() >= nextTurn) {
      idx = (idx + 1) % YAWS.length
      await bot.look(YAWS[idx] * Math.PI / 180, 0, true)
      nextTurn = Date.now() + TURN_MS
      log('TURN', YAWS[idx])
    }
    await bot.waitForTicks(2)
    if (i++ % 5 === 0) {
      const p = bot.entity.position
      log('POS', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'ground=' + bot.entity.onGround, 'hp=' + bot.health)
    }
  }
  bot.setControlState('forward', false)
  log('DONE', bot.entity.position.toString())
  bot.quit()
})
