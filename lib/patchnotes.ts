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
    version: '2.0.0',
    date: '2026-10-13',
    title: 'Feuer und Flamme (Season 4 Update)',
    changes: [
      { type: 'neu', text: 'Season-Rückblick ✨: Zum Abschluss einer Season erscheint eine Story mit den Highlights – Podium, rote Laterne, bester und härtester Abend, Achterbahn (der tiefe Fall vom höchsten Plus ins Minus und das größte Comeback aus dem Minus, mit eingezeichnetem Saldo-Verlauf), Hot Streak, Feuer-König, Erster raus, das Finale (Dauergast im Finale und Finalkönig), Notaufnahme, teuerste Runde und Stammgäste – bildschirmfüllend auf jedem Handy. Unter „Und jetzt du“ wählt jeder sich selbst aus und sieht seine Season samt Erzfeind (gegen wen man die meisten Finals verloren hat) und Lieblingsgegner (gegen wen man die meisten Finals gewonnen hat). Dazu läuft „I Get Money“ von 50 Cent in voller Länge. Oben rechts lässt sich die Story pausieren und die Musik stummschalten. Zum Schluss der Endstand zum Teilen. Jederzeit nochmal über die Season-Übersicht abrufbar (ab Season 3).' },
      { type: 'neu', text: 'Feuer (drei Asse) erfassen: 🔥-Button im Spiel, versehentliche Einträge lassen sich löschen. Feuer-Zähler in der Statistik.' },
      { type: 'neu', text: 'Siegesserien sichtbar am Profilbild – über Sessions und Seasons hinweg: nach einem Sieg ein goldener schimmernder Ring, nach zwei Siegen in Folge glüht er rot und erste Flammen und Funken züngeln, ab drei Siegen brennt ein Ring aus echtem Feuer („On Fire“).' },
      { type: 'neu', text: 'Rundenende: Der Sieger erscheint groß in der Bildschirmmitte, bekommt Ring oder Flamme per Animation und fliegt dann in die (jetzt größere) Rundenübersicht.' },
      { type: 'neu', text: 'First Blood 🩸: Wer die erste Runde einer Session gewinnt, bekommt im Siegerbildschirm eine Blutlache, die hinter dem Profilbild hervorquillt und langsam heruntertropft – und vor dem Siegessong ertönt der „First Blood“-Ruf aus Counter-Strike.' },
      { type: 'neu', text: 'Unwetter ⚡: Beim Rundensieg blitzt es im Siegerbildschirm – mit jeder Einsatzstufe heftiger: ein Blitz bei 3 €, zwei bei 6 €, drei bei 9 €, ab 12 € dunkler Himmel, Sturmwolken und flackernde Blitze, bei 15 € Regen und Blitz auf Blitz, ab 18 € ein ausgewachsenes Gewitter mit Platzregen und wackelndem Bildschirm.' },
      { type: 'neu', text: 'Noob-Schild 🪧: Wer in einer Session zweimal in Folge als Erster rausfliegt, bekommt zu Beginn der nächsten Runde ein Holzschild mit „Noob“ aufs Profilbild gerammt. Es bleibt stehen, solange er weiter als Erster ausscheidet, und kippt weg, sobald er es nicht mehr tut. Neue Session, neues Glück.' },
      { type: 'neu', text: 'Sieg „aus dem Jenseits“ (ausgeschieden, wiederbelebt, gewonnen): Geister fliegen hinter dem Profilbild des Siegers hervor – auch zusammen mit Ring, Glut oder Flamme.' },
      { type: 'neu', text: 'Neuer Spieltisch für Season 4: herbstlicher Wald zur Golden Hour mit fallendem Laub, Bier auf dem Tisch und leuchtendem „Season 4“-Schild.' },
      { type: 'neu', text: 'Animationen: Grabstein beim Ausscheiden, beim Wiederbeleben erst ein wackelndes Profilbild mit „MEDIC!“-Sprechblase, dann eine Spritze, die vom Wiederbeleber zum Wiederbelebten fliegt, Feuerexplosion beim Feuer und Münzregen beim Rundensieg. In den Einstellungen abschaltbar.' },
      { type: 'neu', text: 'Neue Sounds: echte Furzgeräusche beim Ausscheiden (11 Aufnahmen, zufällig ausgewählt, nie zweimal dieselbe hintereinander), beim Wiederbeleben ein Soldat, der „MEDIIIC!“ ruft, bevor die Spritze kommt, beim Feuer eine Explosion mit anschließendem „So ein großer Feuerball, Junge!“ und beim Rundensieg ein zufälliger Siegessong – 11 Hits von „I Get Money“ über „Big Pimpin’“ und „C.R.E.A.M.“ bis „Geld essen“, nie zweimal derselbe hintereinander.' },
      { type: 'neu', text: 'Vibration mit eigenem Schalter in den Einstellungen, unabhängig vom Sound. Sie funktioniert auf Android-Handys – auf dem iPhone erlaubt Apple Web-Apps keine Vibration.' },
      { type: 'neu', text: 'Test-Buttons für Sound & Vibration in den Einstellungen (inkl. First Blood).' },
      { type: 'neu', text: 'Statistik-Kennzahlen pro Season oder gesamt: Sessions, Runden, Ø Einsatz, Ø Spieler pro Runde und Feuer.' },
      { type: 'neu', text: 'Achievements „Burning Man“ 🔥 (meiste Feuer), „First Blood“ 🩸 (Sieg in der ersten Runde einer Session) und „Aus dem Jenseits“ 👻 (wiederbelebt und gewonnen).' },
      { type: 'neu', text: 'Neuer Reiter „Mehr“ mit Regeln, Patch Notes und Einstellungen – die Einstellungen sind damit jederzeit erreichbar.' },
      { type: 'neu', text: 'Regeln: das offizielle Regelwerk mit Abschnitten und Paragraphen – bearbeitbar, mit Stand-Datum.' },
      { type: 'neu', text: 'Patch Notes: alle Updates mit Versionsnummer zum Nachlesen.' },
      { type: 'neu', text: 'Testmodus 🧪 in den Einstellungen: Seasons, Sessions und Runden zum Ausprobieren spielen, ohne dass echte Daten oder Statistiken verändert werden. Ein lila Banner zeigt an, wenn er aktiv ist. Mit Effekt-Vorschau für First Blood, alle Unwetter-Stufen und das Noob-Schild.' },
      { type: 'neu', text: 'Session-Übersicht: neueste Session oben, kompakte aufklappbare Kacheln mit Gewinner pro Runde.' },
      { type: 'verbessert', text: 'Alles passt auf jeden Bildschirm: Laufende Runde, Session starten und Runde vorbereiten sind ohne Scrollen komplett sichtbar, die Spielericons in der Runde deutlich größer. „Spieler & Sitzordnung“ sitzt oben neben dem Zahnrad, „Neue Runde“ und „Session beenden“ (in Orange) stehen nebeneinander.' },
      { type: 'verbessert', text: 'Hot Streak ☄️ zeigt die Länge der Siegesserie (z. B. „4 am Stück“) und wird auch bei kurzen Serien vergeben.' },
      { type: 'verbessert', text: 'Profilbild frei verschieben und mit zwei Fingern zoomen.' },
      { type: 'verbessert', text: 'Größere Pfeile für die Sitzordnung, neueste Season steht oben.' },
      { type: 'behoben', text: 'Der Sound blieb meist stumm, besonders beim Rundensieg – jetzt zuverlässig und lauter.' },
      { type: 'behoben', text: 'Der Geber zeigte nicht zuverlässig auf den Verlierer der Vorrunde – z. B. nach einer Wiederbelebung oder „Rückgängig“.' },
      { type: 'behoben', text: 'Bei vielen Achievements wurde der Spielername in der Statistik verdrängt.' },
      { type: 'entfernt', text: 'Statistiken „Rekord“ und „Serie“ – die Serie lebt in Hot Streak weiter.' },
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
