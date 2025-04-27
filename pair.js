const express = require("express");
const router = express.Router();
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const qrcode = require("qrcode");
const __path = process.cwd();

router.get("/", async (req, res) => {
  try {
    res.sendFile(__path + "/pair.html");
  } catch (error) {
    res.json({
      status: false,
      message: "Error in server",
      error: error.message
    });
  }
});

router.get("/qr", async (req, res) => {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(__path + "/auth_info_baileys");
    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      browser: Browsers.macOS("Desktop"),
      auth: state,
      qrTimeout: 40000
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        qrcode.toDataURL(qr, (err, url) => {
          if (err) {
            res.json({
              status: false,
              message: "Error generating QR code",
              error: err.message
            });
          }
          res.json({
            status: true,
            qr: url
          });
        });
      }
      
      if (connection === "close") {
        let reason = new Error("Unknown");
        if (lastDisconnect && lastDisconnect.error) {
          reason = lastDisconnect.error;
        }
        if (reason.output?.statusCode !== DisconnectReason.loggedOut) {
          console.log("Reconnecting...");
        } else {
          console.log("Disconnected.");
          try {
            fs.rmSync(__path + "/auth_info_baileys", { recursive: true, force: true });
            console.log("Deleted auth_info_baileys folder");
          } catch (err) {
            console.error("Error deleting auth folder:", err);
          }
        }
      }
      
      if (connection === "open") {
        console.log("Connected...");
      }
    });

    sock.ev.on("creds.update", saveCreds);

  } catch (error) {
    res.json({
      status: false,
      message: "Error in server",
      error: error.message
    });
  }
});

module.exports = router;
