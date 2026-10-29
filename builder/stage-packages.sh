#!/bin/bash
# Runs inside the image under arch-chroot: swaps in the Raspberry Pi kernel and installs
# Byōbu's packages.
set -euo pipefail

# pacman's download sandbox (Landlock, seccomp) is unreliable under qemu-user emulation.
PACMAN=(pacman --noconfirm --disable-sandbox)

pacman-key --init
pacman-key --populate archlinuxarm
"${PACMAN[@]}" -Sy --needed archlinuxarm-keyring

# The stock tarball boots a mainline kernel through U-Boot. Byōbu uses the Raspberry Pi
# kernel instead: the firmware boots it directly, and it ships the Touch Display 2 overlay.
for pkg in linux-aarch64 uboot-raspberrypi; do
  if pacman -Q "$pkg" &>/dev/null; then
    pacman --noconfirm -Rdd "$pkg"
  fi
done

mapfile -t packages < <(grep -Ev '^[[:space:]]*(#|$)' /root/byobu-build/packages.txt)
"${PACMAN[@]}" -Syu --needed "${packages[@]}"

rm -rf /var/cache/pacman/pkg/*
# A lingering gpg-agent keeps the image busy and blocks unmounting.
gpgconf --homedir /etc/pacman.d/gnupg --kill all
