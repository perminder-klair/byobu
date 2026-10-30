// Pixel art for the screenshots, drawn here so everything on the site is ours to publish: a
// wallpaper in any theme's colours, an album cover and two camera views.
import { ridgePath } from "../lib/ridges.ts";

function rgb(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

export function mix(from, to, amount) {
  const [a, b] = [rgb(from), rgb(to)];
  return `#${a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// A grid of cells written out as runs, so a scene stays a small file.
function scene(columns, rows, paint) {
  const cells = Array.from({ length: rows }, () => new Array(columns).fill(""));
  const fill = (x, y, width, height, colour) => {
    for (let row = Math.max(0, y); row < Math.min(rows, y + height); row++) {
      for (let column = Math.max(0, x); column < Math.min(columns, x + width); column++) cells[row][column] = colour;
    }
  };
  paint(fill);
  let rects = "";
  cells.forEach((row, y) => {
    for (let x = 0; x < columns; ) {
      let end = x + 1;
      while (end < columns && row[end] === row[x]) end++;
      if (row[x]) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${row[x]}"/>`;
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns} ${rows}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">${rects}</svg>`;
}

const disc = (fill, cx, cy, radius, colour) => {
  for (let y = -radius; y <= radius; y++) {
    const half = Math.round(Math.sqrt((radius + 0.5) ** 2 - y * y));
    fill(cx - half, cy + y, half * 2 + 1, 1, colour);
  }
};

export function wallpaper({ background, blue, cyan, magenta, accent }) {
  const sky = [mix(background, blue, 0.55), mix(background, magenta, 0.42), mix(background, accent, 0.3)];
  const bands = sky.map((colour, i) => `<rect y="${i * 8}" width="160" height="${8 + (i + 1) * 4}" fill="${colour}"/>`).join("");
  const ridge = (seed, base, height, colour) => `<path fill="${colour}" d="${ridgePath({ seed, columns: 160, rows: 90, base, height })}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges"><rect width="160" height="90" fill="${mix(background, cyan, 0.3)}"/>${bands}${ridge(1.2, 40, 14, mix(background, blue, 0.34))}${ridge(4.1, 56, 12, mix(background, cyan, 0.24))}${ridge(7.3, 72, 9, mix(background, "#000000", 0.2))}</svg>`;
}

export function album() {
  return scene(32, 32, (fill) => {
    ["#1b2a49", "#2b3a67", "#4a4e7e", "#7d5a86", "#c97b6e", "#e9a66f"].forEach((colour, i) => fill(0, i * 4 - (i ? 1 : 0), 32, 5, colour));
    disc(fill, 21, 16, 6, "#f6d28b");
    fill(0, 21, 32, 11, "#16324f");
    for (let y = 22; y < 32; y += 2) fill(0, y, 32, 1, "#1c4566");
    [[17, 22, 9], [18, 24, 7], [19, 26, 5], [20, 28, 3]].forEach(([x, y, width]) => fill(x, y, width, 1, "#e9a66f"));
    [[0, 15, 7], [3, 13, 4], [7, 17, 5], [10, 19, 4]].forEach(([x, y, width]) => fill(x, y, width, 21 - y, "#1b2a49"));
  });
}

function frontDoor() {
  return scene(96, 54, (fill) => {
    fill(0, 0, 96, 54, "#3a4152");
    for (let y = 0; y < 48; y += 3) {
      fill(0, y, 96, 1, "#343a4a");
      for (let x = y % 2 ? 0 : 6; x < 96; x += 12) fill(x, y, 1, 3, "#343a4a");
    }
    disc(fill, 34, 14, 15, "#4c5163");
    disc(fill, 34, 14, 9, "#5e6274");
    fill(33, 12, 3, 4, "#f2d9a0");
    fill(38, 8, 20, 42, "#1f242e");
    fill(40, 10, 16, 40, "#7a4b3a");
    fill(42, 12, 12, 8, "#a8c0cc");
    fill(47, 12, 2, 8, "#7a4b3a");
    [[42, 23], [42, 36]].forEach(([x, y]) => fill(x, y, 12, 10, "#6a4032"));
    fill(53, 32, 2, 3, "#d8b866");
    fill(0, 48, 96, 6, "#565d6d");
    fill(0, 48, 96, 1, "#6a7182");
    fill(36, 50, 24, 2, "#2c3140");
    fill(64, 42, 8, 7, "#a0583e");
    [[63, 34, 10], [65, 30, 6], [62, 38, 12]].forEach(([x, y, width]) => fill(x, y, width, 4, "#4a6b4f"));
    fill(66, 32, 3, 5, "#5d8562");
  });
}

function garden() {
  return scene(96, 54, (fill) => {
    ["#27304a", "#303a58", "#3d4768", "#55597b"].forEach((colour, i) => fill(0, i * 6, 96, 7, colour));
    disc(fill, 76, 8, 4, "#dcd7ba");
    fill(0, 22, 96, 12, "#4b3f36");
    for (let x = 0; x < 96; x += 6) fill(x, 20, 1, 14, "#3b312a");
    fill(0, 34, 96, 20, "#2f4a3a");
    for (let y = 36; y < 54; y += 4) fill(0, y, 96, 2, "#345340");
    [[40, 48, 16], [38, 50, 20], [36, 52, 24]].forEach(([x, y, width]) => fill(x, y, width, 2, "#6d6a60"));
    fill(16, 16, 4, 22, "#3a2c24");
    [[8, 8, 20, 6], [6, 12, 24, 6], [10, 4, 16, 6], [9, 16, 18, 4]].forEach(([x, y, width, height]) => fill(x, y, width, height, "#2c4a38"));
    [[12, 7, 6], [20, 11, 7], [13, 14, 8]].forEach(([x, y, width]) => fill(x, y, width, 2, "#38604a"));
    fill(66, 18, 22, 18, "#5b4a3c");
    [[64, 16, 26], [66, 14, 22], [68, 12, 18]].forEach(([x, y, width]) => fill(x, y, width, 2, "#3a3030"));
    fill(74, 25, 7, 11, "#3d3229");
    fill(69, 22, 3, 4, "#a8c0cc");
  });
}

export const camera = (name) => (name === "garden" ? garden() : frontDoor());
