const STORAGE_KEY = 'rules';
const CONFIG_KEY = 'syncConfig';

const listEl = document.getElementById('ruleList');
const patternEl = document.getElementById('pattern');
const targetEl = document.getElementById('target');
const form = document.getElementById('addForm');
const settingsLink = document.getElementById('settingsLink');
const syncStatus = document.getElementById('syncStatus');

let rules = [];
let syncConfig = null;

init();

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (rules.length >= 50) {
    alert('Max 50 rules');
    return;
  }

  const from = patternEl.value.trim();
  const to = targetEl.value.trim();
  if (!from || !to) return;

  rules.push({
    id: Date.now(),
    from: from,
    to: to,
    enabled: true
  });

  await save();
  form.reset();
});

// 进入编辑模式
function enterEditMode(li, rule) {
  li.innerHTML = '';

  const fromInput = document.createElement('input');
  fromInput.type = 'text';
  fromInput.value = rule.from;
  fromInput.placeholder = 'From';

  const toInput = document.createElement('input');
  toInput.type = 'text';
  toInput.value = rule.to;
  toInput.placeholder = 'To';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '✓';
  saveBtn.classList.add('save-btn');
  saveBtn.addEventListener('click', async () => {
    const newFrom = fromInput.value.trim();
    const newTo = toInput.value.trim();
    if (newFrom && newTo) {
      rule.from = newFrom;
      rule.to = newTo;
      await save();
    } else {
      render();
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '✗';
  cancelBtn.classList.add('cancel-btn');
  cancelBtn.addEventListener('click', () => {
    render();
  });

  li.append(fromInput, toInput, saveBtn, cancelBtn);
}

function render() {
  listEl.innerHTML = '';
  rules.forEach(r => {
    if (!r || typeof r.from !== 'string' || typeof r.to !== 'string') {
      console.warn('Skipping invalid rule:', r);
      return;
    }

    const li = document.createElement('li');

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!r.enabled;
    chk.addEventListener('change', async () => {
      r.enabled = chk.checked;
      await save();
    });

    const span = document.createElement('span');
    span.textContent = `${r.from} → ${r.to}`;

    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.classList.add('edit-btn');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterEditMode(li, r);
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.classList.add('delete-btn');
    delBtn.addEventListener('click', async () => {
      rules = rules.filter(x => x.id !== r.id);
      await save();
    });

    li.append(chk, span, editBtn, delBtn);
    listEl.appendChild(li);
  });
}

async function save() {
  await chrome.storage.sync.set({ [STORAGE_KEY]: rules });
  render();
  await autoUpload();
}

async function autoUpload() {
  // 仅当同步功能启用且配置完整时上传
  if (!syncConfig || !syncConfig.enabled || !syncConfig.serverUrl || !syncConfig.apiKey) return;
  try {
    const url = new URL(syncConfig.serverUrl);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': syncConfig.apiKey
      },
      body: JSON.stringify(rules)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    showSyncStatus('Synced', 'green');
  } catch (err) {
    console.warn('Auto sync failed:', err);
    showSyncStatus('Sync failed: ' + err.message, 'red');
  }
}

async function autoDownload() {
  // 仅当同步功能启用、自动下载开启且配置完整时下载
  if (!syncConfig || !syncConfig.enabled || !syncConfig.serverUrl || !syncConfig.apiKey || !syncConfig.autoDownload) return;
  showSyncStatus('Downloading...', 'blue');
  try {
    const url = new URL(syncConfig.serverUrl);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': syncConfig.apiKey }
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    let remoteRules = await response.json();
    if (!Array.isArray(remoteRules)) {
      throw new Error('Invalid data from server (not an array)');
    }

    remoteRules = remoteRules.filter(r =>
      r && typeof r.id === 'number' &&
      typeof r.from === 'string' &&
      typeof r.to === 'string' &&
      typeof r.enabled === 'boolean'
    );

    await chrome.storage.sync.set({ [STORAGE_KEY]: remoteRules });
    rules = remoteRules;
    render();
    showSyncStatus('Downloaded', 'green');
  } catch (err) {
    console.warn('Auto download failed:', err);
    showSyncStatus('Download failed: ' + err.message, 'red');
  }
}

function showSyncStatus(msg, color) {
  syncStatus.textContent = msg;
  syncStatus.style.color = color;
  setTimeout(() => { syncStatus.textContent = ''; }, 2000);
}

async function init() {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    rules = data[STORAGE_KEY] || [];
    const configData = await chrome.storage.sync.get(CONFIG_KEY);
    syncConfig = configData[CONFIG_KEY] || null;

    render();
    await autoDownload();
  } catch (err) {
    console.error('Init error:', err);
    showSyncStatus('Init error: ' + err.message, 'red');
  }
}