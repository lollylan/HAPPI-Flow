# HÄPPI-Flow 2.0

Dienstplanung für eine hausärztliche Praxis. Läuft vollständig lokal: ein Praxis-PC
betreibt die Anwendung, alle anderen Rechner im Praxisnetz greifen per Browser zu.
Keine Cloud, keine Registrierung, keine Internetverbindung nötig.

## Was die Anwendung kann

**Zwei getrennte Dienstpläne** für Ärzte und MFA, die sich an einer Stelle berühren:
die Primary Care Managerin hält Sprechstunde wie eine Ärztin, belegt dabei eines der
vier Behandlungszimmer und ist solange aus dem MFA-Pool gesperrt.

**Automatische Wochenplanung** aus einer gepflegten Musterwoche. Kritische Bereiche
(Anmeldung, Labor vormittags) werden zuerst besetzt, Pflichtrotationen eingehalten
(»jede MFA einmal pro Woche ins Labor«), Vorlieben berücksichtigt und niemand bleibt
ohne Aufgabe.

**Nachvollziehbarkeit.** Für jeden unbesetzten Pflichtplatz nennt die Anwendung den
Grund, statt still zu versagen:

> Labor, Mittwoch 08:00–13:00: 1 von 1 Plätzen unbesetzt. 12 Personen geprüft –
> 6 arbeiten mittwochs nicht, 3 abwesend, 2 ohne eigenständige Freigabe,
> 1 bereits in der Anmeldung gebunden.

**Einsatz-Matrix** statt starrer Rollenlogik: für jede Kombination aus Person und
Bereich lässt sich Freigabe (eigenständig / nur mit Betreuung / gesperrt), Vorliebe
und ein Wochen-Minimum und -Maximum setzen. Von zwei Auszubildenden darf so die eine
allein ins Labor und der andere nicht.

**Selbstverwaltung.** Mitarbeiter beantragen Urlaub und tragen Krankmeldungen selbst
ein. Kolleginnen sehen nur »abwesend«; den Grund sieht ausschließlich die Praxisleitung.

**Druck.** Übersichtsplan fürs schwarze Brett (A4 quer) und persönlicher Wochenplan
je Mitarbeiter (A4 hoch), beides als echter Text.

## Betrieb in der Praxis

Ein Doppelklick auf `HÄPPI-Flow` startet die Anwendung samt internem Dienst. Andere
Rechner im Praxisnetz erreichen sie im Browser unter `http://<IP des Praxis-PCs>:4173` –
die genaue Adresse steht im Menü unter _Hilfe → Zugang im Praxisnetz_.

Beim allerersten Start erzeugt die Anwendung ein Zufallspasswort für das
Verwaltungskonto und zeigt es einmalig an. Es muss beim ersten Anmelden geändert
werden. Es gibt bewusst kein fest eingebautes Standardpasswort.

Die Datenbank liegt unter `%APPDATA%\HAEPPI-Flow\haeppi.db` – nie im
Projektverzeichnis und nie im Installer.

## Entwicklung

```bash
npm install
```

```bash
npm run dev
```

