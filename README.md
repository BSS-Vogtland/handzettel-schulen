This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Recommendation-Attribution (E3)

`RECOMMENDATION_CONTEXT_SECRET` ist in Produktion zwingend als geheime
Vercel-Umgebungsvariable mit mindestens 32 Zeichen zu hinterlegen. Es gibt keinen
Fallback auf Admin-Zugangsdaten, Supabase-Schlüssel, öffentliche Variablen oder
statische Standardwerte. Die Prüfung erfolgt erst zur Laufzeit beim Erzeugen oder
Lesen eines Empfehlungskontexts; Secret-Werte werden weder geloggt noch in
Fehlermeldungen ausgegeben.

Nur in der lokalen Entwicklung wird bei fehlender Variable pro Serverprozess ein
zufälliges, flüchtiges Entwicklungssecret erzeugt. Es wird nicht gespeichert und
niemals in Produktion verwendet. Nach einem Neustart sind damit erzeugte lokale
Kontexte erwartungsgemäß ungültig.

Die First-Party-Attribution arbeitet nach Last-Click je Partner: Ein Cookie pro
Projekt-/Partnerkombination enthält ausschließlich den zufälligen `click_token`.
Ein Folgeklick desselben Partners ersetzt nur dessen Attribution; Cookies anderer
Partner bleiben erhalten.

Nach erfolgreicher Klickspeicherung wird ausschließlich
`hz_click=<click_token>` an die validierte Partner-Ziel-URL angefügt. Der Partner
muss `hz_click` später in der Bestellung, einem CSV-Export oder einem Webhook
zurückmelden, damit eine zukünftige Conversion zugeordnet werden kann. E3 erfasst
noch keine Conversions.

Wahrscheinliche Bots werden als Klick gespeichert und markiert. Der Redirect mit
`hz_click` funktioniert auch für Bots; ein Attributionscookie wird ihnen nicht
gesetzt.
