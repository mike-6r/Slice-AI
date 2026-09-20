import { ArrowUpRight, Check, CircleDollarSign, Layers3, PieChart } from "lucide-react";
import type { CSSProperties } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_OWNERSHIP_EXAMPLE as terms,
} from "@/data/homepage-showcase";
import { exampleMoney, examplePercent, homepageExampleSelection } from "./homepage-example";

export function HomepagePortfolioExample({ count }: { count: number }) {
  const selection = homepageExampleSelection(count);
  const quantity = selection.count.toLocaleString("en-GB");
  const cost = exampleMoney(selection.costMinor);
  const share = examplePercent(selection.ownershipPercent);
  return (
    <div className="sh-portfolio__window">
      <header>
        <Layers3 aria-hidden="true" />
        <span>Collection overview</span>
        <span className="sh-tag">Illustrative portfolio</span>
      </header>
      <div className="sh-portfolio__overview">
        <div>
          <span>Example position cost</span>
          <strong data-testid="home-portfolio-cost">{cost}</strong>
          <small>Your selection from the ownership example</small>
        </div>
        <div className="sh-share-ring" style={{ "--share": share } as CSSProperties}>
          <div>
            <strong>{share}</strong>
            <span>of this card</span>
          </div>
        </div>
      </div>
      <Tabs defaultValue="positions" className="sh-example-tabs">
        <TabsList className="sh-portfolio__subnav" aria-label="Illustrative portfolio views">
          <TabsTrigger value="positions">
            Positions <b>01</b>
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="positions" className="sh-example-panel">
          <article className="sh-position">
            <div className="sh-position__image">
              <img
                className="sh-card"
                src={HOMEPAGE_FEATURED_ASSET.image}
                alt="Illustrative first edition Charizard in a PSA 10 graded slab"
                width={502}
                height={766}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="sh-position__identity">
              <span>Pokémon · Base Set · 1999</span>
              <h3>Charizard</h3>
              <span className="sh-position__grade">1st Edition · PSA 10</span>
              <dl>
                <div>
                  <dt>Slices</dt>
                  <dd data-testid="home-portfolio-slices">{quantity}</dd>
                </div>
                <div>
                  <dt>Ownership</dt>
                  <dd>{share}</dd>
                </div>
                <div>
                  <dt>Example cost</dt>
                  <dd>{cost}</dd>
                </div>
              </dl>
            </div>
          </article>
        </TabsContent>
        <TabsContent value="activity" className="sh-example-panel">
          <div className="sh-example-content">
            <div className="sh-example-heading">
              <h3>Your example, explained.</h3>
              <span className="sh-tag">Example only</span>
            </div>
            <p>
              Follow how your selection becomes a position. This is not your transaction history.
            </p>
            <ol className="sh-example-timeline">
              <li>
                <Layers3 aria-hidden="true" />
                <div>
                  <strong>
                    Quantity selected <b>{quantity} Slices</b>
                  </strong>
                  <p>Your selection out of the 1,000-Slice example.</p>
                </div>
              </li>
              <li>
                <CircleDollarSign aria-hidden="true" />
                <div>
                  <strong>
                    Example cost calculated <b>{cost}</b>
                  </strong>
                  <p>
                    {quantity} × {exampleMoney(terms.slicePriceMinor)} per Slice. No funds moved.
                  </p>
                </div>
              </li>
              <li>
                <PieChart aria-hidden="true" />
                <div>
                  <strong>
                    Ownership illustrated <b>{share}</b>
                  </strong>
                  <p>Your share of this example. No order has been placed.</p>
                </div>
              </li>
            </ol>
          </div>
        </TabsContent>
        <TabsContent value="insights" className="sh-example-panel">
          <div className="sh-example-content">
            <div className="sh-example-heading">
              <h3>See your share clearly.</h3>
              <span className="sh-tag">Example only</span>
            </div>
            <div className="sh-example-breakdown" aria-hidden="true">
              <i style={{ width: share }} />
            </div>
            <dl className="sh-example-insights">
              <div>
                <dt>Your selected share</dt>
                <dd>
                  {share}
                  <small>{quantity} Slices</small>
                </dd>
              </div>
              <div>
                <dt>Remaining example supply</dt>
                <dd>
                  {examplePercent(selection.remainingPercent)}
                  <small>{selection.remainingCount.toLocaleString("en-GB")} Slices</small>
                </dd>
              </div>
              <div>
                <dt>Example price per Slice</dt>
                <dd>{exampleMoney(terms.slicePriceMinor)}</dd>
              </div>
              <div>
                <dt>Whole example value</dt>
                <dd>{exampleMoney(terms.illustrativeValuationMinor)}</dd>
              </div>
            </dl>
            <p>
              No market history or projected returns are shown. Actual prices, fees and availability
              depend on the offering.
            </p>
          </div>
        </TabsContent>
      </Tabs>
      <div className="sh-portfolio__activity">
        <span>
          <Check aria-hidden="true" />
        </span>
        <div>
          <strong>Your example, connected.</strong>
          <p>Change the Slices above. Every view updates with your selection.</p>
        </div>
        <a href="#v2-ownership-scene" aria-label="Adjust the ownership example">
          <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
      <footer>
        <span>No real holdings or returns shown</span>
        <span>Illustration only</span>
      </footer>
    </div>
  );
}
