const RESOURCE_TYPES = ['main_frame'];
const DEFAULT_PRIORITY = 1;

async function loadRules() {
  try {
    const { [STORAGE_KEY]: rules = [] } = await browser.storage.sync.get(STORAGE_KEY);
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
    const dnrRules = enabledRules.map(buildDNRule);
    
    const existing = await browser.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map(r => r.id);
    
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: dnrRules
    });
    
    console.log(`Updating ${dnrRules.length} dynamic rules`);
  } catch (error) {
    console.error('Failed to sync dynamic rules:', error);
  }
}

async function downloadRulesAndUpdate() {
  try {
    if (typeof syncManager === 'undefined') {
      console.warn('SyncManager not available');
      return;
    }

    const config = (await browser.storage.sync.get(CONFIG_KEY))[CONFIG_KEY];
    
    if (!config?.enabled || !config.serverUrl || !config.apiKey) {
      console.log('Sync not configured, skipping download');
      return;
    }

    const result = await syncManager.downloadFromServer();
    
    if (result) {
      const { rules, groups } = result;
      const validRules = syncManager.validateRules(rules);
      const validGroups = syncManager.validateGroups(groups);
      
      await browser.storage.sync.set({ 
        [STORAGE_KEY]: validRules,
        [GROUPS_KEY]: validGroups
      });
      
      console.log(`Downloaded ${validRules.length} rules and ${validGroups.length} groups from server`);
      await syncDynamicRules();
    }
  } catch (error) {
    console.warn('Failed to download rules from server:', error.message);
  }
}

browser.runtime.onStartup.addListener(() => {
  console.log('Extension started, downloading rules...');
  downloadRulesAndUpdate();
});

browser.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated, syncing rules...');
  syncDynamicRules();
  downloadRulesAndUpdate();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) {
    console.log('Rules changed, updating dynamic rules...');
    syncDynamicRules();
  }
});
