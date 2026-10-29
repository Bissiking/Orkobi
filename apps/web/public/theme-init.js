(() => {
  let theme = 'system';
  try {
    const saved = JSON.parse(localStorage.getItem('orkobi.preferences') || '{}');
    if (['light', 'dark', 'system'].includes(saved.theme)) theme = saved.theme;
  } catch {
    /* Le shell reste accessible si le stockage est indisponible. */
  }
  document.documentElement.dataset.theme =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
})();
