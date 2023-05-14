import { createServer } from 'http'
import crypto from 'crypto'
import { buffer } from 'stream/consumers'

const PORT = 1337
//BELOW IS DOCKS FOR WS HANDSHAKE WHERE MAGIC KEY COMES FROM. Sec-WebSocket-Accept header
//https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers
const WEB_SOCKET_SERVER_MAGIC_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const SEVEN_BITS_INTEGER_MARKER = 125
const SIXTEEN_BITS_INTEGER_MARKER = 126
const SIXTYFOUR_BITS_INTEGER_MARKER = 127

const MASK_KEY_BYTES_LENGTH = 4
//parseInt('10000000', 2) equals 128 which is a bit
const FIRST_BIT = 128

const server = createServer((request, response) => {
  response.writeHead(200)
  response.end('Hi Hello')
}).listen(PORT, () => console.log(`Server running on ${PORT}`))

server.on('upgrade', onSocketUpgrade)

function onSocketUpgrade(req, socket, head) {
  const { 'sec-websocket-key': webClientSocketKey } = req.headers
  console.log(req.headers)
  console.log(`${webClientSocketKey} connected!`)
  const headers = prepareHandShakeHeaders(webClientSocketKey)
  socket.write(headers)
  socket.on('readable', () => onSocketReadable(socket))
}

function onSocketReadable(socket) {
  // consume first byte as it only holds meta data
  socket.read(1)
  //reading again below is consuming the second byte
  const [markerAndPayloadLength] = socket.read(1)
  // Because the fisrt bit is always 1 for messages
  // We can subtract one bit (128 or '10000000')
  // to get rid of 0index bit which contains mask
  const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT

  let messageLength = 0
  if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
    messageLength = lengthIndicatorInBits
  } else {
    throw new Error('your message to long we dont handle 64-bit message')
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH)
  const encoded = socket.read(messageLength)
  const decoded = unmask(encoded, maskKey)
  const recieved = decoded.toString('utf8')
  const data = JSON.parse(recieved)
  console.log('Message Recieved: ', data)
}

function unmask(encodedBuffer, maskKey) {
  const finalBuffer = Buffer.from(encodedBuffer)

  //Index mod mask key byte length because mask key is 4 bytes
  //index % 4 === 0, 1, 2, 3 = index bits needed to decode the message
  //
  // XOR ^
  // returns 1 if both are different
  // returns 0 if both are equal
  //
  // (71).toString(2).padStart(8, "0") = 01000111
  // (53).toString(2).padStart(8, "0") = 00110101
  //  XOR result                       = 01110010
  //
  //  we pass in the parsed int of XOR byte to fromCharCode to retrieve char from it
  //  String.fromCharCode(parseInt('01110010', 2)) = 'r'
  //
  //  FINALLY USING XOR INSTEAD
  //  String.fromCharCode(parseInt((71 ^ 53).toString(2).padStart(8, "0"), 2))
  for (let index = 0; index < encodedBuffer.length; index++) {
    finalBuffer[index] =
      encodedBuffer[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH]
  }
  return finalBuffer
}

function prepareHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id)
  const responseHeaders = [
    'HTTP/1.1 101 Web Socket Protocol Handshake',
    'Upgrade: WebSocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ]
  //these spaces and return lines are important for client and server to accept handshake
  return responseHeaders.join('\r\n') + '\r\n\r\n'
}

function createSocketAccept(id) {
  const shaum = crypto.createHash('sha1')
  shaum.update(id + WEB_SOCKET_SERVER_MAGIC_KEY, 'binary')
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
