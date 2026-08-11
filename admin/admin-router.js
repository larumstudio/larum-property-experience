/* ── Larum Admin · Router ───────────────────────────────────────
   Hash-based SPA router. Each route maps to a view module that
   owns its render() and teardown(). The router calls them;
   modules never touch the DOM outside their container.
   ───────────────────────────────────────────────────────────── */

const routes = {};
let currentRoute = null;
let currentParams = null;
let currentModule = null;

export function register(name, mod) {
  routes[name] = mod;
}

export function navigate(name, params) {
  if (currentModule && currentModule.teardown) currentModule.teardown();

  currentRoute = name;
  currentParams = params;
  currentModule = routes[name] || null;

  document.querySelectorAll('[data-nav]').forEach(el =>
    el.classList.toggle('active', el.dataset.nav === name));

  const title = document.getElementById('viewTitle');
  if (title && currentModule && currentModule.title) {
    title.textContent = currentModule.title;
  }

  const content = document.getElementById('viewContent');
  if (!content) return;

  if (currentModule && currentModule.render) {
    currentModule.render(content, params);
  } else {
    content.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">◇</div>' +
        '<div class="empty-state-title">Coming soon</div>' +
        '<div class="empty-state-text">This section will be available in a future milestone.</div>' +
      '</div>';
  }

  history.replaceState(null, '', '#' + name + (params ? '/' + params : ''));
}

export function current() {
  return currentRoute;
}

export function init() {
  const hash = location.hash.slice(1) || 'dashboard';
  const parts = hash.split('/');
  const route = parts[0];
  const params = parts.slice(1).join('/') || undefined;

  if (routes[route]) navigate(route, params);
  else navigate('dashboard');

  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1) || 'dashboard';
    const p = h.split('/');
    const newRoute = p[0];
    const newParams = p.slice(1).join('/') || undefined;
    if (newRoute !== currentRoute || newParams !== currentParams) {
      navigate(newRoute, newParams);
    }
  });
}
