import { Link } from "@tanstack/react-router";

export type InformationPageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: ReadonlyArray<{ title: string; body: string }>;
};

export function InformationPage({ content }: { content: InformationPageContent }) {
  return (
    <div className="information-page">
      <section className="information-page__hero">
        <div className="page-shell">
          <p className="page-kicker">{content.eyebrow}</p>
          <h1 className="page-title mt-3">{content.title}</h1>
          <p>{content.intro}</p>
        </div>
      </section>
      <section className="information-page__content page-shell" aria-label={content.title}>
        {content.sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
        <Link to="/marketplace" className="information-page__cta">
          Explore the marketplace
        </Link>
      </section>
    </div>
  );
}
