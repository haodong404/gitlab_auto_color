const LOG_PREFIX = '[GitLab Auto Color][background]';
const DOMAIN_KEY = 'gitlabDomain';
const DEFAULT_DOMAIN = 'gitlab.com';

let lastHandledMode = null;
let lastHandledAt = 0;
let applying = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function getDomain() {
  const stored = await chrome.storage.sync.get(DOMAIN_KEY);
  return normalizeDomain(stored[DOMAIN_KEY] || DEFAULT_DOMAIN);
}

async function registerContentScripts(domain) {
  const normalizedDomain = normalizeDomain(domain);
  const scripts = [
    {
      id: 'gitlab-auto-color-logger',
      matches: [`https://${normalizedDomain}/*`],
      js: ['logger.js'],
      runAt: 'document_start',
    },
    {
      id: 'gitlab-auto-color-preferences',
      matches: [`https://${normalizedDomain}/-/profile/preferences*`],
      js: ['content.js'],
      runAt: 'document_idle',
    },
  ];
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const existingIds = new Set(existing.map((s) => s.id));
    const toUpdate = scripts.filter((s) => existingIds.has(s.id));
    const toRegister = scripts.filter((s) => !existingIds.has(s.id));
    if (toUpdate.length > 0) await chrome.scripting.updateContentScripts(toUpdate);
    if (toRegister.length > 0) await chrome.scripting.registerContentScripts(toRegister);
  } catch (e) {
    if (e.message && e.message.includes('Duplicate script ID')) {
      // Race condition: already registered between check and register, update instead
      await chrome.scripting.updateContentScripts(scripts).catch(() => {});
    } else {
      throw e;
    }
  }
  logInfo(`content scripts registered for domain: ${normalizedDomain}`);
}

async function ensureContentScriptsRegistered() {
  const domain = await getDomain();
  await registerContentScripts(domain);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContentScriptsRegistered().catch((e) => console.error(e));
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureContentScriptsRegistered().catch((e) => console.error(e));
});

ensureContentScriptsRegistered().catch((e) => console.error(e));

function logInfo(message, extra) {
  if (typeof extra === 'undefined') {
    console.info(`${LOG_PREFIX} ${message}`);
    return;
  }
  console.info(`${LOG_PREFIX} ${message}`, extra);
}

async function waitTabComplete(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return true;
    await sleep(250);
  }
  return false;
}

async function sendApplyMessageWithRetry(tabId, mode, retries = 20) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: 'applyNowForMode',
        mode,
        forceSave: true
      });
      return result || { ok: true, reason: 'no-response-payload' };
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Failed to send apply message to preferences tab');
}

async function reloadGitLabTabs() {
  const domain = await getDomain();
  const tabs = await chrome.tabs.query({ url: [`https://${domain}/*`] });
  await Promise.all(
    tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => chrome.tabs.reload(tab.id).catch(() => null))
  );
  return domain;
}

async function applyThemeByMode(mode) {
  if (applying) {
    logInfo('skip: apply is already running');
    return;
  }

  const now = Date.now();
  if (mode === lastHandledMode && now - lastHandledAt < 2000) {
    logInfo(`skip duplicated mode event: ${mode}`);
    return;
  }

  applying = true;
  lastHandledMode = mode;
  lastHandledAt = now;

  let tabId = null;
  try {
    logInfo(`apply start for mode=${mode}`);
    const domain = await getDomain();
    const tab = await chrome.tabs.create({
      url: `https://${domain}/-/profile/preferences`,
      active: false
    });
    tabId = tab.id;

    if (!Number.isInteger(tabId)) {
      throw new Error('Failed to create preferences tab');
    }

    await waitTabComplete(tabId, 20000);
    const result = await sendApplyMessageWithRetry(tabId, mode, 30);
    logInfo('apply result from preferences page', result);

    const reloadedDomain = await reloadGitLabTabs();
    logInfo(`reloaded ${reloadedDomain} tabs to reflect updated theme`);
  } catch (error) {
    console.error(`${LOG_PREFIX} apply failed`, error);
  } finally {
    if (Number.isInteger(tabId)) {
      await chrome.tabs.remove(tabId).catch(() => null);
    }
    applying = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'systemThemeChanged') {
    applyThemeByMode(message.mode)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'domainChanged') {
    registerContentScripts(message.domain)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  return false;
});
