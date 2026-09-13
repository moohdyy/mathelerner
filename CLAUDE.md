# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ein Einmaleins-Trainer, der vollständig im Browser läuft. Was das Tool fachlich
tut und wie man es benutzt, steht im `README.md` — hier steht nur, was beim
Arbeiten am Code wichtig ist und sich nicht aus einer einzelnen Datei ergibt.

## Kommandos

```
node --test                          # gesamte Suite (aktuell 179 Tests)
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

- **`logic.js`** — reine Logik in nummerierten Abschnitten mit
  Banner-Kommentaren: Sprachpakete, Zahlenparser, Karten und Scheduler,
  Zeitanzeige, Mikrofonzustand, Speicherschicht, Fortschrittsanzeige. Wird per
  UMD-Hülle sowohl von `<script src>` im Browser als auch von `require()` in
  den Tests geladen.
- **`index.html`** — Markup, Styles und die gesamte DOM-, Sprach- und
  Ereignisanbindung in einem inline `<script>`.

### Die tragende Regel

**`logic.js` fasst niemals `window`, `document`, `localStorage`, `Date.now()`
oder `Math.random()` an.** Zeit, Zufall und Storage werden als Parameter
hineingereicht — `opts.now`, `opts.rng`, das Storage-Objekt mit
`getItem`/`setItem`. Die Sprache gehört in dieselbe Reihe: sie wird als
Parameter hineingereicht, `logic.js` liest sie nie selbst aus einem Profil.
Genau das macht Scheduler, Speicherschicht und Textbildung ohne Browser
testbar, und genau daran hängen die 179 Tests.

Die einzige erlaubte Ausnahme ist `typeof self !== 'undefined' ? self : this`
in der UMD-Hülle. `logic.js` muss außerdem CommonJS-kompatibel bleiben — kein
`import`/`export`, sonst brechen die Tests.

Wer eine neue Entscheidungslogik in `index.html` schreibt, sollte prüfen, ob
sie nicht als reine Funktion nach `logic.js` gehört. Von den beiden Stellen,
an denen eine Fehlbewertung dauerhaften Schaden anrichtet, liegt nur noch eine
in `index.html`: ob eine Antwort zählt. Welcher Wert aus einem
Erkennungsergebnis gewertet wird, rechnet `ML.chooseSpokenAnswer` — sie hat
genau deshalb den Weg nach `logic.js` genommen, weil sie in `index.html`
unsichtbar und ungetestet falsch lag.

## Fachlogik, die man leicht falsch macht

Die verbindliche Quelle ist
`docs/superpowers/specs/2026-09-07-einmaleins-trainer-design.md`. Diese Punkte
sind mehrfach falsch umgesetzt worden:

- Eine Karte steigt **nur bei richtig UND schnell** eine Box. Richtig aber zu
  langsam lässt sie stehen — kein Fortschritt, aber ausdrücklich auch **kein**
  Rückschritt. Nur eine falsche Antwort setzt auf Box 0 zurück.
- **Die sichtbare Uhr hat zwei Stufen, und die zweite ist der Grund, warum es
  die erste Regel noch gibt.** Der Timer läuft zuerst gegen die Zeitschwelle
  („schnell genug", Karte steigt) und danach durch eine **Kulanzphase** weiter
  bis zur **Gesamtfrist** = `ML.TIME_LIMIT_FACTOR` × Schwelle (derzeit 3×). In
  der Kulanz zählt eine richtige Antwort immer noch als „richtig, aber zu
  langsam": Karte bleibt stehen, kein Rückschritt. Erst der Ablauf der
  **Gesamtfrist** wertet die Karte als falsch.
  Wer den Timer auf die Zeitschwelle verkürzt, beseitigt damit die Regel
  darüber vollständig — es gäbe dann kein „zu langsam" mehr, weil vorher
  abgebrochen würde. Die Phasen rechnet `ML.timePhase` / `ML.timeDisplay`; die
  Wertung selbst macht weiterhin allein `gradeAnswer` aus der gemessenen Zeit.
- Bei aktivem Mikrofon gilt `thresholdMs() + STT_THRESHOLD_BONUS_MS`, weil
  Sprechen länger dauert als Tippen. Das gilt auch für den sichtbaren Timer
  und die Gesamtfrist — sonst läuft der Balken gegen eine andere Zeit, als
  gewertet wird.
- **Der Fristablauf wertet ausschließlich über `submitAnswer`.** Er ruft sie
  mit dem vierten Argument `timeUp` und fasst die Speicherschicht nicht selbst
  an. Es darf genau eine Stelle geben, die eine Karte verändert; ein zweiter
  Weg dorthin läuft irgendwann auseinander. Im freien Weiterüben wertet auch
  der Fristablauf nichts — dieselbe Weiche wie bei jeder anderen Antwort.
- **Der Timer läuft nie, wenn die Uhr steht.** `session.startedAt === 0` heißt
  „wird gerade vorgelesen"; hinter dem offenen Menü und in `awaitingAck` läuft
  ebenfalls nichts. `clockRunning()` bündelt diese Frage, `updateTimer()`
  ist der einzige Weg, den Timer zu stellen — deshalb darf sie aus jedem
  Zustandswechsel heraus gerufen werden, und deshalb können Anzeige und
  Wertung nicht auseinanderlaufen. Die vier Stellen, die die Uhr neu starten,
  ziehen alle mit: das Ende des Vorlesens in `nextQuestion` und im
  🔊-Handler, `closeMenu` und `retryUnderstood`.
- Die Zeit wird bis `onspeechend` gemessen, **nicht** bis zum Erkennungs­ergebnis
  — die Erkennungslatenz von 0,5–1,5 s darf nicht in die Lernzeit einfließen.
  `retryUnderstood` muss `stt.spokeEndAt` dabei mit zurücksetzen: der gemessene
  Sprechschluss gehört zum verworfenen Versuch und läge sonst *vor* dem neuen
  Uhrenstart — ein danach noch eintreffendes Ergebnis würde mit 0 ms gewertet.
- **Freies Weiterüben läuft ohne Boxwirkung.** `session.fromFreePlay`
  entscheidet darüber; wer `gradeAnswer` dort erreichbar macht, zerstört den
  Auffrischungsplan durchs bloße Benutzen.
- **Ein Erkennungsfehler darf niemals eine Karte werten.** Nichts verstanden,
  keine Zahl erkannt, Mikrofon streikt, Netzwerk weg → Karte unverändert,
  Aufgabe erneut stellen. Ein Kind mit schlechtem Mikrofon würde sonst in
  Minuten wochenlangen Lernfortschritt zerstören.
- **Ein unfertiges Erkennungsergebnis wertet nichts.** Der Erkenner liefert
  wachsende Präfixe — „4“ steht sekundenlang da, bevor „45“ daraus wird. Wer
  das erste Ergebnis mit einer Zahl wertet, wertet das Präfix und wirft die
  Karte auf Box 0, während die richtige Antwort vier Millisekunden später
  eintrifft. `ML.chooseSpokenAnswer` entscheidet das: gewertet wird erst, wenn
  das **letzte** Segment `isFinal` trägt. `rec.interimResults = false`
  schützt nicht davor — die On-Device-Erkennung ignoriert das Flag, deshalb
  steht es jetzt bewusst auf `true` und die Zwischenstände speisen nur die
  Anzeige.
- **Gewertet wird über alle finalen Segmente, nicht über `results[0]`.**
  Zerfällt die Äußerung, steht die Antwort im zweiten Segment („das
  frustrierend“ | „18“) und `results[0]` enthält nur Füllwörter. Die Karte
  bliebe ungewertet, obwohl die Zahl genannt wurde.
- **Ein Durchgang, der nach Sprache ohne Ergebnis endet, ist ein
  Erkennungsfehler.** Er kommt ohne `error` und ohne `result` — nur `end`.
  Wer ihn als Nicht-Ereignis behandelt, lässt das Kind vor „Einen Moment …“
  stehen, während die Uhr weiter gegen die Gesamtfrist läuft; der Fristablauf
  wertet die Karte dann **falsch**, obwohl das Kind gesprochen hat. Der
  `end`-Handler muss deshalb dasselbe tun wie `no-speech`: melden und
  `retryUnderstood` — also die Uhr zurückstellen. Sind Segmente da, die nie
  final wurden, finalisiert er sie (`assumeFinal`), sonst wäre bei einem
  Erkenner ohne `isFinal` das Mikrofon dauerhaft taub.
- **Nach einem Zwischenergebnis gilt die lange Watchdog-Frist.** Nach einem
  finalen folgt `end` sofort, nach einem unfertigen spricht das Kind noch.
  Mit der kurzen Frist schießt der Watchdog die laufende Äußerung ab, sobald
  jemand drei Sekunden überlegt — im Log als „watchdog: no end after result“
  mitten in einer Antwort zu sehen.
- **Eine Aufgabe wird nur gestellt, wenn *beide* Faktoren ausgewählt sind.**
  `settings.rows` ist die Menge der Zahlen, die überhaupt vorkommen dürfen;
  `ML.cardSelected` entscheidet mit UND, nicht mit ODER. Mit ODER wäre „die
  10er abwählen" wirkungslos — 3×10 bliebe drin, weil die 3 ausgewählt ist,
  und von 100 Aufgaben fielen ganze neun weg. Der Filter sitzt in `pickNext`
  selbst, damit ihn kein Aufrufer vergessen kann, und er gilt für Lernkarten
  und Auffrischungen gleichermaßen: eine geparkte Reihe darf nicht durch den
  Auffrischungsplan zurückkommen. Das freie Weiterüben zieht aus derselben
  Auswahl.
- **Eine Auswahländerung wertet keine Karte und stellt die Uhr nicht.**
  Dieselbe Regel wie beim Sprachwechsel: sie passiert im offenen Menü, wo die
  Uhr steht, und `closeMenu` startet sie. Die einzige Sonderbewegung liegt in
  `closeMenu`: gehört die wartende Aufgabe nicht mehr zur Auswahl, wird sie
  **ungewertet** verworfen und `nextQuestion` zieht eine neue — die stellt die
  Uhr ohnehin. Eine wartende Bestätigung (`awaitingAck`) behält ihre Aufgabe;
  dort schaut das Kind auf die Lösung einer bereits gegebenen Antwort.
  Karten ruhender Reihen behalten Box, Zeiten und Trefferquote.
- **`openCount`, `boxDistribution` und das freie Weiterüben rechnen über die
  Auswahl, `cardViews` über alle 100.** Die Anzeige „noch n von m offen"
  erreichte sonst nie die Null, und im Raster verschwände der geparkte
  Fortschritt, den man gerade sehen will. `trainer.progress` und `stats.open`
  tragen deshalb `{total}` statt einer festen 100.
- **Ein kaputtes `settings.rows` heilt auf „alle Reihen", nicht auf „keine".**
  `ML.normalizeRows` erzwingt das an jeder Eingangsstelle, und `ML.toggleRow`
  lässt die letzte Reihe stehen. Eine leere Auswahl hieße: kein Kartenpool,
  „alles geschafft" für ein Kind, das nichts gelernt hat.
- **`STATE_VERSION` bleibt 1.** Ein Versionssprung lässt `loadState` alle
  Profile verwerfen — wochenlanger Fortschritt für ein neues Feld. Ein
  fehlendes `settings.lang` wird beim Lesen geheilt, nicht durch einen
  Versionssprung erzwungen, und es wird auf `de` geheilt: bestehende Stände
  stammen aus der einsprachigen Fassung, unabhängig davon, was der Browser
  meldet. Für `settings.rows` gilt dasselbe.
- **`refreshDue` wird gerechnet, nicht am Text erkannt.** Das Flag kommt aus
  `card.due` und `now`, der Text daraus — nicht umgekehrt. Ein Vergleich gegen
  „Auffrischung fällig" liefert in jeder anderen Sprache `false` und der
  Auffrischungsplan verschwindet lautlos.
- **Ein Sprachwechsel verändert keine Karte und stellt die Uhr nicht.** Er
  findet im offenen Menü statt, wo die Uhr ohnehin steht; `closeMenu` startet
  sie wie nach jedem anderen Menübesuch. Wer im Wechsel-Handler selbst an der
  Uhr dreht, schafft eine fünfte Stelle, die sie stellt.
- **`rec.lang` wird beim Bau des Erkenners gesetzt** und ändert sich an einem
  laufenden nicht mehr. Ein Sprachwechsel muss den laufenden Erkenner also
  verwerfen; `closeMenu` baut den nächsten mit dem neuen `speechLang`. Ohne
  das spricht das Kind englisch und wird deutsch erkannt — und das wertet eine
  Karte falsch.

## Fallen, die schon einmal Zeit gekostet haben

- **`#menu` deckt nur zu, solange nichts anderes positioniert ist.** Das Menü
  ist ein Vollbild-Overlay und hatte lange kein `z-index` — es lag über dem
  Trainer allein deshalb, weil `position: fixed` gegen lauter statische
  Elemente gewinnt. Sobald im Trainer ein Element `position: relative` oder
  einen `z-index` bekommt, gewinnt *es*, und der Inhalt steht mitten in den
  Einstellungen. Genau so sind der Timerbalken und der Blitz durchs Menü
  geschlagen. Das Menü hat jetzt `z-index: 10`; wer im Trainer etwas höher
  legt, bricht es wieder.
