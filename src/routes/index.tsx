import { createFileRoute } from "@tanstack/react-router";
import { CinematicHomepageStory } from "@/components/home/CinematicHomepageStory";
import homepageCss from "@/components/home/homepage.css?url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Slice — A new way to own the collectibles you love" },
      {
        name: "description",
        content:
          "One real collectible. A new way to own it. Discover Slice, explore how fractional ownership works, and follow your collection in one portfolio.",
      },
    ],
    links: [{ rel: "stylesheet", href: homepageCss }],
  }),
  component: CinematicHomepageStory,
});
