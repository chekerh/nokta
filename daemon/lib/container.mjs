/**
 * Nokta Service Container
 * Provides dependency injection via a registry pattern.
 * Replaces direct `new Class()` instantiation in server.mjs
 * with `container.get('name')` calls.
 *
 * Usage in server.mjs:
 *   const container = new ServiceContainer({ log, projectRoot });
 *   container.register('providerManager', () => new ProviderManager({ log }));
 *   const pm = container.get('providerManager');
 *
 * All registered services are lazily instantiated on first get().
 */
export class ServiceContainer {
  constructor(options = {}) {
    this.log = options.log || globalThis.LOGGER || { info() {}, warn() {}, error() {} };
    this.projectRoot = options.projectRoot || process.cwd();
    this._factories = new Map(); // name -> factory function
    this._instances = new Map(); // name -> instantiated instance
  }

  /**
   * Register a factory function for a service.
   * The factory receives the container itself (for further get() calls).
   */
  register(name, factory) {
    if (this._factories.has(name)) {
      throw new Error(`Service "${name}" already registered`);
    }
    this._factories.set(name, factory);
    this._instances.delete(name); // clear cached instance
  }

  /**
   * Get a registered service, instantiating it on first access.
   * Factories are called once and the result is cached.
   */
  get(name) {
    if (this._instances.has(name)) {
      return this._instances.get(name);
    }
    if (!this._factories.has(name)) {
      throw new Error(`Service "${name}" not registered`);
    }
    const factory = this._factories.get(name);
    const instance = factory(this);
    this._instances.set(name, instance);
    return instance;
  }

  /**
   * Check if a service is registered.
   */
  has(name) {
    return this._factories.has(name);
  }

  /**
   * Register and immediately get a service (convenience).
   */
  registerAndGet(name, factory) {
    this.register(name, factory);
    return this.get(name);
  }

  /**
   * Reset all instances (useful for testing).
   */
  reset() {
    this._instances.clear();
  }
}