- **Pakete einzeln geprüft heißt nicht zusammen geprüft.** Der obige Fehler
  war in keinem der vier Änderungszweige sichtbar, weil jeder für sich
  stimmte. Erst ein Durchlauf gegen den zusammengeführten Stand hat ihn
  gezeigt. Nach dem Zusammenführen mehrerer UI-Änderungen also noch einmal
  im Browser nachsehen — besonders auf Elemente, die sich überlagern können.
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
  `#storage-warning`.
- **Die Mikrofon-Statuszeile hat dasselbe Problem und löst es mit einer
  Sperre.** Der laufende Zustand wird bei jedem Ereignis aus der Lage neu
  gerechnet (`ML.micState`); die kurzlebigen Meldungen — verstanden,
  nicht verstanden, nichts gehört — setzt `micReport()` und hält damit die
  Neuberechnung eine Weile fest. Ohne diese Sperre wäre „Verstanden: 40“
  unsichtbar: die nächste Aufgabe folgt im selben Tick. Nur
  `micUpdate(true)` räumt die Sperre ab; das tun ausschließlich
  bewusste Handlungen (Mikrofon aus, Menü auf) und die Ereignisse des
  **aktuellen** Durchgangs.
- **Das Menü ist ein Flex-Container und staucht hohe Kinder.** `#menu` ist
  `display: flex; flex-direction: column`. Sobald der Inhalt länger wird als
  der Bildschirm, schrumpft Flexbox die Kinder — das Aufgabenraster stand mit
  120 px statt 345 px da und war abgeschnitten. Deshalb `#menu > * { flex:
  none; }`. Wer dort etwas Hohes einbaut, prüft `scrollHeight` gegen
  `clientHeight`; im Bildschirmfoto sieht der Fehler wie eine harmlose Lücke aus.
