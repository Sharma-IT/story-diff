import type { LogLevel, LoggerConfig } from './story-diff.types.js';

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export class Logger {
  private readonly level: LogLevel;
  private readonly customLogger?: (level: LogLevel, message: string, ...args: unknown[]) => void;

  constructor(config: LoggerConfig = {}) {
    // Stryker disable next-line StringLiteral: Equivalent mutant — LOG_LEVELS[''] is undefined, so shouldLog comparison always returns false (same as silent level 0)
    this.level = config.level ?? 'silent';
    this.customLogger = config.customLogger;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    if (this.customLogger) {
      this.customLogger(level, message, ...args);
      return;
    }

    const prefix = `[story-diff:${level}]`;
    switch (level) {
      case 'error':
        console.error(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'info':
        console.info(prefix, message, ...args);
        break;
      case 'debug':
        console.debug(prefix, message, ...args);
        break;
    }
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }
}
