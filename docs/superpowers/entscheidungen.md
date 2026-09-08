# Einmaleins-Trainer — Entscheidungsprotokoll

Stand: 2026-09-08, Branch `feature/einmaleins-trainer`.

Dieses Dokument hält fest, welche Entscheidungen während der Umsetzung
ohne Rückfrage getroffen wurden und warum. Es ist bewusst versioniert:
das Arbeitsprotokoll liegt unter `.superpowers/` und ist nicht in git,
die Entscheidungen daraus gehören aber dauerhaft ins Repo.

## Abgeschlossene Schritte

- Task 1: complete (commits e7442c0..b1ddb2a, review clean)
- Task 2: complete (commits d4372cf..dd9ff25, review clean)
- Task 3: complete (commits dd9ff25..dd09277, review clean)
- Task 4: complete (commits dd09277..025e24d, review clean nach 1 Fixrunde)
- Task 5: complete (commits 025e24d..67a7fed, review clean)
- Task 6: complete (commits 67a7fed..c0e4db3, review clean)
- Task 7: complete (commits c0e4db3..32eec21, review clean nach 1 Fixrunde)
- Task 8: complete (commits 32eec21..6082ddd, review clean nach 1 Fixrunde)
- Task 9: complete (commits 6082ddd..361aa4d, review clean)
- Task 10: complete (commits 361aa4d..cdf1398, review clean nach 1 Fixrunde)
- Task 11: complete (commits cdf1398..c0735af, review clean nach 1 Fixrunde)
- Task 12: complete (commits 4415d4b..b1c0ec1, review clean)
- Task 13: complete (commits b1c0ec1..2d9120c)
- Schlusswelle: complete (commits 2d9120c..eae6d69, 50/50 gruen)

## Entscheidungen

Ruling 1: Kein separater git-worktree; Arbeit auf feature/einmaleins-trainer.
  — Das Repo enthaelt ausschliesslich dieses Projekt, der Branch ist bereits von
    main isoliert, und ein Worktree wuerde die manuellen Browser-Pruefungen auf
    einen zweiten Pfad verschieben.
  — Kosten wenn falsch: keine parallele Arbeit an main moeglich; jederzeit
    nachtraeglich durch `git worktree add` behebbar.

Ruling 2: Alle "Expected: PASS, N Tests"-Angaben um 1 erhoeht (6->7, 9->10,
    16->17, 19->20, 24->25, 31->32, 41->42 an 7 Stellen).
  — Der nachtraeglich in den Plan aufgenommene Kollisionstest der Zahlwort-
    Tabelle wurde in den Zaehlungen nicht nachgezogen. Ohne Korrektur haette
    jeder Implementer und jeder Reviewer ab Task 1 eine Abweichung gemeldet.
  — Kosten wenn falsch: reine Erwartungszahl im Plan, kein Produktionscode.

Ruling 3: Task 10 bekommt im Lautsprecher-Klickhandler eine Waechterzeile
    `if (session.currentKey === null) { ... return; }` vor parseCardKey.
  — Auf dem Abschlussbildschirm ist session.currentKey null; parseCardKey(null)
    ergaebe NaN und die Engine wuerde "NaN mal NaN" vorlesen.
  — Kosten wenn falsch: drei Zeilen zu viel in einem Randfall.

Ruling 4: Die UMD-Huelle darf `typeof self !== 'undefined' ? self : this`
    verwenden, ohne die Vorgabe "logic.js greift nie auf window zu" zu verletzen.
  — Es ist das Standard-UMD-Idiom, per typeof abgesichert, und beruehrt weder
    document noch localStorage noch Date.now noch Math.random. Die Vorgabe zielt
    auf Testbarkeit ohne Browser, und die ist gewahrt.
  — Kosten wenn falsch: ein Reviewer-Finding, das ich hier vorab beantwortet habe.

Ruling 5: `.gitignore` mit `.superpowers/` angelegt (fehlte im Repo).
  — Ohne sie waeren Ledger und Review-Pakete in die Commits gerutscht.
  — Kosten wenn falsch: keine.

