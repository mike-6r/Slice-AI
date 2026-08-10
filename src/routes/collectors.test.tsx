import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CollectorSearch } from "./collectors";

describe("collector search", () => {
  it("renders a labelled public-search control with room for its query", () => {
    const html = renderToStaticMarkup(
      <CollectorSearch query="Charizard" onQueryChange={vi.fn()} />,
    );

    expect(html).toContain('class="collectors-search"');
    expect(html).toContain('aria-label="Search public collectors"');
    expect(html).toContain('value="Charizard"');
  });
});