Startet Shared-Watcher, API-Server (Port 4173) und Vite-Dev-Server (Port 5173) parallel.
Im Entwicklungsmodus liegt die Datenbank in `%APPDATA%\HAEPPI-Flow\dev\`, damit
Experimente die Praxisdaten nie anfassen.

```bash
npm test
```

```bash
npm run check
```

`check` prüft Typen, Lint und Formatierung – das muss vor jedem Commit grün sein.

```bash
npm run package
```

Baut alles und erzeugt `release/HAEPPI-Flow-Setup-2.0.0.exe`.

## Projektstruktur

| Pfad              | Inhalt                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Domänentypen, Zeit-/Stundenrechnung, Feiertage, Dienstplan-Algorithmus. Ohne Datenbankzugriff, damit vollständig testbar. |
| `apps/server`     | Express + SQLite. Hält die Daten, setzt Authentifizierung und Datenschutz durch.                                          |
| `apps/client`     | React-Oberfläche: Dashboard, Dienstpläne, Einsatz-Matrix, Abwesenheiten, Druckansichten.                                  |
| `apps/desktop`    | Electron-Hülle: startet den Server, wartet auf seine Bereitschaft, zeigt die Oberfläche.                                  |

## Der Scheduler

Liegt in `packages/shared/src/scheduler/` und ist eine **reine Funktion**: kein
Datenbankzugriff, keine Systemzeit, kein Zufall. Gleicher Input ergibt denselben Plan –
sonst wäre er weder testbar noch erklärbar.

Je Zeitfenster wird ein **Min-Cost-Matching** gelöst (Ungarischer Algorithmus) statt
gierig zu verteilen. Ein gieriges Verfahren setzt die erste passende Person und
verbraucht damit womöglich die einzige, die einen anderen Pflichtplatz hätte füllen
können – genau diese Fehlklasse produzierte Version 1.

Drei Durchläufe je Block:

1. Pflichtplätze, nur eigenständige Kräfte
2. Pflichtplätze, jetzt auch Betreute – aber nur dort, wo eine Betreuung sitzt
3. Restverteilung, damit niemand ohne Aufgabe bleibt

Die Betreuungspflicht ist bewusst **keine** Bedingung in der Eignungsprüfung: ob jemand
mit »nur mit Betreuung« gesetzt werden darf, hängt vom Rest der Lösung ab. Sie wird
über die Reihenfolge der Durchläufe gelöst.

Alle Gewichte stehen in der `settings`-Tabelle, nicht als Zahlenliterale im Code.

## Verbindliche Konventionen

Diese Regeln fangen die Fehlerklassen ab, an denen Version 1 gescheitert ist.
Zwei davon sind als ESLint-Regeln scharf gestellt und brechen den Build.

**Uhrzeiten sind Integer-Minuten seit Mitternacht.** Nie Textvergleiche auf `"HH:MM"`.
In v1 wurde die Verfügbarkeit als `avail.start > slot.start` geprüft – dadurch war
eine Kraft mit Arbeitsbeginn 09:00 für den Block 08:00–13:00 gar nicht einplanbar,
statt zu 80 % anwesend. Für Zeitvergleiche gibt es `overlapMinutes()` und
`coverageRatio()` in `shared/time/minutes.ts`.

**Datumsangaben entstehen ausschließlich über `toLocalISODate()`.**
`toISOString().split('T')[0]` liefert in unserer Zeitzone den Vortag und ist per
Lint-Regel verboten. Datumsarithmetik läuft über `shared/time/dates.ts`, das intern
auf 12:00 Ortszeit verankert und damit gegen die Zeitumstellung immun ist.

**Der Scheduler ist deterministisch.** In `packages/shared/src/scheduler/` sind
`Math.random()`, `Date.now()` und `new Date()` per Lint-Regel gesperrt.

## Sicherheit und Daten

- Passwörter werden serverseitig mit **argon2id** gehasht. Der Browser bekommt
  niemals einen Hash zu sehen; ein Test prüft das gegen die rohe API-Antwort.
- Session-Cookie ist `HttpOnly` mit `SameSite=Lax`, dazu ein CSRF-Token als
  Double-Submit-Cookie.
- Die Datenschutz-Filterung für Abwesenheitsgründe greift **serverseitig** – die API
  liefert Kolleginnen die Felder `type`, `note` und `status` gar nicht erst aus. Sie
  in der Oberfläche auszublenden wäre kein Schutz.
- Mitarbeiter werden deaktiviert, nicht gelöscht: ein echtes `DELETE` würde per
  Kaskade Dienstpläne, Urlaubskonten und Krankmeldungen mitnehmen.
- Der Schutz der Daten auf dem Praxis-PC ist Sache von Windows-Anmeldung, NTFS-Rechten
  und BitLocker. Eine anwendungseigene Verschlüsselung mit einem Schlüssel, der neben
  der Datenbank liegt, wäre wirkungslos – genau das tat v1.

## Virenscanner beim Bauen

Ein frisch gebauter, **nicht signierter** Installer ist für jeden Virenscanner ein
unbekanntes Programm, das obendrein einen Netzwerkport öffnet. Kaspersky, Defender
und SmartScreen schlagen darauf zuverlässig an – das ist eine Reputationswarnung, kein
Fund. Praktikable Wege:

1. **Ausnahme für den Ausgabeordner** setzen: `…\HAEPPI-Flow\release` und den
   Installationspfad der Anwendung. Reicht für den Eigenbedarf.
2. **Code-Signing-Zertifikat** (OV oder EV, etwa 200–400 € im Jahr) in
   `electron-builder.yml` hinterlegen. Erst damit verschwinden die Warnungen dauerhaft,
   auch auf den anderen Praxis-PCs.

Jeder neue Build erzeugt eine neue, unbekannte Datei – die Warnung kommt also nach
jedem `npm run package` erneut.

## Abhängigkeiten mit Einschränkung

**SQLite kommt aus `node:sqlite`**, dem in Node und Electron eingebauten Modul – nicht
aus `better-sqlite3`. Grund: `better-sqlite3` bindet direkt an die V8-API und muss für
jede Electron-Version neu kompiliert werden. Fertige Binärdateien für Electron gibt es
keine, also bräuchte jeder, der den Installer baut, mehrere Gigabyte
Visual-Studio-Build-Tools. `node:sqlite` ist in Node 24 noch als experimentell
gekennzeichnet; der Zugriff liegt deshalb hinter einem Adapter in
`apps/server/src/db/index.ts` – ein Wechsel zurück wäre eine Änderung an genau dieser
einen Datei.

TypeScript ist bewusst auf **5.9** festgehalten. `typescript-eslint` unterstützt
derzeit nur `>=4.8.4 <6.1.0`; ein Sprung auf TypeScript 7 würde das Linting
abschalten. Erst anheben, wenn `typescript-eslint` nachgezogen hat.

Electron ist auf eine **exakte Version** gepinnt, weil electron-builder aus einer
Range keine plattformspezifischen Binärdateien auflösen kann.

## Vorgeschichte

Version 1 wurde vollständig verworfen. Der letzte Stand liegt unter dem Git-Tag
`legacy-v1`. Ursachen: kein relationales Datenmodell (der gesamte Zustand als ein
JSON-Blob in einer SQLite-Zeile), keine serverseitige Anmeldung (jedes Gerät im
Praxisnetz konnte alle Mitarbeiterdaten inklusive Passwort-Hashes abrufen) und ein
Systemfehler im Planungsalgorithmus.
