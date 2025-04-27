// Define path globally with proper declaration
const express = require('express');
const app = express();
const PORT = 5000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// Use try/catch when requiring modules
let code;
try {
  code = require("./pair");
} catch (error) {
  console.error("Error loading pair.js module:", error.message);
  process.exit(1); // Exit if critical module is missing
}

// Increase event listener limit
require("events").EventEmitter.defaultMaxListeners = 500;

// Configure middleware before routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use("/code", code);

app.use("/", async (req, res) => {
  try {
    res.sendFile(path.join(__path, "pair.html"));
  } catch (error) {
    console.error("Error sending file:", error.message);
    res.status(500).send("Internal Server Error: Could not load pair.html");
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Internal Server Error");
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`⏩ Server running on http://0.0.0.0:` + PORT);
}).on("error", (error) => {
  console.error("Failed to start server:", error.message);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = app;
