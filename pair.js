const express = require("express");
const router = express.Router();
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const PhoneNumber = require("awesome-phonenumber");
const phone = require("phone");
const qrcode = require("qrcode");
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
    
    // Validate and format the phone number
    const validatedPhone = phone(phoneNumber);
    
    if (!validatedPhone.isValid) {
      return res.json({
        status: false,
        message: "Invalid phone number format"
      });
    }
    
    // Format the phone number for display
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

// Route to initiate pairing and get QR code
router.post("/get-link-code", async (req, res) => {
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
    
    // Store basic session info immediately so client can start checking status
    pairingSessions.set(sessionId, {
      phoneNumber: validatedPhone.phoneNumber,
      status: "initializing",
      createdAt: new Date()
    });
    
    // Initialize WhatsApp connection asynchronously
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      browser: Browsers.macOS("Desktop"),
      auth: state,
      qrTimeout: 60000
    });
    
    pairingSessions.get(sessionId).sock = sock;
    
    // Handle connection updates
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      const session = pairingSessions.get(sessionId);
      if (!session) return; // Session might have been deleted
      
      if (qr) {
        // QR code received - update session with QR
        session.qr = qr;
        session.status = "qr_ready";
      }
      
      if (connection === "open") {
        console.log("Connection opened for session:", sessionId);
        session.status = "connected";
        
        // Save user profile info
        const userInfo = sock.user;
        session.userInfo = userInfo;
      }
      
      if (connection === "close") {
        console.log("Connection closed for session:", sessionId);
        let reason = new Error("Unknown");
        if (lastDisconnect && lastDisconnect.error) {
          reason = lastDisconnect.error;
        }
        
        session.status = "disconnected";
        session.disconnectReason = reason.message;
        
        // Clean up after some time
        setTimeout(() => {
          if (pairingSessions.has(sessionId)) {
            pairingSessions.delete(sessionId);
          }
          
          // Try to remove session directory
          try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`Removed session directory: ${sessionPath}`);
          } catch (err) {
            console.error(`Error removing session directory: ${err.message}`);
          }
        }, 15 * 60 * 1000); // 15 minutes
      }
    });
    
    sock.ev.on("creds.update", saveCreds);
    
    // Return session ID immediately
    return res.json({
      status: true,
      message: "Pairing session created. Fetching link code...",
      sessionId: sessionId
    });
    
  } catch (error) {
    console.error("Error in creating pairing session:", error);
    return res.json({
      status: false,
      message: "Error initiating pairing",
      error: error.message
    });
  }
});

// Route to check pairing status and get QR code
router.get("/status/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  
  if (!pairingSessions.has(sessionId)) {
    return res.json({
      status: false,
      message: "Invalid or expired session"
    });
  }
  
  const session = pairingSessions.get(sessionId);
  
  // If QR code is available, generate data URL
  let qrDataUrl = null;
  if (session.qr) {
    try {
      qrDataUrl = await qrcode.toDataURL(session.qr);
    } catch (err) {
      console.error("Error generating QR data URL:", err);
    }
  }
  
  return res.json({
    status: true,
    pairingStatus: session.status,
    phoneNumber: session.phoneNumber,
    qrCode: qrDataUrl,
    userInfo: session.userInfo || null,
    disconnectReason: session.disconnectReason || null
  });
});

// Cleanup old sessions periodically
setInterval(() => {
  const now = new Date();
  pairingSessions.forEach((session, sessionId) => {
    // Remove sessions older than 30 minutes
    if ((now - session.createdAt) > 30 * 60 * 1000) {
      console.log(`Cleaning up expired session: ${sessionId}`);
      pairingSessions.delete(sessionId);
    }
  });
}, 10 * 60 * 1000); // Run every 10 minutes

module.exports = router;
