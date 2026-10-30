// The manual's chapters in reading order. A chapter's file is content/manual/<slug>.mdx, and the
// first one is the manual's front page.
export type Chapter = { slug: string; title: string; summary: string };
export type Part = { name: string; chapters: Chapter[] };

export const PARTS: Part[] = [
  {
    name: "Start",
    chapters: [
      { slug: "welcome", title: "Welcome", summary: "What Byōbu is, what you need, and how far along it is." },
      { slug: "getting-started", title: "Getting started", summary: "Build an image, flash it and bring the panel up." },
      { slug: "settings-file", title: "The settings file", summary: "Every line of byobu.conf." },
      { slug: "first-boot", title: "First boot checks", summary: "Prove the display, touch, GPU and network on new hardware." },
    ],
  },
  {
    name: "Using it",
    chapters: [
      { slug: "faces", title: "Faces", summary: "What the screen shows the room." },
      { slug: "home-screen", title: "Home screen and tiles", summary: "Apps, widgets, and tapping and holding tiles." },
      { slug: "idle-and-night", title: "Idle, dim and night", summary: "What it does as a room goes quiet." },
      { slug: "sound", title: "Sound", summary: "Speakers, AirPlay and Spotify Connect." },
      { slug: "timers", title: "Timers", summary: "Countdowns that wake the screen." },
      { slug: "your-phone", title: "Your phone", summary: "Pairing the phone app." },
      { slug: "themes", title: "Themes", summary: "Omarchy's themes, and following your desktop." },
    ],
  },
  {
    name: "Connecting things",
    chapters: [
      { slug: "home-assistant", title: "Home Assistant", summary: "Your rooms, lights, locks and cameras." },
      { slug: "weather-and-calendars", title: "Weather and calendars", summary: "Without Home Assistant." },
      { slug: "assistant", title: "The assistant", summary: "Asking it to do things." },
      { slug: "voice", title: "Voice", summary: "Hold to talk, the wake phrase and speech servers." },
    ],
  },
  {
    name: "Looking after it",
    chapters: [
      { slug: "power-and-updates", title: "Power cuts and updates", summary: "The read-only root and byobu-update." },
      { slug: "security", title: "Security", summary: "Who can reach it, and what leaves it." },
      { slug: "troubleshooting", title: "Troubleshooting", summary: "Logs, and what to try." },
    ],
  },
  {
    name: "Building on it",
    chapters: [
      { slug: "writing-a-plugin", title: "Writing a plugin", summary: "A folder, a manifest and plain data." },
      { slug: "developing", title: "Developing", summary: "Working on the shell and byobud." },
    ],
  },
];

export const CHAPTERS = PARTS.flatMap(({ chapters }) => chapters);

export const FRONT = CHAPTERS[0];

export const hrefOf = ({ slug }: Chapter) => (slug === FRONT.slug ? "/manual/" : `/manual/${slug}/`);
