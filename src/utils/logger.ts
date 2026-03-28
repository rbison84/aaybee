/**
 * Logging utility with severity levels
 * Only logs in development mode unless explicitly configured otherwise
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  minLevel: LogLevel;
  enabledInProduction: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default config: only errors in production
const config: LoggerConfig = {
  minLevel: __DEV__ ? 'debug' : 'error',
  enabledInProduction: false,
};

function shouldLog(level: LogLevel): boolean {
  // In production, only log if explicitly enabled or if it's an error
  if (!__DEV__ && !config.enabledInProduction && level !== 'error') {
    return false;
  }
  return LOG_LEVELS[level] >= LOG_LEVELS[config.minLevel];
}

function formatMessage(tag: string, message: string, ...args: unknown[]): [string, ...unknown[]] {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const prefix = __DEV__ ? `[${timestamp}] [${tag}]` : `[${tag}]`;
  return [`${prefix} ${message}`, ...args];
}

/**
 * Logger instance
 * Usage:
 *   logger.debug('MyComponent', 'Processing item', { id: 123 });
 *   logger.info('Store', 'State updated');
 *   logger.warn('API', 'Retrying request');
 *   logger.error('Auth', 'Login failed', error);
 */
export const logger = {
  debug(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.log(...formatMessage(tag, message, ...args));
    }
  },

  info(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(...formatMessage(tag, message, ...args));
    }
  },

  warn(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(...formatMessage(tag, message, ...args));
    }
  },

  error(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(...formatMessage(tag, message, ...args));
    }
  },

  /**
   * Configure the logger
   * @param newConfig Partial config to merge
   */
  configure(newConfig: Partial<LoggerConfig>): void {
    Object.assign(config, newConfig);
  },

  /**
   * Create a tagged logger for a specific module
   * Usage:
   *   const log = logger.create('MyComponent');
   *   log.debug('Processing...');
   */
  create(tag: string) {
    return {
      debug: (message: string, ...args: unknown[]) => this.debug(tag, message, ...args),
      info: (message: string, ...args: unknown[]) => this.info(tag, message, ...args),
      warn: (message: string, ...args: unknown[]) => this.warn(tag, message, ...args),
      error: (message: string, ...args: unknown[]) => this.error(tag, message, ...args),
    };
  },
};

export default logger;
