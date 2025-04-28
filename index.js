/**
 * KAVEE-MD - WhatsApp Bot Pairing System
 * Main index file for the KAVEE-MD WhatsApp Bot
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const pino = require('pino');
const path = require('path');
const express = require('express');
const { createServer } = require('http');
const qrcode = require('qrcode');
const socketIO = require('socket.io');
const { pairHandler } = require('./pair');
const { megaHandler } = require('./mega');

// Initialize Express app
const app = express();
const port = process.env.PORT || 8000;
const server = createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

// Initialize connection state
let connectionState = {};

// Function to start the WhatsApp connection
async function startWhatsApp(sessionId) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        browser: ['KAVEE-MD', 'Chrome', '1.0.0'],
        auth: state,
        logger: pino({ level: 'silent' })
    });
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // Generate QR code and emit to socket
            try {
                const qrCode = await qrcode.toDataURL(qr);
                io.to(sessionId).emit('qr', qrCode);
                console.log(`QR Code generated for session: ${sessionId}`);
            } catch (err) {
                console.error('QR Code generation error:', err);
            }
        }
        
        if (connection === 'open') {
            io.to(sessionId).emit('connected', {
                status: true,
                message: 'WhatsApp connected successfully!'
            });
            console.log(`Session ${sessionId} connected!`);
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            io.to(sessionId).emit('connection-status', {
                status: false,
                message: 'WhatsApp connection closed',
                reconnect: shouldReconnect
            });
            
            if (shouldReconnect) {
                console.log(`Reconnecting session: ${sessionId}`);
                startWhatsApp(sessionId);
            } else {
                console.log(`Session ${sessionId} logged out`);
                io.to(sessionId).emit('logged-out');
            }
        }
    });
    
    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);
    
    return sock;
}

// Socket connection handling
io.on('connection', async (socket) => {
    console.log('A user connected', socket.id);
    
    // Handle pairing requests
    socket.on('pair', async (data) => {
        const { phoneNumber } = data;
        if (!phoneNumber) {
            socket.emit('error', { message: 'Phone number is required' });
            return;
        }
        
        const sessionId = `KAVEE-${phoneNumber}`;
        socket.join(sessionId);
        
        // Check if session directory exists
        const sessionDir = `./sessions/${sessionId}`;
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        try {
            // Handle pairing process
            await pairHandler(socket, sessionId, phoneNumber);
            
            // Start WhatsApp connection
            connectionState[sessionId] = await startWhatsApp(sessionId);
        } catch (error) {
            console.error('Pairing error:', error);
            socket.emit('error', { message: 'Pairing failed', error: error.message });
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected', socket.id);
    });
    
    // Handle MEGA operations
    socket.on('mega', async (data) => {
        await megaHandler(socket, data);
    });
});

// Start the server
server.listen(port, () => {
    console.log(`KAVEE-MD server running on port ${port}`);
});

// Export connection state for external use
module.exports = { connectionState };