- **`aspect-ratio` greift in einer Tabellenzelle mit `table-layout: fixed`
  nicht.** Die Breite ist beim Berechnen der Höhe noch unbestimmt, und Chrome
  fällt auf die Inhaltshöhe zurück (gemessen: 27,8 × 24 px). Quadratische
  Zellen entstehen dort über `height: 0; padding-bottom: calc(100% - 2px)` —
  die 2 px sind der Rahmen, den `box-sizing: border-box` zur Höhe zählt.
- **Ein gestrichelter 1-px-Rahmen auf einer gefüllten Zelle ist unsichtbar.**
  Die ruhenden Rasterzellen trugen zuerst nur `border-style: dashed` und
  `opacity: .5` — im Bildschirmfoto war der Unterschied zu den aktiven Zellen
  nicht zu erkennen. Sichtbar wurde es erst, als der graue Körper wegfiel
  (`background: transparent`): ein leerer Umriss neben einem gefüllten Gefäß.
  Die Kopfzahlen der aktiven Reihen tragen zusätzlich `.on`.
- **Regeln für Elemente im Menü brauchen `#menu` im Selektor.** `#menu button`
  hat die Spezifität (1,0,1) und schlägt jede reine Klasse — eine
  `.card { border-style: dashed }` wäre wirkungslos verpufft.
