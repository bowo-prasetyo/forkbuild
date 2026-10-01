<!-- translation-of: docs/user/InteractiveTransformGizmo.md source-hash: abe609dc8dec857e -->
# Interaktives Transformations-Gizmo

<!-- languages -->
[English](../InteractiveTransformGizmo.md) · **Deutsch** · [Bahasa Indonesia](../id/InteractiveTransformGizmo.md) · [日本語](../ja/InteractiveTransformGizmo.md)
<!-- /languages -->

Sobald im Editor Steine ausgewählt sind, erscheint am Drehpunkt der
Auswahl ein Gizmo. Wenn Sie an seinen Griffen ziehen, wird die Auswahl mit
Live-Vorschau verschoben oder gedreht; das Loslassen übernimmt die
Änderung als **einen Rückgängig-Schritt**. Eine einzelne ausgewählte
[Strukturinstanz](02-TheEditor.md#strukturinstanzen-eine-lebendige-referenz)
zeigt im Editor genau dasselbe Gizmo, mit einem Unterschied: Der grüne
Griff der Y-Achse ist wirkungslos. Die Höhe einer Platzierung folgt immer
dem Gelände darunter — sie ist nie ein Griff, den Sie ziehen, oder ein
Wert, den Sie eingeben.

Das Gizmo gibt es nur im Editor. Die [Weltansicht](03-WorldView.md) ist
eine schreibgeschützte Fläche zum Erkunden; um auf etwas aufzubauen, das
Sie dort finden, öffnen Sie es mit ihrer Schaltfläche **Eine Kopie
bearbeiten** hier im Editor.

## Das Gizmo

```
    Y
    ↑
    │
    │
    ●──────→ X        ●  Drehpunkt
   /
  /
 Z

    ◯
  ◯ ● ◯               Drehring (Y-Achse)
    ◯
```

| Griff | Farbe | Was er tut |
|---|---|---|
| Achsenpfeil | Rot (X) | Ziehen, um nur entlang X zu verschieben |
| Achsenpfeil | Grün (Y) | Ziehen, um nur entlang Y zu verschieben |
| Achsenpfeil | Blau (Z) | Ziehen, um nur entlang Z zu verschieben |
| Mittelfläche | Bernsteinfarben | Frei auf der Bodenebene verschieben (X + Z) |
| Drehring | Lila | Ziehen, um um den Drehpunkt zu drehen |

Griffe werden hervorgehoben, wenn Sie über sie fahren, und leuchten
heller, während Sie sie ziehen. Das Gizmo behält eine angenehme
Bildschirmgröße, egal wie weit Sie herauszoomen.

## Der Drehpunkt

Die weiße Markierung in der Mitte des Gizmos ist der **Drehpunkt**:

```
┌───────────────┐
│ ■           ■ │
│               │
│       +       │ ← Drehpunkt (Mitte der Auswahlbegrenzung)
│               │
│ ■           ■ │
└───────────────┘
```

- Ein Stein ausgewählt → der Drehpunkt liegt in der Mitte dieses Steins.
- Mehrere Steine ausgewählt → der Drehpunkt liegt in der Mitte des
  Quaders um alle herum.
- Gedreht wird immer um den Drehpunkt.

Der Drehpunkt folgt Ihrer Auswahl automatisch: A auswählen, dann B
hinzufügen, dann eine Verschiebung rückgängig machen — das Gizmo
positioniert sich jedes Mal neu.

## Verschieben

1. Wählen Sie einen oder mehrere Steine aus.
2. Greifen Sie einen Achsengriff, um entlang dieser Achse zu verschieben,
   oder die Mittelfläche für freie Bewegung über den Boden.
3. Die Auswahl folgt dem Zeiger live.
4. Lassen Sie los, um zu übernehmen.

## Drehen

1. Wählen Sie einen oder mehrere Steine aus.
2. Ziehen Sie den lila Ring. Die Auswahl dreht sich beim Ziehen um den
   Drehpunkt.
3. Lassen Sie los, um zu übernehmen.

Bei Mehrfachauswahlen kreist jeder Stein um den gemeinsamen Drehpunkt
*und* dreht sich um denselben Winkel — die Anordnung behält ihre Form.

## Übernehmen, abbrechen, nichts tun

| Sie … | Ergebnis |
|---|---|
| lassen die Maus los | Änderung übernommen — **genau ein** Eintrag im Rückgängig-Verlauf, egal wie viele Steine sich bewegt haben |
| drücken während des Ziehens `Escape` | Abbruch — alles springt genau zurück; der Verlauf bleibt unberührt |
| klicken und lassen los, ohne zu bewegen | Nichts — kein Befehl, kein Verlaufseintrag |

`Strg/Cmd+Z` macht die ganze Geste in einem Schritt rückgängig;
`Strg/Cmd+Y` (oder `Strg/Cmd+Umschalt+Z`) wiederholt sie.

## Während Sie ziehen, gehört der Zeiger der Geste

Während eines Ziehens kreist die Kamera nicht, nichts anderes lässt sich
auswählen, und Tastenkürzel werden ignoriert — das Ziehen kann nicht
versehentlich mit der Kamera kämpfen. Loslassen (übernehmen) oder
`Escape` (abbrechen) stellt alles wieder normal. Auch das Loslassen der
Maus *außerhalb* des Ansichtsfensters übernimmt sauber.

## Gruppen

Eine Gruppe auszuwählen wählt ihre Mitgliedssteine aus — und das Gizmo
behandelt sie genau wie jede Mehrfachauswahl:

- Ziehen verschiebt jedes Mitglied; Drehen dreht jedes Mitglied um den
  gemeinsamen Drehpunkt.
- Die Gruppe selbst bleibt unberührt: Die Mitgliedschaft ändert sich nie
  durch eine Transformation. (Das Gizmo weiß nicht einmal, dass es Gruppen
  gibt.)
- Ein Rückgängig stellt jedes Mitglied dorthin zurück, wo es war.

## Einrasten

Ziehen rastet standardmäßig ein — 1 Welteinheit beim Verschieben
(derselbe Schritt wie ein Druck auf eine Pfeiltaste) und 15° beim Drehen
(feiner als die 90°-Drehung von `R`). Halten Sie beim Ziehen **Umschalt**
für den **Präzisionsmodus**: das 0,1-Fache des normalen Schritts (0,1
Welteinheiten, 1,5°), für Feinarbeit, für die das Standardraster zu grob
ist.

Das **Feld für genaue Werte** und **Ausrichten/Verteilen** sind absichtlich
die Ausnahme — sie wenden immer genau den Wert oder genau das geometrische
Ergebnis an, das Sie verlangt haben, nie eingerastet, denn Sie haben
bereits etwas Genaues eingegeben (oder verlangt).

## Eine Kollision blockiert das Übernehmen

Verschieben oder Drehen einer Auswahl prüft das Ergebnis gegen jeden Stein
*außerhalb* der Auswahl, bevor es landen darf. Würde ein Mitglied etwas
überlappen, das schon da ist, übernimmt das Loslassen dort nicht — jeder
Stein der Auswahl kehrt genau dorthin zurück, wo er war, ohne neuen
Rückgängig-Eintrag, so wie ein einzelner Stein über einer belegten Zelle
den Klick verweigert. Umordnen von Steinen *innerhalb* derselben Auswahl
(etwa zwei Mitglieder, die durch eine Drehung die Plätze tauschen) gilt
nie als Kollision. Diese Prüfung gilt für Ziehen am Gizmo, schrittweises
Verschieben mit der Tastatur und Drehen gleichermaßen; Ausrichten,
Verteilen und das Feld für genaue Werte unterliegen ihr nicht, da sie ein
genaues, bewusstes Ergebnis berechnen statt einer freien Bewegung.

## Was das Gizmo nicht tut

- **Skalieren** — Steine lassen sich nicht in der Größe ändern, daher gibt
  es keine Skaliergriffe.
- **Duplizieren durch Ziehen** — es gibt keine Zusatztaste zum Kopieren
  beim Ziehen; nutzen Sie zuerst `Strg/Cmd+D`, um die Auswahl an Ort und
  Stelle zu duplizieren (siehe
  [Der Editor](02-TheEditor.md#kopieren-einfügen-und-duplizieren)), und
  ziehen Sie dann die Kopie.

## Tipps

- Fahren Sie über den Drehring und ziehen Sie langsam für feine
  Kontrolle — auch kleine Zeigerbögen nahe am Drehpunkt bleiben genau,
  weil die Drehung als Winkel gemessen wird, nicht als Strecke.
- Nutzen Sie einen Achsengriff, wenn zwei Koordinaten exakt gleich
  bleiben sollen — die Beschränkung ist exakt, nicht nur optisch.
- Kombinieren Sie die Wege: mit den Pfeiltasten in ganzen Schritten
  verschieben, dann mit Umschalt-Ziehen fein positionieren. Rückgängig und
  Wiederholen behandeln beides gleich — ein Schritt pro Geste.
