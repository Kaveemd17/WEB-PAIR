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
