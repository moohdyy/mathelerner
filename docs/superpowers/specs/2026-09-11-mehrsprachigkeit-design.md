# Mehrsprachigkeit — Design

Datum: 2026-09-11
Status: verbindlich

Der Einmaleins-Trainer ist heute einsprachig deutsch: Oberflächentexte,
Zahlwortparser, Sprachausgabe und Spracherkennung sind an mehreren Stellen
fest verdrahtet. Dieses Dokument beschreibt, wie die Sprache zu einer
Profileinstellung wird, welche Schnittstelle die Sprachpakete haben und was
nötig ist, um später eine dritte Sprache hinzuzufügen.

Ausgeliefert wird weiterhin nur `logic.js` und `index.html`. Es kommt keine
Abhängigkeit und keine dritte ausgelieferte Datei dazu.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Geltungsbereich | Pro Profil, neben `tts`/`stt`/`thresholdMs` |
| Vorgabe für neue Profile | Aus `navigator.language` abgeleitet, Rückfall Deutsch |
| Englische Variante | Genau eine, `en-US` |
| Ort der Texte | Sprachpakete in `logic.js`, ein zentraler Übersetzer |
| Bestehende Profile | Behalten ihren Fortschritt, bekommen `lang: 'de'` |

Verworfen wurde, `logic.js` nur noch Daten zurückgeben zu lassen und die
Textbildung nach `index.html` zu verschieben: das verlegt Logik in die
ungetestete Datei. Ebenso verworfen wurden externe `i18n/*.json` — sie brechen
die Zwei-Dateien-Vorgabe und scheitern unter `file://` an `fetch`.

## 1 — Das Sprachpaket

Ein Paket je Sprache, in `logic.js`, in einem eigenen Abschnitt mit
Banner-Kommentar. Alles Sprachliche liegt darin; nichts Sprachliches liegt
außerhalb.

```js
{
  id: 'en',
  label: 'English',            // im Menü, stets in der eigenen Sprache
  htmlLang: 'en',              // für <html lang>
  speechLang: 'en-US',         // für TTS und STT
  decimal: '.',                // 1.4 s gegenüber 1,4 s
  spell: spellEnglish,         // n -> Zahlwort, erzeugt die Parser-Tabelle
  extraWords: { … },           // Formen, die spell() nicht erzeugt
  fillerWords: ['and'],        // vor dem Zusammensetzen verworfen
  plural: function (n) { return n === 1 ? 'one' : 'other'; },
  spokenQuestion: function (a, b) { return a + ' times ' + b; },
  texts: { … }
}
```

`label` steht bewusst in der eigenen Sprache: wer die Oberfläche nicht lesen
kann, findet „English" auch in einem deutschen Menü.

