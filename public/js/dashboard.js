// Dashboard JavaScript
class Dashboard {
  constructor() {
    this.socket = null;
    this.currentView = 'dashboard';
    this.accounts = [];
    this.webhooks = {};
    this.messageLogs = {};
    this.init();
  }

  // Ensure page doesn't scroll when a modal is open
  updateBodyScrollLock() {
    const anyOpen = !!document.querySelector('.modal.show');
    if (anyOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }

  async init() {
    this.setupEventListeners();
    this.setupSocketConnection();
    await this.loadDashboard();
    this.startAutoRefresh();
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = e.target.closest('.nav-link').dataset.view;
        this.navigateTo(view);
      });
    });

    // Account management
    document.getElementById('createAccountBtn')?.addEventListener('click', () => {
      this.showCreateAccountModal();
    });

    document.getElementById('createAccountForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createAccount();
    });

    // Webhook management
    document.getElementById('createWebhookForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createWebhook();
    });

    // Message sending
    document.getElementById('sendMessageForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendMessage();
    });

    // Media controls (simplified)
    const mediaToggle = document.getElementById('sendMediaToggle');
    const mediaInputs = document.getElementById('mediaInputs');
    const mediaFile = document.getElementById('mediaFile');
    const mediaPreview = document.getElementById('mediaPreview');
    const optSendAsDoc = document.getElementById('optSendAsDoc');
    const optVoiceNote = document.getElementById('optVoiceNote');
    if (mediaToggle && mediaInputs) {
      mediaToggle.addEventListener('change', () => {
        mediaInputs.style.display = mediaToggle.checked ? 'block' : 'none';
        if (!mediaToggle.checked && mediaPreview) {
          mediaPreview.innerHTML = '';
          mediaPreview.style.display = 'none';
          if (mediaFile) mediaFile.value = '';
        }
      });
    }
    if (mediaFile && mediaPreview) {
      mediaFile.addEventListener('change', () => {
        const file = mediaFile.files && mediaFile.files[0];
        if (!file) {
          mediaPreview.innerHTML = '';
          mediaPreview.style.display = 'none';
          return;
        }
        this.updateMediaPreview(file, mediaPreview);
        if (file.type && file.type.startsWith('audio/') && optVoiceNote) {
          optVoiceNote.checked = true;
          // If voice note is on, sending as document should be off
          if (optSendAsDoc) optSendAsDoc.checked = false;
        }
      });
    }
    // Mutually exclusive toggles: if voice note is checked, turn off document
    optVoiceNote?.addEventListener('change', () => {
      if (optVoiceNote.checked && optSendAsDoc) optSendAsDoc.checked = false;
    });
    // If send as document is checked for audio, turn off voice note
    optSendAsDoc?.addEventListener('change', () => {
      const file = mediaFile?.files && mediaFile.files[0];
      if (optSendAsDoc.checked && file && file.type.startsWith('audio/') && optVoiceNote) {
        optVoiceNote.checked = false;
      }
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeAllModals();
      });
    });

    // Click outside modal to close
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeAllModals();
      }
    });

    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.logout();
    });
  }

  setupSocketConnection() {
    this.socket = io();
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.updateConnectionStatus(false);
    });

    this.socket.on('account_status_update', (data) => {
      this.updateAccountStatus(data);
    });

    this.socket.on('new_message', (data) => {
      this.addMessageToLog(data);
    });

    this.socket.on('webhook_delivery', (data) => {
      this.updateWebhookStatus(data);
    });
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
      statusEl.textContent = connected ? 'Connected' : 'Disconnected';
      statusEl.className = connected ? 'status-badge status-ready' : 'status-badge status-disconnected';
    }
  }

  async loadDashboard() {
    try {
      const [accounts, stats] = await Promise.all([
        this.fetchAccounts(),
        this.fetchStats()
      ]);

      this.accounts = accounts;
      this.renderDashboard(accounts, stats);
    } catch (error) {
      this.showAlert('Error loading dashboard: ' + error.message, 'error');
    }
  }

  async fetchAccounts() {
    const response = await fetch('/api/accounts');
    if (!response.ok) throw new Error('Failed to fetch accounts');
    return response.json();
  }

  async fetchStats() {
    const response = await fetch('/api/stats');
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  }

  renderDashboard(accounts, stats) {
    this.renderStats(stats);
    this.renderAccountsTable(accounts);
    this.renderRecentMessages();
  }

  renderStats(stats) {
    const statsContainer = document.getElementById('statsGrid');
    if (!statsContainer) return;

    statsContainer.innerHTML = `
      <div class="stat-card fade-in">
        <div class="stat-number">${stats.totalAccounts}</div>
        <div class="stat-label">Total Accounts</div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-number">${stats.activeAccounts}</div>
        <div class="stat-label">Active Accounts</div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-number">${stats.totalMessages}</div>
        <div class="stat-label">Total Messages</div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-number">${stats.successRate}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
    `;
  }

  renderAccountsTable(accounts) {
    const tableBody = document.getElementById('accountsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = accounts.map(account => `
      <tr class="fade-in">
        <td>
          <div>
            <div class="font-weight-600">${account.name}</div>
            <div class="text-muted">${account.description || 'No description'}</div>
            <div class="text-muted" style="font-size: 0.8em; margin-top: 2px;">
              <i class="fas fa-fingerprint"></i> ID: ${account.id}
            </div>
          </div>
        </td>
        <td>
          <span class="status-badge status-${account.status}">
            ${this.formatStatus(account.status)}
          </span>
        </td>
        <td>${account.phone_number || 'Not connected'}</td>
        <td>${this.formatDate(account.created_at)}</td>
        <td>
          <div class="btn-group">
            ${account.status === 'qr_ready' ? 
              `<button class="btn btn-sm btn-primary" onclick="dashboard.showQRCode('${account.id}')">
                <i class="fas fa-qrcode"></i> QR Code
              </button>` : ''
            }
            <button class="btn btn-sm btn-secondary" onclick="dashboard.manageWebhooks('${account.id}')">
              <i class="fas fa-link"></i> Webhooks
            </button>
            <button class="btn btn-sm btn-success" onclick="dashboard.sendMessageModal('${account.id}')">
              <i class="fas fa-paper-plane"></i> Send
            </button>
            <button class="btn btn-sm btn-danger" onclick="dashboard.deleteAccount('${account.id}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderRecentMessages() {
    const messagesContainer = document.getElementById('recentMessages');
    if (!messagesContainer) return;

    // This would be populated with recent messages from the database
    messagesContainer.innerHTML = `
      <div class="text-center text-muted">
        <i class="fas fa-comments fa-2x mb-2"></i>
        <p>No recent messages</p>
      </div>
    `;
  }

  formatStatus(status) {
    const statusMap = {
      'ready': 'Ready',
      'qr_ready': 'QR Ready',
      'initializing': 'Initializing',
      'disconnected': 'Disconnected',
      'auth_failed': 'Auth Failed'
    };
    return statusMap[status] || status;
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }

  navigateTo(view) {
    this.currentView = view;
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

    // Load view content
    this.loadView(view);
  }

  async loadView(view) {
    const contentContainer = document.getElementById('mainContent');
    if (!contentContainer) return;

    try {
      // Show loading state
      contentContainer.innerHTML = '<div class="loading">Loading...</div>';
      
      // Load view-specific data and render
      this.initializeView(view);
    } catch (error) {
      contentContainer.innerHTML = `
        <div class="alert alert-error">
          Error loading view: ${error.message}
        </div>
      `;
    }
  }

  initializeView(view) {
    switch (view) {
      case 'accounts':
        this.loadAccountsView();
        break;
      case 'webhooks':
        this.loadWebhooksView();
        break;
      case 'messages':
        this.loadMessagesView();
        break;
      case 'logs':
        this.loadLogsView();
        break;
    }
  }

  // View-specific loading functions
  async loadAccountsView() {
    try {
      const accounts = await this.fetchAccounts();
      this.renderAccountsView(accounts);
    } catch (error) {
      this.showAlert('Error loading accounts: ' + error.message, 'error');
    }
  }

  async loadWebhooksView() {
    try {
      const accounts = await this.fetchAccounts();
      const webhooks = {};
      
      for (const account of accounts) {
        try {
          const response = await fetch(`/api/accounts/${account.id}/webhooks`);
          if (response.ok) {
            webhooks[account.id] = await response.json();
          }
        } catch (error) {
          console.error(`Error fetching webhooks for account ${account.id}:`, error);
          webhooks[account.id] = [];
        }
      }
      
      this.renderWebhooksView(accounts, webhooks);
    } catch (error) {
      this.showAlert('Error loading webhooks: ' + error.message, 'error');
    }
  }

  async loadMessagesView() {
    try {
      const accounts = await this.fetchAccounts();
      const messages = {};
      
      for (const account of accounts) {
        try {
          const response = await fetch(`/api/accounts/${account.id}/logs?limit=50`);
          if (response.ok) {
            messages[account.id] = await response.json();
          }
        } catch (error) {
          console.error(`Error fetching messages for account ${account.id}:`, error);
          messages[account.id] = [];
        }
      }
      
      this.renderMessagesView(accounts, messages);
    } catch (error) {
      this.showAlert('Error loading messages: ' + error.message, 'error');
    }
  }

  async loadLogsView() {
    try {
      const accounts = await this.fetchAccounts();
      const logs = {};
      
      for (const account of accounts) {
        try {
          const response = await fetch(`/api/accounts/${account.id}/logs?limit=100`);
          if (response.ok) {
            logs[account.id] = await response.json();
          }
        } catch (error) {
          console.error(`Error fetching logs for account ${account.id}:`, error);
          logs[account.id] = [];
        }
      }
      
      this.renderLogsView(accounts, logs);
    } catch (error) {
      this.showAlert('Error loading logs: ' + error.message, 'error');
    }
  }

  // Account Management
  showCreateAccountModal() {
    const modal = document.getElementById('createAccountModal');
    const form = document.getElementById('createAccountForm');
    
    if (modal && form) {
      // Reset the form before showing the modal
      form.reset();
      modal.classList.add('show');
      console.log('Create account modal opened');
    }
  }

  async createAccount() {
    const form = document.getElementById('createAccountForm');
    const formData = new FormData(form);
    
    console.log('Creating account with data:', {
      name: formData.get('name'),
      description: formData.get('description')
    });
    
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.get('name'),
          description: formData.get('description')
        })
      });

      if (!response.ok) throw new Error('Failed to create account');
      
      const account = await response.json();
      console.log('Account created successfully:', account);
      this.showAlert('Account created successfully!', 'success');
      
      // Reset the form
      form.reset();
      console.log('Form reset');
      
      // Close the modal with a small delay to ensure proper execution
      setTimeout(() => {
        this.closeAllModals();
        console.log('Modals closed');
        
        // Also specifically close the create account modal as a fallback
        this.closeCreateAccountModal();
      }, 100);
      
      // Reload dashboard to show the new account
      await this.loadDashboard();
      console.log('Dashboard reloaded');
    } catch (error) {
      console.error('Error creating account:', error);
      this.showAlert('Error creating account: ' + error.message, 'error');
    }
  }

  async deleteAccount(accountId) {
    if (!confirm('Are you sure you want to delete this account?')) return;

    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete account');
      
      this.showAlert('Account deleted successfully!', 'success');
      this.loadDashboard();
    } catch (error) {
      this.showAlert('Error deleting account: ' + error.message, 'error');
    }
  }

  showQRCode(accountId) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account || !account.qr_code) {
      this.showAlert('QR code not available for this account', 'warning');
      return;
    }

    const modal = document.getElementById('qrModal');
    modal.querySelector('.modal-title').textContent = `Scan QR Code - ${account.name} (ID: ${account.id})`;
    const qrImage = modal.querySelector('.qr-code img');
    qrImage.src = account.qr_code;
    modal.classList.add('show');
  }

  // Webhook Management
  async manageWebhooks(accountId) {
    try {
      const response = await fetch(`/api/accounts/${accountId}/webhooks`);
      if (!response.ok) throw new Error('Failed to fetch webhooks');
      
      const webhooks = await response.json();
      this.webhooks[accountId] = webhooks;
      
      this.showWebhooksModal(accountId, webhooks);
    } catch (error) {
      this.showAlert('Error loading webhooks: ' + error.message, 'error');
    }
  }

  showWebhooksModal(accountId, webhooks) {
    const modal = document.getElementById('webhooksModal');
    const account = this.accounts.find(a => a.id === accountId);
    
    // Track which account's webhooks are being viewed
    this.currentWebhooksAccountId = accountId;

    modal.querySelector('.modal-title').textContent = `Webhooks - ${account.name} (ID: ${account.id})`;
    
    const webhooksList = modal.querySelector('.webhooks-list');
    webhooksList.innerHTML = webhooks.map(webhook => `
      <div class="webhook-item">
        <div class="webhook-info">
          <div class="webhook-url">${webhook.url}</div>
          <div class="webhook-secret">
            <strong>Secret:</strong> <code>${webhook.secret || 'No secret set'}</code>
            <button class="btn btn-xs btn-outline" onclick="navigator.clipboard.writeText('${webhook.secret || ''}')" title="Copy secret">
              📋
            </button>
          </div>
          <div class="webhook-status">
            <span class="status-badge ${webhook.is_active ? 'status-ready' : 'status-disconnected'}">
              ${webhook.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <div class="webhook-actions">
          <button class="btn btn-sm btn-secondary" onclick="dashboard.toggleWebhook('${webhook.id}')">
            ${webhook.is_active ? 'Disable' : 'Enable'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="dashboard.deleteWebhook('${webhook.id}')">
            Delete
          </button>
        </div>
      </div>
    `).join('');
    
    // Update the Add Webhook button to include the account ID
    const addWebhookBtn = modal.querySelector('button[onclick*="showCreateWebhookModal"]');
    if (addWebhookBtn) {
      addWebhookBtn.onclick = () => this.showCreateWebhookModal(accountId);
    }
    
    modal.classList.add('show');
  }

  showCreateWebhookModal(accountId) {
    const modal = document.getElementById('createWebhookModal');
    const form = document.getElementById('createWebhookForm');
    
    // Add account_id to the form
    let accountIdInput = form.querySelector('input[name="account_id"]');
    if (!accountIdInput) {
      accountIdInput = document.createElement('input');
      accountIdInput.type = 'hidden';
      accountIdInput.name = 'account_id';
      form.appendChild(accountIdInput);
    }
    accountIdInput.value = accountId;
    
    modal.classList.add('show');
  }

  async createWebhook() {
    const form = document.getElementById('createWebhookForm');
    const formData = new FormData(form);
    
    const webhookData = {
      account_id: formData.get('account_id'),
      url: formData.get('url'),
      secret: formData.get('secret'),
      is_active: formData.get('is_active') === 'on'
    };
    
    console.log('Creating webhook with data:', webhookData);
    
    try {
      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create webhook');
      }
      
      const result = await response.json();
      console.log('Webhook created successfully:', result);
      
      this.showAlert('Webhook created successfully!', 'success');
      this.closeAllModals();
      
      // Refresh the webhooks list
      if (webhookData.account_id) {
        this.manageWebhooks(webhookData.account_id);
      }
    } catch (error) {
      console.error('Error creating webhook:', error);
      this.showAlert('Error creating webhook: ' + error.message, 'error');
    }
  }

  async toggleWebhook(webhookId) {
    try {
      const response = await fetch(`/api/webhooks/${webhookId}/toggle`, {
        method: 'PATCH'
      });

      if (!response.ok) throw new Error('Failed to toggle webhook');
      
      this.showAlert('Webhook updated successfully!', 'success');
    } catch (error) {
      this.showAlert('Error updating webhook: ' + error.message, 'error');
    }
  }

  async deleteWebhook(webhookId) {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const response = await fetch(`/api/webhooks/${webhookId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete webhook');
      
      this.showAlert('Webhook deleted successfully!', 'success');
      // Refresh the webhooks list if we know which account modal is open
      if (this.currentWebhooksAccountId) {
        this.manageWebhooks(this.currentWebhooksAccountId);
      }
    } catch (error) {
      this.showAlert('Error deleting webhook: ' + error.message, 'error');
    }
  }

  // Message Sending
  sendMessageModal(accountId) {
    const modal = document.getElementById('sendMessageModal');
    const account = this.accounts.find(a => a.id === accountId);
    
    if (!account) {
      this.showAlert('Account not found', 'error');
      return;
    }
    
    // Check if account is ready to send messages
    if (account.status !== 'ready') {
      this.showAlert(`Cannot send messages. Account status: ${this.formatStatus(account.status)}`, 'warning');
      return;
    }
    
    modal.querySelector('.modal-title').textContent = `Send Message - ${account.name} (ID: ${account.id})`;
    modal.querySelector('#messageAccountId').value = accountId;
    // Reset media controls each time modal opens (simplified)
    const mediaToggle = document.getElementById('sendMediaToggle');
    const mediaInputs = document.getElementById('mediaInputs');
    const mediaFile = document.getElementById('mediaFile');
    const mediaCaption = document.getElementById('mediaCaption');
    const mediaPreview = document.getElementById('mediaPreview');
    const optSendAsDoc = document.getElementById('optSendAsDoc');
    const optVoiceNote = document.getElementById('optVoiceNote');
    if (mediaToggle && mediaInputs) {
      mediaToggle.checked = false;
      mediaInputs.style.display = 'none';
    }
    if (mediaFile) mediaFile.value = '';
    if (mediaCaption) mediaCaption.value = '';
    if (mediaPreview) { mediaPreview.innerHTML = ''; mediaPreview.style.display = 'none'; }
    if (optSendAsDoc) optSendAsDoc.checked = false;
    if (optVoiceNote) optVoiceNote.checked = false;
    modal.classList.add('show');
    this.updateBodyScrollLock();
    console.log('Send message modal opened for account:', account);
  }

  async sendMessage() {
    const form = document.getElementById('sendMessageForm');
    const formData = new FormData(form);
    
    const messageData = {
      account_id: formData.get('account_id'),
      number: formData.get('number'),
      message: formData.get('message')
    };
    
    console.log('Sending message with data:', messageData);
    
    // Validate form data
    if (!messageData.account_id || !messageData.number || !messageData.message) {
      this.showAlert('Please fill in all fields: Account ID, Phone Number, and Message', 'error');
      return;
    }
    
    // Determine if media should be sent (single-file only)
    const mediaToggle = document.getElementById('sendMediaToggle');
    const mediaFileInput = document.getElementById('mediaFile');
    const mediaCaptionInput = document.getElementById('mediaCaption');
    const optSendAsDoc = document.getElementById('optSendAsDoc');
    const optVoiceNote = document.getElementById('optVoiceNote');
    const hasFile = mediaFileInput?.files && mediaFileInput.files.length > 0;
    const sendAsMedia = mediaToggle?.checked && hasFile;

    try {
      let response;
      if (sendAsMedia) {
        const file = mediaFileInput.files[0];
        const caption = mediaCaptionInput?.value || messageData.message || '';
        const options = {
          // If audio and voice note is selected, do not send as document
          sendAudioAsVoice: !!optVoiceNote?.checked,
          sendMediaAsDocument: !!optSendAsDoc?.checked && !(file?.type?.startsWith('audio/') && optVoiceNote?.checked)
        };
        const base64 = await this.fileToBase64(file);
        const media = { data: base64, mimetype: file.type, filename: file.name };
        const payload = { account_id: messageData.account_id, number: messageData.number, media, caption, options };
        console.log('Making API request to /api/send-media (file)...');
        response = await fetch('/api/send-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        console.log('Making API request to /api/send...');
        response = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageData)
        });
      }

      console.log('Response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to send message`);
      }
      const result = await response.json();
      console.log('Send successful:', result);
      this.showAlert('Message sent successfully!', 'success');
      this.closeAllModals();
      form.reset();
      await this.loadDashboard();
    } catch (error) {
      console.error('Error sending message:', error);
      this.showAlert('Error sending message: ' + error.message, 'error');
    }
  }

  // Convert File to base64 data string (no data URL prefix)
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        // Strip prefix if present (data:mime;base64,)
        const base64 = typeof result === 'string' ? result.replace(/^data:[^;]+;base64,/i, '') : '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Update preview for selected media file
  updateMediaPreview(file, containerEl) {
    try {
      const url = URL.createObjectURL(file);
      let html = '';
      if (file.type.startsWith('image/')) {
        html = `<img src="${url}" alt="preview" style="max-width: 100%; max-height: 160px; border-radius: 8px;">`;
      } else if (file.type.startsWith('video/')) {
        html = `<video src="${url}" controls style="max-width: 100%; max-height: 180px; border-radius: 8px;"></video>`;
      } else if (file.type.startsWith('audio/')) {
        html = `<audio src="${url}" controls></audio>`;
      } else {
        html = `<div class="text-muted"><i class="fas fa-file"></i> ${file.name} (${Math.round(file.size/1024)} KB)</div>`;
      }
      containerEl.innerHTML = html;
      containerEl.style.display = 'block';
    } catch (e) {
      console.warn('Failed to render media preview:', e);
      containerEl.innerHTML = '';
      containerEl.style.display = 'none';
    }
  }

  // Test function for debugging message sending
  async sendMessageTest(accountId, number, message) {
    const messageData = { account_id: accountId, number, message };
    
    console.log('Testing message sending with data:', messageData);
    
    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData)
      });

      console.log('Test response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Test API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to send message`);
      }
      
      const result = await response.json();
      console.log('Test message sent successfully:', result);
      this.showAlert('Test message sent successfully!', 'success');
    } catch (error) {
      console.error('Test error sending message:', error);
      this.showAlert('Test error sending message: ' + error.message, 'error');
    }
  }

  // Utility Methods
  closeAllModals() {
    console.log('Closing all modals...');
    document.querySelectorAll('.modal').forEach(modal => {
      if (modal.classList.contains('show')) {
        modal.classList.remove('show');
        console.log(`Closed modal: ${modal.id}`);
      }
    });
    this.updateBodyScrollLock();
  }

  closeCreateAccountModal() {
    const modal = document.getElementById('createAccountModal');
    const form = document.getElementById('createAccountForm');
    
    if (modal) {
      modal.classList.remove('show');
      console.log('Create account modal closed');
    }
    this.updateBodyScrollLock();
    
    if (form) {
      form.reset();
      console.log('Create account form reset');
    }
  }

  showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} fade-in`;
    alert.innerHTML = `
      <span>${message}</span>
      <button class="alert-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    alertContainer.appendChild(alert);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (alert.parentElement) {
        alert.remove();
      }
    }, 5000);
  }

  startAutoRefresh() {
    // Refresh dashboard every 30 seconds
    setInterval(() => {
      if (this.currentView === 'dashboard') {
        this.loadDashboard();
      }
    }, 30000);
  }

  async logout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      });

      if (response.ok) {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  updateAccountStatus(data) {
    const account = this.accounts.find(a => a.id === data.accountId);
    if (account) {
      account.status = data.status;
      this.renderAccountsTable(this.accounts);
    }
  }

  addMessageToLog(message) {
    // Add message to recent messages list
    const messagesContainer = document.getElementById('recentMessages');
    if (messagesContainer) {
      const messageEl = document.createElement('div');
      messageEl.className = 'message-item fade-in';
      messageEl.innerHTML = `
        <div class="message-header">
          <span class="message-direction">${message.direction}</span>
          <span class="message-time">${this.formatDate(message.created_at)}</span>
        </div>
        <div class="message-content">${message.message}</div>
      `;
      
      messagesContainer.insertBefore(messageEl, messagesContainer.firstChild);
      
      // Keep only last 10 messages
      const messages = messagesContainer.querySelectorAll('.message-item');
      if (messages.length > 10) {
        messages[messages.length - 1].remove();
      }
    }
  }

  updateWebhookStatus(data) {
    // Update webhook delivery status in real-time
    console.log('Webhook delivery:', data);
  }

  // View rendering functions
  renderAccountsView(accounts) {
    const contentContainer = document.getElementById('mainContent');
    if (!contentContainer) return;

    contentContainer.innerHTML = `
      <div class="content-header">
        <h2>Accounts Management</h2>
        <p>Manage your WhatsApp automation accounts</p>
      </div>
      
      <div class="content-actions">
        <button class="btn btn-primary" onclick="dashboard.showCreateAccountModal()">
          <i class="fas fa-plus"></i> Create Account
        </button>
      </div>
      
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Status</th>
              <th>Phone Number</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(account => `
              <tr>
                <td>
                  <div>
                    <div class="font-weight-600">${account.name}</div>
                    <div class="text-muted">${account.description || 'No description'}</div>
                    <div class="text-muted" style="font-size: 0.8em; margin-top: 2px;">
                      <i class="fas fa-fingerprint"></i> ID: ${account.id}
                    </div>
                  </div>
                </td>
                <td>
                  <span class="status-badge status-${account.status}">
                    ${this.formatStatus(account.status)}
                  </span>
                </td>
                <td>${account.phone_number || 'Not connected'}</td>
                <td>${this.formatDate(account.created_at)}</td>
                <td>
                  <div class="btn-group">
                    ${account.status === 'qr_ready' ? 
                      `<button class="btn btn-sm btn-primary" onclick="dashboard.showQRCode('${account.id}')">
                        <i class="fas fa-qrcode"></i> QR Code
                      </button>` : ''
                    }
                    <button class="btn btn-sm btn-secondary" onclick="dashboard.manageWebhooks('${account.id}')">
                      <i class="fas fa-link"></i> Webhooks
                    </button>
                    <button class="btn btn-sm btn-success" onclick="dashboard.sendMessageModal('${account.id}')">
                      <i class="fas fa-paper-plane"></i> Send
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="dashboard.deleteAccount('${account.id}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderWebhooksView(accounts, webhooks) {
    const contentContainer = document.getElementById('mainContent');
    if (!contentContainer) return;

    contentContainer.innerHTML = `
      <div class="content-header">
        <h2>Webhooks Management</h2>
        <p>Manage webhooks for all accounts</p>
      </div>
      
      <div class="webhooks-grid">
        ${accounts.map(account => `
          <div class="webhook-account-card">
            <div class="card-header">
              <h3>${account.name}</h3>
              <div class="text-muted" style="font-size: 0.8em; margin-top: 2px;">
                <i class="fas fa-fingerprint"></i> ID: ${account.id}
              </div>
              <span class="status-badge status-${account.status}">
                ${this.formatStatus(account.status)}
              </span>
            </div>
            
            <div class="webhook-list">
              ${(webhooks[account.id] || []).map(webhook => `
                <div class="webhook-item">
                  <div class="webhook-info">
                    <div class="webhook-url">${webhook.url}</div>
                    <div class="webhook-status">
                      <span class="status-badge ${webhook.is_active ? 'status-ready' : 'status-disconnected'}">
                        ${webhook.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div class="webhook-actions">
                    <button class="btn btn-sm btn-secondary" onclick="dashboard.toggleWebhook('${webhook.id}')">
                      ${webhook.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="dashboard.deleteWebhook('${webhook.id}')">
                      Delete
                    </button>
                  </div>
                </div>
              `).join('')}
              
              ${(webhooks[account.id] || []).length === 0 ? 
                '<div class="text-center text-muted">No webhooks configured</div>' : ''
              }
            </div>
            
            <div class="card-actions">
              <button class="btn btn-primary" onclick="dashboard.showCreateWebhookModal('${account.id}')">
                <i class="fas fa-plus"></i> Add Webhook
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderMessagesView(accounts, messages) {
    const contentContainer = document.getElementById('mainContent');
    if (!contentContainer) return;

    contentContainer.innerHTML = `
      <div class="content-header">
        <h2>Recent Messages</h2>
        <p>View recent messages from all accounts</p>
      </div>
      
      <div class="messages-grid">
        ${accounts.map(account => `
          <div class="message-account-card">
            <div class="card-header">
              <h3>${account.name}</h3>
              <div class="text-muted" style="font-size: 0.8em; margin-top: 2px;">
                <i class="fas fa-fingerprint"></i> ID: ${account.id}
              </div>
              <span class="status-badge status-${account.status}">
                ${this.formatStatus(account.status)}
              </span>
            </div>
            
            <div class="message-list">
              ${(messages[account.id] || []).slice(0, 10).map(message => `
                <div class="message-item">
                  <div class="message-header">
                    <span class="message-direction ${message.direction}">${message.direction}</span>
                    <span class="message-time">${this.formatDate(message.created_at)}</span>
                  </div>
                  <div class="message-content">${message.message || 'No content'}</div>
                  <div class="message-status">
                    <span class="status-badge ${message.status === 'success' ? 'status-ready' : 'status-disconnected'}">
                      ${message.status}
                    </span>
                  </div>
                </div>
              `).join('')}
              
              ${(messages[account.id] || []).length === 0 ? 
                '<div class="text-center text-muted">No messages yet</div>' : ''
              }
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderLogsView(accounts, logs) {
    const contentContainer = document.getElementById('mainContent');
    if (!contentContainer) return;

    contentContainer.innerHTML = `
      <div class="content-header">
        <h2>System Logs</h2>
        <p>View detailed logs for all accounts</p>
      </div>
      
      <div class="logs-grid">
        ${accounts.map(account => `
          <div class="log-account-card">
            <div class="card-header">
              <h3>${account.name}</h3>
              <div class="text-muted" style="font-size: 0.8em; margin-top: 2px;">
                <i class="fas fa-fingerprint"></i> ID: ${account.id}
              </div>
              <span class="status-badge status-${account.status}">
                ${this.formatStatus(account.status)}
              </span>
            </div>
            
            <div class="log-list">
              ${(logs[account.id] || []).map(log => `
                <div class="log-item">
                  <div class="log-header">
                    <span class="log-direction ${log.direction}">${log.direction}</span>
                    <span class="log-time">${this.formatDate(log.created_at)}</span>
                  </div>
                  <div class="log-content">${log.message || 'No content'}</div>
                  <div class="log-status">
                    <span class="status-badge ${log.status === 'success' ? 'status-ready' : 'status-disconnected'}">
                      ${log.status}
                    </span>
                  </div>
                  ${log.error_message ? `
                    <div class="log-error">
                      <strong>Error:</strong> ${log.error_message}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
              
              ${(logs[account.id] || []).length === 0 ? 
                '<div class="text-center text-muted">No logs available</div>' : ''
              }
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});

// Global utility functions
window.showQRCode = (accountId) => window.dashboard.showQRCode(accountId);
window.manageWebhooks = (accountId) => window.dashboard.manageWebhooks(accountId);
window.sendMessageModal = (accountId) => window.dashboard.sendMessageModal(accountId);
window.deleteAccount = (accountId) => window.dashboard.deleteAccount(accountId);
window.toggleWebhook = (webhookId) => window.dashboard.toggleWebhook(webhookId);
window.deleteWebhook = (webhookId) => window.dashboard.deleteWebhook(webhookId);

// Debug function to manually close modals
window.closeModals = () => {
  if (window.dashboard) {
    window.dashboard.closeAllModals();
    console.log('Modals closed manually');
  }
};

// Debug function to test message sending
window.testSendMessage = (accountId, number, message) => {
  if (window.dashboard) {
    console.log('Testing message sending...');
    window.dashboard.sendMessageTest(accountId, number, message);
  }
}; 