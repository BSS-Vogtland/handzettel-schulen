export function cleanOutgoingMailText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;

  let text = String(value);

  const replacements: Array<[string, string]> = [
    ["abschlieÃƒÅ¸en", "abschließen"],
    ["abschlieÃƒÂŸen", "abschließen"],
    ["abschlieÃŸen", "abschließen"],
    ["abschlieÃƒÆ’Ã…Â¸en", "abschließen"],
    ["GrÃ¼ÃŸe", "Grüße"],
    ["GrÃƒÂ¼ÃƒÅ¸e", "Grüße"],
    ["GrÃƒÂ¼ÃƒÂŸe", "Grüße"],
    ["GrÃƒÆ’Ã‚Â¼ÃƒÆ’Ã…Â¸e", "Grüße"],
    ["ÃƒÅ¸", "ß"],
    ["ÃƒÂŸ", "ß"],

    ["ÃƒÆ’Ã‚Â¤", "ä"],
    ["ÃƒÆ’Ã‚Â¶", "ö"],
    ["ÃƒÆ’Ã‚Â¼", "ü"],
    ["ÃƒÆ’Ã…Â¸", "ß"],
    ["ÃƒÆ’Ã…â€œ", "Ü"],
    ["ÃƒÆ’Ã¢â‚¬Å¾", "Ä"],
    ["ÃƒÆ’Ã¢â‚¬â€œ", "Ö"],

    ["ÃƒÂ¤", "ä"],
    ["ÃƒÂ¶", "ö"],
    ["ÃƒÂ¼", "ü"],
    ["ÃƒÂŸ", "ß"],
    ["ÃƒÅ“", "Ü"],
    ["Ãƒâ€ž", "Ä"],
    ["Ãƒâ€“", "Ö"],

    ["Ã¤", "ä"],
    ["Ã¶", "ö"],
    ["Ã¼", "ü"],
    ["ÃŸ", "ß"],
    ["Ãœ", "Ü"],
    ["Ã„", "Ä"],
    ["Ã–", "Ö"],

    ["ÃƒÆ’Ã¢€Å¡Ãƒâ€š·", "·"],
    ["Ãƒâ€šÃ‚Â·", "·"],
    ["Ãƒâ€šÃ‚·", "·"],
    ["ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“", "–"],
    ["Ãƒ¢Ã¢â€š¬Ã¢€Å“", "–"],
    ["ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬", "€"],
    ["Ãƒ¢Ã¢€Å¡Ã‚¬", "€"],
    ["Ãƒ—", "×"],

    ["schlieÃŸen", "schließen"],
    ["auswÃ¤hlen", "auswählen"],
    ["mÃ¶chtest", "möchtest"],
    ["prÃ¼fen", "prüfen"],
    ["prÃ¼ft", "prüft"],
    ["persÃ¶nlich", "persönlich"],
    ["fÃ¼r", "für"],
    ["Ã¼bernimmt", "übernimmt"],
    ["Ã¼bernehmen", "übernehmen"],
    ["vorausgewÃ¤hlt", "vorausgewählt"],
    ["Ãœbereinstimmung", "Übereinstimmung"],

    ["âœ“", "✓"],
    ["âœ”", "✓"],
    ["â€“", "–"],
    ["â€”", "—"],
    ["â€œ", "“"],
    ["â€", "”"],
    ["â€ž", "„"],
    ["â€˜", "‘"],
    ["â€™", "’"],
    ["â€¦", "…"],
    ["â‚¬", "€"],

    ["Â·", "·"],
    ["Â§", "§"],
    ["Â€", "€"],
    ["Â ", " "],
    ["Â", ""],
  ];

  for (let pass = 0; pass < 6; pass++) {
    const before = text;

    for (const [broken, fixed] of replacements) {
      text = text.split(broken).join(fixed);
    }

    if (text === before) break;
  }

  return text || fallback;
}

export function cleanOutgoingMailSubject(value: unknown, fallback = "") {
  return cleanOutgoingMailText(value, fallback).replace(/\s+/g, " ").trim();
}
