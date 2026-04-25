import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '../logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to silent mode when no config provided', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger();

    logger.info('test message');
    logger.error('error message');

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs at info level when explicitly configured', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger({ level: 'info' });

    logger.info('test message');

    expect(consoleSpy).toHaveBeenCalledWith('[story-diff:info]', 'test message');
  });

  it('suppresses all output at silent level', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'silent' });

    logger.info('info message');
    logger.error('error message');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('only logs errors at error level', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'error' });

    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[story-diff:error]', 'error message');
  });

  it('logs errors and warnings at warn level', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'warn' });

    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[story-diff:warn]', 'warn message');
    expect(errorSpy).toHaveBeenCalledWith('[story-diff:error]', 'error message');
  });

  it('logs all messages at debug level', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'debug' });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(debugSpy).toHaveBeenCalledWith('[story-diff:debug]', 'debug message');
    expect(infoSpy).toHaveBeenCalledWith('[story-diff:info]', 'info message');
    expect(warnSpy).toHaveBeenCalledWith('[story-diff:warn]', 'warn message');
    expect(errorSpy).toHaveBeenCalledWith('[story-diff:error]', 'error message');
  });

  it('delegates to custom logger when provided', () => {
    const customLogger = vi.fn();
    const logger = new Logger({ level: 'info', customLogger });

    logger.info('test message', 'arg1', 'arg2');

    expect(customLogger).toHaveBeenCalledWith('info', 'test message', 'arg1', 'arg2');
  });

  it('passes additional arguments to console logger', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger({ level: 'info' });

    logger.info('message', { key: 'value' }, 123);

    expect(consoleSpy).toHaveBeenCalledWith('[story-diff:info]', 'message', { key: 'value' }, 123);
  });

  it('filters messages for custom logger based on level', () => {
    const customLogger = vi.fn();
    const logger = new Logger({ level: 'error', customLogger });

    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(customLogger).toHaveBeenCalledTimes(1);
    expect(customLogger).toHaveBeenCalledWith('error', 'error message');
  });

  it('honors default silent level even when empty config is provided', () => {
    const logger = new Logger({});
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('wont be logged');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('default level is exactly silent (not empty string) when level is undefined', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Explicitly pass undefined level (same as omitting it)
    const logger = new Logger({ level: undefined });

    logger.error('error');
    logger.warn('warn');
    logger.info('info');
    logger.debug('debug');

    // With 'silent' (level 0), nothing should log
    // With '' (undefined level), behaviour would be different
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });
});
