const STORAGE_KEY = 'gitlabThemePreset';
const DOMAIN_KEY = 'gitlabDomain';
const DEFAULT_DOMAIN = 'gitlab.com';

const DEFAULT_PRESET = {
  dark: {
    colorTheme: '11',  // Dark Mode (alpha)
    syntaxTheme: '2',  // Dark
  },
  light: {
    colorTheme: '1',   // Indigo
    syntaxTheme: '1',  // Light
  },
  autoSave: true
};

function normalizeDomain(input) {
  const raw = (input || '').trim();
  if (!raw) return DEFAULT_DOMAIN;

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname;
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .trim() || DEFAULT_DOMAIN;
  }
}

function mergePreset(saved) {
  return {
    dark: {
      ...DEFAULT_PRESET.dark,
      ...(saved?.dark || {})
    },
    light: {
      ...DEFAULT_PRESET.light,
      ...(saved?.light || {})
    },
    autoSave: saved?.autoSave ?? DEFAULT_PRESET.autoSave
  };
}

function setStatus(text, isError = false) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.style.color = isError ? '#c62828' : 'inherit';
}

async function loadToForm() {
  const stored = await chrome.storage.sync.get([STORAGE_KEY, DOMAIN_KEY]);
  const preset = mergePreset(stored[STORAGE_KEY]);

  document.getElementById('gitlabDomain').value = normalizeDomain(stored[DOMAIN_KEY] || DEFAULT_DOMAIN);
  document.getElementById('darkColorTheme').value = preset.dark.colorTheme || '';
  document.getElementById('darkSyntaxTheme').value = preset.dark.syntaxTheme || '';
  document.getElementById('lightColorTheme').value = preset.light.colorTheme || '';
  document.getElementById('lightSyntaxTheme').value = preset.light.syntaxTheme || '';
  document.getElementById('autoSave').checked = Boolean(preset.autoSave);
}

async function saveFromForm() {
  const domain = normalizeDomain(document.getElementById('gitlabDomain').value);
  const preset = {
    dark: {
      colorTheme: document.getElementById('darkColorTheme').value.trim(),
      syntaxTheme: document.getElementById('darkSyntaxTheme').value.trim()
    },
    light: {
      colorTheme: document.getElementById('lightColorTheme').value.trim(),
      syntaxTheme: document.getElementById('lightSyntaxTheme').value.trim()
    },
    autoSave: document.getElementById('autoSave').checked
  };

  const prevData = await chrome.storage.sync.get(DOMAIN_KEY);
  const prevDomain = normalizeDomain(prevData[DOMAIN_KEY] || DEFAULT_DOMAIN);

  await chrome.storage.sync.set({ [STORAGE_KEY]: preset, [DOMAIN_KEY]: domain });
  document.getElementById('gitlabDomain').value = domain;

  if (domain !== prevDomain) {
    await chrome.runtime.sendMessage({ type: 'domainChanged', domain }).catch(() => null);
    setStatus(`✅ Settings saved. Domain updated to ${domain} — please refresh your open GitLab tabs.`);
  } else {
    setStatus('✅ Settings saved.');
  }
}

async function applyNow() {
  const stored = await chrome.storage.sync.get(DOMAIN_KEY);
  const domain = normalizeDomain(stored[DOMAIN_KEY] || DEFAULT_DOMAIN);
  const tabs = await chrome.tabs.query({
    url: [`https://${domain}/-/profile/preferences*`]
  });

  if (!tabs.length) {
    setStatus('⚠️ No open GitLab preferences tab found.', true);
    return;
  }

  await Promise.all(
    tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'applyNow' }).catch(() => null))
  );

  setStatus('🚀 Apply command sent to open preferences tab.');
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  try {
    await saveFromForm();
  } catch (error) {
    console.error(error);
    setStatus('Failed to save settings. Please try again.', true);
  }
});

document.getElementById('applyNowBtn').addEventListener('click', async () => {
  try {
    await saveFromForm();
    await applyNow();
  } catch (error) {
    console.error(error);
    setStatus('Apply failed. Make sure the preferences page is open.', true);
  }
});

loadToForm().catch((error) => {
  console.error(error);
  setStatus('Failed to load settings.', true);
});
