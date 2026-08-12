const DEFAULT_ROUTE = "game";

export class SpaRouter {
  constructor({ links, views, onRouteChange }) {
    this.links = [...links];
    this.views = [...views];
    this.routes = new Set(this.views.map((view) => view.dataset.view));
    this.onRouteChange = onRouteChange;
    this.currentRoute = null;
    window.addEventListener("hashchange", () => this.sync());
    this.sync();
  }

  routeFromHash() {
    const route = window.location.hash.replace(/^#\/?/, "");
    return this.routes.has(route) ? route : DEFAULT_ROUTE;
  }

  sync() {
    const route = this.routeFromHash();
    this.currentRoute = route;
    this.views.forEach((view) => { view.hidden = view.dataset.view !== route; });
    this.links.forEach((link) => {
      const active = link.dataset.routeLink === route;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.title = `${this.views.find((view) => view.dataset.view === route)?.dataset.title || "Mafia Host"} · Mafia Host`;
    this.onRouteChange?.(route);
  }
}
