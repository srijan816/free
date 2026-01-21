interface CircuitState {
  status: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  opened_at?: number;
}

export class CircuitBreakerService {
  private readonly failureThreshold = 5;
  private readonly successThreshold = 3;
  private readonly openDurationMs = 30000;
  private states = new Map<string, CircuitState>();

  isOpen(service: string): boolean {
    const state = this.getState(service);

    if (state.status === 'closed') {
      return false;
    }

    if (state.status === 'open') {
      if (Date.now() - (state.opened_at || 0) > this.openDurationMs) {
        state.status = 'half-open';
        state.successes = 0;
        this.states.set(service, state);
        return false;
      }
      return true;
    }

    return false;
  }

  recordSuccess(service: string) {
    const state = this.getState(service);

    if (state.status === 'half-open') {
      state.successes += 1;
      if (state.successes >= this.successThreshold) {
        this.states.set(service, { status: 'closed', failures: 0, successes: 0 });
      } else {
        this.states.set(service, state);
      }
      return;
    }

    if (state.status === 'closed' && state.failures > 0) {
      this.states.set(service, { ...state, failures: 0 });
    }
  }

  recordFailure(service: string) {
    const state = this.getState(service);
    state.failures += 1;

    if (state.status === 'half-open' || (state.status === 'closed' && state.failures >= this.failureThreshold)) {
      this.states.set(service, {
        status: 'open',
        failures: state.failures,
        successes: 0,
        opened_at: Date.now()
      });
      return;
    }

    this.states.set(service, state);
  }

  private getState(service: string): CircuitState {
    return this.states.get(service) || { status: 'closed', failures: 0, successes: 0 };
  }
}
