const express = require("express");
const router = express.Router();
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const PhoneNumber = require("awesome-phonenumber");
const phone = require("phone");
const __path = process.cwd();

// In-memory storage for pairing sessions
const pairingSessions = new Map();

router.get("/", async (req, res) => {
  try {
    res.sendFile(path.join(__path, "/pair.html"));
  } catch (error) {
    res.json({
      status: false,
      message: "Error in server",
      error: error.message
    });
  }
});

// Route to validate and format phone numbers
router.post("/validate-phone", (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber || phoneNumber.trim() === "") {
      return res.json({
        status: false,
        message: "Phone number is required"
      });
    }
    
    // Validate and format the phone number using the phone library
    const validatedPhone = phone(phoneNumber);
    
    if (!validatedPhone.isValid) {
      return res.json({
        status: false,
        message: "Invalid phone number format"
      });
    }
    
    // Format the phone number for display using awesome-phonenumber
    const pn = new PhoneNumber(validatedPhone.phoneNumber);
    
    return res.json({
      status: true,
      phoneNumber: validatedPhone.phoneNumber,
      formattedNumber: pn.getNumber("international"),
      countryCode: validatedPhone.countryCode
    });
  } catch (error) {
    return res.json({
      status: false,
      message: "Error processing phone number",
      error: error.message
    });
  }
});

// Route to initiate pairing with phone number
router.post("/pair", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber || phoneNumber.trim() === "") {
      return res.json({
        status: false,
        message: "Phone number is required"
      });
    }
    
    // Validate phone number
    const validatedPhone = phone(phoneNumber);
    
    if (!validatedPhone.isValid) {
      return res.json({
        status: false,
        message: "Invalid phone number format"
      });
    }
    
    // Create a unique session ID
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Create directory for this session if it doesn't exist
    const sessionPath = path.join(__path, "auth_sessions", sessionId);
    
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    // Initialize WhatsApp connection
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Desktop"),
      auth: state
    });
    
    // Store session information
    pairingSessions.set(sessionId, {
      sock,
      phoneNumber: validatedPhone.phoneNumber,
      status: "initializing",
      createdAt: new Date()
    });
    
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === "open") {
        console.log("Connection opened for session:", sessionId);
        pairingSessions.get(sessionId).status = "connected";
        
        // Save user profile info
        const userInfo = await sock.user;
        pairingSessions.get(sessionId).userInfo = userInfo;
      }
      
      if (connection === "close") {
        console.log("Connection closed for session:", sessionId);
        let reason = new Error("Unknown");
        if (lastDisconnect && lastDisconnect.error) {
          reason = lastDisconnect.error;
        }
        
        pairingSessions.get(sessionId).status = "disconnected";
        pairingSessions.get(sessionId).disconnectReason = reason.message;
        
        // Clean up after some time
        setTimeout(() => {
          if (pairingSessions.has(sessionId)) {
            pairingSessions.delete(sessionId);
          }
        }, 30 * 60 * 1000); // 30 minutes
      }
    });
    
    sock.ev.on("creds.update", saveCreds);
    
    // Start the pairing process by sending a message to the provided phone number
    try {
      await sock.sendMessage(`${validatedPhone.phoneNumber.replace("+", "")}@s.whatsapp.net`, { 
        text: `🤖 *KAVEE-MD Bot Pairing Request*\n\nThis is an automated message from KAVEE-MD Bot. Someone is trying to pair this bot with your WhatsApp number. If this was you, please wait while the pairing completes. If not, please ignore this message.`
      });
      
      pairingSessions.get(sessionId).status = "message_sent";
      
      return res.json({
        status: true,
        message: "Pairing initiated. A message has been sent to your WhatsApp number.",
        sessionId: sessionId
      });
    } catch (msgError) {
      console.error("Error sending message:", msgError);
      
      return res.json({
        status: false,
        message: "Failed to send message to the provided number. Please ensure the number is registered on WhatsApp.",
        error: msgError.message
      });
    }
  } catch (error) {
    console.error("Error in pairing:", error);
    return res.json({
      status: false,
      message: "Error initiating pairing",
      error: error.message
    });
  }
});

// Route to check pairing status
router.get("/status/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  
  if (!pairingSessions.has(sessionId)) {
    return res.json({
      status: false,
      message: "Invalid or expired session"
    });
  }
  
  const session = pairingSessions.get(sessionId);
  
  return res.json({
    status: true,
    pairingStatus: session.status,
    phoneNumber: session.phoneNumber,
    userInfo: session.userInfo || null,
    disconnectReason: session.disconnectReason || null
  });
});

// Cleanup old sessions periodically
setInterval(() => {
  const now = new Date();
  pairingSessions.forEach((session, sessionId) => {
    // Remove sessions older than 1 hour
    if ((now - session.createdAt) > 60 * 60 * 1000) {
      pairingSessions.delete(sessionId);
    }
  });
}, 15 * 60 * 1000); // Run every 15 minutes

module.exports = router;
