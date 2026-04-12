importScripts('common.js');

const RESOURCE_TYPES = ['main_frame'];
const DEFAULT_PRIORITY = 1;

async function broadcastSyncStatus(status, message) {
  try {
    chrome.runtime.sendMessage({ 
      action: 'syncStatusUpdate', 
      status, 
      message 
    }).catch(() => {});
  } catch (e) { console.debug('Broadcast failed:', e); }
}

async function loadRules() {
  try {
    const { [STORAGE_KEY]: rules = [] } = await chrome.storage.sync.get(STORAGE_KEY);
    return rules;
  } catch (error) {
    console.error('Failed to load rules:', error);
    return [];
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\\]/g, '\\$&');
}

function normalizeFromPattern(from) {
  const trimmed = from.trim();
  if (!trimmed.includes('://') && !trimmed.includes('*')) {
    return `*://${trimmed}/*`;
  }
  return trimmed;
}

function normalizeToPattern(to, hasWildcard) {
  let normalized = to.trim();
  if (!normalized.match(/^\w+:\/\//)) {
    normalized = 'https://' + normalized;
  }
  if (hasWildcard && !normalized.includes('$')) {
    if (!normalized.includes('/')) {
      return normalized + '/$1';
    }
    console.warn('Rule target should include $1 to capture path:', to);
  }
  return normalized;
}

function buildDNRule(rule, idx) {
  const from = normalizeFromPattern(rule.from);
  const to = normalizeToPattern(rule.to, from.includes('*'));
  const parts = from.split('*').map(part => escapeRegex(part));
  const regexString = '^' + parts.join('(.*)') + '$';
  return {
    id: idx + 1,
    priority: DEFAULT_PRIORITY,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: to }
    },
    condition: {
      regexFilter: regexString,
      resourceTypes: RESOURCE_TYPES
    }
  };
}

async function syncDynamicRules() {
  try {
    const rules = await loadRules();
    const enabledRules = rules.filter(r => r.enabled);
    const dnrRules = enabledRules.map((rule, index) => buildDNRule(rule, index));
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map(r => r.id);
    const maxExistingId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const newDnrRules = dnrRules.map((rule, idx) => ({
      ...rule,
      id: maxExistingId + idx + 1
    }));
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: newDnrRules
    });
    console.log(`Updated ${newDnrRules.length} dynamic rules`);
  } catch (error) {
    console.error('Failed to sync dynamic rules:', error);
  }
}

async function performDownload(trigger) {
  try {
    const config = (await chrome.storage.sync.get(CONFIG_KEY))[CONFIG_KEY];
    if (!config || !syncManager.isSyncEnabled(config)) {
      console.log(`Sync not enabled for ${trigger} trigger`);
      return;
    }
    
    const mode = config.syncMode || SyncMode.MANUAL;
    let shouldDownload = false;
    
    if (trigger === 'startup') {
      shouldDownload = (mode === SyncMode.STARTUP || mode === SyncMode.BOTH);
    } else if (trigger === 'popup') {
      shouldDownload = (mode === SyncMode.POPUP || mode === SyncMode.BOTH);
    } else if (trigger === 'manual') {
      shouldDownload = true;
    }
    
    if (!shouldDownload) {
      console.log(`Download not configured for ${trigger} trigger (mode: ${mode})`);
      return;
    }

    console.log(`Triggering download on ${trigger}`);
    broadcastSyncStatus(SyncStatus.DOWNLOADING, '下载中...');
    
    const result = await syncManager.downloadFromServer();
    if (result) {
      await syncDynamicRules();
      broadcastSyncStatus(SyncStatus.DOWNLOADED, '已下载');
      setTimeout(() => broadcastSyncStatus(SyncStatus.IDLE, '就绪'), 2000);
    } else {
      broadcastSyncStatus(SyncStatus.IDLE, '就绪');
    }
  } catch (error) {
    console.error('Download failed:', error);
    broadcastSyncStatus(SyncStatus.ERROR, '下载失败');
  }
}

// 处理上传请求
async function performUpload(rules, groups) {
  const config = (await chrome.storage.sync.get(CONFIG_KEY))[CONFIG_KEY];
  if (!config || !syncManager.isSyncEnabled(config)) {
    throw new Error('Sync not configured');
  }

  broadcastSyncStatus(SyncStatus.UPLOADING, '上传中...');
  
  try {
    await syncManager.uploadToServer(rules, groups);
    broadcastSyncStatus(SyncStatus.UPLOADED, '已上传');
    setTimeout(() => broadcastSyncStatus(SyncStatus.IDLE, '就绪'), 2000);
  } catch (error) {
    console.error('Upload failed:', error);
    broadcastSyncStatus(SyncStatus.ERROR, '上传失败');
    throw error;
  }
}

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'triggerDownload') {
    performDownload(message.trigger || 'manual').then(() => sendResponse({success: true}));
    return true;
  }
  if (message.action === 'manualDownload') {
    performDownload('manual').then(() => sendResponse({success: true}));
    return true;
  }
  if (message.action === 'popupOpened') {
    performDownload('popup').then(() => sendResponse({success: true}));
    return true;
  }
  if (message.action === 'uploadRules') {
    performUpload(message.rules, message.groups)
      .then(() => sendResponse({success: true}))
      .catch(err => sendResponse({success: false, error: err.message}));
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  syncDynamicRules();
  performDownload('startup');
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  syncDynamicRules();
  performDownload('startup');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) {
    console.log('Rules changed, updating dynamic rules...');
    syncDynamicRules();
  }
});