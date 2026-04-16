import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '../logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Requirement: Logger defaults to silent mode
  // Case: happy-path
  // Invariant: No console output when logger is created without configuration
  it('defaults to silent mode when no config provided', () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger();

    // Act
    logger.info('test message');
    logger.error('error message');

    // Assert
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  // Requirement: Logger respects explicit log level configuration
  // Case: happy-path
  // Invariant: Only logs at or above the configured level
  it('logs at info level when explicitly configured', () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger({ level: 'info' });

    // Act
    logger.info('test message');

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith('[story-diff:info]', 'test message');
  });

  // Requirement: Logger filters messages based on log level
  // Case: boundary
  // Invariant: Silent level suppresses all output including errors
  it('suppresses all output at silent level', () => {
    // Arrange
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'silent' });

    // Act
    logger.info('info message');
    logger.error('error message');

    // Assert
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Requirement: Logger filters messages based on log level
  // Case: happy-path
  // Invariant: Error level only logs errors, not info or warn
  it('only logs errors at error level', () => {
    // Arrange
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'error' });

    // Act
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    // Assert
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[story-diff:error]', 'error message');
  });

  // Requirement: Logger filters messages based on log level
  // Case: happy-path
  // Invariant: Warn level logs errors and warnings, but not info
  it('logs errors and warnings at warn level', () => {
    // Arrange
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'warn' });

    // Act
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    // Assert
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[story-diff:warn]', 'warn message');
    expect(errorSpy).toHaveBeenCalledWith('[story-diff:error]', 'error message');
  });

  // Requirement: Logger filters messages based on log level
  // Case: happy-path
  // Invariant: Debug level logs all messages including debug
  it('logs all messages at debug level', () => {
    // Arrange
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ level: 'debug' });

    // Act
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    // Assert
    expect(debugSpy).toHaveBeenCalledWith('[story-diff:debug]', 'debug message');
    expect(infoSpy).toHaveBeenCalledWith('[story-diff:info]', 'info message');
    expect(warnSpy).toHaveBeenCalledWith('[story-diff:warn]', 'warn message');
    expect(errorSpy).toHaveBeenCalledWith('[story-diff:error]', 'error message');
  });

  // Requirement: Logger supports custom logger functions
  // Case: happy-path
  // Invariant: Custom logger receives all log calls with correct parameters
  it('delegates to custom logger when provided', () => {
    // Arrange
    const customLogger = vi.fn();
    const logger = new Logger({ level: 'info', customLogger });

    // Act
    logger.info('test message', 'arg1', 'arg2');

    // Assert
    expect(customLogger).toHaveBeenCalledWith('info', 'test message', 'arg1', 'arg2');
  });

  // Requirement: Logger supports additional arguments
  // Case: happy-path
  // Invariant: All arguments are passed through to console methods
  it('passes additional arguments to console logger', () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger({ level: 'info' });

    // Act
    logger.info('message', { key: 'value' }, 123);

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith('[story-diff:info]', 'message', { key: 'value' }, 123);
  });

  // Requirement: Custom logger respects log level filtering
  // Case: happy-path
  // Invariant: Custom logger only receives messages at or above configured level
  it('filters messages for custom logger based on level', () => {
    // Arrange
    const customLogger = vi.fn();
    const logger = new Logger({ level: 'error', customLogger });

    // Act
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    // Assert
    expect(customLogger).toHaveBeenCalledTimes(1);
    expect(customLogger).toHaveBeenCalledWith('error', 'error message');
  });
});
