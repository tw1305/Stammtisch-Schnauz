/**
 * Release history shown under Mehr → Patch Notes (newest first).
 *
 * Versioning: MAJOR for big feature drops that change how the app is used,
 * MINOR for new features, PATCH for fixes only. Bump APP_VERSION by adding an
 * entry on top — package.json "version" should match.
 */

export type ChangeType = 'neu' | 'verbessert' | 'behoben' | 'entfernt'

export type PatchNote = {
  version: string
  date: string // YYYY-MM-DD
  title: string
  changes: { type: ChangeType; text: string }[]
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: '2.1.0',
    date: '2026-10-12',
    title: 'Feuer und Flamme',
    changes: [
      { type: 'neu', text: 'Neuer Spieltisch für Season 4: herbstlicher Wald zur Golden Hour mit fallendem Laub, Bier auf dem Tisch und leuchtendem „Season 4“-Schild.' },
      { type: 'neu', text: 'Neuer Reiter „Mehr“ mit Regeln, Patch Notes und Einstellungen – die Einstellungen sind damit jederzeit erreichbar.' },
      { type: 'neu', text: 'Regeln: das offizielle Regelwerk mit Abschnitten und Paragraphen – bearbeitbar, mit Stand-Datum.' },
      { type: 'neu', text: 'Patch Notes: alle Updates mit Versionsnummer zum Nachlesen.' },
      { type: 'neu', text: 'Animationen: Grabstein beim Ausscheiden, eine Spritze, die vom Wiederbeleber zum Wiederbelebten fliegt, Feuerexplosion beim Feuer und Münzregen beim Rundensieg. In den Einstellungen abschaltbar.' },
      { type: 'neu', text: 'Neue Sounds: echte Furzgeräusche beim Ausscheiden (11 Aufnahmen, zufällig ausgewählt, nie zweimal dieselbe hintereinander), eine Feuerexplosion beim Feuer und „I Get Money“ von 50 Cent beim Rundensieg.' },
      { type: 'neu', text: 'Achievement „Burning Man“ 🔥 für die meisten Feuer der Season.' },
      { type: 'neu', text: 'Testmodus 🧪 in den Einstellungen: Seasons, Sessions und Runden zum Ausprobieren spielen, ohne dass echte Daten oder Statistiken verändert werden. Ein lila Banner zeigt an, wenn er aktiv ist.' },
      { type: 'neu', text: 'Test-Buttons für Sound & Vibration in den Einstellungen.' },
      { type: 'verbessert', text: 'Laufende Runde: Die Spielfläche nutzt jetzt den ganzen Bildschirm und die Spielericons sind deutlich größer – auf jedem Gerät ist alles ohne Scrollen sichtbar.' },
      { type: 'verbessert', text: 'Session starten und Runde vorbereiten passen jetzt auf jeden Bildschirm: alle Spieler, die Einsatzauswahl und die Buttons sind ohne Scrollen sichtbar. „Spieler & Sitzordnung“ sitzt oben neben dem Zahnrad, „Neue Runde“ und „Session beenden“ stehen nebeneinander.' },
      { type: 'neu', text: 'Vibration hat einen eigenen Schalter in den Einstellungen, unabhängig vom Sound. Sie funktioniert auf Android-Handys – auf dem iPhone erlaubt Apple Web-Apps keine Vibration.' },
      { type: 'neu', text: 'Siegesserien sichtbar am Profilbild: nach einem Sieg ein goldener schimmernder Ring, nach zwei Siegen in Folge glüht er rot und erste Flammen und Funken züngeln, ab drei Siegen brennt das Feuer.' },
      { type: 'neu', text: 'Rundenende: Der Sieger erscheint groß in der Bildschirmmitte, bekommt Ring oder Flamme per Animation und fliegt dann in die (jetzt größere) Rundenübersicht.' },
      { type: 'neu', text: 'Sieg „aus dem Jenseits“ (ausgeschieden, wiederbelebt, gewonnen): Geister fliegen hinter dem Profilbild des Siegers hervor – auch zusammen mit Ring, Glut oder Flamme.' },
      { type: 'verbessert', text: 'Der Feuerring sieht jetzt aus wie echtes Feuer statt wie gezeichnete Flammen.' },
      { type: 'verbessert', text: 'Hot Streak ☄️ zeigt die Länge der Siegesserie (z. B. „4 am Stück“) und wird auch bei kurzen Serien vergeben.' },
      { type: 'behoben', text: 'Der Sound blieb meist stumm, besonders beim Rundensieg – jetzt zuverlässig und lauter.' },
      { type: 'neu', text: 'Statistik: neue Kennzahl „Ø Spieler“ – wie viele im Schnitt pro Runde mitspielen. Reihenfolge jetzt Sessions, Runden, Ø Einsatz, Ø Spieler, Feuer.' },
      { type: 'entfernt', text: 'Statistik „Serie“ – ersetzt durch Hot Streak.' },
      { type: 'entfernt', text: 'Kennzahl „Wiederbelebt“ oben in der Statistik (pro Spieler weiterhin sichtbar).' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-10-08',
    title: 'Das große Feuer-Update',
    changes: [
      { type: 'neu', text: 'Feuer (drei Asse) erfassen: 🔥-Button im Spiel, versehentliche Einträge lassen sich löschen. Feuer-Zähler in der Statistik.' },
      { type: 'neu', text: '„On Fire“: Feuerring um jeden, der drei Runden in Folge gewinnt – über Sessions und Seasons hinweg.' },
      { type: 'neu', text: 'Statistik-Kennzahlen: Runden, Sessions, Ø Einsatz, Wiederbelebungen und Feuer pro Season oder gesamt.' },
      { type: 'neu', text: 'Achievements „First Blood“ 🩸 (Sieg in der ersten Runde einer Session) und „Aus dem Jenseits“ 👻 (wiederbelebt und gewonnen).' },
      { type: 'neu', text: 'Session-Übersicht: neueste Session oben, kompakte aufklappbare Kacheln mit Gewinner pro Runde.' },
      { type: 'verbessert', text: 'Profilbild frei verschieben und mit zwei Fingern zoomen.' },
      { type: 'verbessert', text: 'Größere Pfeile für die Sitzordnung, „Session beenden“ in Orange, neueste Season steht oben.' },
      { type: 'behoben', text: 'Der Geber zeigte nicht zuverlässig auf den Verlierer der Vorrunde – z. B. nach einer Wiederbelebung oder „Rückgängig“.' },
      { type: 'behoben', text: 'Bei vielen Achievements wurde der Spielername in der Statistik verdrängt.' },
      { type: 'entfernt', text: 'Statistik „Rekord“.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-11',
    title: 'Ab in den Wald',
    changes: [
      { type: 'neu', text: 'Neuer Spieltisch: eine Waldlichtung mit Baumstümpfen als Sitzplätze.' },
      { type: 'neu', text: 'Vier neue Achievements: Münzstern 🌟, Kotstern 💩, High Roller 🎲 und Kleinvieh 🐜.' },
      { type: 'neu', text: 'Session-Übersicht direkt aus der Season-Ansicht öffnen.' },
      { type: 'verbessert', text: 'Einsatz-Auswahl mit sieben Stufen bis 21 €.' },
      { type: 'verbessert', text: 'Das Limit von 9 Spielern am Tisch wird angezeigt.' },
      { type: 'verbessert', text: 'Achievements umbenannt: Hot Streak, Medic, Noob und Bonze.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-14',
    title: 'Happy Birthday',
    changes: [
      { type: 'neu', text: 'Geburtstag im Spielerprofil – in der Geburtstagswoche trägt man einen Lorbeerkranz mit Bierkrügen.' },
      { type: 'neu', text: 'Session-Ende mit Übersicht für Session und Saison.' },
      { type: 'neu', text: 'Der Runden-Editor zeigt den Saison-Saldo vor und nach der Runde.' },
      { type: 'verbessert', text: 'Geber ist, wer in der Vorrunde als Erster ausgeschieden ist.' },
      { type: 'verbessert', text: 'Tisch-Vorbereitung und laufende Runde sind klar getrennt; der Saldo bleibt im Spiel sichtbar.' },
      { type: 'verbessert', text: 'Die Season-Statistik zeigt nur Spieler, die dort mitgespielt haben.' },
      { type: 'behoben', text: 'Schnelles Doppeltippen konnte eine Runde doppelt starten.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-01',
    title: 'Statistik-Feinschliff',
    changes: [
      { type: 'neu', text: 'Achievements werden pro Season vergeben, mit Zählung über alle Seasons und Erklärungen hinter dem 🏅-Button.' },
      { type: 'neu', text: 'Saldo-Verlauf im Spielerprofil pro Session, mit Markierungen für jede Season.' },
      { type: 'verbessert', text: 'Kompakte einzeilige Spielerzeilen in der Statistik.' },
      { type: 'verbessert', text: 'Die Statistik öffnet direkt die aktive Season.' },
      { type: 'verbessert', text: 'Der Kopf-an-Kopf-Vergleich ist jetzt erklärt.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-08',
    title: 'Der Anfang',
    changes: [
      { type: 'neu', text: 'Schnauz-Runden digital erfassen: Ausscheiden, Wiederbeleben, Gewinner und Bilanzen – mit „Rückgängig“ während der Runde und „Runde wieder öffnen“ nach einem Versehen.' },
      { type: 'neu', text: 'Seasons mit Saldovortrag, Auszahlungsübersicht und bearbeitbarem Namen.' },
      { type: 'neu', text: 'Spielerprofile mit eigenem Profilbild.' },
      { type: 'neu', text: 'Geber-Markierung am Tisch, frei wählbare Sitzordnung und Session-Zusammenfassung.' },
      { type: 'neu', text: 'Live-Sync: mehrere Handys sehen dieselbe Runde in Echtzeit.' },
      { type: 'neu', text: 'Sound & Vibration bei Ausscheiden, Wiederbeleben und Rundensieg.' },
      { type: 'neu', text: 'Statistik mit Podium, Win-Rate, Saldo-Verlauf, Achievements und Spielerprofilen mit Kopf-an-Kopf.' },
      { type: 'neu', text: 'Als App auf dem Handy installierbar.' },
    ],
  },
]

export const APP_VERSION = PATCH_NOTES[0].version
