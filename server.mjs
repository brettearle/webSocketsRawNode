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
const MAX_SIXTEENBITS_INT = 2 ** 16
const MASK_KEY_BYTES_LENGTH = 4
//parseInt('10000000', 2) equals 128 which is a bit
const FIRST_BIT = 128
const OPCODE_TEXT = 0x01

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

function sendMessage(msg, socket) {
  const data = prepareMessage(msg)
  socket.write(data)
}

function prepareMessage(msg) {
  const message = Buffer.from(msg)
  const msgSize = message.length

  let dataFrameBuffer

  //128 as binary = 0x80
  const firstByte = 0x80 | OPCODE_TEXT
  if (msgSize <= SEVEN_BITS_INTEGER_MARKER) {
    const bytes = [firstByte]
    dataFrameBuffer = Buffer.from(bytes.concat(msgSize))
  } else if (msgSize <= MAX_SIXTEENBITS_INT) {
    const offsetFourBytes = 4
    const target = Buffer.allocUnsafe(offsetFourBytes)
    target[0] = firstByte
    target[1] = SIXTEEN_BITS_INTEGER_MARKER

    target.writeUint16BE(msgSize, 2)
    dataFrameBuffer = target
  } else {
    throw new Error('message to long')
  }
  const totalLength = dataFrameBuffer.byteLength + msgSize
  const dataFrameResponse = concatBuff([dataFrameBuffer, message], totalLength)
  return dataFrameResponse
}

function concatBuff(bufferList, totalLength) {
  const target = Buffer.allocUnsafe(totalLength)
  let offset = 0
  for (const buffer of bufferList) {
    target.set(buffer, offset)
    offset += buffer.length
  }
  return target
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
  } else if (lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
    //unsigned big-endian 16-bit int
    messageLength = socket.read(2).readUint16BE(0)
  } else {
    throw new Error('your message to long we dont handle 64-bit message')
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH)
  const encoded = socket.read(messageLength)
  const decoded = unmask(encoded, maskKey)
  const recieved = decoded.toString('utf8')
  const data = JSON.parse(recieved)
  console.log('Message Recieved: ', data)

  const msg = JSON.stringify({ message: data, at: new Date().toISOString() })
  sendMessage(msg, socket)
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
  const fillWithEightZeros = (t) => t.padStart(8, '0')
  const toBinary = (t) => fillWithEightZeros(t.toString(2))
  const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2)
  const getCharFromBinary = (t) => String.fromCharCode(fromBinaryToDecimal(t))

  for (let index = 0; index < encodedBuffer.length; index++) {
    finalBuffer[index] =
      encodedBuffer[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH]

    const logger = {
      unmaskingCalc: `${toBinary(encodedBuffer[index])} ^ ${
        maskKey[index % MASK_KEY_BYTES_LENGTH]
      } 
      = ${toBinary(finalBuffer[index])}`,
      decoded: getCharFromBinary(finalBuffer[index])
    }
    console.log(logger)
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
