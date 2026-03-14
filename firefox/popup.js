class PopupManager {
  constructor() {
    this.rules = [];
    this.groups = [];
    this.syncConfig = null;

    this.initializeElements();
    this.bindEvents();
    this.init();
  }

  initializeElements() {
    this.elements = {
      patternEl: document.getElementById('pattern'),
      targetEl: document.getElementById('target'),
      groupSelectEl: document.getElementById('groupSelect'),
      form: document.getElementById('addForm'),
      settingsLink: document.getElementById('settingsLink'),
      syncStatus: document.getElementById('syncStatus')
    };
  }

  bindEvents() {
    this.bindFormEvents();
    this.bindNavigationEvents();
    this.bindSyncEvents();
  }

  bindFormEvents() {
    this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  bindNavigationEvents() {
    this.elements.settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      browser.runtime.openOptionsPage();
    });
  }

  bindSyncEvents() {
    if (typeof syncManager !== 'undefined') {
      syncManager.addStatusListener((status, message) => {
        this.updateSyncStatus(status, message);
      });
    }
  }

  async init() {
    try {
      await this.downloadFromServer();
      await this.loadData();
      this.updateGroupSelect();
      this.updateSyncStatusVisibility();
    } catch (error) {
      console.error('Initialization failed:', error);
      this.updateSyncStatus(SyncStatus.ERROR, 'Init error');
    }
  }

  async loadData() {
    const data = await browser.storage.sync.get([STORAGE_KEY, GROUPS_KEY, CONFIG_KEY]);
    this.rules = syncManager.validateRules(data[STORAGE_KEY] || []);
    this.groups = syncManager.validateGroups(data[GROUPS_KEY] || []);
    this.syncConfig = data[CONFIG_KEY] || null;

    this.groups = syncManager.ensureDefaultGroup(this.groups);
  }

  async downloadFromServer() {
    if (typeof syncManager === 'undefined') {
      console.warn('SyncManager not available');
      return;
    }

    try {
      await syncManager.downloadFromServer();
    } catch (error) {
      console.error('Download failed:', error);
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (this.rules.length >= MAX_RULES) {
      this.updateSyncStatus(SyncStatus.ERROR, `Max ${MAX_RULES} rules`);
      return;
    }

    const from = this.elements.patternEl.value.trim();
    const to = this.elements.targetEl.value.trim();

    if (!from || !to) {
      this.updateSyncStatus(SyncStatus.ERROR, 'Please fill in both fields');
      return;
    }

    let groupId = this.elements.groupSelectEl.value;
    if (!groupId) {
      groupId = syncManager.determineGroupForRule(from, to, this.groups);
    }

    this.rules.push({
      id: Date.now(),
      from: from,
      to: to,
      enabled: true,
      groupId: groupId
    });

    await this.save();
    this.clearForm();
    this.updateSyncStatus(SyncStatus.UPLOADED, 'Rule added');
  }

  clearForm() {
    this.elements.form.reset();
  }

  updateGroupSelect() {
    const options = this.groups.map(g => 
      `<option value="${g.id}">${this.escapeHtml(g.name)}</option>`
    ).join('');
    
    this.elements.groupSelectEl.innerHTML = '<option value="">Auto Group</option>' + options;
  }

  async save() {
    await browser.storage.sync.set({ 
      [STORAGE_KEY]: this.rules,
      [GROUPS_KEY]: this.groups
    });
    await this.uploadToServer();
  }

  async uploadToServer() {
    if (typeof syncManager === 'undefined') {
      return;
    }

    try {
      await syncManager.uploadToServer(this.rules, this.groups);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }

  updateSyncStatus(status, message) {
    if (!this.elements.syncStatus) return;

    const statusText = message || this.getStatusText(status);
    this.elements.syncStatus.textContent = statusText;
    
    this.elements.syncStatus.className = 'sync-status';
    
    switch (status) {
      case SyncStatus.DOWNLOADING:
      case SyncStatus.UPLOADING:
        this.elements.syncStatus.classList.add('syncing');
        break;
      case SyncStatus.DOWNLOADED:
      case SyncStatus.UPLOADED:
        this.elements.syncStatus.classList.add('success');
        break;
      case SyncStatus.ERROR:
        this.elements.syncStatus.classList.add('error');
        break;
      default:
        this.elements.syncStatus.classList.add('idle');
    }
  }

  updateSyncStatusVisibility() {
    if (this.elements.syncStatus) {
      const syncEnabled = syncManager.isSyncEnabled(this.syncConfig);
      this.elements.syncStatus.style.display = syncEnabled ? 'block' : 'none';
    }
  }

  getStatusText(status) {
    switch (status) {
      case SyncStatus.DOWNLOADING:
        return 'Downloading...';
      case SyncStatus.DOWNLOADED:
        return 'Downloaded';
      case SyncStatus.UPLOADING:
        return 'Uploading...';
      case SyncStatus.UPLOADED:
        return 'Uploaded';
      case SyncStatus.ERROR:
        return 'Error';
      case SyncStatus.IDLE:
      default:
        return 'Ready';
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const popupManager = new PopupManager();
