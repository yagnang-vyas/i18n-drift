import { t } from '../i18n';

// Keys such as `notifications.sent` are passed in from the server, so they cannot be seen here.
// They are declared in `dynamicKeyPatterns` in i18n-drift.config.json instead.
export function notify(key: string): string {
  return t(key);
}
