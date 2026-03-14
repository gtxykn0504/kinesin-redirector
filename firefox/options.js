class OptionsManager {
  constructor() {
    this.rules = [];
    this.groups = [];
    this.syncConfig = null;
    this.editingGroupId = null;
    this.editingRuleId = null;
    this.draggedRule = null;

    this.initializeElements();
    this.bindEvents();
    this.init();
  }

  initializeElements() {
    this.elements = {
      navItems: document.querySelectorAll('.nav-item'),
      pages: document.querySelectorAll('.page'),
      pageTitle: document.getElementById('pageTitle'),
      groupsContainer: document.getElementById('groupsContainer'),
      statusDiv: document.getElementById('status'),
      syncIndicator: document.getElementById('syncStatus'),
      newFromInput: document.getElementById('newFrom'),
      newToInput: document.getElementById('newTo'),
      newGroupSelect: document.getElementById('newGroup'),
      addRuleBtn: document.getElementById('addRuleBtn'),
      groupModal: document.getElementById('groupModal'),
      groupModalTitle: document.getElementById('groupModalTitle'),
      groupNameInput: document.getElementById('groupName'),
      autoRulesList: document.getElementById('autoRulesList'),
      addAutoRuleBtn: document.getElementById('addAutoRuleBtn'),
      cancelGroupBtn: document.getElementById('cancelGroupBtn'),
      saveGroupBtn: document.getElementById('saveGroupBtn'),
      editRuleModal: document.getElementById('editRuleModal'),
      editFromInput: document.getElementById('editFrom'),
      editToInput: document.getElementById('editTo'),
      editGroupSelect: document.getElementById('editGroup'),
      cancelEditRuleBtn: document.getElementById('cancelEditRuleBtn'),
      saveEditRuleBtn: document.getElementById('saveEditRuleBtn'),
      enableSyncCheck: document.getElementById('enableSync'),
      serverUrlInput: document.getElementById('serverUrl'),
      apiKeyInput: document.getElementById('apiKey'),
      autoDownloadCheck: document.getElementById('autoDownload'),
      saveSettingsBtn: document.getElementById('saveSettingsBtn'),
      downloadBtn: document.getElementById('downloadBtn')
    };
  }

  bindEvents() {
    this.bindNavigationEvents();
    this.bindFormEvents();
    this.bindModalEvents();
    this.bindSyncEvents();
  }

  bindNavigationEvents() {
    this.elements.navItems.forEach(item => {
      item.addEventListener('click', () => this.handleNavClick(item));
      item.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleNavClick(item);
        }
      });
    });
  }

  bindFormEvents() {
    this.elements.addRuleBtn.addEventListener('click', () => this.addRule());
    this.elements.newFromInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addRule();
    });
    this.elements.newToInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addRule();
    });

    const groupForm = document.getElementById('groupForm');
    if (groupForm) {
      groupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveGroup();
      });
    }

    const editRuleForm = document.getElementById('editRuleForm');
    if (editRuleForm) {
      editRuleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEditRule();
      });
    }
  }

  bindModalEvents() {
    this.elements.cancelGroupBtn.addEventListener('click', () => this.closeGroupModal());
    this.elements.saveGroupBtn.addEventListener('click', () => this.saveGroup());
    this.elements.addAutoRuleBtn.addEventListener('click', () => this.addAutoRuleField());
    this.elements.cancelEditRuleBtn.addEventListener('click', () => this.closeEditRuleModal());
    this.elements.saveEditRuleBtn.addEventListener('click', () => this.saveEditRule());
  }

  bindSyncEvents() {
    this.elements.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    this.elements.downloadBtn.addEventListener('click', () => this.manualDownload());

    if (typeof syncManager !== 'undefined') {
      syncManager.addStatusListener((status, message) => {
        this.updateSyncIndicator(status, message);
      });
    }
  }

  async init() {
    try {
      await this.downloadFromServer();
      await this.loadData();
      this.applyAutoGrouping();
      this.render();
      this.loadSyncSettings();
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showStatus('Failed to load data', 'error');
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
      const result = await syncManager.downloadFromServer();
      if (result) {
        this.rules = result.rules;
        this.groups = result.groups;
        this.render();
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  }

  applyAutoGrouping() {
    this.rules.forEach(rule => {
      if (rule.groupId && rule.groupId !== UNGROUPED_ID) return;
      
      for (const group of this.groups) {
        if (group.id === UNGROUPED_ID || !group.autoRules) continue;
        
        for (const autoRule of group.autoRules) {
          if (syncManager.matchesAutoRule(rule, autoRule)) {
            rule.groupId = group.id;
            break;
          }
        }
        if (rule.groupId && rule.groupId !== UNGROUPED_ID) break;
      }
      
      if (!rule.groupId) {
        rule.groupId = UNGROUPED_ID;
      }
    });
  }

  render() {
    this.renderGroups();
    this.updateGroupSelects();
    this.bindGroupButtons();
  }

  renderGroups() {
    this.elements.groupsContainer.innerHTML = '';

    this.groups.forEach(group => {
      const groupRules = this.rules.filter(r => r.groupId === group.id);
      const section = this.createGroupSection(group, groupRules);
      this.elements.groupsContainer.appendChild(section);
    });
  }

  createGroupSection(group, groupRules) {
    const section = document.createElement('div');
    section.className = 'group-section';
    section.dataset.groupId = group.id;

    const header = this.createGroupHeader(group, groupRules);
    section.appendChild(header);

    const rulesList = this.createRulesList(group, groupRules);
    section.appendChild(rulesList);

    return section;
  }

  createGroupHeader(group, groupRules) {
    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = `
      <div class="group-title">
        <span>${this.escapeHtml(group.name)}</span>
        <span class="group-count">${groupRules.length}</span>
      </div>
      <div class="group-actions">
        <button class="edit-group-btn" title="Edit Group">✏️</button>
        ${group.id !== UNGROUPED_ID ? '<button class="delete-group-btn" title="Delete Group">🗑️</button>' : ''}
      </div>
    `;

    header.querySelector('.edit-group-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEditGroupModal(group.id);
    });

    if (group.id !== UNGROUPED_ID) {
      header.querySelector('.delete-group-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteGroup(group.id);
      });
    }

    return header;
  }

  createRulesList(group, groupRules) {
    const rulesList = document.createElement('div');
    rulesList.className = 'rules-list';
    rulesList.dataset.groupId = group.id;

    if (groupRules.length === 0) {
      rulesList.innerHTML = '<div class="empty-state"><div class="empty-state-text">No rules in this group</div></div>';
    } else {
      groupRules.forEach(rule => {
        const card = this.createRuleCard(rule);
        rulesList.appendChild(card);
      });
    }

    this.setupDropZone(rulesList, group.id);
    return rulesList;
  }

  createRuleCard(rule) {
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.draggable = true;
    card.dataset.ruleId = rule.id;

    card.innerHTML = `
      <input type="checkbox" class="rule-checkbox" ${rule.enabled ? 'checked' : ''}>
      <div class="rule-content">
        <div class="rule-from">${this.escapeHtml(rule.from)}</div>
        <div class="rule-to"><span class="rule-arrow">→</span> ${this.escapeHtml(rule.to)}</div>
      </div>
      <div class="rule-actions">
        <button class="edit-btn" title="Edit">✏️</button>
        <button class="delete-btn" title="Delete">×</button>
      </div>
    `;

    this.bindRuleCardEvents(card, rule);
    return card;
  }

  bindRuleCardEvents(card, rule) {
    card.querySelector('.rule-checkbox').addEventListener('change', async (e) => {
      rule.enabled = e.target.checked;
      await this.save();
    });

    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEditRuleModal(rule.id);
    });

    card.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      this.rules = this.rules.filter(r => r.id !== rule.id);
      await this.save();
    });

    card.addEventListener('dragstart', (e) => {
      this.draggedRule = rule;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      this.draggedRule = null;
      document.querySelectorAll('.rule-card.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
  }

  setupDropZone(element, groupId) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', (e) => {
      if (!element.contains(e.relatedTarget)) {
        element.classList.remove('drag-over');
      }
    });

    element.addEventListener('drop', async (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');

      if (this.draggedRule && this.draggedRule.groupId !== groupId) {
        this.draggedRule.groupId = groupId;
        await this.save();
      }
    });
  }

  bindGroupButtons() {
    const addGroupBtn = document.querySelector('.add-group-btn');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => this.openAddGroupModal());
    }
  }

  updateGroupSelects() {
    const options = this.groups.map(g => 
      `<option value="${g.id}">${this.escapeHtml(g.name)}</option>`
    ).join('');
    
    this.elements.newGroupSelect.innerHTML = '<option value="">Select Group</option>' + options;
    this.elements.editGroupSelect.innerHTML = options;
  }

  async addRule() {
    const from = this.elements.newFromInput.value.trim();
    const to = this.elements.newToInput.value.trim();
    let groupId = this.elements.newGroupSelect.value;

    if (!from || !to) {
      this.showStatus('Please fill in both fields', 'error');
      return;
    }

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

    this.clearNewRuleForm();
    await this.save();
    this.showStatus('Rule added', 'success');
  }

  clearNewRuleForm() {
    this.elements.newFromInput.value = '';
    this.elements.newToInput.value = '';
    this.elements.newGroupSelect.value = '';
  }

  openAddGroupModal() {
    this.editingGroupId = null;
    this.elements.groupModalTitle.textContent = 'Add Group';
    this.elements.groupNameInput.value = '';
    this.elements.autoRulesList.innerHTML = '';
    this.elements.groupModal.classList.add('active');
  }

  openEditGroupModal(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    this.editingGroupId = groupId;
    this.elements.groupModalTitle.textContent = 'Edit Group';
    this.elements.groupNameInput.value = group.name;
    
    this.elements.autoRulesList.innerHTML = '';
    if (group.autoRules) {
      group.autoRules.forEach(rule => this.addAutoRuleField(rule));
    }

    this.elements.groupModal.classList.add('active');
  }

  closeGroupModal() {
    this.elements.groupModal.classList.remove('active');
    this.editingGroupId = null;
  }

  addAutoRuleField(existingRule = null) {
    const item = document.createElement('div');
    item.className = 'auto-rule-item';
    
    const field = existingRule ? existingRule.field : 'from';
    const keyword = existingRule ? existingRule.keyword : '';
    
    item.innerHTML = `
      <select class="auto-rule-field">
        ${AUTO_RULE_FIELDS.map(f => 
          `<option value="${f}" ${field === f ? 'selected' : ''}>${f.charAt(0).toUpperCase() + f.slice(1)} URL</option>`
        ).join('')}
      </select>
      <input type="text" class="auto-rule-keyword" placeholder="Contains..." value="${this.escapeHtml(keyword)}">
      <button class="remove-auto-rule-btn">×</button>
    `;

    item.querySelector('.remove-auto-rule-btn').addEventListener('click', () => {
      item.remove();
    });

    this.elements.autoRulesList.appendChild(item);
  }

  async saveGroup() {
    const name = this.elements.groupNameInput.value.trim();
    if (!name) {
      this.showStatus('Please enter a group name', 'error');
      return;
    }

    const autoRules = this.collectAutoRules();

    if (this.editingGroupId) {
      this.updateExistingGroup(name, autoRules);
    } else {
      this.createNewGroup(name, autoRules);
    }

    this.closeGroupModal();
    this.applyAutoGrouping();
    await this.save();
    this.showStatus('Group saved', 'success');
  }

  collectAutoRules() {
    const autoRules = [];
    this.elements.autoRulesList.querySelectorAll('.auto-rule-item').forEach(item => {
      const field = item.querySelector('.auto-rule-field').value;
      const keyword = item.querySelector('.auto-rule-keyword').value.trim();
      if (keyword) {
        autoRules.push({ field, keyword });
      }
    });
    return autoRules;
  }

  updateExistingGroup(name, autoRules) {
    const group = this.groups.find(g => g.id === this.editingGroupId);
    if (group) {
      group.name = name;
      group.autoRules = autoRules;
    }
  }

  createNewGroup(name, autoRules) {
    this.groups.push({
      id: 'group_' + Date.now(),
      name: name,
      autoRules: autoRules
    });
  }

  async deleteGroup(groupId) {
    if (groupId === UNGROUPED_ID) return;

    const groupRules = this.rules.filter(r => r.groupId === groupId);
    groupRules.forEach(r => r.groupId = UNGROUPED_ID);

    this.groups = this.groups.filter(g => g.id !== groupId);
    await this.save();
    this.showStatus('Group deleted', 'success');
  }

  openEditRuleModal(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return;

    this.editingRuleId = ruleId;
    this.elements.editFromInput.value = rule.from;
    this.elements.editToInput.value = rule.to;
    this.elements.editGroupSelect.value = rule.groupId || UNGROUPED_ID;
    this.elements.editRuleModal.classList.add('active');
  }

  closeEditRuleModal() {
    this.elements.editRuleModal.classList.remove('active');
    this.editingRuleId = null;
  }

  async saveEditRule() {
    const rule = this.rules.find(r => r.id === this.editingRuleId);
    if (!rule) return;

    const from = this.elements.editFromInput.value.trim();
    const to = this.elements.editToInput.value.trim();
    const groupId = this.elements.editGroupSelect.value;

    if (!from || !to) {
      this.showStatus('Please fill in both fields', 'error');
      return;
    }

    rule.from = from;
    rule.to = to;
    rule.groupId = groupId || UNGROUPED_ID;

    this.closeEditRuleModal();
    await this.save();
    this.showStatus('Rule updated', 'success');
  }

  async save() {
    await browser.storage.sync.set({ 
      [STORAGE_KEY]: this.rules,
      [GROUPS_KEY]: this.groups
    });
    this.render();
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

  loadSyncSettings() {
    if (this.syncConfig) {
      this.elements.enableSyncCheck.checked = this.syncConfig.enabled || false;
      this.elements.serverUrlInput.value = this.syncConfig.serverUrl || '';
      this.elements.apiKeyInput.value = this.syncConfig.apiKey || '';
      this.elements.autoDownloadCheck.checked = this.syncConfig.autoDownload || false;
    }
    this.updateSyncStatusVisibility();
  }

  async saveSettings() {
    this.syncConfig = {
      enabled: this.elements.enableSyncCheck.checked,
      serverUrl: this.elements.serverUrlInput.value.trim(),
      apiKey: this.elements.apiKeyInput.value.trim(),
      autoDownload: this.elements.autoDownloadCheck.checked
    };
    await browser.storage.sync.set({ [CONFIG_KEY]: this.syncConfig });
    this.updateSyncStatusVisibility();
    this.showStatus('Settings saved', 'success');
  }

  async manualDownload() {
    if (!this.syncConfig?.enabled || !this.syncConfig.serverUrl || !this.syncConfig.apiKey) {
      this.showStatus('Synchronization is disabled or incomplete', 'error');
      return;
    }
    
    try {
      await this.downloadFromServer();
      this.showStatus('Download successful', 'success');
    } catch (error) {
      this.showStatus('Download failed: ' + error.message, 'error');
    }
  }

  handleNavClick(item) {
    this.elements.navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    const pageName = item.dataset.page;
    this.elements.pages.forEach(p => p.classList.remove('active'));
    document.getElementById(pageName + 'Page').classList.add('active');
    this.elements.pageTitle.textContent = item.querySelector('span:last-child').textContent;
  }

  updateSyncStatusVisibility() {
    if (this.elements.syncIndicator) {
      const syncEnabled = syncManager.isSyncEnabled(this.syncConfig);
      this.elements.syncIndicator.style.display = syncEnabled ? 'flex' : 'none';
    }
  }

  updateSyncIndicator(status, message) {
    if (!this.elements.syncIndicator) return;

    const dot = this.elements.syncIndicator.querySelector('.sync-dot');
    const text = this.elements.syncIndicator.querySelector('.sync-text');
    
    if (text) {
      text.textContent = message || this.getStatusText(status);
    }
    
    this.elements.syncIndicator.className = 'sync-indicator';
    dot.className = 'sync-dot';
    
    switch (status) {
      case SyncStatus.DOWNLOADING:
      case SyncStatus.UPLOADING:
        this.elements.syncIndicator.classList.add('syncing');
        dot.classList.add('syncing');
        break;
      case SyncStatus.DOWNLOADED:
      case SyncStatus.UPLOADED:
        this.elements.syncIndicator.classList.add('success');
        dot.classList.add('success');
        break;
      case SyncStatus.ERROR:
        this.elements.syncIndicator.classList.add('error');
        dot.classList.add('error');
        break;
      default:
        this.elements.syncIndicator.classList.add('idle');
        dot.classList.add('idle');
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

  showStatus(msg, type = 'success') {
    this.elements.statusDiv.textContent = msg;
    this.elements.statusDiv.className = 'status ' + type;
    setTimeout(() => { 
      this.elements.statusDiv.textContent = ''; 
      this.elements.statusDiv.className = 'status'; 
    }, 3000);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const optionsManager = new OptionsManager();
