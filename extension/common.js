const STORAGE_KEY = 'rules';
const GROUPS_KEY = 'groups';
const CONFIG_KEY = 'syncConfig';
const LAST_SYNC_KEY = 'lastSyncTime';

const UNGROUPED_ID = 'ungrouped';
const UNGROUPED_NAME = 'Ungrouped';

const AUTO_RULE_FIELDS = ['from', 'to', 'both'];

const SyncStatus = {
  IDLE: 'idle',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  ERROR: 'error'
};

class SyncManager {
  constructor() {
    this.status = SyncStatus.IDLE;
    this.statusListeners = [];
  }

  addStatusListener(listener) {
    this.statusListeners.push(listener);
  }

  removeStatusListener(listener) {
    this.statusListeners = this.statusListeners.filter(l => l !== listener);
  }

  setStatus(status, message = '') {
    this.status = status;
    this.statusListeners.forEach(listener => listener(status, message));
  }

  async downloadFromServer() {
    const config = await this.getSyncConfig();
    if (!this.isSyncEnabled(config)) {
      return null;
    }

    this.setStatus(SyncStatus.DOWNLOADING, '下载中...');

    try {
      const url = new URL(config.serverUrl);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'X-API-Key': config.apiKey }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      let rules = [];
      let groups = [];
      
      if (data.rules && Array.isArray(data.rules)) {
        rules = this.validateRules(data.rules);
      } else if (Array.isArray(data)) {
        rules = this.validateRules(data);
      }
      
      if (data.groups && Array.isArray(data.groups)) {
        groups = this.validateGroups(data.groups);
      }

      groups = this.ensureDefaultGroup(groups);

      await chrome.storage.sync.set({ 
        [STORAGE_KEY]: rules,
        [GROUPS_KEY]: groups,
        [LAST_SYNC_KEY]: Date.now()
      });

      this.setStatus(SyncStatus.DOWNLOADED, '已下载');
      
      setTimeout(() => {
        if (this.status === SyncStatus.DOWNLOADED) {
          this.setStatus(SyncStatus.IDLE);
        }
      }, 2000);

      return { rules, groups };
    } catch (error) {
      console.error('下载失败:', error);
      this.setStatus(SyncStatus.ERROR, '下载失败');
      throw error;
    }
  }

  async uploadToServer(rules, groups) {
    const config = await this.getSyncConfig();
    if (!this.isSyncEnabled(config)) {
      return;
    }

    this.setStatus(SyncStatus.UPLOADING, '上传中...');

    try {
      const url = new URL(config.serverUrl);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey
        },
        body: JSON.stringify({ rules, groups })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      await chrome.storage.sync.set({
        [LAST_SYNC_KEY]: Date.now()
      });

      this.setStatus(SyncStatus.UPLOADED, '已上传');
      
      setTimeout(() => {
        if (this.status === SyncStatus.UPLOADED) {
          this.setStatus(SyncStatus.IDLE);
        }
      }, 2000);
    } catch (error) {
      console.error('上传失败:', error);
      this.setStatus(SyncStatus.ERROR, '上传失败');
      throw error;
    }
  }

  async getSyncConfig() {
    const data = await chrome.storage.sync.get(CONFIG_KEY);
    return data[CONFIG_KEY] || null;
  }

  isSyncEnabled(config) {
    return config?.enabled && config.serverUrl && config.apiKey;
  }

  validateRules(rules) {
    if (!Array.isArray(rules)) return [];
    return rules.filter(rule => 
      rule && 
      typeof rule.id === 'number' && 
      typeof rule.from === 'string' && 
      typeof rule.to === 'string' &&
      typeof rule.enabled === 'boolean'
    );
  }

  validateGroups(groups) {
    if (!Array.isArray(groups)) return [];
    return groups.filter(group => 
      group && 
      typeof group.id === 'string' && 
      typeof group.name === 'string'
    );
  }

  ensureDefaultGroup(groups) {
    const hasUngrouped = groups.some(g => g.id === UNGROUPED_ID);
    if (!hasUngrouped) {
      groups.unshift({
        id: UNGROUPED_ID,
        name: UNGROUPED_NAME,
        autoRules: []
      });
    }
    return groups;
  }

  matchesAutoRule(rule, autoRule) {
    if (!autoRule?.keyword) return false;
    const keyword = autoRule.keyword.toLowerCase();
    const field = autoRule.field || 'from';
    
    if (field === 'from') {
      return rule.from.toLowerCase().includes(keyword);
    } else if (field === 'to') {
      return rule.to.toLowerCase().includes(keyword);
    } else if (field === 'both') {
      return rule.from.toLowerCase().includes(keyword) || 
             rule.to.toLowerCase().includes(keyword);
    }
    return false;
  }

  determineGroupForRule(from, to, groups) {
    for (const group of groups) {
      if (group.id === UNGROUPED_ID || !group.autoRules) continue;
      
      for (const autoRule of group.autoRules) {
        if (this.matchesAutoRule({ from, to }, autoRule)) {
          return group.id;
        }
      }
    }
    return UNGROUPED_ID;
  }
}

const syncManager = new SyncManager();
