// The palette, read from the same theme.css the shell loads, and the colour roles derived from it
// the way shell/src/styles.css does, so any Omarchy theme works here too.
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

const NIGHT_RED: Rgb = rgb(0xc9, 0x3a, 0x2e);

const fn rgb(r: u8, g: u8, b: u8) -> Rgb {
    Rgb { r, g, b }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Palette {
    pub background: Rgb,
    pub foreground: Rgb,
    pub accent: Rgb,
    pub red: Rgb,
    pub yellow: Rgb,
    pub green: Rgb,
    pub cyan: Rgb,
    pub blue: Rgb,
    pub magenta: Rgb,
    pub orange: Option<Rgb>,
    // Red on black, which has roles of its own rather than ones mixed from the palette.
    pub night: bool,
}

// Omarchy's Kanagawa, for when theme.css can't be loaded.
impl Default for Palette {
    fn default() -> Self {
        Palette {
            background: rgb(0x1f, 0x1f, 0x28),
            foreground: rgb(0xdc, 0xd7, 0xba),
            accent: rgb(0xdc, 0xd7, 0xba),
            red: rgb(0xc3, 0x40, 0x43),
            yellow: rgb(0xc0, 0xa3, 0x6e),
            green: rgb(0x76, 0x94, 0x6a),
            cyan: rgb(0x6a, 0x95, 0x89),
            blue: rgb(0x7e, 0x9c, 0xd8),
            magenta: rgb(0x95, 0x7f, 0xb8),
            orange: None,
            night: false,
        }
    }
}

impl Palette {
    // Reads lines like `--bright-red: #e82424;`. Anything a theme leaves out keeps the fallback.
    pub fn from_css(css: &str) -> Palette {
        let mut found = HashMap::new();
        for line in css.lines() {
            let Some((name, value)) = line.trim().strip_prefix("--").and_then(|rest| rest.split_once(':')) else { continue };
            if let Some(colour) = parse_colour(value.trim().trim_end_matches(';')) {
                found.insert(name.trim().to_string(), colour);
            }
        }
        let fallback = Palette::default();
        let get = |name: &str, otherwise: Rgb| found.get(name).copied().unwrap_or(otherwise);
        Palette {
            background: get("background", fallback.background),
            foreground: get("foreground", fallback.foreground),
            accent: get("accent", fallback.accent),
            red: get("red", fallback.red),
            yellow: get("yellow", fallback.yellow),
            green: get("green", fallback.green),
            cyan: get("cyan", fallback.cyan),
            blue: get("blue", fallback.blue),
            magenta: get("magenta", fallback.magenta),
            orange: found.get("orange").copied(),
            night: false,
        }
    }

    // Red on black, so a screen in a dark room doesn't light it up: :root[data-night] in the shell's
    // styles.css. Colours a plugin gives a tile itself, like a lamp's, stay as they are.
    pub fn night() -> Palette {
        let red = NIGHT_RED;
        Palette {
            background: rgb(0, 0, 0),
            foreground: red,
            accent: red,
            red,
            yellow: red,
            green: red,
            cyan: red,
            blue: red,
            magenta: red,
            orange: Some(red),
            night: true,
        }
    }

    pub fn raised(&self) -> Rgb {
        if self.night { rgb(0x1c, 0x07, 0x05) } else { mix(self.background, self.foreground, 0.10) }
    }

    pub fn border(&self) -> Rgb {
        if self.night { rgb(0x4a, 0x14, 0x0f) } else { mix(self.background, self.foreground, 0.30) }
    }

    pub fn text_dim(&self) -> Rgb {
        if self.night { rgb(0x8f, 0x28, 0x20) } else { mix(self.background, self.foreground, 0.62) }
    }

    // Not every theme has an orange.
    pub fn heat(&self) -> Rgb {
        self.orange.unwrap_or_else(|| mix(self.red, self.yellow, 0.5))
    }

    // A theme colour's name, or any colour for something with its own, like a light.
    pub fn tone(&self, tone: &str) -> Rgb {
        match tone {
            "accent" => self.accent,
            "red" => self.red,
            "yellow" => self.yellow,
            "green" => self.green,
            "cyan" => self.cyan,
            "blue" => self.blue,
            "magenta" => self.magenta,
            "heat" => self.heat(),
            other => parse_colour(other).unwrap_or(self.accent),
        }
    }

    // What a tile that's on is filled with.
    pub fn tinted(&self, tone: Rgb) -> Rgb {
        mix(self.background, tone, 0.22)
    }
}

// The forms plugins send: #rgb, #rrggbb, and rgb() with spaces or commas.
pub fn parse_colour(text: &str) -> Option<Rgb> {
    let text = text.trim();
    if let Some(hex) = text.strip_prefix('#') {
        let digits: Vec<u8> = hex.chars().map(|c| c.to_digit(16).map(|d| d as u8)).collect::<Option<_>>()?;
        return match digits.len() {
            3 | 4 => Some(rgb(digits[0] * 17, digits[1] * 17, digits[2] * 17)),
            6 | 8 => Some(rgb(digits[0] * 16 + digits[1], digits[2] * 16 + digits[3], digits[4] * 16 + digits[5])),
            _ => None,
        };
    }
    let inside = text.strip_prefix("rgb(").or_else(|| text.strip_prefix("rgba("))?.strip_suffix(')')?;
    let mut parts = inside.split(|c: char| c == ',' || c == '/' || c.is_whitespace()).filter(|part| !part.is_empty());
    let mut channel = || parts.next()?.parse::<f32>().ok().map(|value| value.round().clamp(0.0, 255.0) as u8);
    Some(rgb(channel()?, channel()?, channel()?))
}

fn to_linear(channel: u8) -> f32 {
    let c = channel as f32 / 255.0;
    if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
}

fn from_linear(c: f32) -> u8 {
    let c = c.clamp(0.0, 1.0);
    let encoded = if c <= 0.0031308 { c * 12.92 } else { 1.055 * c.powf(1.0 / 2.4) - 0.055 };
    (encoded * 255.0).round() as u8
}

fn to_oklab(colour: Rgb) -> [f32; 3] {
    let (r, g, b) = (to_linear(colour.r), to_linear(colour.g), to_linear(colour.b));
    let l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b).cbrt();
    let m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b).cbrt();
    let s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b).cbrt();
    [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ]
}

