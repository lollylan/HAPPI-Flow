# HÄPPI-Flow 2.0

Dienstplanung für eine hausärztliche Praxis. Läuft vollständig lokal: ein Praxis-PC
betreibt die Anwendung, alle anderen Rechner im Praxisnetz greifen per Browser zu.
Keine Cloud, keine Registrierung, keine Internetverbindung nötig.

## Was die Anwendung kann

**Ein Dienstplan für alle** – Ärzte, PCM und MFA stehen untereinander auf einem Blatt.
Jede Gruppe hat ihr eigenes Zeitmodell: die Ärzte teilen den Vormittag in Sprechstunde
(08–11) und Infekt-/Videosprechstunde (11–13), die MFA arbeiten durchgehend 08–13, danach
Innendienst und Nachmittagssprechstunde. Die Primary Care Managerin ist eine eigene Gruppe
mit eigener Sprechstunde und eigenen Hausbesuchen; für einzelne MFA-Bereiche lässt sie sich
gezielt freigeben.

**Musterwoche als Basis.** Wer ist normalerweise wo – das steht einmal in der Musterwoche,
und jede Woche entsteht daraus. Eine gelungene Woche lässt sich mit einem Klick als neue
Musterwoche übernehmen.

**Umplanung statt Neuplanung.** Fällt jemand aus, wird der Plan nicht stillschweigend
umgeworfen. Die Anwendung rechnet einen Umplanungsvorschlag, der nur die betroffenen Plätze
anfasst, und legt ihn der Praxisleitung vor: was entfällt, was neu ist, ob Pflichtplätze
offen bleiben. Erst mit »Übernehmen« wird er zum Plan. Ein Block wird nur dann umgestellt,
wenn dadurch mehr Pflichtplätze besetzt werden.

**Automatische Planung** je Zeitfenster als exaktes Zuordnungsproblem: kritische Bereiche
(Anmeldung, Labor, Telefon) werden zuerst besetzt, Pflichtrotationen eingehalten (»jede MFA
einmal pro Woche ins Labor«), Vorlieben berücksichtigt, Folgeaufgaben an dieselbe Person
gegeben (»Hausbesuche schreiben« an die, die gestern gefahren ist), und niemand bleibt ohne
Aufgabe. Homeoffice-Tage sind Teil des Arbeitszeitmodells: wer mittwochs von zu Hause
arbeitet, bekommt an dem Tag nur Bereiche, die von zu Hause gehen.

**Nachvollziehbarkeit.** Für jeden unbesetzten Pflichtplatz nennt die Anwendung den
Grund, statt still zu versagen:

> Labor, Mittwoch 08:00–13:00: 1 von 1 Plätzen unbesetzt. 12 Personen geprüft –
> 6 arbeiten mittwochs nicht, 3 abwesend, 2 ohne eigenständige Freigabe,
> 1 bereits in der Anmeldung gebunden.

Die Auswertung jedes Planungslaufs bleibt gespeichert und ist jederzeit im Dienstplan
abrufbar.

**Einsatz-Matrix** statt starrer Rollenlogik: für jede Kombination aus Person und
Bereich lässt sich Freigabe (eigenständig / nur mit Betreuung / gesperrt), Vorliebe
und ein Wochen-Minimum und -Maximum setzen. Von zwei Auszubildenden darf so die eine
allein ins Labor und der andere nicht.

**Urlaub mit Antragsprüfung.** Beim Beantragen und beim Genehmigen zeigt die Anwendung Tag
für Tag, wie viele Personen der Gruppe noch da wären und was die kritischen Bereiche
brauchen. Halbe Tage sperren nur die betroffene Tageshälfte.

**Praxisschließzeiten.** Alle haben Urlaub, eine Notbesetzung bereitet die letzten Tage vor
der Wiedereröffnung vor. Die Verteilung rotiert fair über frühere Schließungen, achtet auf
Urlaubswünsche und trägt nach Bestätigung Urlaub und Notdienste für alle ein.

**Selbstverwaltung.** Mitarbeiter beantragen Urlaub und tragen Krankmeldungen selbst
ein. Kolleginnen sehen nur »abwesend«; den Grund sieht ausschließlich die Praxisleitung.

**Druck.** Übersichtsplan fürs schwarze Brett (A4 quer, alle Gruppen) und persönlicher
Wochenplan je Mitarbeiter (A4 hoch), beides als echter Text.

## Betrieb in der Praxis

Ein Doppelklick auf `HÄPPI-Flow` startet die Anwendung samt internem Dienst.

Ohne Installer geht es auch direkt aus dem Projektordner: ein Doppelklick auf
`start-server.bat` baut die Anwendung beim ersten Mal, startet den Server und öffnet
`http://localhost:4173` im Browser. Das Fenster bleibt offen, solange der Server läuft.
`start-server.bat dev` benutzt stattdessen die Testdaten unter `%APPDATA%\HAEPPI-Flow\dev\`. Andere
Rechner im Praxisnetz erreichen sie im Browser unter `http://<IP des Praxis-PCs>:4173` –
die genaue Adresse steht im Menü unter _Hilfe → Zugang im Praxisnetz_.

