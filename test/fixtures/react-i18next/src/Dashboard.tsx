import { Trans, useTranslation } from 'react-i18next';

export function Dashboard({ metric }: { metric: string }) {
  const { t } = useTranslation('dashboard');

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>
        <Trans i18nKey="intro">
          Welcome to <strong>your dashboard</strong>.
        </Trans>
      </p>
      <p>{t('stats.revenue')}</p>
      <p>{t(`stats.${metric}`)}</p>
      <p>{t('empty')}</p>
      <p>{t('nothing', { ns: 'dashboard' })}</p>
      <button>{t('common:save')}</button>
    </main>
  );
}
