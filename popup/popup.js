const enabledToggle = document.getElementById('enabled-toggle');
const apiKeyInput = document.getElementById('api-key');
const toggleKeyBtn = document.getElementById('toggle-key');
const saveKeyBtn = document.getElementById('save-key');
const saveStatus = document.getElementById('save-status');
const platformPills = document.getElementById('platform-pills');
const versionEl = document.getElementById('version');

const DEFAULTS = { apiKey: '', enabled: true, platform: 'yahoo' };

chrome.runtime.getManifest().version &&
  (versionEl.textContent = 'v' + chrome.runtime.getManifest().version);

chrome.storage.sync.get(DEFAULTS, (settings) => {
  enabledToggle.checked = settings.enabled !== false;
  apiKeyInput.value = settings.apiKey || '';
  setActivePlatform(settings.platform || 'yahoo');
});

enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
});

toggleKeyBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
});

saveKeyBtn.addEventListener('click', () => {
  chrome.storage.sync.set({ apiKey: apiKeyInput.value.trim() }, () => {
    saveStatus.textContent = 'Saved';
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  });
});

platformPills.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  const platform = pill.dataset.platform;
  setActivePlatform(platform);
  chrome.storage.sync.set({ platform });
});

function setActivePlatform(platform) {
  platformPills.querySelectorAll('.pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.platform === platform);
  });
}
