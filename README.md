# MyNews

Et personligt nyhedsfeed, der samler dine interesser uden sociale mediers feed-algoritmer. Historier hentes fra Google News RSS; lokale historier søges på dansk, mens de øvrige feeds primært er engelske. Brugerfladen er dansk, og gemte artikler opbevares lokalt i browseren.

## Funktioner

- Artikler vises som større, læsevenlige opslag med billede, kilde, opsummering og direkte link til udgiveren.
- To gange dagligt henter en automatiseret proces nyheder, sorterer svage og gentagne historier fra, laver en dansk opsummering med OpenAI og gemmer de unikke historier i Neon.
- Unikke historier vises fra databasen. Hvis database eller AI endnu ikke er tilsluttet, falder feedet tilbage til de åbne RSS-feeds.
- Gemte historier og egne emner bliver på den enkelte browser.

## Kør lokalt

```sh
npm install
npm start
```

Åbn `http://localhost:4173`.

## Produktionsopsætning

Vercel-projektet bruger Hobby-planen, som kun tillader én Vercel-cron om dagen. Derfor kalder et GitHub Actions-workflow den beskyttede Vercel-funktion to gange dagligt (05:17 og 17:17 UTC). GitHub kan starte planlagte workflows lidt senere ved høj belastning.

Sæt disse værdier, før den første AI-opdatering:

1. Forbind Neon med Vercel, så projektet får `DATABASE_URL` i Production.
2. Tilføj `OPENAI_API_KEY` som en hemmelig Production-miljøvariabel i Vercel.
3. Opret en tilfældig hemmelig værdi på mindst 32 tegn. Sæt den som `CRON_SECRET` i Vercel Production og som `MYNEWS_CRON_SECRET` under GitHub-repoets Actions secrets. De to værdier skal være identiske.
4. Deploy `main`. Workflowet kan også startes manuelt fra GitHub Actions.

API-nøgler må ikke lægges i kildekoden eller `.env.example`. Funktionen opretter automatisk `news_stories` i Neon ved første kørsel og gemmer ikke selve artikelteksten, kun titel, kort opsummering, kilde, billede, link og emner.

## Emner

Lokalt (Frederikssund Kommune, herunder Vinge by i Frederikssund, Slangerup og Jægerspris), sport, fodbold, Premier League, Superligaen, Liverpool, FCK, padel, tech og AI, biler og elbiler, gaming samt film og serier. Du kan desuden tilføje op til 20 af dine egne emner med plusknappen; de gemmes lokalt i browseren.
