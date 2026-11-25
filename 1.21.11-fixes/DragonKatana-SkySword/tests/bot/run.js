// Bot test runner for SkySword.
// usage: node run.js <scenario> <seconds> [atSeconds:command ...]
// scenarios: walk | sprint | jump | sprintjump | idle
// commands are sent as "!bh ..." chat messages at given time offsets.
const mineflayer = require('/tmp/bot/node_modules/mineflayer')

const SCENARIO = process.argv[2] || 'walk'
const MOVE = SCENARIO.endsWith('stop') ? SCENARIO.slice(0, -4) : SCENARIO
const STOP_AFTER = SCENARIO.endsWith('stop') ? 0.55 : 1.0
const LOG_EVERY = process.env.LOGEVERY ? parseFloat(process.env.LOGEVERY) : 0.2
const DURATION = parseFloat(process.argv[3] || '10')
const CMDS = process.argv.slice(4).map(s => {
  const i = s.indexOf(':')
  return { at: parseFloat(s.slice(0, i)), cmd: s.slice(i + 1) }
})

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: parseInt(process.env.PORT || '25565', 10),
  username: process.env.BOTNAME || 'BotTest',
  version: '1.21.11'
})

const t0 = Date.now()
function log(...a) { console.log(new Date().toISOString().slice(11, 23), ...a) }
function el() { return (Date.now() - t0) / 1000 }

bot.on('error', e => log('ERR', e.message))
bot.on('kicked', r => log('KICKED', String(r).slice(0, 300)))
bot.on('end', r => log('END', String(r).slice(0, 200)))

bot.on('spawn', async () => {
  try {
    log('SPAWN', bot.entity.position.toString())
    await bot.waitForTicks(80)
    log('READY', bot.entity.position.toString(), 'held=', bot.heldItem ? bot.heldItem.name : 'none')
    if (CMDS.some(c => c.cmd.startsWith('noact'))) {
      log('SKIP ACTIVATE')
    } else {
      bot.activateItem()
    }
    await bot.waitForTicks(6)
    log('ACTIVATED held=', bot.heldItem ? bot.heldItem.name : 'none')
    if (MOVE !== 'idle') {
      await bot.look(-Math.PI / 2, 0, true)
      bot.setControlState('forward', true)
      if (MOVE === 'sprint' || MOVE === 'sprintjump') bot.setControlState('sprint', true)
      if (MOVE === 'jump' || MOVE === 'sprintjump') bot.setControlState('jump', true)
    }
    const tMove = el()
    let next = 0
    const steps = Math.ceil(DURATION * 10)
    const tPlaced = el()
    let stopped = false
    for (let i = 0; i < steps; i++) {
      if (!stopped && el() >= tMove + DURATION * STOP_AFTER) {
        stopped = true
        bot.setControlState('forward', false)
        bot.setControlState('jump', false)
        bot.setControlState('sprint', false)
        log('STOPPED')
      }
      await bot.waitForTicks(2)
      while (next < CMDS.length && CMDS[next].at <= el()) {
        const c = CMDS[next++]
        log('CMD', c.cmd)
        bot.chat('!' + c.cmd)
        await bot.waitForTicks(2)
      }
      const p = bot.entity.position
      if (i % Math.max(1, Math.round(LOG_EVERY * 10)) === 0) log('POS', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2),
        'ground=' + bot.entity.onGround, 'vy=' + bot.entity.velocity.y.toFixed(2),
        'hp=' + (bot.health !== undefined ? bot.health.toFixed(1) : '?'),
        'food=' + (bot.food !== undefined ? bot.food : '?'))
    }
    bot.setControlState('forward', false)
    bot.setControlState('jump', false)
    bot.setControlState('sprint', false)
    log('DONE')
    bot.quit()
  } catch (e) {
    log('TESTERR', e.stack)
    bot.quit()
  }
})
