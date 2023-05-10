import { createServer } from 'http'
import crypto from 'crypto'

const PORT = 1337
//BELOW IS DOCKS FOR WS HANDSHAKE WHERE MAGIC KEY COMES FROM. Sec-WebSocket-Accept header
//https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers
const WEB_SOCKET_SERVER_MAGIC_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const server = createServer((request, response) => {
  response.writeHead(200)
  response.end('Hi Hello')
}).listen(PORT, () => console.log(`Server running on ${PORT}`))

server.on('upgrade', onSocketUpgrade)

function onSocketUpgrade(req, socket, head) {
  const { 'sec-websocket-key': webClientSocketKey } = req.headers
  console.log(`${webClientSocketKey} connected!`)
  const headers = prepareHandShakeHeaders(webClientSocketKey)
  socket.write(headers)
}

function prepareHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id)
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    ''
  ]
    .map((line) => {
      line.concat('\r\n')
    })
    .join('')
  return headers
}

function createSocketAccept(id) {
  const shaum = crypto.createHash('sha1')
  shaum.update(id + WEB_SOCKET_SERVER_MAGIC_KEY)
  return shaum.digest('base64')
}

;[
  // error handling to keep server running, this handles missed errors
  'uncaughtException',
  'unhandledRejection'
].forEach((event) => {
  process.on(event, (err) => {
    console.error(`Error happened: event: ${event}, msg: ${err.stack || err}`)
  })
})
