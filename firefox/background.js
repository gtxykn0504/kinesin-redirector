const STORAGE_KEY = 'rules';
const CONFIG_KEY = 'syncConfig';

async function loadRules() {
  const { [STORAGE_KEY]: rules = [] } = await browser.storage.sync.get(STORAGE_KEY);
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
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: dnrRules
  });
}

async function downloadRulesFromServer() {
  const config = (await browser.storage.sync.get(CONFIG_KEY))[CONFIG_KEY];
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

    await browser.storage.sync.set({ [STORAGE_KEY]: remoteRules });
    console.log('Auto-download on startup succeeded');
  } catch (err) {
    console.warn('Auto-download on startup failed:', err);
  }
}

// Firefox 没有 runtime.onStartup？实际上有，但用 runtime.onStartup 即可。
browser.runtime.onStartup.addListener(() => {
  downloadRulesFromServer();
});

browser.runtime.onInstalled.addListener(() => {
  syncDynamicRules();
  downloadRulesFromServer();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) syncDynamicRules();
});