- **Eine CSS-Animation startet nicht neu, wenn die Klasse im selben Tick
  gesetzt bleibt.** Zwei schnell aufeinanderfolgende richtige Antworten setzen
  beide `#flash` auf `ok`; ohne den erzwungenen Umbruch (`void
  el.flash.offsetWidth`) zwischen Entfernen und Setzen sieht der Browser
  keinen Wechsel und das zweite Aufleuchten bleibt aus.
- **`requestAnimationFrame` läuft im Hintergrundtab gar nicht und
  `setTimeout` wird dort gedrosselt.** Der Timer zeichnet per rAF, die Frist
  hängt aber an einem eigenen `setTimeout`, und beide rechnen aus
  `Date.now() - session.startedAt`. Der Fristablauf prüft die echte Zeit noch
  einmal nach und stellt sich neu, wenn er zu früh kam. Wer stattdessen Ticks
  zählt, wertet im Hintergrundtab falsch.
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

Eine brauchbare Attrappe für `SpeechRecognition` muss mehr können als ein
fertiges Ergebnis liefern. Die Fälle, in denen die Wertung tatsächlich
schiefging, sind genau die unbequemen: wachsende Zwischenergebnisse, ein
Ergebnis in einem zweiten Segment, ein Durchgang der nie `isFinal` setzt, und
einer der nach `speechend` nur noch `end` meldet. Eine Attrappe ohne diese
vier prüft den Normalfall, der ohnehin nie kaputt war. Die Sprache der
Prüfung ist dabei nicht deutsch: headless Chrome meldet `en`, also gegen
`ML.t` vergleichen statt gegen feste Texte.

