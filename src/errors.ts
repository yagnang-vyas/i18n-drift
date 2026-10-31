/** An error caused by the user's input or project; reported without a stack trace (exit code 2). */
export class UserError extends Error {
  override name: string = 'UserError';
}

/** An invalid configuration value; the message always names the JSON path of the problem. */
export class ConfigError extends UserError {
  override name = 'ConfigError';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
