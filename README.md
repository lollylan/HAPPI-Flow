# HÄPPI-Flow

HÄPPI-Flow ist eine intelligente, browserbasierte Anwendung zur Erstellung und Verwaltung von Dienstplänen (Fokus auf medizinische Praxen). Die Anwendung läuft lokal in deinem Browser und unterstützt komplexe Einteilungs-Regeln, Skills, Zeit-Präferenzen und vieles mehr.

## 🌟 Funktionsübersicht

- **Intelligente, automatische Schichtplanung**: Ein Algorithmus verteilt Mitarbeiter automatisch auf Arbeitsbereiche basierend auf Skills, Abwesenheiten und Prioritäten. Praxisspezifische Logik bevorzugt kritische Bereiche und beachtet Minimum-Besetzungen.
- **Rollen- & Skill-Management**: Definiere beliebige Skills (z.B. Blutentnahme, EKG, Abrechnung) und ordne sie Mitarbeitern und Arbeitsbereichen zu.
- **Min/Max-Regeln & Präferenzen**: Mitarbeiter können Prioritäten haben (`Bevorzugt`, `Ungern`, etc.) oder harte Regeln besitzen (z.B. maximal 2 Mal Rezeption pro Woche).
- **Flexible Zeit- und Slotsteuerung**: Komplett anpassbare Praxisöffnungszeiten und Schichtzeiten (Vormittag, Mittag, Nachmittag) pro Wochentag inklusive Minuten-genauen Start- und Endzeiten der Mitarbeiter. Komplette Schichten können an bestimmten Tagen deaktiviert (z.B. Mittwochnachmittag geschlossen) werden.
- **Lokale / Offline Nutzung**: Alle Daten werden (derzeit) lokal in deinem Browser (`localStorage`) gespeichert. Es ist keine Registrierung oder Online-Verbindung erforderlich.
- **Backups**: Du kannst jederzeit eine `.json`-Datei exportieren, um deine Konfiguration und Mitarbeiter zu sichern – oder für einen Umzug auf einen anderen PC / Browser wieder importieren.

## 🚀 Installation & Start

Die App basiert auf React und Vite. Um sie lokal zum Laufen zu bringen, benötigst du [Node.js](https://nodejs.org/) auf deinem Computer.

1. **Repository klonen**
   ```bash
   git clone https://github.com/lollylan/HAPPI-Flow.git
   cd HAPPI-Flow
   ```

2. **Abhängigkeiten installieren**
   ```bash
   npm install
   ```

3. **Entwicklungsserver starten**
   ```bash
   npm run dev
   ```

4. **App öffnen**
   Öffne deinen Browser und gehe zu der Adresse, die im Terminal angezeigt wird (meist `http://localhost:5173/` oder `http://localhost:5174/`).

## 📖 Kurzanleitung

1. **Einstellungen anpassen**: Gehe zuerst in den Reiter **"Einstellungen"**. Dort kannst du die Start- und Endzeiten für die Blöcke "Vormittag", "Mittag" und "Nachmittag" für jeden Wochentag festlegen. Wenn an manchen Tagen nachmittags geschlossen ist, nehme für diesen Slot dort das Häkchen bei "Aktiv" heraus. Bestätige mit "Zeiten speichern".
2. **Skills & Räume**: Lege eventuell zusätzliche Qualifikationen (Skills) an. Passe die Arbeitsbereiche an, lege fest, ob ein Bereich "kritisch" ist (wird zuerst aufgefüllt) und wie viele Mitarbeiter dort zwingend gebraucht werden.
3. **Mitarbeiter anlegen**: Lege deine Mitarbeiter an, ordne ihnen Skills zu und klappe das kleine Menü aus, um Urlaubsstände, Arbeitszeiten (ganz genau für jeden Tag) und besondere Wünsche / Regeln festzulegen.
4. **Dienstplan füllen**: Wechsel auf "Dienstplan", wähle eine Woche aus, drücke auf **"Automatisch befüllen"** und die Software übernimmt die Puzzlespiel-Arbeit. Danach kannst du jederzeit in Schichten klicken und dort Personen händisch auswechseln oder fest verankern (Schloss-Symbol), falls der Algorithmus sie beim nächsten Knopfdruck nicht mehr verschieben soll.

## 🛠 Tech-Stack

- React 18
- TypeScript
- Tailwind CSS
- Lucide Icons
- Vite

## 📄 Lizenz

Dieses Projekt ist MIT-lizenziert.
