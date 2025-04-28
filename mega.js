/**
 * KAVEE-MD - WhatsApp Bot Pairing System
 * MEGA storage integration handler
 */

const { Storage } = require('megajs');
const fs = require('fs');
const path = require('path');

/**
 * Handle MEGA storage operations
 * @param {Object} socket - Socket.io socket object
 * @param {Object} data - Data for MEGA operations
 */
async function megaHandler(socket, data) {
    const { operation, email, password, sessionId, filePath } = data;

    try {
        switch (operation) {
            case 'backup':
                await backupToMega(socket, email, password, sessionId);
                break;
            case 'restore':
                await restoreFromMega(socket, email, password, sessionId);
                break;
            case 'upload':
                await uploadFileToMega(socket, email, password, filePath);
                break;
            default:
                throw new Error('Unknown MEGA operation');
        }
    } catch (error) {
        console.error('MEGA operation error:', error);
        socket.emit('mega-status', {
            success: false,
            operation,
            message: 'MEGA operation failed',
            error: error.message
        });
    }
}

/**
 * Backup session data to MEGA
 * @param {Object} socket - Socket.io socket object
 * @param {String} email - MEGA account email
 * @param {String} password - MEGA account password
 * @param {String} sessionId - Session ID to backup
 */
async function backupToMega(socket, email, password, sessionId) {
    try {
        socket.emit('mega-status', {
            success: true,
            operation: 'backup',
            message: 'Starting backup to MEGA...'
        });

        // Connect to MEGA
        const storage = new Storage({
            email,
            password
        });

        await new Promise((resolve, reject) => {
            storage.login((err) => {
                if (err) {
                    reject(new Error('MEGA login failed: ' + err.message));
                    return;
                }
                resolve();
            });
        });

        socket.emit('mega-status', {
            success: true,
            operation: 'backup',
            message: 'Connected to MEGA, preparing backup...'
        });

        // Create backup directory if it doesn't exist
        const rootFolder = storage.root;
        let backupFolder = null;

        for (const node of rootFolder.children) {
            if (node.name === 'KAVEE-MD-Backups') {
                backupFolder = node;
                break;
            }
        }

        if (!backupFolder) {
            backupFolder = await new Promise((resolve, reject) => {
                rootFolder.mkdir('KAVEE-MD-Backups', (err, folder) => {
                    if (err) {
                        reject(new Error('Failed to create backup folder: ' + err.message));
                        return;
                    }
                    resolve(folder);
                });
            });
        }

        // Create session folder
        let sessionFolder = null;
        for (const node of backupFolder.children) {
            if (node.name === sessionId) {
                sessionFolder = node;
                break;
            }
        }

        if (!sessionFolder) {
            sessionFolder = await new Promise((resolve, reject) => {
                backupFolder.mkdir(sessionId, (err, folder) => {
                    if (err) {
                        reject(new Error('Failed to create session folder: ' + err.message));
                        return;
                    }
                    resolve(folder);
                });
            });
        }

        // Create backup archive
        const sessionPath = path.join(__dirname, 'sessions', sessionId);
        const backupArchivePath = path.join(__dirname, `${sessionId}-backup.zip`);

        // Create zip archive of session data
        const archiver = require('archiver');
        const output = fs.createWriteStream(backupArchivePath);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(sessionPath, false);
            archive.finalize();
        });

        socket.emit('mega-status', {
            success: true,
            operation: 'backup',
            message: 'Session data archived, uploading to MEGA...'
        });

        // Upload backup archive to MEGA
        await new Promise((resolve, reject) => {
            sessionFolder.upload(backupArchivePath, (err, uploadedFile) => {
                if (err) {
                    reject(new Error('Failed to upload backup: ' + err.message));
                    return;
                }
                resolve(uploadedFile);
            });
        });

        // Remove temporary backup archive
        fs.unlinkSync(backupArchivePath);

        socket.emit('mega-status', {
            success: true,
            operation: 'backup',
            message: 'Backup to MEGA completed successfully!'
        });
    } catch (error) {
        console.error('Backup to MEGA error:', error);
        socket.emit('mega-status', {
            success: false,
            operation: 'backup',
            message: 'Backup to MEGA failed',
            error: error.message
        });
    }
}

/**
 * Restore session data from MEGA
 * @param {Object} socket - Socket.io socket object
 * @param {String} email - MEGA account email
 * @param {String} password - MEGA account password
 * @param {String} sessionId - Session ID to restore
 */
async function restoreFromMega(socket, email, password, sessionId) {
    try {
        socket.emit('mega-status', {
            success: true,
            operation: 'restore',
            message: 'Starting restore from MEGA...'
        });

        // Connect to MEGA
        const storage = new Storage({
            email,
            password
        });

        await new Promise((resolve, reject) => {
            storage.login((err) => {
                if (err) {
                    reject(new Error('MEGA login failed: ' + err.message));
                    return;
                }
                resolve();
            });
        });

        socket.emit('mega-status', {
            success: true,
            operation: 'restore',
            message: 'Connected to MEGA, searching for backup...'
        });

        // Find backup directory
        const rootFolder = storage.root;
        let backupFolder = null;

        for (const node of rootFolder.children) {
            if (node.name === 'KAVEE-MD-Backups') {
                backupFolder = node;
                break;
            }
        }

        if (!backupFolder) {
            throw new Error('Backup folder not found in MEGA');
        }

        // Find session folder
        let sessionFolder = null;
        for (const node of backupFolder.children) {
            if (node.name === sessionId) {
                sessionFolder = node;
                break;
            }
        }

        if (!sessionFolder) {
            throw new Error(`No backup found for session: ${sessionId}`);
        }

        // Find the latest backup file
        let latestBackup = null;
        let latestTime = 0;

        for (const node of sessionFolder.children) {
            if (node.timestamp > latestTime) {
                latestBackup = node;
                latestTime = node.timestamp;
            }
        }

        if (!latestBackup) {
            throw new Error(`No backup files found for session: ${sessionId}`);
        }

        socket.emit('mega-status', {
            success: true,
            operation: 'restore',
            message: 'Backup found, downloading...'
        });

        // Download backup archive
        const downloadPath = path.join(__dirname, `${sessionId}-restore.zip`);
        
        await new Promise((resolve, reject)
