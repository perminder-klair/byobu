# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Byōbu is a wall display OS for a Raspberry Pi 4 with a touchscreen: Arch Linux ARM running cage and
Chromium, showing a React shell fed by a local Node service. `README.md` covers usage, building an
image, writing a plugin and first boot checks, and its Developing section covers the dev Home
Assistant, `dev/panel` and `dev/sync`.

## Commands

`byobud/`, `shell/` and `site/` are separate pnpm packages with no workspace, and `panel/` is a
Rust crate, so run these inside each one.

```sh
# byobud/
pnpm test                                                   # everything
node --test src/core.test.ts                                # one file
node --test --test-name-pattern="pair" src/clients.test.ts  # one test by name
pnpm typecheck
pnpm dev                                                    # API on :8080, state in dev/state

# shell/
pnpm typecheck
pnpm dev                                                    # :5173, proxies /api to byobud

# site/
pnpm typecheck
pnpm dev                                                    # :3000
pnpm build
pnpm capture                                                # retakes public/shots
pnpm themes                                                 # regenerates the palettes

# panel/
cargo test
cargo run                                                   # a window, talking to byobud on :8080
cargo check --features kms                                  # the build for the panel itself
```

- Only byobud and `panel/` have tests. There's no linter or formatter, so `pnpm typecheck` in both
  packages is the check for any change, and `cargo test` for the panel.
- `dev/fixture-home` runs byobud on throwaway state with the site's fixture home, which is the
  quickest thing to point `panel/` at.
- Reach for `pnpm typecheck` over `pnpm build` in byobud: the build also runs `builder/fetch-voice`,
  a large download the first time (cached in `~/.cache/byobu/voice`).
- View the panel at http://localhost:5173 at 1280×720, and the phone app at `/phone`. Port 8080
  serves the last build in `shell/dist`, without your edits.
- Tests build real plugin folders in a temporary directory (`pluginFolder` in `core.test.ts`). The
  assistant's run the real SDK against a local stand-in that replays scripted responses.

## Architecture

Plugins run inside byobud and publish plain data, and clients draw it. `byobud/src/protocol.ts` is
the contract between them, and `byobud/src/plugin.ts` is what a plugin is handed.

- **Publishing.** A plugin publishes everything every time. `Core.publish` compares by value and
  emits only what changed, per id for keyed lists.
- **Reaching clients.** `/api/events` sends a `Snapshot`, then `Update`s, over server-sent events.
  `shell/src/store.ts` applies them and holds the selectors components read. The shell takes only
  types from byobud.
- **Acting.** Everything a client shows carries its plugin (`Placed<T>`), and actions go back to
  that plugin through `POST /api/plugins/:id/actions/:action`.
- **Lifecycle.** Changing a plugin's settings stops and restarts it, so `host.settings` is fixed
  for the life of an instance. `host.store()` keeps data across restarts.
- **Integrations stay in plugins.** `shell/` and `protocol.ts` are neutral about any one service,
  and Home Assistant is optional. Faces and apps appear once they have data (`useFaces`, `useApps`).

### What changes together

- New `PluginData` field: `protocol.ts` and a selector in `shell/src/store.ts`. For a list keyed by
  id, also `KEYED` in `core.ts` and `KeyedData` in `protocol.ts`.
- Anything the native panel draws: `panel/src/protocol.rs` when its type changes in `protocol.ts`.
- New `Section` type: `shell/src/Sheet.tsx` and `fromSection` in `plugins/assistant/devices.ts`.
- New face: `FACES` in `shell/src/faces.tsx`, `PANEL_DEFAULTS.faces` in `byobud/src/settings.ts` and
  `faceNames` in `plugins/assistant/devices.ts`.
- New built-in plugin: `build.mjs` bundles the `index.ts` of any folder with a `manifest.json`.
  Anything else a plugin ships needs its own copy step there, as `listen.py` has.
- Anything a user would notice: `README.md`, which every feature commit updates.

### Trust

- Tokens stay in byobud. `secret` settings go through `redact` on the way out and `applyValues` on
  the way in, both in `settings.ts`.
