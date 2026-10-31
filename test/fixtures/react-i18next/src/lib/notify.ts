import i18next from 'i18next';

// A plain key without a namespace falls back to the default namespace when it is looked up.
export function cancelLabel(): string {
  return i18next.t('common:cancel');
}

// Not translation calls: lookalikes, comments and object keys.
// i18next.t('commented.out')
export const lookalikes = { t: 'value', format: (value: string) => value };
export const text = lookalikes.format('not.a.key');