`spell` und `spokenQuestion` sind Funktionen, keine Tabellen — die deutsche
Zusammensetzung („achtundvierzig") und der deutsche Sonderfall „ein mal drei"
lassen sich nicht als Daten ausdrücken.

### Der Übersetzer

```
ML.t(lang, key, params)
```

Ein Textwert ist entweder ein String oder ein Objekt mit Pluralformen
(`{ one: …, other: … }`); im zweiten Fall wählt `plural(params.n)` des Pakets
die Form. Platzhalter werden als `{name}` geschrieben und aus `params` ersetzt.

`t` wirft nie:

- unbekannte Sprache → Paket der Vorgabesprache
- unbekannter Schlüssel → der Schlüsselname selbst als Text

Der Grund ist nicht Bequemlichkeit: ein beschädigter gespeicherter Wert oder
eine unvollständige neue Übersetzung darf die Seite nicht töten. Dass eine
Übersetzung fehlt, meldet stattdessen der Vollständigkeitstest (§ 7).

### Weitere Funktionen

```
ML.LANGUAGES           // [{ id, label }, …] in fester Reihenfolge, fürs Menü
ML.DEFAULT_LANGUAGE    // 'de'
ML.locale(lang)        // das Paket, mit Rückfall auf die Vorgabe
ML.resolveLanguage(t)  // 'en-GB' -> 'en', 'de-AT' -> 'de', Unbekanntes -> 'de'
```

`resolveLanguage` vergleicht nur den Teil vor dem Bindestrich und ist damit
unabhängig davon, welche Regionsvarianten der Browser meldet.

## 2 — Der Parser wird sprachfähig

Aus `parseGermanNumber` / `parseGermanNumbers` werden
`parseNumber(text, lang)` / `parseNumbers(text, lang)`. Der Algorithmus bleibt
unverändert: Ziffern haben Vorrang, sonst wandert ein Fenster über die Wörter
und an jeder Stelle gewinnt die längste Übereinstimmung.

Drei Dinge werden sprachabhängig:

**Die Worttabelle.** Sie wird weiterhin aus `spell(n)` für 0–999 erzeugt,
jetzt aber je Paket und einmalig beim Laden zwischengespeichert.

**Die Normalisierung.** `normalizeWord` verliert seine deutsche Prägung und
behält Buchstaben und Ziffern jeder Sprache: `/[^\p{L}\p{N}]/gu`, dazu
weiterhin Kleinschreibung und `ß` → `ss`. Damit normalisieren „forty-eight"
und „forty eight" beide auf `fortyeight` — genau das, was die Tabelle aus
`spellEnglish(48)` erzeugt. Die Normalisierung wird wie bisher identisch auf
Eingabe und Tabelle angewandt.

**Die Füllwörter.** Englisch muss `and` verwerfen, bevor die Wörter
zusammengesetzt werden: „one hundred and five" soll `onehundredfive` ergeben.
Deutsch darf `und` auf keinen Fall verwerfen — „acht und vierzig" würde sonst
zu `achtvierzig`, stünde nicht in der Tabelle und zerfiele in 8 und 40. Genau
deshalb ist `fillerWords` eine Eigenschaft des Pakets und keine globale Regel.

### Englische Zahlwörter

```
ONES   zero one two three four five six seven eight nine
TEENS  ten eleven twelve … nineteen
TENS   – – twenty thirty forty fifty sixty seventy eighty ninety
< 100  TENS[t] + '-' + ONES[o]      (Bindestrich fällt der Normalisierung zum Opfer)
>= 100 ONES[h] + ' hundred ' + Rest
```

`extraWords` bleibt für Englisch leer, und zwar aus demselben Grund, aus dem
im Deutschen „eine" draußen bleibt: Der Artikel `a` und das gesprochene `oh`
für Null stecken in Zögerfloskeln („maybe a…", „oh, twenty-four"). Da
`parseNumber` die **erste** gefundene Zahl nimmt, würde „oh, twenty-four" als
0 gewertet und die Karte fiele zurück. Ein Zögern darf keine Karte kosten.

`MAX_NUMBER_WORDS` bleibt bei 6 und deckt beide Sprachen ab.

## 3 — Textfunktionen in `logic.js`

Jede Funktion, die sichtbaren Text erzeugt, bekommt die Sprache als Parameter
hineingereicht — dieselbe Regel, nach der heute schon `now`, `rng` und das
Storage-Objekt hereingereicht werden. `logic.js` liest die Sprache nie selbst
aus einem Profil.

| vorher | nachher |
|---|---|
| `BOX_NAMES` (Konstante) | `boxNames(lang)` |
| `timeText(ms)` | `timeText(ms, lang)` |
| `refreshText(card, now)` | `refreshText(card, now, lang)` |
| `scoreText(card)` | `scoreText(card, lang)` |
| `cardView(card, key, now)` | `cardView(card, key, now, lang)` |
| `cardViews(profile, now)` | `cardViews(profile, now, lang)` |
| `spokenQuestion(a, b)` | `spokenQuestion(a, b, lang)` |
| `parseGermanNumber(text)` | `parseNumber(text, lang)` |
| `parseGermanNumbers(text)` | `parseNumbers(text, lang)` |

`BOX_NAMES` entfällt als exportierte Konstante. Es bleibt keine
Übergangsfassung der alten Namen stehen: zwei Wege zum selben Text laufen
auseinander, und der Aufrufer, der den alten Weg nimmt, bleibt deutsch, ohne
dass es jemand bemerkt.

`cardView().refreshDue` darf **nicht** länger durch Vergleich mit dem deutschen
Text „Auffrischung fällig" bestimmt werden. Das Flag wird aus `card.due` und
`now` berechnet und der Text daraus abgeleitet — nicht umgekehrt.

Zahlen im Text: `timeText` nimmt das `decimal` des Pakets. Die Faktoren und
das Zeichen `×` bleiben in jeder Sprache gleich.

## 4 — Speicherschicht

`DEFAULT_SETTINGS` bekommt `lang: 'de'`. `newProfile(name, now, lang)` und
`createProfile(state, name, now, lang)` nehmen die Sprache entgegen; fehlt sie
oder ist sie unbekannt, gilt `ML.DEFAULT_LANGUAGE`.

**`STATE_VERSION` bleibt 1.** Ein Versionssprung würde in `loadState` dazu
führen, dass alle bestehenden Profile verworfen werden — der gesamte
Lernfortschritt wäre weg, und zwar für einen neuen Schalter im Menü. Das ist
keine vertretbare Gegenleistung.

Stattdessen heilt `loadState` das fehlende Feld beim Lesen: ist
`settings.lang` kein String oder keine bekannte Sprache, wird `'de'` gesetzt.
Bestehende Profile stammen aus der deutschen App — das ist die richtige
Annahme, und sie ist es unabhängig davon, welche Sprache der Browser meldet.

Der Name des beim ersten Start angelegten Profils („Ich") ist sichtbarer Text
und kommt aus dem Paket der abgeleiteten Sprache. Er wird dabei einmalig
festgeschrieben — ein späterer Sprachwechsel benennt ein Profil nicht um. Das
ist beabsichtigt: der Name gehört dem Kind, nicht der Oberfläche.

Die Ableitung aus `navigator.language` bleibt in `index.html`: sie gilt
ausschließlich für **neu angelegte** Profile und wird über `createProfile`
hineingereicht. `logic.js` fasst den Browser weiterhin nicht an.

## 5 — Oberfläche

### Statische Texte

Jedes Element im Markup mit sichtbarem Text bekommt `data-i18n="key"`.
Attributtexte bekommen `data-i18n-placeholder`, `data-i18n-title`,
`data-i18n-aria-label`. `applyLanguage()` durchläuft diese Elemente, setzt
`document.documentElement.lang` aus `htmlLang` und `document.title`.

Damit steht der deutsche Text nicht mehr im Markup; der Schlüssel steht dort.

### Dynamische Texte

Alles, was im Script geschrieben wird, geht über ein lokales
`t(key, params)`, das `ML.t` mit der Sprache des aktiven Profils aufruft.
Betroffen sind unter anderem: Fortschrittszeile, Rückmeldung nach einer
Antwort einschließlich „Zeit ist um", Beschriftung des Bestätigungsknopfes
(„OK" / „Weiter"), Speicherwarnung, die sieben Mikrofon-Zustandstexte, die
kurzlebigen Mikrofonmeldungen, das „gehört: …", die Titel der drei
Werkzeugleistenknöpfe samt der HTTPS-Erklärung, die Statistik, die
Boxerklärungen, der Regelsatz, der Rasterhinweis und die zweistufige
Löschbestätigung.

Pluralfälle, die es heute schon gibt: „1 Aufgabe" / „n Aufgaben",
„in 1 Tag" / „in n Tagen". Sie laufen über die Pluralform des Pakets, nicht
über ein `=== 1` im Script — sonst muss eine spätere Sprache mit mehr
Pluralformen wieder in `index.html` eingreifen.

### Die Umschaltung

Im Menü, unter „Einstellungen", neben der Zeitschwelle:

```html
<label for="language" data-i18n="settings.language"></label>
<select id="language"></select>
```

gefüllt aus `ML.LANGUAGES`. Beim Wechsel geschieht in dieser Reihenfolge:

1. `profile().settings.lang` setzen und `persist()`
2. `applyLanguage()` — statische Texte, `<html lang>`, Titel
3. die gebauten Menüteile neu zeichnen: Statistik, Boxlegende, Regelsatz,
   Aufgabenraster, Detailzeile
4. die aktuelle Aufgabe neu beschriften (die Faktoren bleiben, die
   Rückmeldung und die Knopfbeschriftung nicht)
5. die Spracherkennung verwerfen und, falls das Mikrofon aktiv ist, mit dem
   neuen `speechLang` neu aufbauen

Schritt 5 ist nicht optional: `rec.lang` wird beim Bau des Erkenners gesetzt
und ändert sich an einem laufenden Erkenner nicht mehr. Ein Wechsel ohne
Neubau lässt das Kind englisch sprechen und deutsch erkennen.

Die Uhr ist beim Umschalten ohnehin angehalten — der Wechsel findet im
offenen Menü statt, und `closeMenu` startet sie wie bisher über `updateTimer`.
Es entsteht also keine neue Stelle, die die Uhr stellt.

### Sprachausgabe

`u.lang` und die Stimmenauswahl vergleichen gegen `locale.speechLang` statt
gegen `'de-DE'`; der Präfixvergleich (`voice.lang` beginnt mit `de` / `en`)
bleibt, wird aber aus dem Paket gespeist. Findet sich keine passende Stimme,
bleibt es wie bisher bei der Vorgabestimme des Browsers.

Der deutsche Sonderfall — „ein mal drei" statt „eins mal drei" — wandert
unverändert in `spokenQuestion` des deutschen Pakets. Englisch hat ihn nicht.

### Spracherkennung

`SR.available({ langs: [locale.speechLang] })`, `SR.install({ langs: […] })`
und `rec.lang` nehmen den Sprachcode aus dem Paket. Die lokale Erkennung wird
je Sprache getrennt geprüft: dass Deutsch lokal verfügbar ist, sagt nichts
über Englisch.

Alle Schutzregeln bleiben, wie sie sind. Insbesondere gilt weiter: **ein
Erkennungsfehler wertet keine Karte.** Ein Sprachwechsel ist kein Ereignis,
das eine Karte verändert.

## 6 — Eine dritte Sprache hinzufügen

Vollständige Liste dessen, was dann zu tun ist:

1. `spellXx(n)` für 0–999 schreiben
2. ein Paket in `LOCALES` ergänzen: Kennung, Label in der eigenen Sprache,
   `htmlLang`, `speechLang`, Dezimalzeichen, `spell`, `extraWords`,
   `fillerWords`, `plural`, `spokenQuestion`, `texts`
3. die Kennung in die Reihenfolge von `ML.LANGUAGES` aufnehmen

Mehr nicht. `index.html` wird dabei nicht angefasst — wenn doch, ist die
Trennung an der betreffenden Stelle unvollständig und gehört korrigiert.

## 7 — Verifikation

### Tests

Neu, `test/i18n.test.js`:

- **Vollständigkeit**: Jedes Paket hat exakt denselben Schlüsselsatz wie das
  deutsche. Keine fehlenden, keine überzähligen. Dieser Test ist der Grund,
  warum der Übersetzer bei einem unbekannten Schlüssel schweigen darf.
- **Struktur**: Jedes Paket hat alle Pflichtfelder; Pluralwerte haben in jedem
  Paket dieselben Formen wie das Paket es über `plural` verlangt.
- **Platzhalter**: Jede Übersetzung enthält dieselben `{name}`-Platzhalter wie
  ihr deutsches Gegenstück — ein vergessener Platzhalter fällt sonst erst im
  Betrieb auf.
- `resolveLanguage`: Regionsvarianten, Groß-/Kleinschreibung, Unsinn, `null`
- `t`: Ersetzung, Plural, unbekannter Schlüssel, unbekannte Sprache

Bestehende Tests werden auf die neuen Signaturen gezogen und um englische
Fälle erweitert:

- `parser.test.js`: die deutschen Fälle bleiben; dazu Englisch mit
  Bindestrich, mit Leerzeichen, mit `and`, Ziffern, Nichtzahlen. Ausdrücklich
  ein Test, der belegt, dass „acht und vierzig" weiterhin 48 ergibt — die
  Füllwortregel darf Deutsch nicht beschädigen.
- `progress.test.js`: Boxnamen, Zeitangabe mit beidem Dezimalzeichen,
  Auffrischungstext, Punktetext, Kartenansicht in beiden Sprachen; dazu, dass
  `refreshDue` ohne Textvergleich zustande kommt.
- `storage.test.js`: Vorgabesprache neuer Profile, Heilung eines Profils ohne
  `lang`, Heilung bei unbekanntem Wert, und der wichtigste: ein gespeicherter
  Stand aus der einsprachigen Fassung behält alle Karten.

### Im Browser

`index.html` ist weiterhin nicht durch Tests gedeckt. Nach der Umsetzung wird
über das DevTools-Protokoll geprüft, mit abgeschaltetem Cache:

1. Umschalten auf Englisch: Menü, Werkzeugleiste, Trainer, Rasterdetails,
   Statistik — kein deutscher Rest, kein Schlüsselname als Text
2. `document.documentElement.lang` und der Titel wechseln mit
3. Zurück auf Deutsch: derselbe Stand wie zuvor
4. Mit aktivem Mikrofon umschalten: der neue Erkenner läuft mit `en-US`
5. Vorlesen in beiden Sprachen, einschließlich „ein mal drei" / „1 times 3"
6. Neu geladen: die Sprache steht noch, der Fortschritt ebenso
7. Zwei Profile mit verschiedenen Sprachen: der Wechsel des Profils wechselt
   die Oberfläche
8. Die bekannte Überlagerungsfalle: Menü offen, Timerbalken und Blitz liegen
   weiterhin darunter

## Was ausdrücklich nicht dazugehört

- Rechts-nach-links-Schriften, andere Ziffernsysteme, Datumsformate
- Regionsvarianten derselben Sprache als getrennte Einträge
- Eine Sprachwahl außerhalb des Profils
- Übersetzte Konsolenausgaben: die bleiben Englisch, wie der übrige Code