Für die Sprachschicht haben sich zwei Prüfungen als die aussagekräftigen
erwiesen, und beide laufen über das DOM, nicht über Augenmaß: erstens, dass
jedes markierte Element genau das trägt, was `ML.t` für die aktive Sprache
liefert; zweitens, dass kein Blattelement einen Text hat, der wie ein
Schlüsselname aussieht (`/^[a-z]+(\.[a-z0-9]+)+$/`) — ein Schlüssel als
sichtbarer Text heißt, dass ein Paket ihn nicht kennt. Eine Suche nach
„Resten der anderen Sprache" braucht dagegen Wortgrenzen und muss den inline
`<script>` auslassen: dessen Kommentare sind deutsch und sein Code englisch,
und der deutsche Plural „Profile" enthält das englische Wort „Profile". Ohne
diese beiden Einschränkungen meldet die Suche lauter Treffer, die keine sind.

## Sprache

**Der Code ist Englisch, die sichtbaren Texte liegen in den Sprachpaketen.**
Bezeichner, Kommentare, Testnamen, CSS-Klassen, DOM-IDs und Konsolenausgaben:
Englisch, und auch übersetzt wird dort nichts — eine deutsche Konsolenzeile
hilft niemandem.

**Alles Sprachliche liegt in `LOCALES` in `logic.js`.** `index.html` trägt nur
noch Schlüssel: `data-i18n` und seine drei Attributgeschwister im Markup,
`t(key, params)` im Script. Wer für eine neue Sprache `index.html` anfassen
muss, hat damit keine Aufgabe gefunden, sondern eine unvollständige Trennung —
die gehört korrigiert, nicht umgangen. Eine dritte Sprache besteht aus
`spellXx(n)`, einem Paket in `LOCALES` und der Kennung in der Reihenfolge von
`ML.LANGUAGES`. Mehr nicht.

Die deutschen Texte tragen echte Umlaute und ß. ASCII-Ersatzschreibungen wie
`ae`, `oe`, `ue` oder `ss` statt ß sind dort ein Verstoß — das hat schon eine
eigene Korrekturrunde gekostet.

Die Zahlwörter im Parser (`ONES`, `TEENS`, `TENS`, `spellGerman`,
`spellEnglish`) sind Fachdaten, keine Oberfläche: die Wörter stehen natürlich
in ihrer Sprache, die Bezeichner drumherum sind Englisch.

**`fillerWords` ist eine Eigenschaft des Pakets, keine globale Regel.**
Englisch muss `and` verwerfen, damit „one hundred and five" zusammenwächst.
Deutsch darf `und` auf keinen Fall verwerfen: „acht und vierzig" würde zu
`achtvierzig`, stünde in keiner Tabelle und zerfiele in 8 und 40.

**Weder `a` noch `oh` gehören in die englischen Zahlwörter.** Beide stecken in
Zögerfloskeln, und `parseNumber` nimmt die *erste* gefundene Zahl — „oh,
twenty-four" würde als 0 gewertet und die Karte fiele auf Box 0 zurück. Ein
Zögern darf keine Karte kosten; aus demselben Grund bleibt im Deutschen
„eine" draußen.

**`ML.t` darf bei einem unbekannten Schlüssel schweigen** und den
Schlüsselnamen selbst zurückgeben, weil ein beschädigter gespeicherter Wert
die Seite nicht töten soll. Dass das nie im Betrieb passiert, sichert allein
der Vollständigkeitstest in `test/i18n.test.js` — jedes Paket hat denselben
Schlüsselsatz, dieselben Pluralformen, dieselben Platzhalter. Wer den Test
aufweicht, macht aus dem Schweigen einen sichtbaren Schlüsselnamen im Menü.

## Dokumente

- `docs/superpowers/specs/…-einmaleins-trainer-design.md` — die verbindliche Spec
- `docs/superpowers/specs/…-mehrsprachigkeit-design.md` — die verbindliche Spec
  der Sprachschicht: Paketaufbau, Übersetzer, Parser, Umschaltreihenfolge
- `docs/superpowers/plans/…-einmaleins-trainer.md` — der Umsetzungsplan.
  **Achtung:** Er enthält an mehreren Stellen Code, der sich als fehlerhaft
  erwiesen hat und im Repo korrigiert wurde. Bei Abweichung gilt der Code.
- `docs/superpowers/entscheidungen.md` — warum bestimmte Dinge so sind, samt
  der Fälle, in denen gegen den Plan entschieden wurde
