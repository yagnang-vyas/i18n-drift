import { useForm } from '@inertiajs/react';
import { t } from '../../i18n';

export default function Login() {
  const { data, setData, post } = useForm({ email: '', password: '' });

  return (
    <form onSubmit={(event) => { event.preventDefault(); post('/login'); }}>
      <h1>{t('Sign in')}</h1>
      <label>{t('Email')}</label>
      <input value={data.email} onChange={(e) => setData('email', e.target.value)} />
      <p role="alert">{t('auth.failed')}</p>
      <button type="button">{t('Dismiss')}</button>
    </form>
  );
}