- The API in `server.ts` answers localhost (the kiosk, and Vite's proxy in development) and paired
  clients. `/api/pair` is the only open route, and starting a pairing is localhost-only because
  standing at the panel is the proof. Requiring JSON in `readBody` is what stops cross-site forms,
  so a new write route reads its body through it.
- `sensitive` on a `Button` limits the assistant to offering a Confirm button, so nothing the model
  reads can open a door. Mark locks, garages and the like `sensitive`, and leave `tap` off their
  tile so they only happen from the sheet.

### Assistant

`plugins/assistant` is an ordinary plugin built on `host.world()` and `host.perform()`. `devices.ts`
derives its controls from tiles and their sheets, so any plugin's devices work with nothing extra.

`listen.py` holds the microphone in a child process, with JSON lines out and one-word commands in
(`ears.ts`). Hearing needs the `voice/` folder that `builder/fetch-voice` puts in `dist`, holding
aarch64 wheels, so `canHear` is false under `pnpm dev`.

### Shell

A Pi gets about 16 ms a frame and has a weak main thread, so motion runs on the compositor. Swipes
are native scrolling with snap points, and `Shell.tsx` keeps scroll position and React state in step
in both directions. The far and near views change layout once, then animate with transforms
(`morph.ts`). The Developing section of `README.md` says how to measure this.

`power.ts` holds the near, far, dim and blank states outside React. It swallows the touch that wakes
the screen, so waking never presses what's under the finger. Call `wake()` for anything as good as a
tap.

Colours come from the active Omarchy theme: `theme.css` supplies the palette at runtime, and
`styles.css` maps it onto roles like `--window`, `--raised`, `--border` and `--text-dim`. Build from
those roles, as every theme has to work, light or dark.

`Phone.tsx` is the phone app, sharing the store and parts with its own layout. `power.ts` runs on
the panel only.

### Native panel

`panel/` is replacing Chromium and the shell on the panel's screen, a piece at a time, and isn't in
the image yet. It's one more client of byobud, so nothing in byobud or a plugin changes for it, and
the shell stays as the phone app.

- `ui/*.slint` is the screens and `src/main.rs` fills their properties. The store is updated on
  the thread that reads events and drawn on Slint's, with `request_render` folding a burst of
  updates into one redraw and `sync` changing only the rows that differ.
- `src/protocol.rs` mirrors `byobud/src/protocol.ts` by hand, only as far as what's drawn, and
  skips what it doesn't know.
- `src/theme.rs` reads the same `theme.css` and derives the same roles as `styles.css`, mixing in
  oklab as the browser does. Screens build from the `Theme` global.
- Slint has no scroll snapping, so swiping between pages is `SwipeGestureHandler` in
  `ui/panel.slint`.
- `BYOBU_SCRIPT` (`src/script.rs`) taps, swipes and saves pictures, which is how to see a change
  where there's no display. Under Xvfb, `SLINT_BACKEND=winit-software` needs no GPU.

### On the panel

- Boot runs `byobu-firstboot` (first boot only), `byobu-config` (when `/boot/byobu.conf` exists),
  byobud, then the kiosk: cage, `byobu-session`, Chromium.
- Root is read-only from the second boot on. Everything that changes lives in `/data`, bind-mounted
  over `PATHS` in `byobu-firstboot`, so new writable state goes in one of those, usually
  `/var/lib/byobu`. `/etc/byobu` stays on root, so writing there takes `mount -o remount,rw /`
  first, as `byobu-config` and `dev/sync` do.
- Two copies of the app can exist. `byobud-start` prefers `/data/app/current`, from `byobu-update`,
  over `/usr/local/share/byobu`, from the image or `dev/sync`, which removes `current` so the
  checkout's build runs.
- `dev/sync` copies `rootfs/` except `rootfs/boot` and `rootfs/etc/byobu`. Changing `rootfs/boot`
  takes a new image.
- byobud runs as the `byobu` user inside the sandbox in `byobud.service` (`ProtectSystem=strict`, no
  `/home`, restricted address families), and whatever a plugin spawns inherits it. A plugin writes
  to `host.directory`. System packages go in `builder/packages.txt`, and device access comes from
  the udev rules in `rootfs/etc/udev/rules.d`.

### Site

`site/` is the public website and manual. Pages are all static, with chapters as MDX in
`content/manual/`, listed in order in `lib/chapters.ts`. It's drawn in the shell's own vocabulary
(`Win`, tiles, the 3 by 5 block type) and is meant to stay inspired by omarchy.org, not a copy of it.

- Its screenshots are the real shell, taken by `scripts/capture.mjs` driving byobud on throwaway
  state. Run it when the shell's look changes. It uses `scripts/fixture/` and `scripts/art.mjs` in
  place of Home Assistant's demo and the Omarchy wallpapers, whose pictures aren't ours to publish
  (a Family Guy still, a video thumbnail, a wallpaper marked Capcom), so keep them out of anything
  public.
- `app/themes.css` and `lib/themes.ts` are generated by `scripts/themes.mjs`. Every theme has to pass
  4.5:1, which is why `--text-dim` and `--action` differ from the shell's.
- The manual states what's been proven: keep its notes about stand-ins true as things get tested,
  and check facts against the code, as `README.md` isn't generated from it or the other way round.
- `next dev` writes `site/AGENTS.md` by itself. Its docs for this version are in
  `node_modules/next/dist/docs/`.

## Conventions

- byobud runs its TypeScript directly under Node, so imports carry `.ts` and only erasable syntax
  works, which `tsconfig.json` enforces. The shell goes through Vite and imports without extensions.
- Comments explain why, in plain sentences, and most files open with one saying what the file is for.
- Commits are one per feature, with an imperative title and a prose body saying what changed, how
  it was tested and what wasn't.
