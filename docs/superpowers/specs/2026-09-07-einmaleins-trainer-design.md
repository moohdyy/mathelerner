# Einmaleins-Trainer — Design

Datum: 2026-09-07
Status: freigegeben

## Zweck

Ein ablenkungsfreies Browser-Tool zum Automatisieren des kleinen Einmaleins.
Der Nutzer beantwortet zufällige Aufgaben möglichst schnell. Aufgaben, die er
mehrfach schnell und richtig löst, verschwinden aus dem Pool, sodass am Ende nur
die Problemaufgaben übrig bleiben. Wahlweise mit Sprachausgabe der Aufgabe und
Spracheingabe der Antwort.

Kein Backend, kein Framework, keine Abhängigkeiten.

## Abgrenzung

Teil 1 umfasst ausschließlich die Multiplikation 1×1 bis 10×10. Division, großes
Einmaleins, Punkte/Badges/Sounds, Bestenlisten und Export/Import sind
ausdrücklich nicht Teil dieses Designs.

## Recherche-Grundlage

Sprachausgabe (`SpeechSynthesis`) ist in allen Browsern inklusive Firefox
verfügbar, offline und mit vorinstallierten deutschen Stimmen. Stolpersteine:
Die Stimmenliste lädt asynchron (`onvoiceschanged` abwarten) und iOS/Safari
verlangt eine Nutzergeste, bevor gesprochen werden darf.

Spracheingabe (`SpeechRecognition`) funktioniert in Chrome, Edge, Opera und
Safari (macOS 14.1+, iOS 14.5+), **nicht** in Firefox. Sie verlangt zwingend
HTTPS oder `localhost`. Chrome sendet Audio klassischerweise an Google-Server;
seit Chrome 139 erlaubt `processLocally` zusammen mit `SpeechRecognition.available()`
On-Device-Erkennung mit deutlich geringerer Latenz. Die Erkennung deutscher
Zahlen liefert uneinheitliche Formen (`"48"`, `"achtundvierzig"`,
`"acht und vierzig"`) und braucht einen eigenen Parser. Kinderstimmen werden von
ASR-Modellen messbar schlechter erkannt als Erwachsenenstimmen.

Vergleichbare Tools existieren (schuNa, TU Graz 1×1 Trainer, einmaleins.at,
Tintenklex), aber keines kombiniert Spracheingabe, Zeitmessung pro Aufgabe,
adaptives Ausblenden gemeisterter Aufgaben und ein radikal ablenkungsfreies UI.

## Architektur

Zwei Dateien, kein Build-Schritt, kein npm:

- `index.html` — Markup, Styles und die gesamte DOM-/Sprach-Anbindung
- `logic.js` — Scheduler, Zahlenparser und Speicherschicht als reine Funktionen,
  eingebunden per `<script src="logic.js">` und importierbar für `node --test`

Auslieferung über GitHub Pages (liefert das für das Mikrofon nötige HTTPS).
Lokal per Doppelklick nutzbar, dann ohne Spracheingabe.

Begründung der Trennung: Scheduler und Zahlenparser sind die einzigen logisch
kniffligen Teile und mit Handproben im Browser nicht zuverlässig zu prüfen. Als
reine Funktionen ohne DOM sind sie ideal testbar. Für den Nutzer ändert die
zweite Datei nichts.

## Datenmodell

Ein einziger localStorage-Key `mathelerner.v1`:

```
{
  version: 1,
  activeProfile: "p1",
  profiles: {
    "p1": {
      name: "Anna",
      created: <timestamp>,
      settings: { tts: bool, stt: bool, thresholdMs: 3000 },
      cards: { "7x8": { box, due, refreshLevel, seen, correct, bestMs, lastMs } },
      stats: { sessions, totalAnswers }
    }
  }
}
```

Kartenschlüssel ist `"<a>x<b>"`. Es gibt 100 Karten; `7x8` und `8x7` sind
getrennte Karten, weil Lernende oft nur eine Richtung sicher beherrschen. Alle
100 werden beim Anlegen eines Profils mit `box: 0` erzeugt.

Mehrere Profile teilen sich denselben Key, jedes mit eigenem Lernstand und
eigenen Einstellungen. Beim Start wird das zuletzt aktive Profil geladen.