fn from_oklab([l, a, b]: [f32; 3]) -> Rgb {
    let l_ = (l + 0.3963377774 * a + 0.2158037573 * b).powi(3);
    let m_ = (l - 0.1055613458 * a - 0.0638541728 * b).powi(3);
    let s_ = (l - 0.0894841775 * a - 1.2914855480 * b).powi(3);
    rgb(
        from_linear(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
        from_linear(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
        from_linear(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_),
    )
}

// CSS's color-mix(in oklab, from, to amount), which is how the shell derives its roles.
pub fn mix(from: Rgb, to: Rgb, amount: f32) -> Rgb {
    let (a, b) = (to_oklab(from), to_oklab(to));
    from_oklab([0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * amount))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_colours_byobu_theme_writes() {
        let palette = Palette::from_css(":root {\n  color-scheme: dark;\n  --background: #000000;\n  --bright-red: #e82424;\n  --orange: #f80;\n}\n");
        assert_eq!(palette.background, rgb(0, 0, 0));
        assert_eq!(palette.orange, Some(rgb(255, 136, 0)));
        assert_eq!(palette.foreground, Palette::default().foreground);
    }

    #[test]
    fn reads_the_colours_plugins_send() {
        assert_eq!(parse_colour("rgb(255 196 137)"), Some(rgb(255, 196, 137)));
        assert_eq!(parse_colour("rgb(1, 2, 3)"), Some(rgb(1, 2, 3)));
        assert_eq!(parse_colour("#1f1f28"), Some(rgb(0x1f, 0x1f, 0x28)));
        assert_eq!(parse_colour("tomato"), None);
        assert_eq!(Palette::default().tone("tomato"), Palette::default().accent);
    }

    #[test]
    fn mixes_the_way_a_browser_does() {
        let (black, white) = (rgb(0, 0, 0), rgb(255, 255, 255));
        assert_eq!(mix(black, white, 0.0), black);
        assert_eq!(mix(black, white, 1.0), white);
        // color-mix(in oklab, black, white) is #636363 in Chromium.
        assert_eq!(mix(black, white, 0.5), rgb(0x63, 0x63, 0x63));
    }
}
