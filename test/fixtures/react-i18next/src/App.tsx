import { useTranslation } from 'react-i18next';

type Props = { name: string; count: number };

export function App({ name, count }: Props) {
  const { t } = useTranslation('common');

  return (
    <nav>
      <button>{t('save')}</button>
      <button>{t('cancel')}</button>
      <a href="/">{t('nav.home')}</a>
      <a href="/settings">{t('nav.settings')}</a>
      <p>{t('greeting', { name })}</p>
      <p>{t('items', { count })}</p>
    </nav>
  );
}
