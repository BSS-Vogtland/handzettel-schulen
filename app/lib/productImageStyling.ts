type DisabledStyleResult = {
  attempted: boolean;
  ok: boolean;
  result: null;
  message: string;
};

export async function styleProductImageById(_productId: string) {
  throw new Error(
    "Die originalschonende Hintergrund-Freistellung ist vorübergehend deaktiviert. Die bisher getestete Freistell-Library ist in der Next.js/API-Route nicht stabil genug."
  );
}

export async function tryStyleProductImageById(
  _productId: string
): Promise<DisabledStyleResult> {
  return {
    attempted: false,
    ok: false,
    result: null,
    message:
      "Automatische Hintergrund-Erzeugung wurde deaktiviert. Produktbild, Originalbild und SEO-Daten wurden gespeichert; die Hintergrundbearbeitung wird später über ein separates Batch-Script gelöst.",
  };
}