/**
 * The only file with anything personal in it. Search for FILL_ME.
 * Keep it short — the game does the talking.
 */

export const SITE = {
  name: "Daniel Tong",
  event: "TreeHacks",
  year: 2027,

  /** Printed on the cartridge label and the console body. */
  cartridge: "TREE CLIMB",

  /** Revealed when a player reaches the top. No jokes here. */
  pitch:
    "FILL_ME — One or two sentences. Why you want to be at TreeHacks, and the specific thing you want to build there.",

  links: [
    { label: "github", href: "FILL_ME" },
    { label: "email", href: "FILL_ME" },
  ],
} as const;

export const liveLinks = () =>
  SITE.links.filter((l) => l.href && !l.href.startsWith("FILL_ME"));

export const unfilled = (s: string) => s.trimStart().startsWith("FILL_ME");
