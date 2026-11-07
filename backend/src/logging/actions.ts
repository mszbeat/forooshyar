/**
 * Turns a route into a stable, human-readable action name.
 * Kept as a pure function so it can be unit-tested without a server.
 */
export function actionFor(method: string, path: string): { action: string; entity?: string } {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = clean.split('/').filter(Boolean);
  const verb = method.toUpperCase();
  const isUuid = (value: string | undefined) => !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  // health
  if (segments[0] === 'health') return { action: 'health.check' };

  // auth
  if (segments[0] === 'auth') return { action: `auth.${segments[1] ?? 'unknown'}` };

  // shop settings
  if (segments[0] === 'shop') return { action: verb === 'PATCH' ? 'shop.update' : 'shop.view', entity: 'shop' };

  // audit trail itself
  if (segments[0] === 'audit') return { action: 'audit.read', entity: 'audit' };

  // import (route is POST /catalog/import)
  if (segments[0] === 'catalog' && segments[1] === 'import') {
    return { action: 'catalog.import', entity: 'catalog' };
  }

  // imports
  if (segments[0] === 'imports' || segments[0] === 'import') {
    return { action: verb === 'POST' ? 'catalog.import' : 'catalog.import.view', entity: 'catalog' };
  }

  // reports
  if (segments[0] === 'reports') return { action: `reports.${segments[1] ?? 'view'}`, entity: 'report' };

  // products
  if (segments[0] === 'products') {
    if (segments.length === 1) return { action: verb === 'POST' ? 'product.create' : 'product.list', entity: 'product' };
    if (segments.length === 2) {
      const action = verb === 'GET' ? 'product.view' : verb === 'PATCH' ? 'product.update' : verb === 'DELETE' ? 'product.archive' : 'product.change';
      return { action, entity: 'product' };
    }
    if (segments[2] === 'variants' && verb === 'POST') return { action: 'variant.create', entity: 'variant' };
  }

  // variants
  if (segments[0] === 'variants') {
    if (segments.length === 2) {
      const action = verb === 'GET' ? 'variant.view' : verb === 'PATCH' ? 'variant.update' : verb === 'DELETE' ? 'variant.archive' : 'variant.change';
      return { action, entity: 'variant' };
    }
    if (segments[2] === 'sell') return { action: 'variant.sell', entity: 'variant' };
    if (segments[2] === 'stock') return { action: 'variant.stock_adjust', entity: 'variant' };
    if (segments[2] === 'movements') return { action: 'variant.movements', entity: 'variant' };
  }

  // fallback: verb + first segment, so nothing is ever unlabelled
  const fallbackVerb = verb === 'GET' ? 'read' : verb === 'POST' ? 'create' : verb === 'PATCH' ? 'update' : verb === 'DELETE' ? 'delete' : verb.toLowerCase();
  return { action: `${segments[0] ?? 'root'}.${fallbackVerb}`, entity: segments[0] };
}

/** Actions that change state — these are the ones persisted to the audit table. */
export function isMutating(method: string): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase());
}

export function entityIdFrom(path: string): string | undefined {
  const segments = path.split('/').filter(Boolean);
  const id = segments.find(segment => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment));
  return id;
}
