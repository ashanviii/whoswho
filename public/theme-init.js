// Apply the saved theme before first paint to avoid a flash of the wrong theme.
try {
  var t = localStorage.getItem('cc:theme');
  var dark = t === 'dark' || ((!t || t === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
