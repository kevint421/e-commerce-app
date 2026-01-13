/**
 * Structured Logger for Lambda Functions
 * Provides consistent logging across all services
 */

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
  }
  
  interface LogContext {
    requestId?: string;
    userId?: string;
    orderId?: string;
    customerId?: string;
    [key: string]: any;
  }
  
  class Logger {
    private context: LogContext = {};
    private logLevel: LogLevel;
  
    constructor() {
      // Set from environment or default to INFO
      const envLevel = process.env.LOG_LEVEL?.toUpperCase() as LogLevel;
      this.logLevel = envLevel || LogLevel.INFO;
    }
  
    /**
     * Set persistent context for all subsequent logs
     */
    setContext(context: LogContext): void {
      this.context = { ...this.context, ...context };
    }
  
    /**
     * Clear all context
     */
    clearContext(): void {
      this.context = {};
    }
  
    /**
     * Debug level logging
     */
    debug(message: string, data?: any): void {
      if (this.shouldLog(LogLevel.DEBUG)) {
        this.log(LogLevel.DEBUG, message, data);
      }
    }
  
    /**
     * Info level logging
     */
    info(message: string, data?: any): void {
      if (this.shouldLog(LogLevel.INFO)) {
        this.log(LogLevel.INFO, message, data);
      }
    }
  
    /**
     * Warning level logging
     */
    warn(message: string, data?: any): void {
      if (this.shouldLog(LogLevel.WARN)) {
        this.log(LogLevel.WARN, message, data);
      }
    }
  
    /**
     * Error level logging
     */
    error(message: string, error?: Error | any, data?: any): void {
      if (this.shouldLog(LogLevel.ERROR)) {
        const errorData = error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...data,
            }
          : { error, ...data };
  
        this.log(LogLevel.ERROR, message, errorData);
      }
    }
  
    /**
     * Log with custom level
     */
    private log(level: LogLevel, message: string, data?: any): void {
      const logEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...this.context,
        ...(data && { data }),
      };
  
      // Use console methods for CloudWatch integration
      switch (level) {
        case LogLevel.DEBUG:
        case LogLevel.INFO:
          console.log(JSON.stringify(logEntry));
          break;
        case LogLevel.WARN:
          console.warn(JSON.stringify(logEntry));
          break;
        case LogLevel.ERROR:
          console.error(JSON.stringify(logEntry));
          break;
      }
    }
  
    /**
     * Check if should log at this level
     */
    private shouldLog(level: LogLevel): boolean {
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
      const currentLevelIndex = levels.indexOf(this.logLevel);
      const messageLevelIndex = levels.indexOf(level);
      return messageLevelIndex >= currentLevelIndex;
    }
  
    /**
     * Create a child logger with additional context
     */
    child(context: LogContext): Logger {
      const childLogger = new Logger();
      childLogger.context = { ...this.context, ...context };
      childLogger.logLevel = this.logLevel;
      return childLogger;
    }
  }
  
  // Export singleton instance
  export const logger = new Logger();
  
  // Export class for testing
  export { Logger };
  
  /**
   * Usage Examples:
   * 
   * // Basic logging
   * logger.info('Order created', { orderId: 'order-123' });
   * 
   * // Set context for request
   * logger.setContext({ requestId: event.requestContext.requestId });
   * logger.info('Processing request');
   * 
   * // Error logging
   * try {
   *   await processOrder();
   * } catch (error) {
   *   logger.error('Failed to process order', error, { orderId: 'order-123' });
   * }
   * 
   * // Child logger
   * const orderLogger = logger.child({ orderId: 'order-123' });
   * orderLogger.info('Starting payment processing');
   * orderLogger.info('Payment completed');
   */
  