import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p>{t('app.tagline')}</p>
      <section>
        <h2>{t('phase.title')}</h2>
        <p>{t('phase.description')}</p>
      </section>
    </main>
  );
}
