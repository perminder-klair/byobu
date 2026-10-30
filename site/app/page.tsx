import { mdiCalendarBlankOutline, mdiCastAudioVariant, mdiHomeOutline, mdiMessageTextOutline, mdiTimerOutline, mdiWeatherPartlyCloudy } from "@mdi/js";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Ridges, Sun } from "@/components/Ridges";
import { Screen } from "@/components/Screen";
import { Shot } from "@/components/Shot";
import { ThemePicker } from "@/components/ThemePicker";
import { Win } from "@/components/Win";
import { Wordmark } from "@/components/Wordmark";

const PLUGINS = [
  { name: "Home Assistant", about: "Lights, climate, locks, blinds, media and cameras, in your rooms.", icon: mdiHomeOutline, tone: "yellow" },
  { name: "Open-Meteo", about: "Weather with no account and no Home Assistant.", icon: mdiWeatherPartlyCloudy, tone: "cyan" },
  { name: "Calendar link", about: "Events from a private .ics link, as Google, Apple and Fastmail share them.", icon: mdiCalendarBlankOutline, tone: "blue" },
  { name: "AirPlay and Spotify", about: "It shows up as Byobu, and what's playing appears on Now Playing.", icon: mdiCastAudioVariant, tone: "magenta" },
  { name: "Timers", about: "They count down in the bar, then wake the screen and chime until dismissed.", icon: mdiTimerOutline, tone: "red" },
  { name: "Assistant", about: "It uses whatever the others offer, without being taught.", icon: mdiMessageTextOutline, tone: "green" },
];

const MANIFEST = `{
  "schemaVersion": 1,
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "description": "A tile that counts its taps.",
  "enabledByDefault": true,
  "schema": [
    { "key": "label", "type": "string",
      "label": "Label", "defaultValue": "Hello" }
  ]
}`;

const PLUGIN = `export default (host) => {
  let taps = 0;
  const publish = () => {
    host.publish({
      tiles: [{
        id: "counter",
        name: String(host.settings.label),
        icon: "M12,2L2,22H22Z",
        tone: "green",
        active: taps > 0,
        detail: \`\${taps} taps\`,
        tap: { id: "tap" },
      }],
    });
  };
  publish();
  host.status("ok");
  return {
    act(id) {
      if (id === "tap") taps++;
      publish();
    },
  };
};`;

const BUILD = `sudo pacman -S --needed arch-install-scripts qemu-user-static-binfmt \\
  dosfstools e2fsprogs imagemagick

(cd shell && pnpm install && pnpm build)
(cd byobud && pnpm install && pnpm build)
sudo builder/build.sh            # writes out/byobu-YYYYMMDD.img

sudo dd if=out/byobu-YYYYMMDD.img of=/dev/sdX bs=4M conv=fsync status=progress`;

const NEED = ["A Raspberry Pi 4", 'The 7" Touch Display 2', "An SD card", "An Arch Linux machine to build on"];

