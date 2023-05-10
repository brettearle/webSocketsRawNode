import { createServer } from "http";

const PORT = 1337;

const server = createServer((request, response) => {
  response.writeHead(200);
  response.end("Hi Hello");
}).listen(PORT, () => console.log(`Server running on ${PORT}`));

server.on("upgrade", (req, socket, head) => {
  console.log({
    req,
    socket,
    head,
  });
});

[
  // error handling to keep server running, this handles missed errors
  "uncaughtException",
  "unhandledRejection",
].forEach((event) => {
  process.on(event, (err) => {
    console.error(`Error happened: event: ${event}, msg: ${err.stack || err}`);
  });
});