Beim allerersten Start führt die Anwendung selbst durch die Einrichtung: Praxisname,
Benutzername und Passwort werden im Fenster festgelegt, danach ist man direkt
angemeldet. Es gibt bewusst kein fest eingebautes Standardpasswort und kein
Passwort, das irgendwo abgeschrieben werden müsste.

Die Datenbank liegt unter `%APPDATA%\HAEPPI-Flow\haeppi.db` – nie im
Projektverzeichnis und nie im Installer.

### Zugang wiederherstellen

Falls das Passwort der Praxisleitung verloren geht, der einfachste Weg aus dem
Projektordner: Serverfenster schließen und

```bash
start-server.bat reset
```

Die neuen Zugangsdaten erscheinen im Serverfenster unter „ZUGANG WURDE ZURÜCKGESETZT“.
Beim Anmelden muss das Passwort geändert werden.

Für die installierte App geht es über eine Datei:

1. HÄPPI-Flow schließen.
2. Im Ordner `%APPDATA%\HAEPPI-Flow\` eine leere Datei namens
   **`ZUGANG-ZURUECKSETZEN.txt`** anlegen (Groß-/Kleinschreibung und eine vom
   Explorer angehängte zweite Endung sind egal).
3. HÄPPI-Flow starten. Das neue Passwort steht in `server.log` im selben Ordner,
   ganz unten unter „ZUGANG WURDE ZURÜCKGESETZT“. Beim Anmelden muss es geändert
   werden.

Die Marker-Datei wird dabei sofort gelöscht, alle offenen Sitzungen werden beendet
und der Vorgang landet im Protokoll (`audit_log`).

Bewusst über eine Datei und nicht über einen Knopf in der Oberfläche: so braucht es
Zugriff auf das Dateisystem des Praxis-Rechners – dieselbe Hürde, die auch das
Löschen der Datenbank hätte. Ein Knopf wäre für jede neugierige Kollegin einen Klick
weit weg. Wer am Praxis-PC sitzt, kommt an die Daten; die eigentliche Grenze ist die
Windows-Anmeldung, nicht diese Anwendung.

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
npx tsx apps/server/scripts/seed-dev-team.ts
```

Legt ein Beispielteam in der Entwicklungsdatenbank an (nie in der Praxisdatenbank), um die
Oberfläche mit realistischen Daten auszuprobieren.

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
sonst wäre er weder testbar noch erklärbar. Er plant alle Gruppen in einem Lauf; eine
Person kann über Gruppengrenzen hinweg nie an zwei Orten gleichzeitig stehen, auch wenn
die Blöcke der Gruppen unterschiedlich geschnitten sind.

Je Zeitfenster wird ein **Min-Cost-Matching** gelöst (Ungarischer Algorithmus) statt
gierig zu verteilen. Ein gieriges Verfahren setzt die erste passende Person und
verbraucht damit womöglich die einzige, die einen anderen Pflichtplatz hätte füllen
können – genau diese Fehlklasse produzierte Version 1.

Zwei Betriebsarten:

- `fresh`: die Woche entsteht neu – gesperrte Zuweisungen, dann die Musterwoche, dann
  werden die Lücken gefüllt.
- `replan`: die bisherige Woche bleibt stehen, soweit sie noch gültig ist; nur Lücken
  werden gefüllt. Bleibt ein Pflichtplatz offen, wird der betroffene Block mit
  Stabilitätsprämie neu gelöst – und nur behalten, wenn danach mehr Pflichtplätze
  besetzt sind. Das Ergebnis samt Unterschied zur bisherigen Woche ist der
  Umplanungsvorschlag.

Drei Durchläufe je Zeitfenster, Pflicht vor Kür über alle Gruppen hinweg:

1. Pflichtplätze, nur eigenständige Kräfte
2. Pflichtplätze, jetzt auch Betreute – aber nur dort, wo eine Betreuung sitzt
3. Restverteilung, damit niemand ohne Aufgabe bleibt

Die Betreuungspflicht ist bewusst **keine** Bedingung in der Eignungsprüfung: ob jemand
mit »nur mit Betreuung« gesetzt werden darf, hängt vom Rest der Lösung ab. Sie wird
über die Reihenfolge der Durchläufe gelöst.

Daneben zwei weitere reine Funktionen: `assessAbsence()` (Antragsprüfung als
Kopfzahl-Rechnung je Tag) und `planClosure()` (Notbesetzung und Urlaub einer
Schließzeit, fair rotierend).

Alle Gewichte stehen in der `settings`-Tabelle und sind unter _Einstellungen → Planung_
änderbar, nicht als Zahlenliterale im Code.

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

**Schemaänderungen laufen als nummerierte Migration** in `apps/server/src/db/migrations/`.
SQLite kann CHECK-Bedingungen nicht ändern; solche Tabellen werden neu angelegt, kopiert
und umbenannt. Der Migrationsläufer schaltet dafür die Fremdschlüssel ab und prüft sie
nach jeder Migration mit `foreign_key_check`.

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

## Lizenz

Dieses Projekt ist MIT-lizenziert.
