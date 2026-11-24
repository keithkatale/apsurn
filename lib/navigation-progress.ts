type Listener = (pending: boolean) => void;

function createPendingBus() {
  const listeners = new Set<Listener>();
  return {
    set(pending: boolean) {
      listeners.forEach((listener) => listener(pending));
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const pageBus = createPendingBus();
const dashboardBus = createPendingBus();

export function setNavigationPending(pending: boolean) {
  pageBus.set(pending);
}

export function subscribeNavigation(listener: Listener) {
  return pageBus.subscribe(listener);
}

export function setDashboardContentPending(pending: boolean) {
  dashboardBus.set(pending);
}

export function subscribeDashboardContent(listener: Listener) {
  return dashboardBus.subscribe(listener);
}
