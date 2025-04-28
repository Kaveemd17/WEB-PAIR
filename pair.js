/**
 * KAVEE-MD - WhatsApp Bot Pairing System
 * Pairing handler for phone number registration
 */

const fs = require('fs');
const path = require('path');

/**
 * Handle the pairing process
 * @param {Object} socket - Socket.io socket object
 * @param {String} sessionId - Unique session identifier
 * @param {String} phoneNumber - User's phone number with country code
 */
async function pairHandler(socket, sessionId, phoneNumber) {
    try {
        // Create a session directory if it doesn't exist
        const sessionDir = path.join(__dirname, 'sessions', sessionId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Save phone number for the session
        const configPath = path.join(sessionDir, 'config.json');
        const configData = {
            phoneNumber: phoneNumber,
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        };

        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

        // Emit success event to client
        socket.emit('pair-status', {
            success: true,
            message: 'Phone number registered successfully',
            sessionId
        });

        console.log(`Pairing completed for ${phoneNumber} with session ID: ${sessionId}`);
        
        // Return the session data
        return {
            sessionId,
            phoneNumber,
            configPath
        };
    } catch (error) {
        console.error('Error in pairing process:', error);
        
        // Emit error event to client
        socket.emit('pair-status', {
            success: false,
            message: 'Failed to register phone number',
            error: error.message
        });
        
        throw error;
    }
}

/**
 * Check if a session exists for the given phone number
 * @param {String} phoneNumber - Phone number to check
 * @returns {Boolean} - Whether session exists
 */
function sessionExists(phoneNumber) {
    const sessionId = `KAVEE-${phoneNumber}`;
    const sessionDir = path.join(__dirname, 'sessions', sessionId);
    return fs.existsSync(sessionDir);
}

/**
 * Get session data for the given phone number
 * @param {String} phoneNumber - Phone number to get session for
 * @returns {Object|null} - Session data or null if not found
 */
function getSessionData(phoneNumber) {
    try {
        const sessionId = `KAVEE-${phoneNumber}`;
        const configPath = path.join(__dirname, 'sessions', sessionId, 'config.json');
        
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        return null;
    } catch (error) {
        console.error('Error getting session data:', error);
        return null;
    }
}

module.exports = {
    pairHandler,
    sessionExists,
    getSessionData
};
