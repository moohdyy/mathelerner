# Einmaleins-Trainer

Ein ablenkungsfreier Einmaleins-Trainer, der vollständig im Browser läuft.
Kein Backend, kein Framework, keine Abhängigkeiten, kein Build-Schritt.

## Idee

Zufällige Aufgaben aus dem kleinen Einmaleins (1×1 bis 10×10, 100 Karten,
`7×8` und `8×7` getrennt). Wer eine Aufgabe dreimal **schnell und richtig**
löst, bekommt sie nicht mehr gestellt — übrig bleiben die Problemaufgaben.
Gemeisterte Aufgaben kommen nach 2, dann 7, dann 30 Tagen einmal zur Kontrolle
wieder.

## Nutzung

Für den reinen Tastaturbetrieb genügt ein Doppelklick auf `index.html`.
Dabei funktionieren auch die Aufgaben vorlesen (🔊). Das Mikrofon (🎤) ist
über `file://` absichtlich deaktiviert: Chrome zählt `file://` als sicheren
Kontext, aber die Spracheingabe wird dort aus Sicherheitsgründen blockiert.
Ein Lernender, der Antworten sprechen möchte, nutzt den lokalen Server oder
GitHub Pages.

Für die **Spracheingabe** ist HTTPS oder `localhost` Pflicht:

```
python3 -m http.server 8000
# dann http://localhost:8000/ öffnen
```

Oder über GitHub Pages veröffentlichen: Repository-Einstellungen → Pages →
Branch auswählen, Ordner `/ (root)`.

## Bedienung

| Element | Bedeutung |
|---|---|
| 🔊 | Aufgabe vorlesen |
| 🎤 | Antwort sprechen statt tippen |
| ☰ | Profile, Zeitschwelle, Statistik |
| Enter | Antwort abschicken, nach einem Fehler weiter |

Der Fortschritt liegt pro Profil im `localStorage` des Browsers und wird nicht
zwischen Geräten synchronisiert.

## Browser-Unterstützung

| | Tastatur | Vorlesen | Spracheingabe |
|---|---|---|---|
| Chrome / Edge | ✓ | ✓ | ✓ |
| Safari | ✓ | ✓ | ✓ |
| Firefox | ✓ | ✓ | — |

Firefox liefert keine `SpeechRecognition`-API; der 🎤-Knopf erscheint dort nicht.

## Tests

```
node --test
```

43 Tests abgedeckt: Zahlenparser, Scheduler und Speicherschicht in `logic.js`.
Sprachein- und -ausgabe werden manuell verifiziert — sie brauchen echte Browser
und ein echtes Mikrofon.

## Dokumente

- Design: `docs/superpowers/specs/2026-09-07-einmaleins-trainer-design.md`
- Plan: `docs/superpowers/plans/2026-09-07-einmaleins-trainer.md`

## Was bewusst nicht gebaut wurde

Diese Grenzen sind bewusste Entwurfsentscheidungen:

- Kein Punktesystem, keine Abzeichen, keine Sounds oder Leaderboards
- Keine Division, keine erweiterte Multiplikationstabelle
- Kein Export/Import von Fortschritt
- Keine Synchronisation zwischen Geräten — der Fortschritt liegt im `localStorage` des einzelnen Browsers, pro Profil
