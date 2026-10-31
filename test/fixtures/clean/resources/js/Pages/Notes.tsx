import { t } from '../i18n';

export default function Notes() {
  return (
    <section>
      <p>{t('messages.sync.done')}</p>
      <button>{t('messages.ok')}</button>
      <button>{t('Delete note')}</button>
    </section>
  );
}
