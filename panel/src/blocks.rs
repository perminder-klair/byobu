// Big square digits on a 3 by 5 grid, like tty-clock: the same glyphs as shell/src/Blocks.tsx,
// each as one path of unit squares that the screen scales up.
const GLYPHS: [(char, &str); 14] = [
    ('0', "111101101101111"),
    ('1', "110010010010111"),
    ('2', "111001111100111"),
    ('3', "111001111001111"),
    ('4', "101101111001001"),
    ('5', "111100111001111"),
    ('6', "111100111101111"),
    ('7', "111001001001001"),
    ('8', "111101111101111"),
    ('9', "111101111001111"),
    (':', "01010"),
    ('.', "00001"),
    ('-', "000000111000000"),
    ('°', "1111000000"),
];

pub struct Glyph {
    pub columns: usize,
    pub path: String,
}

// Characters with no glyph are left out, as the shell does.
pub fn glyphs(text: &str) -> Vec<Glyph> {
    text.chars()
        .filter_map(|wanted| GLYPHS.iter().find(|(char, _)| *char == wanted))
        .map(|(_, bits)| {
            let columns = bits.len() / 5;
            let cells = bits.bytes().enumerate().filter(|(_, bit)| *bit == b'1');
            let path = cells.map(|(i, _)| format!("M{} {}h1v1h-1z", i % columns, i / columns)).collect();
            Glyph { columns, path }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_colon_is_one_column_and_a_digit_three() {
        let time = glyphs("9:41");
        assert_eq!(time.iter().map(|glyph| glyph.columns).collect::<Vec<_>>(), [3, 1, 3, 3]);
        assert_eq!(time[1].path, "M0 1h1v1h-1zM0 3h1v1h-1z");
    }

    #[test]
    fn letters_are_left_out() {
        assert_eq!(glyphs("7 on").len(), 1);
    }
}
