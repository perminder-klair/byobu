// Sets the panel's backlight. 0 turns it off. Anywhere without one, like a desktop, does nothing.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BACKLIGHTS = "/sys/class/backlight";

export function setBacklight(percent: number) {
  try {
    const [name] = readdirSync(BACKLIGHTS);
    if (!name) return;
    const max = Number(readFileSync(join(BACKLIGHTS, name, "max_brightness"), "utf8"));
    // A low percentage shouldn't round down to off.
    const level = percent === 0 ? 0 : Math.max(1, Math.floor((percent * max) / 100));
    writeFileSync(join(BACKLIGHTS, name, "brightness"), String(level));
  } catch (error) {
    console.error("Setting the backlight failed:", error);
  }
}
