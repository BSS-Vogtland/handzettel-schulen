export function cleanOutgoingMailText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;

  let text = String(value);

  const replacements: Array<[string, string]> = [
    ["abschließen", "abschließen"],
    ["abschließen", "abschließen"],
    ["abschließen", "abschließen"],
    ["abschließen", "abschließen"],
    ["Grüße", "Grüße"],
    ["Grüße", "Grüße"],
    ["Grüße", "Grüße"],
    ["Grüße", "Grüße"],
    ["ß", "ß"],
    ["ß", "ß"],

    ["ä", "ä"],
    ["ö", "ö"],
    ["ü", "ü"],
    ["ß", "ß"],
    ["Ü", "Ü"],
    ["Ä", "Ä"],
    ["Ö", "Ö"],

    ["ä", "ä"],
    ["ö", "ö"],
    ["ü", "ü"],
    ["ß", "ß"],
    ["Ü", "Ü"],
    ["Ä", "Ä"],
    ["Ö", "Ö"],

    ["ä", "ä"],
    ["ö", "ö"],
    ["ü", "ü"],
    ["ß", "ß"],
    ["Ü", "Ü"],
    ["Ä", "Ä"],
    ["Ö", "Ö"],

    ["ÃƒÆ’Ã¢€Å¡Ãƒâ€š·", "·"],
    ["·", "·"],
    ["Ãƒâ€šÃ‚·", "·"],
    ["–", "–"],
    ["Ãƒ¢Ã¢â€š¬Ã¢€Å“", "–"],
    ["€", "€"],
    ["Ãƒ¢Ã¢€Å¡Ã‚¬", "€"],
    ["Ãƒ—", "×"],

    ["schließen", "schließen"],
    ["auswählen", "auswählen"],
    ["möchtest", "möchtest"],
    ["prüfen", "prüfen"],
    ["prüft", "prüft"],
    ["persönlich", "persönlich"],
    ["für", "für"],
    ["übernimmt", "übernimmt"],
    ["übernehmen", "übernehmen"],
    ["vorausgewählt", "vorausgewählt"],
    ["Übereinstimmung", "Übereinstimmung"],

    ["✓", "✓"],
    ["✔", "✓"],
    ["–", "–"],
    ["—", "—"],
    ["“", "“"],
    ["”", "”"],
    ["„", "„"],
    ["‘", "‘"],
    ["’", "’"],
    ["…", "…"],
    ["€", "€"],

    ["·", "·"],
    ["§", "§"],
    ["", "€"],
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