## Lernalgorithmus

### Boxen

Vier Zustände pro Karte: Box 0 (neu oder Problemfall) → 1 → 2 → 3 (gemeistert).
Drei Treffer bringen eine Karte von 0 auf gemeistert.

| Ergebnis | Wirkung |
|---|---|
| richtig **und** Zeit ≤ Schwelle | Box +1 |
| richtig, aber zu langsam | Box bleibt unverändert |
| falsch | Box zurück auf 0 |

Die mittlere Regel ist bewusst milde: Wer die richtige Antwort weiß, aber zu
lange braucht, soll nicht zurückgestuft werden, sondern nur nicht weiterkommen.
Rückstufung erfolgt ausschließlich bei echten Fehlern.

Zeitschwelle: 3000 ms als Standard, pro Profil einstellbar. Bei aktivem Mikrofon
gilt die Schwelle **+1000 ms**, weil Aussprechen länger dauert als Tippen — damit
bleiben Tipp- und Sprechsitzungen vergleichbar.

### Auffrischung

Gemeisterte Karten (Box 3) bekommen ein Fälligkeitsdatum `due`, gesteuert über
`refreshLevel`:

| refreshLevel | nächste Fälligkeit |
|---|---|
| 0 | +2 Tage |
| 1 | +7 Tage |
| 2 und höher | +30 Tage |

Eine fällige Auffrischung, die richtig und schnell beantwortet wird, erhöht
`refreshLevel` und setzt ein neues `due`. Eine falsch beantwortete Auffrischung
setzt die Karte auf `box: 0` und `refreshLevel: 0` zurück.

Fällige Auffrischungen dürfen höchstens **jede fünfte** Aufgabe einer Sitzung
stellen. Sonst besteht eine Sitzung irgendwann nur noch aus Wiederholung statt
aus den Problemfällen.

### Auswahl der nächsten Aufgabe

1. Ist die Auffrischungsquote (max. 1 von 5) noch nicht ausgeschöpft und
   existiert eine fällige Karte in Box 3, wird diese gestellt.
2. Sonst gewichtete Zufallsauswahl aus Box 0–2 mit den Gewichten 3 / 2 / 1.
   Problemfragen kommen dadurch häufiger, ohne vorhersehbar zu werden.
3. Die zuletzt gestellten drei Karten werden übersprungen, solange der Pool mehr
   als drei Karten enthält.
4. Ist alles gemeistert und nichts fällig, erscheint ein Abschlussbildschirm mit
   der Option, gleichgewichtet frei weiterzuüben (ohne Boxwirkung).

### Zeitmessung

Ohne Mikrofon: Uhr startet, wenn die Aufgabe sichtbar wird — bei aktiver
Sprachausgabe erst, wenn das Vorlesen endet (`utterance.onend`). Sie stoppt bei
der Eingabebestätigung.

Mit Mikrofon ist eine exakte Messung nicht möglich, weil die Erkennung selbst
0,5–1,5 s benötigt, die nicht in die Zeit einfließen dürfen. Gemessen wird
deshalb bis `onspeechend`, also bis zu dem Moment, in dem der Browser das Ende
des Sprechens erkennt — vor der eigentlichen Erkennung. Das ist eine Näherung
und wird als solche behandelt; die um 1000 ms erhöhte Schwelle gleicht sie aus.

## Oberfläche

### Übungsbildschirm

Der Regelfall und praktisch der einzige Bildschirm. Zentriert und sehr groß die
Aufgabe (`7 × 8`), darunter ein großes Eingabefeld mit `inputmode="numeric"` und
Autofokus, damit auf Mobilgeräten sofort der Ziffernblock erscheint. Bestätigt
wird mit Enter oder über eine breite Touch-Fläche.

Rückmeldung bei richtiger Antwort: kurzes grünes Aufblitzen, danach sofort die
nächste Aufgabe ohne weiteren Klick. Bei falscher Antwort: rot, die richtige
Antwort wird eingeblendet, und es geht erst auf Enter weiter — ein Fehler soll
einen Moment stehenbleiben.

