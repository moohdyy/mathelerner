# Prüfungen

Drei Ebenen, und sie prüfen absichtlich Verschiedenes.

## `test/*.test.js` — die Logik

    node --test test/*.test.js

Deckt `logic.js` ab. Das ausdrückliche Muster ist nötig: der nackte Aufruf
`node --test` sammelt auch `test/browser/*.js` ein und führt den Harness als
Testdatei aus.

## `test/browser/` — `index.html` im echten Chrome

    node test/browser/run.js [pfad/zum/worktree]

`index.html` hat keine Unit-Tests, und das ist eine Entscheidung: Sprach- und
DOM-Schicht brauchen einen echten Browser. `run.js` startet headless Chrome
über das DevTools-Protokoll, gesteuert aus Node über den eingebauten
`WebSocket` — keine Abhängigkeit, wie im Rest des Projekts auch.

`mocks.js` wird **vor** dem Seitenskript installiert und stellt nach:

* `SpeechRecognition` im Dauermodus — wachsende Segmente, ein `speechstart` pro
  Durchgang, kein `end` nach einem Ergebnis. Von Hand ausgelöst mit
  `_say(texte, final)`, `_speechend()` und `_sound()`. Die letzte ist der
  Durchgang, in dem Chrome nur Geräusch meldet und die Äußerung dann
  verschluckt — der Fall, der Karten falsch gewertet hat.
* den Pegel-Detektor — `getUserMedia` und `AudioContext` als Attrappe, der
  Pegel steht in `window.__probe.level`. Damit ist das Sprechende ein
  steuerbarer Zeitpunkt statt echtes Audio.
* `speechSynthesis` — antwortet sofort, damit die Uhr nicht am Vorlesen hängt.

Die Prüfsprache ist **nicht** deutsch: headless Chrome meldet `en`. Gegen
`ML.t` vergleichen, nie gegen feste Texte. Zeiten gegen
`window.__app.STT_SETTLE_MS` rechnen statt gegen eine abgeschriebene Zahl.

## `test/stt-diag/` — der echte Erkenner am echten Mikrofon

    python3 -m http.server 8077     # aus test/stt-diag/ heraus

Was der Harness nicht kann: das Verhalten von Chromes Erkenner selbst. Die
Seite schaltet `continuous`, `interimResults`, `processLocally` und die Sprache
einzeln um, protokolliert jedes Ereignis mit ms-Zeitstempel und misst über
einen eigenen Pegel-Detektor das echte Sprechende mit. Der Abstand zwischen
`VAD SPEECHEND` und dem nächsten `RESULT` **ist** die Erkennungslatenz.

`processLocally` nur ankreuzen, wenn `available(…, local)` auch `available`
meldet — sonst wirft der Erkenner sofort `language-not-supported`.

Fragen wie „warum kommt kein Ergebnis“ beantwortet nur diese Seite. Ohne sie
wird geraten.