export default function Home() {
  return (
    <>
      <header className="hero">
        <Sun />
        <Ridges />
        <div className="hero-text">
          <h1>
            <Wordmark />
          </h1>
          <div>
            <p className="lede">A wall display OS for a Raspberry Pi with a touchscreen.</p>
            <p className="dim">Faces for the room, a home screen for your hand, in the look of Omarchy.</p>
            <div className="cta">
              <Link className="button primary" href="#build">Build it</Link>
              <Link className="button" href="/manual/">Read the manual</Link>
            </div>
          </div>
        </div>
        <Screen />
      </header>

      <section className="section" id="distance" aria-labelledby="distance-title">
        <div className="tiled">
          <Win title="left alone" number={1} className="words span-5">
            <h2 id="distance-title">Readable from the sofa, useful at arm&apos;s length</h2>
            <p>
              Left alone for 45 seconds it goes back to the room: whatever was open closes, and it shows the far view, one or two big windows you can read from across the
              room.
            </p>
            <p>A tap brings the near view back. That tap only wakes it, so it can&apos;t press what was under your finger.</p>
          </Win>
          <Shot name="far-music" title="far" number={2} className="span-7" alt="The far view: album art and the song title, large enough to read across a room." />
          <Shot name="music" title="near" number={3} className="span-6" sizes="(min-width: 900px) 600px, 100vw" alt="The near view of Now Playing, with the panel's bar and playback buttons back." />
          <Shot name="night" title="night" number={4} className="span-6" sizes="(min-width: 900px) 600px, 100vw" alt="Night mode: the Modular face drawn in red on black." />
        </div>
        <p className="aside dim">It dims after 5 minutes and turns off after 30. Night mode runs from 22:00 to 07:00 unless you change it.</p>
      </section>

      <section className="section" id="home" aria-labelledby="home-title">
        <div className="tiled">
          <Shot name="home" title="home screen" number={1} focused className="span-8" alt="The home screen: a rail of recent apps, widgets for music, weather and the next event, and a grid of apps." />
          <Win title="your hand" number={2} className="words span-4">
            <h2 id="home-title">A home screen for your hand</h2>
            <p>Swipe up from any face for your apps, with widgets beside them and a rail that&apos;s always one tap from home.</p>
            <p>An app only appears once there&apos;s something to fill it, so a home without cameras has no cameras app.</p>
          </Win>
          <Win title="tiles" number={3} className="words span-4">
            <h3>Tap, or press and hold</h3>
            <p>A tap switches a light, plays or pauses, or moves a blind. Press and hold for the rest: brightness and colour, fan speed, thermostat modes, blind position, volume.</p>
          </Win>
          <Shot name="sheet-light" title="hold" number={4} className="span-4" sizes="(min-width: 900px) 400px, 100vw" alt="A light's sheet, with brightness, colour temperature and colour sliders." />
          <Shot name="sheet-lock" title="secure" number={5} className="span-4" sizes="(min-width: 900px) 400px, 100vw" alt="The front door's sheet, with separate Lock and Unlock buttons." />
        </div>
        <p className="aside dim">Unlocking a lock and opening a garage door only happen from the sheet, so brushing the screen can&apos;t do them.</p>
      </section>

      <section className="section" id="plugins" aria-labelledby="plugins-title">
        <div className="section-head">
          <h2 id="plugins-title">Everything on it comes from plugins</h2>
          <p>Home Assistant is one of them, and the panel works without it. Tokens stay in byobud, the service on the panel, so the browser never holds one.</p>
        </div>
        <div className="plugins">
          {PLUGINS.map(({ name, about, icon, tone }) => (
            <div key={name} className="tile" style={{ "--tone": `var(--${tone})` } as React.CSSProperties}>
              <Icon path={icon} />
              <h3>{name}</h3>
              <p>{about}</p>
            </div>
          ))}
        </div>
        <div className="tiled">
          <Win title="plain data" number={1} className="words span-5">
            <h3>Writing one takes a folder</h3>
            <p>A plugin is a manifest and an index file. It publishes plain data and the shell draws it, so it needs no interface of its own and can&apos;t look out of place in any theme.</p>
            <p>Its settings page is built from the manifest. Drop the folder in <code>/var/lib/byobu/installed/</code>, restart byobud, and it&apos;s there.</p>
            <p>
              <Link href="/manual/writing-a-plugin/">Writing a plugin</Link>
            </p>
          </Win>
          <Win title="index.mjs" number={2} className="code span-7 tall">
            <pre>
              <code>{PLUGIN}</code>
            </pre>
          </Win>
          <Win title="manifest.json" number={3} className="code span-5">
            <pre>
              <code>{MANIFEST}</code>
            </pre>
          </Win>
        </div>
      </section>

      <section className="section" id="themes" aria-labelledby="themes-title">
        <div className="section-head">
          <h2 id="themes-title">Every Omarchy theme</h2>
          <p>
            The panel starts out in the theme of the desktop that built it, with that desktop&apos;s others in Settings. On an Omarchy desktop, <code>dev/follow-theme</code> keeps it in step with
            yours, wallpaper included.
          </p>
          <p className="dim">Pick one. That&apos;s the real panel in each, and this page follows.</p>
        </div>
        <ThemePicker />
      </section>

      <section className="section" id="phone" aria-labelledby="phone-title">
        <div className="tiled">
          <Win title="nothing to install" number={1} className="words span-6">
            <h2 id="phone-title">Your phone is the remote</h2>
            <p>
              Scan a code on the panel and your phone opens an app the panel serves: your rooms and tiles, Now Playing and timers, volume, brightness, theme and faces, and every plugin&apos;s
              settings, with your own keyboard for the long ones.
            </p>
            <p>A code works once, for five minutes, and only the panel can make one, so getting in takes standing in front of it.</p>
            <p>
              <Link href="/manual/your-phone/">Your phone</Link>
            </p>
          </Win>
          <Shot phone name="phone-home" title="home" number={2} className="span-2" sizes="(min-width: 900px) 200px, 100vw" alt="The phone app's Home tab, with tiles for the Living Room." />
          <Shot phone name="phone-now" title="now" number={3} className="span-2" sizes="(min-width: 900px) 200px, 100vw" alt="The phone app's Now tab, with what's playing and the running timers." />
          <Shot phone name="phone-panel" title="panel" number={4} className="span-2" sizes="(min-width: 900px) 200px, 100vw" alt="The phone app's Panel tab, with the panel's volume, brightness, theme and faces." />
        </div>
      </section>

      <section className="section" id="assistant" aria-labelledby="assistant-title">
        <div className="tiled">
          <Shot name="ask-confirm" title="ask byōbu" number={1} focused className="span-7" alt="The assistant saying the front door needs a person, above the door's tile and a Confirm button." />
          <Win title="assistant" number={2} className="words span-5">
            <h2 id="assistant-title">Ask it, or just say it</h2>
            <p>Add an Anthropic API key and a prompt appears on the home screen and your phone. The tile it changed shows under its answer.</p>
            <p>Opening a lock or a garage only ever gets you a Confirm button, however it&apos;s asked, so nothing it reads can open your door.</p>
            <p>Using it is billed to your key, and what you ask goes to Anthropic.</p>
          </Win>
          <Win title="voice" number={3} className="words span-12">
            <p>
              Plug in a microphone to hold and talk, or turn on a wake phrase and say it from across the room. Listening for the phrase happens on the panel, and nothing leaves until it&apos;s heard.{" "}
              <Link href="/manual/voice/">Voice</Link>
            </p>
          </Win>
        </div>
      </section>

      <section className="section" id="power" aria-labelledby="power-title">
        <div className="section-head">
          <h2 id="power-title">It will lose power, so that&apos;s allowed for</h2>
        </div>
        <div className="tiled">
          <Win title="read-only" number={1} className="words span-4">
            <p>The first boot moves everything that changes onto a data partition. From then on the system is read-only, so pulling the plug can&apos;t damage it.</p>
          </Win>
          <Win title="updates" number={2} className="words span-4">
            <p>An update checks its download, installs beside the current version, and goes back by itself if the new one isn&apos;t answering within 45 seconds.</p>
          </Win>
          <Win title="watchdog" number={3} className="words span-4">
            <p>If the system hangs, the Pi&apos;s hardware watchdog restarts it. If the data partition ever fails, it still boots and answers SSH.</p>
          </Win>
        </div>
      </section>

      <section className="section" id="build" aria-labelledby="build-title">
        <div className="tiled">
          <Win title="you'll need" number={1} className="words span-4">
            <h2 id="build-title">Build it</h2>
            <ul>
              {NEED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>
              <Link href="/manual/getting-started/">Getting started</Link>
            </p>
          </Win>
          <Win title="on an arch host" number={2} className="code span-8">
            <pre>
              <code>{BUILD}</code>
            </pre>
          </Win>
          <Win title="where it's up to" number={3} focused className="words span-12">
            <p>
              Byōbu is early. There&apos;s no download yet, so you build the image yourself, and it has only run on one panel so far. AirPlay, Spotify, voice, the assistant and pairing a phone have
              been tried with stand-ins rather than the real things, and recent changes to the image builder have only been tried on a running panel, not a freshly flashed one.
            </p>
          </Win>
        </div>
      </section>
    </>
  );
}
