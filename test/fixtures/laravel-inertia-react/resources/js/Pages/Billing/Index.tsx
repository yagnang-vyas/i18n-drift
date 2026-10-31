import { t } from '../../i18n';

type Invoice = { id: number; status: string; daysLate: number };

const statusLabel = (status: string) => t(`status.${status}`);

export default function Billing({ invoices, labelKey }: { invoices: Invoice[]; labelKey: string }) {
  return (
    <section>
      <h1>{t('billing.title')}</h1>
      <h2>{t(labelKey)}</h2>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            {statusLabel(invoice.status)}
            {invoice.daysLate > 0 && <em>{t('billing.invoice_overdue', { days: invoice.daysLate })}</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}
