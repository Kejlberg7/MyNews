# MyNews

Et personligt nyhedsfeed, der samler dine interesser uden sociale mediers feed-algoritmer. Historier hentes fra Google News RSS på engelsk; brugerfladen er dansk. Gemte historier opbevares lokalt i browseren.

## Kør lokalt

```sh
npm install
npm start
```

Åbn `http://localhost:4173`.

## Deploy til Vercel + Neon

1. Importér `Kejlberg7/MyNews` i Vercel, eller kør `npx vercel` i repoet.
2. Tilføj en Neon-database til Vercel-projektet i Vercel Marketplace. Forbind `DATABASE_URL` til Production (og Preview hvis ønsket).
3. Deploy. Funktionen opretter automatisk tabellen `news_feed_cache` ved første kald.

Feedets RSS-resultater caches i Neon i fem minutter, så gentagne besøg ikke henter de samme feeds fra kilden. Hvis et feed midlertidigt fejler, vises den senest gemte version. Gemte artikler er kun på den enkelte browser.

## Emner

Lokalt (Frederikssund), padel, tech og AI, biler og elbiler, gaming samt film og serier.
