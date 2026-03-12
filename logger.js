(() => {
  const LOG_PREFIX = '[GitLab Auto Color]';
  const getMode = () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  function logThemeEvent(reason, fromMode, toMode) {
    const now = new Date().toISOString();
    if (fromMode && toMode && fromMode !== toMode) {
      console.info(
        `${LOG_PREFIX} ${reason}: ${fromMode} -> ${toMode} @ ${now} | ${location.href}`
      );
      return;
    }

    console.info(`${LOG_PREFIX} ${reason}: ${toMode} @ ${now} | ${location.href}`);
  }

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  let lastMode = getMode();

  logThemeEvent('init', null, lastMode);

  const handler = () => {
    const nextMode = getMode();
    logThemeEvent('system-theme-changed', lastMode, nextMode);
    if (nextMode !== lastMode) {
      chrome.runtime
        .sendMessage({
          type: 'systemThemeChanged',
          mode: nextMode,
          url: location.href
        })
        .catch(() => null);
    }
    lastMode = nextMode;
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(handler);
  }
})();
