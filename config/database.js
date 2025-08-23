const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration. Please check your .env file.');
  process.exit(1);
}

// Create optimized Supabase client with connection pooling and caching
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'wa-multi-automation'
    }
  },
  realtime: {
    // Disable realtime subscriptions if not needed
    params: {
      eventsPerSecond: 10
    }
  }
});

// Simple in-memory cache for database queries
const queryCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache TTL

// Database helper functions
const db = {
  // Account management
  async createAccount(accountData) {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .insert([accountData])
      .select();
    
    if (error) throw error;
    return data[0];
  },

  async getAccounts() {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getAccount(id) {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateAccount(id, updates) {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .update(updates)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data[0];
  },

  async deleteAccount(id) {
    const { error } = await supabase
      .from('whatsapp_accounts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  // Webhook management
  async createWebhook(webhookData) {
    try {
      const { data, error } = await supabase
        .from('webhooks')
        .insert([webhookData])
        .select();
      
      if (error) {
        console.error('Supabase error creating webhook:', error);
        throw error;
      }
      // Invalidate cache for this account's webhooks
      try {
        if (webhookData && webhookData.account_id) {
          queryCache.delete(`webhooks_${webhookData.account_id}`);
        }
      } catch (_) {}
      return data[0];
    } catch (error) {
      console.error('Error in createWebhook:', error);
      throw error;
    }
  },

  async getWebhooks(accountId) {
    // Check cache first
    const cacheKey = `webhooks_${accountId}`;
    const cachedData = queryCache.get(cacheKey);
    
    if (cachedData && cachedData.timestamp > Date.now() - CACHE_TTL) {
      return cachedData.data;
    }
    
    // If not in cache or expired, fetch from database
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Store in cache
    queryCache.set(cacheKey, {
      data: data || [],
      timestamp: Date.now()
    });
    
    return data || [];
  },

  async getWebhook(id) {
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateWebhook(id, updates) {
    const { data, error } = await supabase
      .from('webhooks')
      .update(updates)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    // Invalidate cache for this account's webhooks
    try {
      const updated = data && data[0];
      if (updated && updated.account_id) {
        queryCache.delete(`webhooks_${updated.account_id}`);
      }
    } catch (_) {}
    return data[0];
  },

  async deleteWebhook(id) {
    // Fetch webhook to get account_id for cache invalidation
    let webhookAccountId = null;
    try {
      const { data: existing } = await supabase
        .from('webhooks')
        .select('id, account_id')
        .eq('id', id)
        .single();
      webhookAccountId = existing?.account_id || null;
    } catch (_) {}

    let { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', id);

    // If delete fails due to FK constraint from message_logs.webhook_id, nullify and retry
    if (error && error.code === '23503') {
      console.warn('Webhook delete blocked by FK; nullifying message_logs.webhook_id and retrying...', { id });
      const nullify = await supabase
        .from('message_logs')
        .update({ webhook_id: null })
        .eq('webhook_id', id);
      if (nullify.error) {
        console.error('Failed to nullify message_logs.webhook_id:', nullify.error);
        throw error; // throw original delete error
      }
      // Retry delete
      const retry = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id);
      error = retry.error;
    }

    if (error) throw error;
    // Invalidate cache for this account's webhooks
    if (webhookAccountId) {
      queryCache.delete(`webhooks_${webhookAccountId}`);
    }
    return true;
  },

  // Message logging
  // Optimized message logging with batching for better performance
  async logMessage(messageData) {
    // Initialize message queue if it doesn't exist
    if (!this.messageQueue) {
      this.messageQueue = [];
      this.lastFlushTime = Date.now();
      
      // Set up periodic flush of message queue
      setInterval(() => this.flushMessageQueue(), 5000); // Flush every 5 seconds
    }
    
    // Add message to queue
    this.messageQueue.push(messageData);
    
    // If queue is large enough or enough time has passed, flush it
    if (this.messageQueue.length >= 10 || Date.now() - this.lastFlushTime > 5000) {
      await this.flushMessageQueue();
    }
    
    return messageData;
  },
  
  // Flush message queue to database
  async flushMessageQueue() {
    if (!this.messageQueue || this.messageQueue.length === 0) return;
    
    // Get messages to flush and reset queue
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    this.lastFlushTime = Date.now();
    
    try {
      // Insert messages in batch
      let { error } = await supabase
        .from('message_logs')
        .insert(messages);

      // Handle PostgREST schema cache errors for unknown columns
      if (error && error.code === 'PGRST204' && typeof error.message === 'string') {
        const unknownColMatch = error.message.match(/'([^']+)' column/);
        const unknownCol = unknownColMatch ? unknownColMatch[1] : null;
        if (unknownCol) {
          console.warn(`Retrying log insert without unknown column: ${unknownCol}`);
          const sanitized = messages.map(m => {
            const copy = { ...m };
            delete copy[unknownCol];
            return copy;
          });
          const retry = await supabase.from('message_logs').insert(sanitized);
          error = retry.error;
        }
      }

      if (error) {
        console.error('Error flushing message queue:', error);
        // Put messages back in queue if insert fails
        this.messageQueue.unshift(...messages);
      }
    } catch (error) {
      console.error('Error flushing message queue:', error);
      // Put messages back in queue if insert fails
      this.messageQueue.unshift(...messages);
    }
  },

  async getMessageLogs(accountId, limit = 100) {
    const { data, error } = await supabase
      .from('message_logs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  async getMessageStats(accountId) {
    const { data, error } = await supabase
      .from('message_logs')
      .select('direction, status')
      .eq('account_id', accountId);
    
    if (error) throw error;
    
    const stats = {
      total: data.length,
      incoming: data.filter(m => m.direction === 'incoming').length,
      outgoing: data.filter(m => m.direction === 'outgoing').length,
      success: data.filter(m => m.status === 'success').length,
      failed: data.filter(m => m.status === 'failed').length
    };
    
    return stats;
  }
};

module.exports = { supabase, db };