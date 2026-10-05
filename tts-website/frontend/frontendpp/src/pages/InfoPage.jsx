import { Link } from 'react-router-dom';
import { SITE_PAGES, sitePagePath, sitePageSeo } from '../lib/sitePages';
import useSeo from '../hooks/useSeo';
import NotFoundPage from './NotFoundPage';

export default function InfoPage({ slug }) {
  const page = SITE_PAGES.find((item) => item.slug === slug);

  if (!page) return <NotFoundPage />;

  return <InfoPageContent page={page} />;
}

function InfoPageContent({ page }) {
  useSeo(sitePageSeo(page));

  return (
    <article className="info-page">
      <Link to="/" className="back-link">← Audio &amp; Voice</Link>
      <h1>{page.heading}</h1>
      <p className="info-page-intro">{page.intro}</p>
      {page.sections.map((section) => (
        <section
          key={section.title}
          aria-labelledby={`info-${section.title.toLowerCase().replaceAll(' ', '-')}`}
        >
          <h2 id={`info-${section.title.toLowerCase().replaceAll(' ', '-')}`}>{section.title}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
      <nav className="info-page-links" aria-label="Related site information">
        {SITE_PAGES.filter((item) => item.slug !== page.slug).map((item) => (
          <Link key={item.slug} to={sitePagePath(item)}>{item.title}</Link>
        ))}
      </nav>
    </article>
  );
}
