type Listener = (pending: boolean) => void;

const listeners = new Set<Listener>();

export function setNavigationPending(pending: boolean) {
  listeners.forEach((listener) => listener(pending));
}

export function subscribeNavigation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
