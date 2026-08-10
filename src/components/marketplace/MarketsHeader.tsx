export function MarketsHeader() {
  return (
    <section className="markets-shell markets-header" aria-labelledby="markets-heading">
      <div className="markets-intro-copy">
        <p className="markets-eyebrow">Markets</p>
        <h1 id="markets-heading" aria-label="Discover. Analyse. Invest.">
          <span aria-hidden="true">Discover.</span>
          <span aria-hidden="true">Analyse.</span>
          <span aria-hidden="true">Invest.</span>
        </h1>
        <p>Published collectible assets and their available market data.</p>
      </div>
    </section>
  );
}
