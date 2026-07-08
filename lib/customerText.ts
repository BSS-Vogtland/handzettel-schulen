export function cleanCustomerText(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  const replacements: Array<[string, string]> = [
    ["ÃƒÂ¤", "ä"],
    ["ÃƒÂ¶", "ö"],
    ["ÃƒÂ¼", "ü"],
    ["Ãƒâ€ž", "Ä"],
    ["Ãƒâ€“", "Ö"],
    ["ÃƒÅ“", "Ü"],
    ["ÃƒÅ¸", "ß"],
    ["ÃƒÂŸ", "ß"],

    ["Ã¤", "ä"],
    ["Ã¶", "ö"],
    ["Ã¼", "ü"],
    ["Ã„", "Ä"],
    ["Ã–", "Ö"],
    ["Ãœ", "Ü"],
    ["ÃŸ", "ß"],

    ["â€“", "–"],
    ["â€”", "—"],
    ["â€œ", "“"],
    ["â€", "”"],
    ["â€ž", "„"],
    ["â€˜", "‘"],
    ["â€™", "’"],
    ["â€¦", "…"],
    ["â‚¬", "€"],

    ["Â§", "§"],
    ["Â€", "€"],
    ["Â ", " "],
    ["Â", ""],
  ];

  for (const [broken, fixed] of replacements) {
    text = text.split(broken).join(fixed);
  }

  return text;
}
