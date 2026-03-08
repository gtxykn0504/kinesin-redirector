const STORAGE_KEY = 'rules';
const CONFIG_KEY = 'syncConfig';

const enableSyncCheck = document.getElementById('enableSync');
const serverUrlInput = document.getElementById('serverUrl');
const apiKeyInput = document.getElementById('apiKey');
const autoDownloadCheck = document.getElementById('autoDownload');
const configForm = document.getElementById('configForm');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');

async function loadConfig() {
  const config = (await browser.storage.sync.get(CONFIG_KEY))[CONFIG_KEY] || {};
  enableSyncCheck.checked = config.enabled || false;
  serverUrlInput.value = config.serverUrl || '';
  apiKeyInput.value = config.apiKey || '';
  autoDownloadCheck.checked = config.autoDownload || false;
}

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const config = {
    enabled: enableSyncCheck.checked,
    serverUrl: serverUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    autoDownload: autoDownloadCheck.checked
  };
  await browser.storage.sync.set({ [CONFIG_KEY]: config });
  showStatus('Settings saved', 'success');
});

function showStatus(msg, type = 'success') {
  statusDiv.textContent = msg;
  statusDiv.className = 'status ' + type;
  setTimeout(() => { statusDiv.textContent = ''; statusDiv.className = 'status'; }, 3000);
}

downloadBtn.addEventListener('click', async () => {
  const config = (await browser.storage.sync.get(CONFIG_KEY))[CONFIG_KEY];
  if (!config || !config.enabled || !config.serverUrl || !config.apiKey) {
    showStatus('Synchronization is disabled or incomplete', 'error');
    return;
  }
  try {
    await downloadRules(config);
    showStatus('Download successful, rules updated', 'success');
  } catch (err) {
    showStatus('Download failed: ' + err.message, 'error');
  }
});

async function downloadRules(config) {
  const url = new URL(config.serverUrl);
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-API-Key': config.apiKey }
  });
  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }
  const remoteRules = await response.json();
  if (!Array.isArray(remoteRules)) {
    throw new Error('Invalid data from server');
  }
  await browser.storage.sync.set({ [STORAGE_KEY]: remoteRules });
}

loadConfig();