Ablenkungsfrei bedeutet konkret: keine Punkte, Sterne, Sounds, Maskottchen oder
Animationen außer dem Farbblitz. Einziger dauerhaft sichtbarer Zusatz ist eine
dezente Zeile „noch N von 100 offen" — der schrumpfende Stapel ist der Motivator.

Oben rechts zwei kleine Schalter: 🔊 Vorlesen und 🎤 Mikrofon, unabhängig
voneinander. Die Aufgabe ist immer auch sichtbar, auch bei aktivem Vorlesen.
Hell/Dunkel folgt `prefers-color-scheme`.

Alles Weitere — Statistik, langsamste Karten, Profilwechsel und -anlage,
Zeitschwelle — liegt hinter einem einzelnen unauffälligen Knopf.

### Sprachausgabe

Vorgelesen wird der ausgeschriebene Text `"7 mal 8"`; das Zeichen `×` wird von
manchen Engines nicht oder falsch ausgesprochen. Die deutsche Stimme wird aus
`getVoices()` gewählt, nachdem `onvoiceschanged` gefeuert hat. Der erste Tap auf
„Start" schaltet die Sprachausgabe für iOS/Safari frei.

### Spracheingabe

`maxAlternatives = 5`. Ergibt **eine** der Alternativen die richtige Zahl, gilt
die Antwort als richtig — ohne diese Toleranz ist Browser-ASR im Alltag
unbenutzbar. Ergibt keine Alternative die richtige Zahl, wird die erste als
gültige Zahl lesbare Alternative als Antwort gewertet.

Wo verfügbar, wird On-Device-Erkennung angefordert (`processLocally` nach
Prüfung über `SpeechRecognition.available()`); andernfalls automatisch der
serverbasierte Weg, ohne Bruch für den Nutzer.

Der Zahlenparser verarbeitet: Ziffernform (`"48"`), zusammengeschriebene
Zahlwörter (`"achtundvierzig"`), getrennt geschriebene Formen
(`"acht und vierzig"`), Satzzeichen und Groß-/Kleinschreibung, Einbettung in
einen Satz sowie die häufige Fehlerkennung `"zwo"` → 2. Gültiger Wertebereich
ist 1–100; alles andere liefert `null`.

## Fehlerverhalten

Die zentrale Regel: **Ein Erkennungsfehler darf niemals eine Karte
zurückwerfen.** Wenn nichts verstanden wurde, keine Zahl herauskam, das Mikrofon
streikt oder die Netzwerkerkennung scheitert, wird die Karte nicht gewertet und
die Aufgabe erneut gestellt. Andernfalls zerstört ein schlechtes Mikrofon in
wenigen Minuten den echten Lernstand.

Weitere Fälle, in denen das Tool jeweils voll benutzbar bleibt:

- Firefox oder fehlende `SpeechRecognition`-API → Mikrofon-Schalter wird nicht
  angezeigt
- Aufruf über `file://` → Schalter deaktiviert, mit dem Hinweis, dass das
  Mikrofon HTTPS benötigt
- Mikrofon-Berechtigung verweigert → Schalter aus, einmalige Meldung, Tastatur
  läuft weiter
- Beschädigtes JSON im localStorage → Rückfall auf Standardwerte statt Absturz

## Tests

`node --test` gegen `logic.js`:

**Zahlenparser** — alle Zahlwörter 0–100 generativ, Ziffernform, getrennt
geschriebene Formen, Satzzeichen, Groß-/Kleinschreibung, `"zwo"`, Einbettung in
Sätze, Nicht-Zahlen ergeben `null`.

**Scheduler** — alle drei Ergebnisfälle, drei Treffer bis gemeistert,
Fälligkeiten 2/7/30 Tage, Rückfall bei verpatzter Auffrischung,
Auffrischungsquote höchstens jede fünfte Aufgabe, keine Wiederholung der letzten
drei Karten, Verhalten bei leerem Pool.

**Speicher** — Standardwerte, Profil anlegen und löschen, beschädigtes JSON
führt nicht zum Absturz.

Sprachein- und -ausgabe werden nicht automatisiert getestet; das verlangt echte
Browser und ein echtes Mikrofon. Sie werden manuell verifiziert, und es wird
ausdrücklich berichtet, was verifiziert wurde und was nicht.
