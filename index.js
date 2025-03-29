const express = require("express");
const app = express();
__path = process.cwd();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Added for Replit compatibility
let code = require("./pair");
require("events").EventEmitter.defaultMaxListeners = 500;
app.use("/code", code);

app.use("/", async (req, res, next) => {
  res.sendFile(__path + "/pair.html");
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const server = 
app.listen(PORT, HOST, () => {
  console.log(`⏩ Server running on port ${PORT} at ${HOST}`);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Performing graceful shutdown...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
