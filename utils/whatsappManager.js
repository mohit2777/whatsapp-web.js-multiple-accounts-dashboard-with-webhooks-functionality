const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const axios = require('axios');
const moment = require('moment');
const fs = require('fs-extra');

class WhatsAppManager {
  constructor() {
    this.clients = new Map(); // Store active WhatsApp clients
    this.qrCodes = new Map(); // Store QR codes for each account
    this.accountStatus = new Map(); // Store account status
  }

  // Create a new WhatsApp account instance - optimized for performance
  async createAccount(accountName, description = '') {
    let accountId;
    try {
      accountId = uuidv4();
      const sessionsBase = `./sessions`;
      const sessionDir = `${sessionsBase}/${accountId}`;

      // Ensure sessions directories exist
      await fs.ensureDir(sessionsBase);
      await fs.ensureDir(sessionDir);
      
      // Create account in database
      const accountData = {
        id: accountId,
        name: accountName,
        description: description,
        status: 'initializing',
        session_dir: sessionDir,
        created_at: new Date().toISOString()
      };

      // Create DB record immediately (so API can respond fast)
      const accountPromise = db.createAccount(accountData);
      
      // Initialize WhatsApp client with optimized settings
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: accountId,
          // Use a stable base dataPath; LocalAuth will place client data under this path by clientId
          dataPath: sessionsBase
        }),
        puppeteer: {
          headless: true,
          // Optimized browser arguments for faster startup and lower resource usage
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            // '--single-process', // can cause hangs on some platforms; avoid
            '--disable-gpu',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--no-default-browser-check',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-networking',
            '--disable-breakpad',
            '--disable-sync',
            '--disable-translate',
            '--metrics-recording-only',
            '--disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection'
          ],
          // Reduce memory usage
          defaultViewport: { width: 800, height: 600 }
        },
        // Increase message queue processing speed
        queueOptions: { 
          messageProcessingTimeoutMs: 15000, // Faster message processing
          concurrency: 5 // Process multiple messages concurrently
        }
      });

      // Set up event handlers
      this.setupEventHandlers(client, accountId);

      // Store client reference
      this.clients.set(accountId, client);
      this.accountStatus.set(accountId, 'initializing');

      // Initialize the client asynchronously (do not block API response)
      client.initialize().catch(err => {
        console.error('Client initialization error:', err);
        this.accountStatus.set(accountId, 'failed');
        // Try to reflect error in DB
        db.updateAccount(accountId, { status: 'failed', error_message: err.message, updated_at: new Date().toISOString() }).catch(() => {});
      });

      // Return as soon as DB record is created (non-blocking init)
      const account = await accountPromise;
      return account;
    } catch (error) {
      console.error('Error creating WhatsApp account:', error);
      if (accountId) {
        this.accountStatus.set(accountId, 'failed');
      }
      throw error;
    }
  }

  // Set up event handlers for a WhatsApp client
  setupEventHandlers(client, accountId) {
    client.on('qr', async (qr) => {
      try {
        // Generate QR code as data URL
        const qrDataUrl = await qrcode.toDataURL(qr);
        this.qrCodes.set(accountId, qrDataUrl);
        
        // Update account status
        await db.updateAccount(accountId, { 
          status: 'qr_ready',
          qr_code: qrDataUrl,
          updated_at: new Date().toISOString()
        });
        
        this.accountStatus.set(accountId, 'qr_ready');
        console.log(`QR code generated for account ${accountId}`);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    });

    client.on('ready', async () => {
      try {
        // Update account status
        await db.updateAccount(accountId, { 
          status: 'ready',
          phone_number: client.info.wid.user,
          updated_at: new Date().toISOString()
        });
        
        this.accountStatus.set(accountId, 'ready');
        this.qrCodes.delete(accountId); // Clear QR code
        
        console.log(`WhatsApp client ready for account ${accountId}`);
      } catch (error) {
        console.error('Error updating account status:', error);
      }
    });

    client.on('authenticated', () => {
      console.log(`WhatsApp client authenticated for account ${accountId}`);
    });

    client.on('auth_failure', async (msg) => {
      try {
        await db.updateAccount(accountId, { 
          status: 'auth_failed',
          error_message: msg,
          updated_at: new Date().toISOString()
        });
        
        this.accountStatus.set(accountId, 'auth_failed');
        console.error(`Authentication failed for account ${accountId}:`, msg);
      } catch (error) {
        console.error('Error updating account status:', error);
      }
    });

    client.on('disconnected', async (reason) => {
      try {
        await db.updateAccount(accountId, { 
          status: 'disconnected',
          error_message: reason,
          updated_at: new Date().toISOString()
        });
        
        this.accountStatus.set(accountId, 'disconnected');
        console.log(`WhatsApp client disconnected for account ${accountId}:`, reason);
      } catch (error) {
        console.error('Error updating account status:', error);
      }
    });

    client.on('message', async (message) => {
      try {
        await this.handleIncomingMessage(client, accountId, message);
      } catch (error) {
        console.error('Error handling incoming message:', error);
      }
    });
  }

  // Handle incoming messages
  async handleIncomingMessage(client, accountId, message) {
    try {
      const chat = await message.getChat();
      
      // Prepare message data
      const messageData = {
        account_id: accountId,
        direction: 'incoming',
        message_id: message.id._serialized,
        sender: message.from,
        recipient: message.to,
        message: message.body,
        timestamp: message.timestamp,
        type: message.type,
        chat_id: chat.id._serialized,
        is_group: chat.isGroup,
        group_name: chat.isGroup ? chat.name : null,
        created_at: new Date().toISOString()
      };

      // Add media data if present
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        messageData.media = {
          mimetype: media.mimetype,
          data: media.data,
          filename: media.filename
        };
      }

      // Log message to database
      await db.logMessage(messageData);

      // Send to webhooks
      await this.sendToWebhooks(accountId, messageData);

    } catch (error) {
      console.error('Error handling incoming message:', error);
      
      // Log error
      await db.logMessage({
        account_id: accountId,
        direction: 'incoming',
        status: 'failed',
        error_message: error.message,
        created_at: new Date().toISOString()
      });
    }
  }

  // Send message to webhooks - optimized for performance
  async sendToWebhooks(accountId, messageData) {
    try {
      const webhooks = await db.getWebhooks(accountId);
      
      // Skip processing if no webhooks
      if (!webhooks || webhooks.length === 0) return;
      
      // Process webhooks in parallel for better performance
      const webhookPromises = webhooks
        .filter(webhook => webhook.is_active)
        .map(async (webhook) => {
          // Identify n8n webhooks for optimized handling
          const isN8n = webhook.url.includes('n8n') || webhook.url.includes('nodemation');
          
          try {
            // Set optimized timeout for n8n (shorter timeout for faster processing)
            const timeout = isN8n ? 5000 : 10000;
            
            // Optimize payload for n8n
            const payload = isN8n ? this.optimizePayloadForN8n(messageData) : messageData;
            
            const response = await axios.post(webhook.url, payload, {
              headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': webhook.secret || '',
                'X-Account-ID': accountId
              },
              timeout
            });

            // Log successful webhook delivery - non-blocking
            this.logWebhookDelivery({
              account_id: accountId,
              direction: 'webhook',
              status: 'success',
              webhook_id: webhook.id,
              webhook_url: webhook.url,
              response_status: response.status,
              created_at: new Date().toISOString()
            });
            
            return { success: true, webhook_id: webhook.id };
          } catch (error) {
            // Log failed webhook delivery - non-blocking
            this.logWebhookDelivery({
              account_id: accountId,
              direction: 'webhook',
              status: 'failed',
              webhook_id: webhook.id,
              webhook_url: webhook.url,
              error_message: error.message,
              created_at: new Date().toISOString()
            });
            
            return { success: false, webhook_id: webhook.id, error: error.message };
          }
        });
      
      // Execute all webhook calls in parallel
      await Promise.allSettled(webhookPromises);
    } catch (error) {
      console.error('Error sending to webhooks:', error);
    }
  }
  
  // Optimize payload for n8n to reduce processing time
  optimizePayloadForN8n(messageData) {
    // Create a streamlined version of the payload for n8n
    const { account_id, direction, sender, recipient, message, timestamp, type, chat_id, is_group } = messageData;
    
    return {
      account_id,
      direction,
      sender,
      recipient,
      message,
      timestamp,
      type,
      chat_id,
      is_group,
      // Add a flag to indicate this is an optimized payload
      optimized: true
    };
  }
  
  // Non-blocking log message
  logWebhookDelivery(logData) {
    // Use setImmediate to make this non-blocking
    setImmediate(async () => {
      try {
        await db.logMessage(logData);
      } catch (error) {
        console.error('Error logging webhook delivery:', error);
      }
    });
  }

  // Send message from an account - optimized for performance
  async sendMessage(accountId, number, message, options = {}) {
    // Use a message queue to prevent overloading the WhatsApp client
    if (!this.messageQueues) {
      this.messageQueues = new Map();
    }
    
    // Create queue for this account if it doesn't exist
    if (!this.messageQueues.has(accountId)) {
      this.messageQueues.set(accountId, []);
    }
    
    // Get the queue for this account
    const queue = this.messageQueues.get(accountId);
    
    // Check if we're already processing too many messages
    if (queue.length > 20) {
      throw new Error('Message queue is full. Please try again later.');
    }
    
    try {
      // Reduce logging for better performance
      const client = this.clients.get(accountId);
      if (!client) {
        throw new Error('WhatsApp client not found for this account');
      }

      // Fast status check
      const status = this.accountStatus.get(accountId);
      if (status !== 'ready') {
        throw new Error(`WhatsApp client is not ready. Current status: ${status}`);
      }

      // Quick client state validation
      if (!client.pupPage || client.pupPage._closed) {
        throw new Error('WhatsApp client page is closed or not available');
      }

      // Format phone number - cache formatted numbers for repeated sends
      const formattedNumber = this.getFormattedNumber(number);
      
      // Add to processing queue
      const queueItem = { number: formattedNumber, message, options, timestamp: Date.now() };
      queue.push(queueItem);
      
      // Send message with optimized error handling
      const result = await client.sendMessage(formattedNumber, message, options);
      
      // Remove from queue
      const index = queue.findIndex(item => 
        item.number === formattedNumber && 
        item.message === message && 
        item.timestamp === queueItem.timestamp
      );
      if (index !== -1) queue.splice(index, 1);
      
      // Log outgoing message in a non-blocking way
      this.logOutgoingMessage({
        account_id: accountId,
        direction: 'outgoing',
        message_id: result.id._serialized,
        sender: result.from,
        recipient: result.to,
        message: message,
        timestamp: result.timestamp,
        type: 'text',
        status: 'success',
        created_at: new Date().toISOString()
      });
      
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp
      };

    } catch (error) {
      // Log failed message in a non-blocking way
      this.logOutgoingMessage({
        account_id: accountId,
        direction: 'outgoing',
        recipient: number,
        message: message,
        status: 'failed',
        error_message: error.message,
        created_at: new Date().toISOString()
      });

      throw error;
    }
  }
  
  // Non-blocking message logging
  logOutgoingMessage(messageData) {
    setImmediate(async () => {
      try {
        await db.logMessage(messageData);
      } catch (error) {
        console.error('Error logging message:', error);
      }
    });
  }
  
  // Send media (image/document/audio/video)
  // media: { data(base64) | url, mimetype?, filename? }
  // options: { sendMediaAsDocument?: boolean, sendAudioAsVoice?: boolean }
  async sendMedia(accountId, number, media, caption = '', options = {}) {
    // Validate media payload
    if (!media || (!media.data && !media.url)) {
      throw new Error('Invalid media payload. Expect { data | url, mimetype?, filename? }');
    }
    
    // Ensure client exists and ready
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error('WhatsApp client not found for this account');
    }
    const status = this.accountStatus.get(accountId);
    if (status !== 'ready') {
      throw new Error(`WhatsApp client is not ready. Current status: ${status}`);
    }
    if (!client.pupPage || client.pupPage._closed) {
      throw new Error('WhatsApp client page is closed or not available');
    }

    // Prepare media data
    let base64Data = media.data || '';
    let mimetype = media.mimetype || '';
    let filename = media.filename || '';

    if (media.url && !base64Data) {
      // Fetch from URL
      const response = await axios.get(media.url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      base64Data = buffer.toString('base64');
      mimetype = mimetype || response.headers['content-type'] || 'application/octet-stream';
      if (!filename) {
        try {
          const urlObj = new URL(media.url);
          filename = urlObj.pathname.split('/').pop() || '';
        } catch {}
      }
    }

    // Normalize base64: strip possible data URL prefix
    const dataUrlPrefix = /^data:[^;]+;base64,/i;
    if (base64Data && dataUrlPrefix.test(base64Data)) {
      base64Data = base64Data.replace(dataUrlPrefix, '');
    }

    if (!mimetype) {
      throw new Error('mimetype is required when sending media');
    }

    // Enforce size limit (~16MB)
    try {
      const sizeBytes = Buffer.byteLength(base64Data, 'base64');
      const MAX = 16 * 1024 * 1024; // 16MB
      if (sizeBytes > MAX) {
        throw new Error(`Media too large (${(sizeBytes/1024/1024).toFixed(2)}MB). Max allowed ~16MB`);
      }
    } catch (e) {
      if (e.message.startsWith('Media too large')) throw e;
    }
    
    // Build MessageMedia
    filename = filename || this.deriveDefaultFilename(mimetype);
    const msgMedia = new MessageMedia(mimetype, base64Data, filename);
    
    // Format number
    const formattedNumber = this.getFormattedNumber(number);
    
    // Send media
    const isAudio = typeof mimetype === 'string' && mimetype.startsWith('audio/');
    const sendOptions = { caption };
    if (isAudio && options.sendAudioAsVoice) {
      // Voice note takes precedence for audio files
      sendOptions.sendAudioAsVoice = true;
    } else if (options.sendMediaAsDocument) {
      // Otherwise, allow sending as document
      sendOptions.sendMediaAsDocument = true;
    }
    const result = await client.sendMessage(formattedNumber, msgMedia, sendOptions);
    
    // Log outgoing media in a non-blocking way
    this.logOutgoingMessage({
      account_id: accountId,
      direction: 'outgoing',
      message_id: result.id?._serialized,
      sender: result.from,
      recipient: result.to,
      message: caption || '',
      type: 'media',
      media: {
        mimetype: mimetype,
        filename: filename,
        source: media.url ? 'url' : 'base64'
      },
      status: 'success',
      timestamp: result.timestamp,
      created_at: new Date().toISOString()
    });
    
    return {
      success: true,
      messageId: result.id?._serialized,
      timestamp: result.timestamp
    };
  }

  // Derive a default filename from mimetype
  deriveDefaultFilename(mimetype) {
    try {
      const ext = mimetype.split('/')[1] || 'bin';
      return `media.${ext}`;
    } catch {
      return 'media.bin';
    }
  }
  
  // Cached phone number formatting
  getFormattedNumber(number) {
    // Initialize number format cache if it doesn't exist
    if (!this.numberFormatCache) {
      this.numberFormatCache = new Map();
    }
    
    // Check if we already formatted this number
    if (this.numberFormatCache.has(number)) {
      return this.numberFormatCache.get(number);
    }
    
    // Format the number
    const formattedNumber = this.formatPhoneNumber(number);
    
    // Cache the result (limit cache size to prevent memory leaks)
    if (this.numberFormatCache.size > 1000) {
      // Clear the oldest entries if cache gets too big
      const oldestKey = this.numberFormatCache.keys().next().value;
      this.numberFormatCache.delete(oldestKey);
    }
    
    this.numberFormatCache.set(number, formattedNumber);
    return formattedNumber;
  }

  // Format phone number for WhatsApp
  formatPhoneNumber(number) {
    // Remove any non-digit characters
    let cleaned = number.replace(/[^\d]/g, '');

    // If no country code, assume it's a local number (default to India 91)
    if (!/^\d{10,}$/.test(cleaned)) {
      // If user included a plus, it was stripped above; ensure we prepend default country code
      cleaned = '91' + cleaned;
    }

    // Ensure we don't end up with leading zeros after country code
    cleaned = cleaned.replace(/^0+/, '');

    // Build WhatsApp JID (no plus sign)
    return cleaned + '@c.us';
  }

  // Get QR code for an account
  getQRCode(accountId) {
    return this.qrCodes.get(accountId);
  }

  // Get account status
  getAccountStatus(accountId) {
    return this.accountStatus.get(accountId);
  }

  // Get all account statuses
  getAllAccountStatuses() {
    const statuses = {};
    for (const [accountId, status] of this.accountStatus) {
      statuses[accountId] = status;
    }
    return statuses;
  }

  // Delete an account
  async deleteAccount(accountId) {
    try {
      const client = this.clients.get(accountId);
      if (client) {
        await client.destroy();
        this.clients.delete(accountId);
      }
      
      this.qrCodes.delete(accountId);
      this.accountStatus.delete(accountId);
      
      // Delete from database
      await db.deleteAccount(accountId);
      
      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }

  // Initialize existing accounts from database
  async initializeExistingAccounts() {
    try {
      const accounts = await db.getAccounts();
      
      // Attempt to reconnect all accounts to reuse persisted sessions
      for (const account of accounts) {
        await this.reconnectAccount(account);
      }
    } catch (error) {
      console.error('Error initializing existing accounts:', error);
    }
  }

  // Reconnect to an existing account
  async reconnectAccount(account) {
    try {
      const sessionsBase = `./sessions`;
      // Ensure base sessions directory exists
      await fs.ensureDir(sessionsBase);
      
      // Initialize WhatsApp client with existing session
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: account.id,
          // Use the same stable base as on creation so tokens are reused across restarts
          dataPath: sessionsBase
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        }
      });

      // Set up event handlers
      this.setupEventHandlers(client, account.id);

      // Store client reference
      this.clients.set(account.id, client);
      this.accountStatus.set(account.id, 'initializing');

      // Initialize the client
      await client.initialize();

      console.log(`Reconnected to existing account: ${account.name} (${account.id})`);
    } catch (error) {
      console.error(`Error reconnecting to account ${account.id}:`, error);
      // Update account status to disconnected if reconnection fails
      await db.updateAccount(account.id, { 
        status: 'disconnected',
        updated_at: new Date().toISOString()
      });
      this.accountStatus.set(account.id, 'disconnected');
    }
  }
}

module.exports = new WhatsAppManager();