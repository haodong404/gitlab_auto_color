const STORAGE_KEY = 'gitlabThemePreset';
const LOG_PREFIX = '[GitLab Auto Color][preferences]';

// name="user[theme_id]"  ->  Color theme (navigation sidebar)
const COLOR_THEME_OPTIONS = [
  { value: '1',  label: 'Indigo' },
  { value: '6',  label: 'Light Indigo' },
  { value: '4',  label: 'Blue' },
  { value: '7',  label: 'Light Blue' },
  { value: '5',  label: 'Green' },
  { value: '8',  label: 'Light Green' },
  { value: '9',  label: 'Red' },
  { value: '10', label: 'Light Red' },
  { value: '2',  label: 'Gray' },
  { value: '3',  label: 'Light Gray' },
  { value: '11', label: 'Dark Mode (alpha)' },
];

// name="user[color_scheme_id]"  ->  Syntax highlighting theme
const SYNTAX_THEME_OPTIONS = [
  { value: '1', label: 'Light' },
  { value: '2', label: 'Dark' },
  { value: '3', label: 'Solarized Light' },
  { value: '4', label: 'Solarized Dark' },
  { value: '5', label: 'Monokai' },
  { value: '6', label: 'None' },
];

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

const normalize = (text) => (text || '').trim().toLowerCase().replace(/\s+/g, ' ');

function logInfo(message, extra) {
  if (typeof extra === 'undefined') {
    console.info(`${LOG_PREFIX} ${message}`);
    return;
  }
  console.info(`${LOG_PREFIX} ${message}`, extra);
}

function getSystemMode() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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

async function loadPreset() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return mergePreset(stored[STORAGE_KEY]);
}

// Resolve a target (label text or numeric value string) to the radio value string.
function resolveToValue(target, options) {
  if (!target) return null;
  const t = normalize(target);
  const byValue = options.find(o => o.value === t || normalize(o.value) === t);
  if (byValue) return byValue.value;
  const byExact = options.find(o => normalize(o.label) === t);
  if (byExact) return byExact.value;
  const byPartial = options.find(o => normalize(o.label).includes(t) || t.includes(normalize(o.label)));
  return byPartial?.value ?? null;
}

// Select a radio button by group name + value; returns true when a change is made.
function setRadioGroup(name, targetValue) {
  if (!targetValue) return false;
  const radio = document.querySelector(
    `input[type="radio"][name="${name}"][value="${CSS.escape(targetValue)}"]`
  );
  if (!radio) {
    logInfo(`radio not found: name="${name}" value="${targetValue}"`);
    return false;
  }
  if (radio.checked) {
    logInfo(`radio already checked: name="${name}" value="${targetValue}"`);
    return false;
  }
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  radio.dispatchEvent(new Event('input',  { bubbles: true }));
  logInfo(`radio set: name="${name}" value="${targetValue}"`);
  return true;
}

// Submit the GitLab preferences form (data-remote="true" means AJAX — no navigation).
function clickSaveButton() {
  const form = document.getElementById('profile-preferences-form');
  if (form) {
    const btn = form.querySelector('button[type="submit"]');
    if (btn && !btn.disabled) {
      btn.click();
      logInfo('save triggered via submit button click');
      return true;
    }
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      logInfo('save triggered via form.requestSubmit()');
      return true;
    }
  }
  logInfo('no save trigger found');
  return false;
}


let applying = false;
async function applyPreset(options = {}) {
  const modeOverride = options?.modeOverride;
  const forceSave = Boolean(options?.forceSave);

  if (applying) return;
  applying = true;

  try {
    const preset = await loadPreset();
    const mode = modeOverride === 'dark' || modeOverride === 'light' ? modeOverride : getSystemMode();
    const modePreset = preset[mode] || {};

    const hasColorRadio = !!document.querySelector('input[type="radio"][name="user[theme_id]"]');
    const hasSyntaxRadio = !!document.querySelector('input[type="radio"][name="user[color_scheme_id]"]');

    if (!hasColorRadio && !hasSyntaxRadio) {
      logInfo('radio buttons not found on page');
      return;
    }

    logInfo(`apply preset start: mode=${mode}`, modePreset);

    const colorValue  = resolveToValue(modePreset.colorTheme, COLOR_THEME_OPTIONS);
    const syntaxValue = resolveToValue(modePreset.syntaxTheme, SYNTAX_THEME_OPTIONS);

    const colorChanged  = setRadioGroup('user[theme_id]',       colorValue);
    const syntaxChanged = setRadioGroup('user[color_scheme_id]', syntaxValue);

    if ((forceSave || preset.autoSave) && (colorChanged || syntaxChanged)) {
      const saved = clickSaveButton();
      if (!saved) logInfo('save requested but no save trigger was found');
    }

    if (!colorChanged && !syntaxChanged) {
      logInfo('apply preset finished with no changes');
    }

    return { ok: true, mode, colorChanged, syntaxChanged };
  } finally {
    applying = false;
  }
}

function applyWhenReady(maxRetry = 20, delayMs = 300) {
  let retry = 0;
  const timer = setInterval(() => {
    retry += 1;
    const ready = !!document.querySelector('input[type="radio"][name="user[theme_id]"]');
    if (ready) {
      clearInterval(timer);
      applyPreset();
    } else if (retry >= maxRetry) {
      clearInterval(timer);
      logInfo('applyWhenReady: radio buttons never appeared');
    }
  }, delayMs);
}

const mql = window.matchMedia('(prefers-color-scheme: dark)');
if (typeof mql.addEventListener === 'function') {
  mql.addEventListener('change', () => applyPreset());
} else if (typeof mql.addListener === 'function') {
  mql.addListener(() => applyPreset());
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'applyNow') {
    applyPreset().then((result) => sendResponse(result || { ok: true }));
    return true;
  }
  if (message?.type === 'applyNowForMode') {
    applyPreset({ modeOverride: message.mode, forceSave: Boolean(message.forceSave) })
      .then((result) => sendResponse(result || { ok: true }));
    return true;
  }
  return false;
});

applyWhenReady();
