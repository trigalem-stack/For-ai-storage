// Проверка точности предсказания: снег не должен появляться сбоку при прыжках на месте,
// а при движении под углом — должен идти по диагонали, не теряя игрока.
const mineflayer = require('/tmp/bot/node_modules/mineflayer')
const PORT = parseInt(process.env.PORT || '25565', 10)
const fs = require('fs')
function log(...a){console.log(new Date().toISOString().slice(11,23), ...a)}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

async function join(name) {
  const b = mineflayer.createBot({host:'127.0.0.1', port:PORT, username:name, version:'1.21.11'})
  b.on('error', e=>log('ERR', name, e.message))
  await new Promise(res => b.once('spawn', res))
  await b.waitForTicks(70)
  return b
}

;(async () => {
  const out = {}
  // ---------- A: прыжки на месте, 8 с ----------
  const b1 = await join('BotTest')
  b1.chat('!bh reset'); await b1.waitForTicks(25)
  b1.chat('!bh tp 205.5 100 207.5'); await b1.waitForTicks(10)
  b1.activateItem(); await b1.waitForTicks(6)
  b1.setControlState('jump', true)
  await b1.waitForTicks(160)
  b1.setControlState('jump', false)
  const end1 = b1.entity.position
  out.A_jump_in_place = {endX: Math.round(end1.x*100)/100, endZ: Math.round(end1.z*100)/100, endY: Math.round(end1.y*100)/100}
  b1.quit(); await sleep(2500)

  // ---------- B: диагональный бег по пустоте (yaw 45°) ----------
  const b2 = await join('BotTest')
  b2.chat('!bh reset'); await b2.waitForTicks(25)
  b2.chat('!bh tp 205.5 100 205.5'); await b2.waitForTicks(10)
  await b2.look(Math.PI/4, 0, true)   // +x +z диагональ
  b2.activateItem(); await b2.waitForTicks(6)
  b2.setControlState('forward', true); b2.setControlState('sprint', true)
  await b2.waitForTicks(140)
  b2.setControlState('forward', false); b2.setControlState('sprint', false)
  await b2.waitForTicks(10)
  const end2 = b2.entity.position
  out.B_diagonal_sprint = {endX: Math.round(end2.x*100)/100, endZ: Math.round(end2.z*100)/100, endY: Math.round(end2.y*100)/100}
  b2.quit(); await sleep(2500)

  // ---------- C: бег под 22° (не по осям и не 45°) ----------
  const b3 = await join('BotTest')
  b3.chat('!bh reset'); await b3.waitForTicks(25)
  b3.chat('!bh tp 205.5 100 207.5'); await b3.waitForTicks(10)
  await b3.look(-90*Math.PI/180 + 0.38, 0, true)
  b3.activateItem(); await b3.waitForTicks(6)
  b3.setControlState('forward', true)
  await b3.waitForTicks(150)
  b3.setControlState('forward', false)
  await b3.waitForTicks(10)
  const end3 = b3.entity.position
  out.C_angled_walk = {endX: Math.round(end3.x*100)/100, endZ: Math.round(end3.z*100)/100, endY: Math.round(end3.y*100)/100}
  b3.quit(); await sleep(2500)

  // ---------- D: прыжки вперёд (walkjump), проверка "лестницы" и точности ----------
  const b4 = await join('BotTest')
  b4.chat('!bh reset'); await b4.waitForTicks(25)
  b4.chat('!bh tp 205.5 100 207.5'); await b4.waitForTicks(10)
  b4.activateItem(); await b4.waitForTicks(6)
  b4.setControlState('forward', true); b4.setControlState('jump', true)
  await b4.waitForTicks(110)
  b4.setControlState('forward', false); b4.setControlState('jump', false)
  await b4.waitForTicks(10)
  const end4 = b4.entity.position
  out.D_walkjump = {endX: Math.round(end4.x*100)/100, endZ: Math.round(end4.z*100)/100, endY: Math.round(end4.y*100)/100}
  b4.quit()

  fs.writeFileSync(process.env.OUT || '/tmp/bot/aim.json', JSON.stringify(out, null, 2))
  log('AIM DONE', JSON.stringify(out))
  process.exit(0)
})()
