const STORAGE_KEY = 'rules';
const CONFIG_KEY = 'syncConfig';

async function loadRules() {
  const { [STORAGE_KEY]: rules = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  return rules;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDNRule(rule, idx) {
  let from = rule.from.trim();
  let to = rule.to.trim();

  if (!from.includes('://') && !from.includes('*')) {
    from = `*://${from}/*`;
  }
  const parts = from.split('*').map(part => escapeRegex(part));
  const regexString = '^' + parts.join('(.*)') + '$';
  const starCount = (from.match(/\*/g) || []).length;

  if (!to.match(/^\w+:\/\//)) {
    to = 'https://' + to;
  }
  if (starCount > 0 && !to.includes('$')) {
    if (!to.includes('/')) {
      to = to + '/$1';
    } else {
      console.warn('Rule target should include $1 to capture path', rule);
    }
  }

  return {
    id: idx + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { regexSubstitution: to } },
    condition: { regexFilter: regexString, resourceTypes: ['main_frame'] }
  };
}

async function syncDynamicRules() {
  const rules = await loadRules();
  const dnrRules = rules.filter(r => r.enabled).map(buildDNRule);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: dnrRules
  });
}

// 从服务器下载规则
async function downloadRulesFromServer() {
  const config = (await chrome.storage.sync.get(CONFIG_KEY))[CONFIG_KEY];
  // 仅当同步功能启用且配置完整时执行
  if (!config || !config.enabled || !config.serverUrl || !config.apiKey) return;

  try {
    const url = new URL(config.serverUrl);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': config.apiKey }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remoteRules = await response.json();
    if (!Array.isArray(remoteRules)) throw new Error('Invalid data');

    await chrome.storage.sync.set({ [STORAGE_KEY]: remoteRules });
    console.log('Auto-download on startup succeeded');
  } catch (err) {
    console.warn('Auto-download on startup failed:', err);
  }
}

// 浏览器启动时自动下载（如果启用）
chrome.runtime.onStartup.addListener(() => {
  downloadRulesFromServer();
});

chrome.runtime.onInstalled.addListener(() => {
  syncDynamicRules();
  downloadRulesFromServer(); // 安装时也尝试下载
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) syncDynamicRules();
});