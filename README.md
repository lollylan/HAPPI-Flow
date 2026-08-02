# HÄPPI-Flow 2.0

Dienstplanung für eine hausärztliche Praxis. Läuft vollständig lokal: ein Praxis-PC
betreibt die Anwendung, alle anderen Rechner im Praxisnetz greifen per Browser zu.
Keine Cloud, keine Registrierung, keine Internetverbindung nötig.

> **Status:** Im Neuaufbau. Version 1 wurde verworfen — der letzte Stand liegt
> unter dem Git-Tag `legacy-v1`, die Neuentwicklung auf Branch `rebuild/v2`.

## Was die Anwendung leisten soll

- **Zwei getrennte Dienstpläne** für Ärzte und MFA, die sich an einer Stelle
  berühren: die Primary Care Managerin hält Sprechstunde wie eine Ärztin, belegt
  dabei eines der vier Zimmer und ist solange aus dem MFA-Pool gesperrt.
- **Automatische Zuteilung** mit garantierter Mindestbesetzung kritischer Bereiche
  (Anmeldung, Labor vormittags) und Pflichtrotation, damit niemand das Labor verlernt.
- **Nachvollziehbarkeit**: Für jeden unbesetzten Pflichtplatz nennt die Anwendung
  den Grund — nicht nur „konnte nicht geplant werden".
- **Selbstverwaltung**: Mitarbeiter beantragen Urlaub und tragen Krankmeldungen
  selbst ein. Kolleginnen sehen nur „abwesend", den Grund sieht ausschließlich die
  Praxisleitung.

## Entwicklung

```bash
npm install
```

```bash
npm run dev
```

Startet Shared-Watcher, API-Server (Port 4173) und Vite-Dev-Server (Port 5173) parallel.

```bash
npm test
```

```bash
npm run check
```

`check` prüft Typen, Lint und Formatierung — das muss vor jedem Commit grün sein.

## Projektstruktur

| Pfad              | Inhalt                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Domänentypen, Zeit-/Stundenrechnung, Dienstplan-Algorithmus. Ohne Datenbankzugriff, damit vollständig testbar. |
| `apps/server`     | Express + SQLite. Hält die Daten, setzt Authentifizierung und Datenschutz durch.                               |
| `apps/client`     | React-Oberfläche: Dashboard, Dienstpläne, Einsatz-Matrix, Abwesenheiten, Druckansichten.                       |
| `apps/desktop`    | Electron-Hülle (kommt in Etappe 7).                                                                            |

## Verbindliche Konventionen

Diese drei Regeln fangen die Fehlerklassen ab, an denen Version 1 gescheitert ist.
Zwei davon sind als ESLint-Regeln scharf gestellt und brechen den Build.

**Uhrzeiten sind Integer-Minuten seit Mitternacht.** Nie Textvergleiche auf `"HH:MM"`.
In v1 wurde die Verfügbarkeit als `avail.start > slot.start` geprüft — dadurch war
eine Kraft mit Arbeitsbeginn 09:00 für den Block 08:00–13:00 gar nicht einplanbar,
statt zu 80 % anwesend. Für Zeitvergleiche gibt es `overlapMinutes()` und
`coverageRatio()` in `shared/time/minutes.ts`.

**Datumsangaben entstehen ausschließlich über `toLocalISODate()`.**
`toISOString().split('T')[0]` liefert in unserer Zeitzone den Vortag und ist per
Lint-Regel verboten. Datumsarithmetik läuft über `shared/time/dates.ts`, das intern
auf 12:00 Ortszeit verankert und damit gegen die Zeitumstellung immun ist.

**Der Scheduler ist deterministisch.** In `packages/shared/src/scheduler/` sind
`Math.random()`, `Date.now()` und `new Date()` per Lint-Regel gesperrt. Gleicher
Input muss denselben Plan ergeben, sonst ist er weder testbar noch erklärbar.

## Sicherheit und Daten

- Passwörter werden serverseitig mit **argon2id** gehasht. Der Browser bekommt
  niemals einen Hash zu sehen.
- Die Datenschutz-Filterung für Abwesenheitsgründe greift **serverseitig** — die
  API liefert Kolleginnen das Feld gar nicht erst aus, statt es nur auszublenden.
- Im Betrieb liegt die Datenbank unter `%APPDATA%\HAEPPI-Flow\`, **nie** im
  Projektverzeichnis und **nie** im Installer.
- Der Schutz der Daten auf dem Praxis-PC ist Sache von Windows-Anmeldung, NTFS-Rechten
  und BitLocker. Eine anwendungseigene Verschlüsselung mit einem Schlüssel, der neben
  der Datenbank liegt, wäre wirkungslos — genau das tat v1.

## Abhängigkeiten mit Einschränkung

TypeScript ist bewusst auf **5.9** festgehalten. `typescript-eslint` unterstützt
derzeit nur `>=4.8.4 <6.1.0`; ein Sprung auf TypeScript 7 würde das Linting
abschalten. Erst anheben, wenn `typescript-eslint` nachgezogen hat.
