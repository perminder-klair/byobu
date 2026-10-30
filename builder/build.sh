#!/bin/bash
# Builds a flashable Byōbu image for the Raspberry Pi 4 from the Arch Linux ARM tarball.
#
#   sudo builder/build.sh [output.img]
#
# Host needs arch-install-scripts, qemu-user-static-binfmt, dosfstools and e2fsprogs.
# If ./byobu.conf exists it is copied onto the boot partition, so the image comes up configured.
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
CACHE_DIR=$ROOT_DIR/cache
OUTPUT=${1:-$ROOT_DIR/out/byobu-$(date +%Y%m%d).img}
IMAGE_SIZE=6G
BOOT_SIZE=512MiB

TARBALL_URL=http://os.archlinuxarm.org/os/ArchLinuxARM-rpi-aarch64-latest.tar.gz
TARBALL=$CACHE_DIR/${TARBALL_URL##*/}
# Arch Linux ARM Build System <builder@archlinuxarm.org>, which signs the tarball.
ALARM_KEY=68B3537F39A313B3E574D06777193F152BDBE6A6

die() { echo "build: $*" >&2; exit 1; }
step() { echo "==> $*"; }

[[ $EUID -eq 0 ]] || die "run as root: sudo $0"
for cmd in arch-chroot bsdtar curl gpg losetup mkfs.ext4 mkfs.vfat sfdisk; do
  command -v "$cmd" >/dev/null || die "missing $cmd"
done
grep -q '^flags: .*F' /proc/sys/fs/binfmt_misc/qemu-aarch64 2>/dev/null \
  || die "qemu-aarch64 binfmt is not registered (pacman -S qemu-user-static-binfmt)"
# Building these needs the user's own Node setup, so it isn't done here as root.
[[ -f $ROOT_DIR/shell/dist/index.html && -f $ROOT_DIR/byobud/dist/byobud.mjs ]] \
  || die "build these first: (cd shell && pnpm install && pnpm build) and the same in byobud"

# The tarball and its signature are cached together. Delete cache/ to pick up a newer tarball.
if [[ ! -f $TARBALL ]]; then
  step "Downloading Arch Linux ARM tarball"
  mkdir -p "$CACHE_DIR"
  curl -fL -o "$TARBALL.part" "$TARBALL_URL"
  curl -fsL -o "$TARBALL.sig" "$TARBALL_URL.sig"
  mv "$TARBALL.part" "$TARBALL"
fi

step "Verifying tarball signature"
GPG_HOME=$(mktemp -d)
gpg --homedir "$GPG_HOME" --batch --quiet --keyserver hkps://keyserver.ubuntu.com --recv-keys "$ALARM_KEY"
if ! gpg --homedir "$GPG_HOME" --batch --quiet --verify "$TARBALL.sig" "$TARBALL"; then
  rm -f "$TARBALL" "$TARBALL.sig"
  die "bad signature; removed the cached tarball, run again to re-download"
fi
gpgconf --homedir "$GPG_HOME" --kill all
rm -rf "$GPG_HOME"

step "Creating $OUTPUT"
mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"
truncate -s "$IMAGE_SIZE" "$OUTPUT"
# Partitions are found by PARTUUID, so the same image boots from SD card or USB.
DISK_ID=$(od -An -N4 -tx4 /dev/urandom | tr -d ' \n')
sfdisk --quiet "$OUTPUT" <<EOF
label: dos
label-id: 0x$DISK_ID
size=$BOOT_SIZE, type=c
type=83
EOF

# Keep the desktop's automounter off the image's partitions, or it mounts them as soon as
# they're formatted and the loop device can't be detached afterwards.
UDEV_RULE=/run/udev/rules.d/90-byobu-build.rules
mkdir -p "$(dirname "$UDEV_RULE")"
echo 'SUBSYSTEM=="block", KERNEL=="loop*", ENV{UDISKS_IGNORE}="1", ENV{UDISKS_AUTO}="0"' > "$UDEV_RULE"
udevadm control --reload

LOOP=$(losetup --find --show --partscan "$OUTPUT")
MNT=$(mktemp -d)
cleanup() {
  umount -R "$MNT" 2>/dev/null || true
  losetup -d "$LOOP" || true
  rmdir "$MNT" || true
  rm -f "$UDEV_RULE"
  udevadm control --reload
}
trap cleanup EXIT
udevadm settle

mkfs.vfat -F 32 -n BYOBU "${LOOP}p1" >/dev/null
mkfs.ext4 -q -L byobu-root "${LOOP}p2"
mount "${LOOP}p2" "$MNT"

step "Unpacking root filesystem"
bsdtar -xpf "$TARBALL" -C "$MNT"
# Unpacking straight onto FAT trips over ownership and permissions, so move /boot over after.
mv "$MNT/boot" "$MNT/boot.tarball"
mkdir "$MNT/boot"
mount "${LOOP}p1" "$MNT/boot"
cp -r "$MNT/boot.tarball/." "$MNT/boot/"
rm -rf "$MNT/boot.tarball"

# /boot/config.txt belongs to linux-rpi, so the boot overlay goes in after the packages.
step "Copying rootfs overlay"
for dir in "$ROOT_DIR"/rootfs/*/; do
  [[ $(basename "$dir") == boot ]] || cp -r --preserve=mode "$dir" "$MNT/"
done

step "Copying shell and byobud"
mkdir -p "$MNT/usr/local/share/byobu"
cp -r "$ROOT_DIR/shell/dist" "$MNT/usr/local/share/byobu/shell"
cp -r "$ROOT_DIR/byobud/dist" "$MNT/usr/local/share/byobu/byobud"
# The panel starts out in the theme of the Omarchy desktop that built it, if there is one, with
# the rest of that desktop's themes to choose from in Settings.
HOME_DIR=$(getent passwd "${SUDO_USER:-root}" | cut -d: -f6)
OMARCHY=$HOME_DIR/.local/state/omarchy/current
if [[ -d $HOME_DIR/.local/share/omarchy/themes ]]; then
  "$ROOT_DIR/builder/export-themes" "$HOME_DIR/.local/share/omarchy/themes" "$ROOT_DIR/cache/themes"
  cp -r "$ROOT_DIR/cache/themes" "$MNT/usr/local/share/byobu/themes"
fi
if [[ -f $OMARCHY/theme/colors.toml ]]; then
  "$ROOT_DIR/rootfs/usr/local/bin/byobu-theme" < "$OMARCHY/theme/colors.toml" > "$MNT/etc/byobu/theme.css"
  magick "$OMARCHY/background" -resize '1280x720^' -gravity center -extent 1280x720 -strip -quality 80 \
    "$MNT/etc/byobu/wallpaper.jpg"
fi

step "Installing packages (slow: this runs under qemu)"
mkdir -p "$MNT/root/byobu-build"
cp "$ROOT_DIR"/builder/{packages.txt,stage-packages.sh,stage-configure.sh} "$MNT/root/byobu-build/"
arch-chroot "$MNT" bash /root/byobu-build/stage-packages.sh

step "Writing boot configuration"
cp -r "$ROOT_DIR/rootfs/boot/." "$MNT/boot/"
echo "root=PARTUUID=$DISK_ID-02 rw rootwait console=serial0,115200 console=tty1 fsck.repair=yes" > "$MNT/boot/cmdline.txt"
cat > "$MNT/etc/fstab" <<EOF
# <device>             <dir>  <type>  <options>         <dump> <pass>
PARTUUID=$DISK_ID-01  /boot  vfat    defaults,noatime  0      2
EOF
if [[ -f $ROOT_DIR/byobu.conf ]]; then
  cp "$ROOT_DIR/byobu.conf" "$MNT/boot/byobu.conf"
fi

step "Configuring system"
arch-chroot "$MNT" bash /root/byobu-build/stage-configure.sh
rm -rf "$MNT/root/byobu-build"

if [[ -n ${SUDO_USER:-} ]]; then
  chown "$SUDO_USER:" "$OUTPUT"
fi
step "Done: $OUTPUT"
echo "Flash it with: sudo dd if=$OUTPUT of=/dev/sdX bs=4M conv=fsync status=progress"
