/** The subset of pino's API the domain code uses, so tests can pass a silent stub. */
export interface Logger {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
  debug(obj: object | string, msg?: string): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {}, debug() {} };
