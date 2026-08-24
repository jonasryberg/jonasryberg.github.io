# Org-mode Local

En statisk Org-mode-webbapp som öppnar och redigerar lokala `.org`-filer direkt i webbläsaren.

## Funktioner

- Trädvy med infällbara Org-rubriker.
- Agenda för `SCHEDULED`, `DEADLINE` och aktiva timestamps.
- Klickbar `TODO`/`DONE` och klickbara checkboxar.
- Redigering av titel, status, taggar, datum och Org-text.
- Skapa en ny Org-fil.
- Lista med de fem senast öppnade filerna i Chrome/Edge.
- Skapa nya uppgifter och underuppgifter.
- Flytta hela subtrees mellan föräldrar.
- Org-länkar i rubriker visar bara länktexten och är klickbara.
- Ångra lokala ändringar.
- Öppna och spara lokala filer utan server eller Dropbox.

## Lokal filåtkomst

I Chrome och Edge används File System Access API när det finns tillgängligt. Då kan **Spara** skriva tillbaka till samma fil som öppnades. Appen kontrollerar också att filen på disk inte har ändrats sedan den lästes innan den skriver över den.

I webbläsare som saknar API:t används en vanlig filväljare för öppning och **Spara/Spara som** skapar en nedladdad `.org`-fil.

När en backupmapp har valts i appen sparas en kopia automatiskt när en fil öppnas. Kopian hamnar i en ny undermapp med dagens datum, exempelvis `2026-08-19/2026-08-19_14-30-00_tasks.org`.

Med **Autospara ändringar** sparas ändringar automatiskt till originalfilen efter en sekunds paus i Chrome/Edge när direkt filåtkomst är tillgänglig. I fallback-läge sparas i stället ett lokalt utkast i webbläsaren. Utkastet återställer osparade ändringar, vald vy, sökning och agendafilter efter en omladdning.

## Kör lokalt

Eftersom vissa fil-API:n kräver en säker kontext är det bäst att köra sidan via en lokal webbserver i stället för att dubbelklicka på `index.html`.

Exempel med Python:

```bash
python3 -m http.server 8000
```

Öppna sedan `http://localhost:8000`.

## Publicera på GitHub Pages

1. Skapa ett GitHub-repository.
2. Lägg filerna i repositoryts rot.
3. Pusha till GitHub.
4. Öppna **Settings → Pages**.
5. Välj att publicera från din branch, exempelvis `main` och `/ (root)`.

Ingen byggprocess behövs. `index.html`, `styles.css` och `app.js` är hela appen.

## Integritet

Org-filen laddas inte upp av appen. När den körs som den här statiska versionen sker filhanteringen lokalt i webbläsaren. Det finns ingen serverkod och inga externa JavaScript-bibliotek.
