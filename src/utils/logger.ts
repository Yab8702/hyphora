import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(level: string = 'info'): Logger {
  return pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  });
}
