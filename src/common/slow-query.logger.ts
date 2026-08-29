import { Logger } from '@nestjs/common';
import { AbstractLogger } from 'typeorm';
import type { LogMessage, LogLevel, LogMessageType } from 'typeorm';

const THRESHOLD_MS = 200;

/**
 * Custom TypeORM logger that integrates with NestJS Logger.
 * Logs slow queries (>200ms) at WARN level, errors at ERROR level,
 * and info queries at LOG level.
 */
export class SlowQueryLogger extends AbstractLogger {
  private readonly logger = new Logger('SlowQuery');

  /**
   * Logs slow queries with the configured threshold.
   */
  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
  ): void {
    if (time < THRESHOLD_MS) return;

    this.logger.warn(
      `[SLOW QUERY] ${time}ms - ${query}${parameters?.length ? ` | params: ${JSON.stringify(parameters)}` : ''}`,
    );
  }

  protected writeLog(
    level: LogLevel,
    message: LogMessage | string | number | (LogMessage | string | number)[],
  ): void {
    const messages = Array.isArray(message) ? message : [message];

    for (const msg of messages) {
      const text = typeof msg === 'object' ? String(msg.message) : String(msg);

      // Skip TypeORM's built-in query-slow log (we handle it in logQuerySlow)
      if (typeof msg === 'object' && msg.type === 'query-slow') continue;

      switch (level) {
        case 'warn':
          this.logger.warn(text);
          break;
        case 'error':
          this.logger.error(text);
          break;
        default:
          this.logger.debug(text);
          break;
      }
    }
  }
}
