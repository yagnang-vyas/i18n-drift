import { t } from '../i18n';

// t('commented.out') inside a line comment must not be counted.
/* t('commented.block') neither. */
const format = (value: string) => value.trim();
const labels = { t: 'export', title: 'not a translation' };

export default function Dashboard() {
  const heading = format('not.a.key');
  const note = "t('inside.a.string')";

  return (
    <main>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.subtitle')}</p>
      <button title={labels.title}>{t('messages.export_csv')}</button>
      <small>{heading}{note}</small>
      <aside>{t('admin/users.title')}</aside>
    </main>
  );
}
