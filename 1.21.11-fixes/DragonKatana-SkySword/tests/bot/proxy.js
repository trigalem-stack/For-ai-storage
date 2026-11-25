const net = require('net')
const DELAY = parseInt(process.argv[2] || '50', 10)
const TARGET = 25565
const LISTEN = parseInt(process.argv[3] || '25566', 10)
const server = net.createServer(client => {
  const upstream = net.connect(TARGET, '127.0.0.1')
  client.setNoDelay(true)
  upstream.setNoDelay(true)
  client.on('data', d => setTimeout(() => { if (upstream.writable) upstream.write(d) }, DELAY))
  upstream.on('data', d => setTimeout(() => { if (client.writable) client.write(d) }, DELAY))
  const done = () => { upstream.destroy(); client.destroy() }
  client.on('close', done); upstream.on('close', done)
  client.on('error', done); upstream.on('error', done)
})
server.listen(LISTEN, '127.0.0.1', () => console.log('proxy listening', LISTEN, '->', TARGET, 'one-way delay', DELAY, 'ms'))
