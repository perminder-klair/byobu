#!/bin/bash
# Runs inside the image under arch-chroot, after the rootfs overlay and packages are in.
set -euo pipefail

# The tarball ships alarm/alarm and root/root logins. Byōbu only accepts SSH keys
# (ssh_key in byobu.conf).
userdel -r alarm 2>/dev/null || true
passwd -l root >/dev/null

# The kiosk runs as an unprivileged user with no login shell.
useradd -m -G video,render,input,audio -s /usr/bin/nologin byobu

systemctl enable avahi-daemon.service byobu-config.service byobud.service byobu-kiosk.service \
  iwd.service nqptp.service sshd.service
systemctl set-default graphical.target

# byobu-config does first-boot setup, so systemd-firstboot's console prompt would only hold up
# boot until it gives up. iwd brings up Wi-Fi without networkd, so networkd's wait-online times
# out on an unplugged Ethernet port. Its only user is the archlinux-keyring WKD refresh, and
# ALARM packages are signed by archlinuxarm-keyring instead.
systemctl mask systemd-firstboot.service systemd-networkd-wait-online.service \
  archlinux-keyring-wkd-sync.timer

# The kiosk user's services, like PipeWire, run from boot rather than from the first login.
mkdir -p /var/lib/systemd/linger
touch /var/lib/systemd/linger/byobu

# Lets names like homeassistant.local resolve.
sed -i 's/^hosts: mymachines resolve/hosts: mymachines mdns_minimal [NOTFOUND=return] resolve/' /etc/nsswitch.conf

# Each flashed panel generates its own machine-id and SSH host keys on first boot.
echo uninitialized > /etc/machine-id
rm -f /etc/ssh/ssh_host_*
