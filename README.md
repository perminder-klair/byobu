# Byōbu

A wall panel for Home Assistant: a Raspberry Pi with a touchscreen that boots straight into a
full-screen dashboard styled with Omarchy themes.

It's Arch Linux ARM with [cage](https://github.com/cage-kiosk/cage) running Chromium in kiosk
mode. Omarchy's desktop stack doesn't run here, but its `colors.toml` themes will.

Current target: Raspberry Pi 4 with the 7" Touch Display 2, rotated to landscape.

## Roadmap

1. **Boots to a browser** (done). Image builder, settings file on the boot partition, cage +
   Chromium, touch test page. Proves the display, rotation, touch and GPU on real hardware.
2. **Dashboard** (now). Home Assistant in a local container with the demo integration for development,
   and a web app on HA's WebSocket API, styled from the active Omarchy theme's `colors.toml`.
3. **Panel behaviour.** Dim and blank when idle, wake on touch without the waking tap pressing
   a button, backlight control.
4. **Robustness.** Persistent data partition, read-only root, an update command, and a theme
   that follows the desktop.

## Building an image

On an Arch host:

```sh
sudo pacman -S --needed arch-install-scripts qemu-user-static-binfmt dosfstools e2fsprogs
(cd dashboard && pnpm install && pnpm build)
sudo builder/build.sh            # writes out/byobu-YYYYMMDD.img
```

The first build downloads the ~850 MB Arch Linux ARM tarball into `cache/` and verifies its
signature. Package installs run under qemu, so expect a slow build. Delete `cache/` to pick up a
newer tarball. The panel starts out in the colours of the Omarchy theme the building desktop
has on.

Flash the image:

```sh
sudo dd if=out/byobu-YYYYMMDD.img of=/dev/sdX bs=4M conv=fsync status=progress
```

## Developing the dashboard

The dashboard (`dashboard/`) is a React app on Home Assistant's WebSocket API. Develop it on the
desktop against a Home Assistant in Docker with the demo integration's fake lights, thermostats,
locks and media players:

```sh
docker compose -f dev/compose.yaml up -d
node dev/ha-setup.mjs            # onboards it and writes dev/ha-credentials.json
cd dashboard && pnpm install && pnpm dev
```

Open http://localhost:5173 at 1280×720, the panel's size. The colours come from the desktop's
current Omarchy theme and change with it. Home Assistant's own UI is at http://localhost:8123,
with the login in `dev/ha-credentials.json`. `docker compose -f dev/compose.yaml down -v` starts
it over.

To try it on the panel, `dev/panel <panel address>` tunnels the dev server to the panel over SSH
and points the kiosk at it; saved changes show up there straight away. Ctrl-C puts the panel
back. Nothing listens on the network, so the desktop's firewall can stay as it is.

`dev/sync <panel address>` brings a running panel up to date with the checkout instead of
flashing a new image: packages, everything in `rootfs/` except the boot partition, the
dashboard build, and the desktop's current theme. Settings the panel got from `byobu.conf` are
left alone.

On the panel, darkhttpd serves the dashboard on localhost:8080 and the page talks to Home
Assistant directly. Next to the build are `config.json` and `theme.css`, symlinks into
`/etc/byobu`; `byobu-config` writes the first and `byobu-theme` makes the second from an
Omarchy `colors.toml`.

## Settings

Copy `byobu.conf.example` on the boot partition (`BYOBU`) to `byobu.conf` and fill in Wi-Fi,
SSH key, rotation and Home Assistant. It's applied on the next boot, then renamed to
`byobu.conf.applied` with the Wi-Fi password and Home Assistant token removed. To skip that step
while iterating, put a filled-in `byobu.conf` in the repo root (it's gitignored) and the builder
copies it into the image.

For Home Assistant, set `ha_url` and `ha_token`, a long-lived access token from the Security tab
of a Home Assistant profile. A user just for the panel keeps it separate from your own login.
The token ends up in `/etc/byobu/config.json`, readable only by root and the kiosk. Until Home
Assistant is set, the panel shows the touch test page.

Access is SSH as root, by key only. There's no mDNS yet, so find the panel's IP on your router.

## First boot checklist

The test page shows the viewport size and the GPU renderer, and draws a ring wherever you touch.

- [ ] Panel lights up with the test page (no image at all: check the DSI ribbon, then
      `display_auto_detect` in `config.txt`)
- [ ] Viewport reads 1280×720 (portrait 720×1280 means rotation didn't apply)
- [ ] Upside down: set `rotation = 90` instead of 270
- [ ] Rings land under your finger in all four corners (mirrored: swap the 90 and 270 matrices
      in `/usr/local/lib/byobu/touch-matrix`)
- [ ] GPU shows V3D, not SwiftShader or llvmpipe
- [ ] Wi-Fi connects and SSH works with your key
- [ ] Pull the power, boot again: no "restore pages" bubble

Logs: `journalctl -b -u byobu-config -u byobu-dashboard -u byobu-kiosk`.

## Layout

```
builder/    image builder (runs on the host, then inside the image via arch-chroot)
rootfs/     files copied into the image as-is; rootfs/boot goes onto the FAT boot partition
dashboard/  the dashboard web app
dev/        Home Assistant for development, the panel tunnel, and syncing a running panel
```