Ruling 6: Das vorgeschriebene Testkommando wird von `node --test test/` auf
    `node --test` (ohne Pfadargument) geaendert — an 24 Stellen im Plan, in der
    Spec und im README-Entwurf.
  — Node 22 versteht ein Verzeichnisargument nicht und bricht mit
    MODULE_NOT_FOUND ab; der Plandefekt ist meiner, nicht der des Implementers.
    Der nackte Aufruf findet test/*.test.js selbst und ergibt 7/7 gruen.
  — Kosten wenn falsch: reines Kommando in der Doku, kein Produktionscode.

Ruling 7: Task 1 geht ohne Fixschleife ins Review.
  — Der gelieferte Code ist korrekt und vollstaendig; der einzige Defekt lag im
    Plan und ist von mir behoben. Es gibt nichts, was der Implementer aendern
    muesste.
  — Kosten wenn falsch: das Review faengt es auf.

Ruling 9: Dispatch-Anweisungen an Implementer werden ab sofort mit echten
    Umlauten geschrieben.
  — Task 4 zeigte, dass Implementer vorgegebenen Text woertlich uebernehmen;
    eine transliterierte Vorgabe erzeugt direkt einen Constraint-Verstoss.
  — Kosten wenn falsch: keine.

Ruling 10: Ich entscheide gegen den Plantext und fuer das Finding (a).
  — Die Spec verlangt Robustheit der Persistenz; der Plan hat sie an dieser
    Stelle falsch ausbuchstabiert. Ein stiller Serialisierungsfehler in der
    Speicherschicht ist genau der Fehlermodus, den das Tool nicht haben darf.
    Plan an der Stelle korrigiert, Serialisieren wandert aus dem try heraus.
  — Kosten wenn falsch: eine Ausnahme wird sichtbar statt verschluckt, was in
    einem Browsertool schlimmstenfalls eine Konsolenmeldung erzeugt.

Ruling 11: Der fehlende Isolationstest wird nachgezogen statt vertagt, obwohl
    die Implementierung nachweislich korrekt ist (Live-Probe: p1 auf 9999
    gesetzt, p2 blieb 3000).
  — Die Vorgabe "jedes Profil bekommt ein eigenes settings-Objekt" ist genau die
    Art Eigenschaft, die eine spaetere harmlose Umformulierung still bricht.
    Ohne Test faellt das erst auf, wenn ein Kind die Zeitschwelle eines anderen
    verstellt. Suite waechst damit auf 43 Tests.
  — Kosten wenn falsch: ein Test mehr.

Ruling 12: Der Fix-Commit wurde per --amend umbenannt (96d2987 -> 32eec21).
  — Mein Kontroll-Commit fuer die Plankorrektur lief mit `git add -A`, waehrend
    der Implementer im selben Arbeitsverzeichnis seinen Fix schrieb, und hat
    dessen Aenderungen mit eingesammelt. Inhalt und Tests sind korrekt (43/43),
    aber die Commit-Botschaft sagte "Plan:" und enthielt Produktionscode. Eine
    irrefuehrende Botschaft bleibt dauerhaft in der Historie; der Branch ist
    lokal und ungepusht, also ist das Umbenennen der Spitze risikoarm.
  — Kosten wenn falsch: geaenderter SHA, den nur dieses Ledger referenziert.

Ruling 13: Ab sofort kein `git add -A` mehr, solange ein Implementer laeuft.
    Kontroll-Commits am Plandokument warten, bis der Subagent gemeldet hat, oder
    nennen ihre Pfade explizit.
  — Genau diese Race hat Ruling 12 verursacht.
  — Kosten wenn falsch: keine.

Ruling 14: Die manuellen Browser-Pruefungen der Tasks 8-13 fuehre ich selbst als
    Controller durch, nicht der Implementer.
  — Der Plan schreibt pro UI-Task eine nummerierte Klickfolge mit erwarteter
    Beobachtung vor. Ein Implementer-Subagent kann eine Seite nicht ansehen; er
    koennte den Punkt nur behaupten. Nach zwei Faellen, in denen Reports mehr
    behaupteten als sie belegten (Task 1 Testkommando, Task 7 Isolation), ist
    "hat der Agent es wirklich gesehen" hier die entscheidende Frage.
    Implementer schreiben den Code und pruefen, was ohne Browser pruefbar ist;
    ich fuehre die Klickfolge aus und melde, was ich tatsaechlich gesehen habe.
  — Kosten wenn falsch: die Browserpruefung landet in meinem Kontext statt in
    dem eines Subagenten.

Ruling 15: Vier Findings gehen in EINE Fixrunde, drei davon gegen den Plantext.
  (a) font-Kurzform mit "inherit" als Familie: ungueltig, Deklaration wird ganz
      verworfen. Gemessen 13,3px Arial statt clamp(2rem,10vw,4.5rem). Mein Fehler.
  (b) #trainer zentriert seine Kinder nicht (block). Gemessen: Feldmitte x=313
      gegen Aufgabenmitte x=450. Mein Fehler.
  (c) Freies Weiterueben zaehlt jede zufaellig gezogene gemeisterte Karte als
      Auffrischung. Empirisch bestaetigt: nach 12 Antworten stand der Zaehler
      auf 13. Die vom Reviewer behauptete Tragweite ist allerdings ENGER als
      dargestellt — in derselben Sitzung ist nichts faellig (naechste
      Faelligkeit in 2 Tagen), die Quote kann dort nichts verhungern lassen.
      Mit vorgespulter Zeit greift der Mechanismus aber nachweislich: bei
      aufgeblaehtem Zaehler liefert pickNext eine Box-0-Karte, bei korrektem
      die faellige Auffrischung. Wer den Tab ueber Nacht offen laesst, trifft
      es. Fix ist einzeilig, Semantik ist ohnehin falsch -> beheben.
  (d) parseInt akzeptiert "4x" als 4. Feld ist type="text", also erreichbar.
  — Kosten wenn falsch: (a)(b) sind rein visuell und sofort sichtbar; (c)(d)
    sind engere Korrektheitsluecken, deren Fix je eine Zeile kostet.

Ruling 16: el bekommt #toolbar NICHT in dieser Task.
  — Task 9 fuegt es zusammen mit den uebrigen Menue-Elementen hinzu; im
    Task-9-Brief steht die Zeile bereits. Ein Vorziehen erzeugte einen Konflikt.
  — Kosten wenn falsch: Task 9 meldet einen doppelten Eintrag.

Ruling 18: Vier Punkte in EINE Fixrunde, alle gegen den Plantext.
  (a) Knopf luegt ueber seinen Zustand (Neuladen UND Profilwechsel). Fix: der
      Knopf zeigt nur "an", wenn settings.tts UND tts.unlocked; ein Klick im
      Zustand "gespeichert aber nicht freigeschaltet" schaltet frei statt aus.
      Dazu renderTtsButton in restartSession.
  (b) Der Klick-Handler hat keinen Staleness-Guard wie nextQuestion.
      WICHTIG: Ich stufe die Tragweite NIEDRIGER ein als der Reviewer. Die
      eigene Rueckmeldung der neuen Aufgabe ueberschreibt den Wert danach
      korrekt, und der Fehler laesst die Uhr LAENGER laufen, kann also keine
      Karte faelschlich hochstufen. Trotzdem beheben, weil die zugesicherte
      Invariante sonst nicht gilt und der Schwesterpfad es anders macht.
  (c) Haengende Sprach-Engine laesst startedAt auf 0 -> jede Antwort zaehlt als
      sofortiger Treffer. DAS ist die gefaehrliche Richtung: stille Korruption
      des Lernstands. Fix: Wachhund mit 5s Zeitgrenze plus try/catch um speak().
  — Kosten wenn falsch: (a) rein visuell/bedienbar, (b) Uhr laeuft in einem
    schmalen Fenster zu lang, (c) ein Wachhund feuert frueher als noetig, was
    lediglich die Uhr startet.

Ruling 19: Fuenf Punkte in EINE Fixrunde, alle gegen den Plantext.
  (a) SCHWERWIEGEND: Bei 🔊+🎤 gleichzeitig hoert die Erkennung die eigene
      Sprachausgabe. parseGermanNumber findet in "drei mal vier" die 3, und weil
      startedAt waehrend des Vorlesens 0 ist, wird das als blitzschnelle Antwort
      gewertet — bei 3x4=12 also eine FALSCHE Antwort, die die Karte auf Box 0
      wirft. Genau der Schaden, den die Fehlerregel verhindern soll, durch eine
      Tuer die sie nicht abdeckt. Fix: Flag wirdVorgelesen, Mikrofon erst nach
      dem Vorlesen oeffnen.
  (b) restartSession stoppt das Zuhoeren nicht -> ein noch laufender
      Erkennungsdurchgang kann nach einem Profilwechsel eine Karte im NEUEN
      Profil werten. Bricht die Zusicherung "Profile vermischen sich nicht".
  (c) end -> startListening -> error -> end laeuft ohne Bremse. Offline oder mit
      kaputtem Mikro eine Endlosschleife. Fix: Zaehler, nach 5 Fehlern abschalten.
  (d) settings.stt wird geschrieben, aber nie gelesen. Fix: gar nicht mehr
      speichern; der Mikrofonzustand braucht ohnehin je Sitzung eine Geste.
  (e) file://-Pruefung ueber isSecureContext greift in Chrome nicht.
  — Kosten wenn falsch: (a)(b) korrumpieren den Lernstand und sind die
    eigentlichen Risiken; (c) verbrennt CPU; (d) entfernt totes Feld; (e) macht
    einen Knopf ehrlich, der sonst zu einem nicht funktionierenden Weg einlaedt.

Ruling 20: Fixwelle F1-F14 in EINEM Dispatch, statt die Findings zu parken.
  — C1 freies Ueben wertete Karten, obwohl meine eigene Spec Zeile 141
    "ohne Boxwirkung" sagt: zehn Minuten Spielen verschieben den ganzen
    Auffrischungsplan von 2 auf 30 Tage.
  — C2 der Parser las die ERSTE Zahl im Satz: "sechs mal sieben ist
    zweiundvierzig" ergab 6. Von 100 Karten-Saetzen 90 falsch. Genau die
    natuerlichste Antwortform, wenn die Aufgabe vorgelesen wurde.
  — C3 Loeschen vernichtete ein Profil mit einem Klick ohne Rueckfrage.
  — Kosten wenn falsch: die Fixwelle ist gross; dafuer wurde sie einzeln
    nachgemessen statt geglaubt.
Ruling 21: F7 (verspaetetes Erkennungsergebnis) brauchte eine zweite Runde.
  — Mein vorgeschriebener Waechter war logisch unwirksam: er merkt sich die
    Karte beim Start des Zuhoerens, und genau dieser Merker wird fuer die
    naechste Aufgabe ueberschrieben, bevor das alte Ergebnis eintrifft. Ein
    einzelner wiederverwendeter Erkenner kann Durchgaenge nicht unterscheiden.
    Loesung: ein Erkenner je Durchgang, Karte im Abschluss festgehalten.
  — Der Implementer fand dabei, dass MEIN Fix eine Endlosschleife erzeugt
    haette (128 zusaetzliche Erkenner in 75ms gemessen) und ergaenzte einen
    Identitaets-Waechter. Richtig erkannt, uebernommen.
Ruling 22: F14 (Speicherwarnung) brauchte ebenfalls eine zweite Runde.
  — Die Warnung landete in #feedback, das bei JEDER Antwort neu geschrieben
    wird; sie wurde im selben Tick ueberschrieben, bevor der Browser sie
    zeichnen konnte. Nachgemessen: unsichtbar. Eigenes Element, bleibt stehen.
Ruling 23: Formulierung "mit Enter oder dem Knopf weiter" statt meiner Vorgabe
    "weiter mit Enter oder OK".
  — Meine Vorgabe nannte das Label "OK", waehrend der Knopf in genau diesem
    Moment "Weiter" heisst. Der Implementer meldete den Widerspruch statt ihn
    zu uebernehmen; sein Vorschlag stimmt unabhaengig vom Label.

