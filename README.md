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
sudo builder/build.sh            # writes out/byobu-YYYYMMDD.img
```

The first build downloads the ~850 MB Arch Linux ARM tarball into `cache/` and verifies its
signature. Package installs run under qemu, so expect a slow build. Delete `cache/` to pick up a
newer tarball.

Flash the image:

```sh
sudo dd if=out/byobu-YYYYMMDD.img of=/dev/sdX bs=4M conv=fsync status=progress
```

## Settings

Copy `byobu.conf.example` on the boot partition (`BYOBU`) to `byobu.conf` and fill in Wi-Fi,
SSH key and rotation. It's applied on the next boot, then renamed to `byobu.conf.applied` with
the Wi-Fi password removed. To skip that step while iterating, put a filled-in `byobu.conf` in
the repo root (it's gitignored) and the builder copies it into the image.

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

Logs: `journalctl -b -u byobu-config -u byobu-kiosk`.

## Layout

```
builder/   image builder (runs on the host, then inside the image via arch-chroot)
rootfs/    files copied into the image as-is; rootfs/boot goes onto the FAT boot partition
```
