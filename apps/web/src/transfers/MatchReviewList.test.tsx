// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { LowConfidenceMatch } from "../api/transfers-client.js";
import { MatchReviewList } from "./MatchReviewList.js";

afterEach(cleanup);

function match(overrides: Partial<LowConfidenceMatch["decision"]> = {}): LowConfidenceMatch {
  return {
    source: {
      id: "s1",
      title: "Mr. Brightside",
      artists: [{ name: "The Killers" }],
      durationMs: 222075,
    },
    decision: {
      candidate: {
        id: "d1",
        title: "Mr. Brightside (Live)",
        artists: [{ name: "The Killers" }],
        durationMs: 251000,
      },
      confidence: 74.3,
      method: "normalized_title_artist",
      reason: "Titles match once punctuation is ignored; durations differ by 29s.",
      risk: "medium",
      ...overrides,
    },
  };
}

describe("MatchReviewList", () => {
  it("renders nothing when every match was confident", () => {
    const { container } = render(<MatchReviewList matches={[]} />);

    // An empty "worth checking" heading is noise on the one screen that
    // must stay readable.
    expect(container.firstChild).toBeNull();
  });

  it("shows both ends of the match, not just what was chosen", () => {
    render(<MatchReviewList matches={[match()]} />);

    // The whole point of §10.4: a chosen candidate cannot be judged
    // without the track it was chosen for.
    expect(screen.getByText(/Mr\. Brightside — The Killers/)).toBeDefined();
    expect(screen.getByText(/Mr\. Brightside \(Live\) — The Killers/)).toBeDefined();
    expect(screen.getByText("From")).toBeDefined();
    expect(screen.getByText("Matched to")).toBeDefined();
  });

  it("explains the decision in words, not method names", () => {
    render(<MatchReviewList matches={[match()]} />);

    expect(
      screen.getByText(/title and artist matching once punctuation was ignored/),
    ).toBeDefined();
    // The engine's own reason is shown too — it carries the specifics.
    expect(screen.getByText(/durations differ by 29s/)).toBeDefined();
    expect(screen.getByText(/74%/)).toBeDefined();
  });

  it("says how uncertain in words as well as colour", () => {
    render(<MatchReviewList matches={[match({ risk: "high" })]} />);

    // Colour alone fails a screen reader and a colourblind user
    // (CLAUDE.md §20.3).
    expect(screen.getByText("Uncertain")).toBeDefined();
  });

  it("shows both track durations, which is often the tell", () => {
    render(<MatchReviewList matches={[match()]} />);

    expect(screen.getByText(/3:42/)).toBeDefined();
    expect(screen.getByText(/4:11/)).toBeDefined();
  });

  it("lists the alternatives the engine passed over, collapsed", () => {
    render(
      <MatchReviewList
        matches={[
          match({
            alternatives: [
              { id: "d2", title: "Mr. Brightside", artists: [{ name: "The Killers" }] },
              { id: "d3", title: "Mr Brightside", artists: [{ name: "Tribute Band" }] },
            ],
          }),
        ]}
      />,
    );

    const details = screen.getByText(/2 other candidates considered/);
    fireEvent.click(details);

    const list = details.closest("details") as HTMLElement;
    expect(within(list).getByText(/Tribute Band/)).toBeDefined();
  });

  it("omits the alternatives control when there were none", () => {
    render(<MatchReviewList matches={[match()]} />);

    expect(screen.queryByText(/candidates considered/)).toBeNull();
  });

  it("says plainly that a different version cannot be chosen yet", () => {
    render(<MatchReviewList matches={[match()]} />);

    // An absent override button would read as an oversight; saying why
    // is the honest version (CLAUDE.md §20.2).
    expect(screen.getByText(/isn't possible yet/i)).toBeDefined();
  });

  it("keeps each match distinct when one source matched several times", () => {
    render(
      <MatchReviewList
        matches={[
          match(),
          {
            ...match(),
            decision: { ...match().decision, candidate: { id: "d9", title: "Other" } },
          },
        ]}
      />,
    );

    expect(screen.getByText(/Worth checking \(2\)/)).toBeDefined();
  });
});
