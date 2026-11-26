const net = require('net');
const port = 12343;
const server = net.createServer((conn) => {
  console.log(Robot connected from :);
});
server.listen(port, '0.0.0.0', () => {
  console.log(Listening on );
});
