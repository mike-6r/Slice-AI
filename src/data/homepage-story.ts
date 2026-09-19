export const HOME_CHAPTERS = [
  { id: "v2-hero-scene", label: "Discover" },
  { id: "v2-ownership-scene", label: "Ownership" },
  { id: "v2-lifecycle-scene", label: "The journey" },
  { id: "v2-portfolio-scene", label: "Portfolio" },
  { id: "v2-real-market-scene", label: "Explore" },
] as const;

export const HOME_JOURNEY = [
  {
    label: "Reserve",
    title: "Your interest becomes a reservation.",
    copy: "For a pre-sale offering, choose a quantity and review its terms before reserving. A reservation is conditional; it is not settled ownership.",
    detail: "Start with the offering terms, price and any conditions.",
    next: "The collectible enters physical intake.",
  },
  {
    label: "Receive",
    title: "The physical card enters the story.",
    copy: "The collector sends the item through the intake process. Receipt and supporting evidence are recorded against the same asset.",
    detail: "One asset record connects the submission to its physical intake.",
    next: "Identity and condition are reviewed.",
  },
  {
    label: "Verify",
    title: "The details need to line up.",
    copy: "The review checks the collectible’s identity, grade, condition and evidence against the submission. Exceptions need resolving before the asset can progress.",
    detail: "Read the published evidence and verification details for each asset.",
    next: "Custody and offering readiness are confirmed.",
  },
  {
    label: "Custody",
    title: "One card. A recorded chain of custody.",
    copy: "Custody details are recorded for the physical collectible. The card stays whole while its ownership and offering are prepared.",
    detail: "Check each asset’s custody information and applicable terms.",
    next: "The offering can progress when its requirements are met.",
  },
  {
    label: "Market",
    title: "Ready is a status. Not a promise.",
    copy: "Ownership is finalized only when the offering’s requirements are met. An enabled market may support buy and sell orders; availability and execution depend on the market.",
    detail: "A published asset is not automatically open for trading.",
    next: "Settled positions appear in your portfolio.",
  },
  {
    label: "Portfolio",
    title: "Now you can follow what you own.",
    copy: "Your settled Slices, cost basis and available valuation appear together in Portfolio. Reservations, orders and available cash keep their own clear statuses.",
    detail: "See the position, its history and the actions available to you.",
    next: "Keep exploring. Build a collection that feels like you.",
  },
] as const;

export const HOME_QUESTIONS = [
  {
    question: "What am I actually buying?",
    answer:
      "Slices represent an ownership position tied to a particular collectible, subject to its offering terms. Read the asset details, total supply, rights, fees and conditions before deciding. The examples on this page explain the concept; they are not an offer to buy the featured Charizard.",
  },
  {
    question: "Does the physical card get split up?",
    answer:
      "No. The physical collectible stays whole. It is the ownership position that is divided into units. Each published asset provides its own identity, evidence and custody information.",
  },
  {
    question: "Is reserving the same as owning?",
    answer:
      "No. A pre-sale reservation is conditional. Ownership is finalized only after the offering requirements are satisfied. Your account keeps pending commitments separate from settled positions.",
  },
  {
    question: "Can I sell my Slices whenever I want?",
    answer:
      "Only where trading is enabled and the asset’s rules permit it. A sell order needs a matching buyer and may not fill. Market access, price and liquidity are not guaranteed.",
  },
  {
    question: "How do I get my own collectible on Slice?",
    answer:
      "Sign in and start a listing. Submit the item’s identity, images and supporting details. You can follow review and any next actions in your collector workspace. Submission does not guarantee approval or publication.",
  },
  {
    question: "Are these prices and positions real?",
    answer:
      "The interactive story uses a clearly labeled £10,000 collectible with 1,000 Slices at £10 each. It is a teaching example, not a valuation or available offering. The marketplace section separately shows catalogue data when available; check each asset for current terms and status.",
  },
] as const;
