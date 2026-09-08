# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ein Einmaleins-Trainer, der vollständig im Browser läuft. Was das Tool fachlich
tut und wie man es benutzt, steht im `README.md` — hier steht nur, was beim
Arbeiten am Code wichtig ist und sich nicht aus einer einzelnen Datei ergibt.

## Kommandos

```
node --test                          # gesamte Suite (aktuell 50 Tests)
node --test test/parser.test.js      # eine einzelne Datei
python3 -m http.server 8000          # zum Ausprobieren, dann http://localhost:8000/
```

**`node --test test/` funktioniert nicht.** Node 22 deutet das Verzeichnis als
Modulpfad und bricht mit `MODULE_NOT_FOUND` ab. Der nackte Aufruf findet
`test/*.test.js` von selbst. Einzelne Dateien nur mit vollem Pfad.

Es gibt keine `package.json`, keinen Build-Schritt, keinen Linter und keine
Abhängigkeit — auch keine Entwicklungsabhängigkeit. Der Testrunner ist der in
Node eingebaute. Das ist eine Vorgabe, kein Zufall: wer hier ein Paket
hinzufügt, bricht den Entwurf.

## Aufbau

Genau **zwei ausgelieferte Dateien** im Wurzelverzeichnis:

- **`logic.js`** — reine Logik in drei Abschnitten mit Banner-Kommentaren:
  Zahlenparser, Karten und Scheduler, Speicherschicht. Wird per UMD-Hülle
  sowohl von `<script src>` im Browser als auch von `require()` in den Tests
  geladen.
- **`index.html`** — Markup, Styles und die gesamte DOM-, Sprach- und
  Ereignisanbindung in einem inline `<script>`.

### Die tragende Regel

**`logic.js` fasst niemals `window`, `document`, `localStorage`, `Date.now()`
oder `Math.random()` an.** Zeit, Zufall und Storage werden als Parameter
hineingereicht — `opts.now`, `opts.rng`, das Storage-Objekt mit
`getItem`/`setItem`. Genau das macht Scheduler und Speicherschicht ohne
Browser testbar, und genau daran hängen die 50 Tests.

Die einzige erlaubte Ausnahme ist `typeof self !== 'undefined' ? self : this`
in der UMD-Hülle. `logic.js` muss außerdem CommonJS-kompatibel bleiben — kein
`import`/`export`, sonst brechen die Tests.

Wer eine neue Entscheidungslogik in `index.html` schreibt, sollte prüfen, ob
sie nicht als reine Funktion nach `logic.js` gehört. Die beiden Stellen, an
denen eine Fehlbewertung dauerhaften Schaden anrichtet — welcher Wert aus den
Erkennungsalternativen gewertet wird und ob eine Antwort zählt — liegen
derzeit noch in `index.html`.

## Fachlogik, die man leicht falsch macht

Die verbindliche Quelle ist
`docs/superpowers/specs/2026-09-07-einmaleins-trainer-design.md`. Diese Punkte
sind mehrfach falsch umgesetzt worden:

- Eine Karte steigt **nur bei richtig UND schnell** eine Box. Richtig aber zu
  langsam lässt sie stehen — kein Fortschritt, aber ausdrücklich auch **kein**
  Rückschritt. Nur eine falsche Antwort setzt auf Box 0 zurück.
- Bei aktivem Mikrofon gilt `thresholdMs() + STT_THRESHOLD_BONUS_MS`, weil
  Sprechen länger dauert als Tippen.
- Die Zeit wird bis `onspeechend` gemessen, **nicht** bis zum Erkennungs­ergebnis
  — die Erkennungslatenz von 0,5–1,5 s darf nicht in die Lernzeit einfließen.
- **Freies Weiterüben läuft ohne Boxwirkung.** `session.ausFreiemUeben`
  entscheidet darüber; wer `gradeAnswer` dort erreichbar macht, zerstört den
  Auffrischungsplan durchs bloße Benutzen.
- **Ein Erkennungsfehler darf niemals eine Karte werten.** Nichts verstanden,
  keine Zahl erkannt, Mikrofon streikt, Netzwerk weg → Karte unverändert,
  Aufgabe erneut stellen. Ein Kind mit schlechtem Mikrofon würde sonst in
  Minuten wochenlangen Lernfortschritt zerstören.

## Fallen, die schon einmal Zeit gekostet haben

- **`file://` ist in Chrome ein „sicherer Kontext".** `window.isSecureContext`
  allein reicht nicht, um die Spracheingabe dort abzuschalten; die Prüfung
  braucht zusätzlich `location.protocol !== 'file:'`.
- **`font: … inherit` ist ungültig.** `inherit` als Familie in der
  `font`-Kurzform lässt den Browser die *gesamte* Deklaration verwerfen.
  Longhands verwenden.
- **Ein einzelner, wiederverwendeter `SpeechRecognition` kann Durchgänge nicht
  unterscheiden.** Deshalb wird pro Zuhör-Durchgang ein eigener Erkenner
  gebaut, der die Karte in seinem Abschluss festhält. Eine gemeinsame Variable
  reicht nicht — sie wird für die nächste Aufgabe überschrieben, bevor ein
  verspätetes Ergebnis eintrifft. Der `end`-Handler braucht dazu den
  Identitäts-Wächter, sonst entsteht eine Abbruch-Neustart-Schleife.
- **`#feedback` wird bei jeder Antwort neu geschrieben.** Wer dort eine
  dauerhafte Meldung ablegt, sieht sie nie — sie wird im selben Tick
  überschrieben, bevor der Browser zeichnet. Für Bleibendes gibt es
  `#speicherwarnung`.
- **Beim Prüfen im Browser den Cache abschalten** (`Network.setCacheDisabled`).
  Ein Nachlauf mit alten Messwerten sieht exakt so aus wie ein wirkungsloser
  Fix.

## Verifikation

`logic.js` ist durch Tests abgedeckt. `index.html` ist es **nicht** — Sprach-
und DOM-Schicht brauchen einen echten Browser, und das ist eine bewusste
Entscheidung, kein Versäumnis.

UI-Änderungen wurden bisher über das Chrome DevTools Protocol geprüft:
headless Chrome mit `--remote-debugging-port`, gesteuert aus Node über den
eingebauten `WebSocket` (ab Node 21 global, also ohne Abhängigkeit). Sprach­aus-
und -eingabe lassen sich dabei durch Attrappen ersetzen, sodass auch
Fehlerpfade und Zeitverhalten messbar sind. Berichte über UI-Verhalten sind
ohne solche Messung nicht belastbar — mehrfach sahen Fixes im Code korrekt aus
und wirkten trotzdem nicht.

## Sprache

Alle sichtbaren Texte und alle Codekommentare sind Deutsch, mit echten
Umlauten und ß. ASCII-Ersatzschreibungen wie `ae`, `oe`, `ue` oder `ss` statt
ß sind ein Verstoß — das hat schon eine eigene Korrekturrunde gekostet.

## Dokumente

- `docs/superpowers/specs/…-design.md` — die verbindliche Spec
- `docs/superpowers/plans/…-einmaleins-trainer.md` — der Umsetzungsplan.
  **Achtung:** Er enthält an mehreren Stellen Code, der sich als fehlerhaft
  erwiesen hat und im Repo korrigiert wurde. Bei Abweichung gilt der Code.
- `docs/superpowers/entscheidungen.md` — warum bestimmte Dinge so sind, samt
  der Fälle, in denen gegen den Plan entschieden wurde
