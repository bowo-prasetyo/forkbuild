<!-- translation-of: docs/user/02-TheEditor.md source-hash: 651918b44bf2d435 -->
# 02 — Der Editor

<!-- languages -->
[English](../02-TheEditor.md) · **Deutsch** · [Español](../es/02-TheEditor.md) · [Bahasa Indonesia](../id/02-TheEditor.md) · [日本語](../ja/02-TheEditor.md)
<!-- /languages -->

Im Editor wird gebaut. Diese Anleitung behandelt die Werkzeuge, wie Sie
Steine auswählen und transformieren und wie Sie Ihr Bauwerk mit Gruppen
ordnen.

## Der Aufbau

```
┌─────────────────────────────────────────────────────────────┐
│ Werkzeugleiste: Speichern · Veröffentlichen · Neu ·         │
│   Exportieren · Importieren · Zuletzt · ⌨ Tastenkürzel      │
├──────────────────────┬──────────────────────────────────────┤
│ [Auswählen|Platzieren│                                      │
│ Dokumenttitel     ✎  │                                      │
│ Auswahl              │          3D-Ansichtsfenster          │
│ Baubibliothek        │                                      │
│  [Steine|Strukturen] │                                      │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Werkzeugleiste** — speichern, veröffentlichen, eine neue Kreation
  beginnen, ein Dokument als Datei exportieren oder importieren, zuletzt
  geöffnete wieder öffnen und die Übersicht **⌨ Tastenkürzel** öffnen
  (auch `?`).
- **Werkzeuge** — wechseln Sie zwischen **Auswählen** (`1`) und
  **Platzieren** (`2`). **Platzieren** bleibt hervorgehoben, solange Sie
  einen Stein oder eine Struktur platzieren.
- **Dokumenttitel** — der Name der geöffneten Kreation. Klicken Sie auf
  **✎**, um Titel, Beschreibung und Lizenz zu bearbeiten. Ob sie
  gespeichert ist, zeigt die Werkzeugleiste.
- **Auswahl** — zeigt nur, was auf Ihre aktuelle Auswahl wirken kann;
  siehe [Das Feld Auswahl](#das-feld-auswahl) unten.
- **Baubibliothek** — ein Suchfeld und zwei Reiter:
  - **Steine** — alles, was Sie mit dem Platzierwerkzeug setzen können,
    als Kacheln in fünf Abschnitten (Grundformen, Tragwerk, Dächer &
    Treppen, Öffnungen, Details). Klicken Sie auf eine, um sie auszuwählen
    (und zum Platzierwerkzeug zu wechseln); dann erscheint ein Farbfeld
    **Farbe** zum Wählen ihrer Farbe — siehe [Steinfarben](#steinfarben)
    unten.
  - **Strukturen** — zwanzig fertige Strukturen in fünf Kategorien
    (Wohnen, Landwirtschaft, Gewerbe, Gemeinschaft, Infrastruktur) sowie
    Ihre eigenen **Meine Strukturen**. Klicken Sie auf eine Karte, um sie
    zu platzieren — siehe
    [Strukturen: zusammensetzen, forken und Ihre persönliche Bibliothek](#strukturen-zusammensetzen-forken-und-ihre-persönliche-bibliothek)
    unten.

### Das Feld Auswahl

Das Feld ändert sich mit dem, was Sie ausgewählt haben, sodass es nie
Schaltflächen zeigt, die noch nichts tun können:

- **Nichts ausgewählt** — ein kurzer Hinweis, **Alles auswählen**,
  **Einfügen**, sobald Sie etwas kopiert haben, und Ihre Gruppen (klicken
  Sie auf eine, um ihre Steine auszuwählen).
- **Steine ausgewählt** — wie viele, wo sie sind, und die alltäglichen
  Aktionen: **Drehen ↻ / ↺**, **Duplizieren**, **Löschen**, **Kopieren**,
  **Einfügen**, **Farbe**, **Fokussieren** und **Abwählen**. Seltener
  gebrauchte Werkzeuge sind in drei Abschnitte darunter eingeklappt:
  **Genaue Position & Drehung**, **Ausrichten, verteilen, wiederholen**
  und **Gruppen & Bauplan**.
- **Eine Strukturinstanz ausgewählt** — stattdessen eine eigene Karte mit
  ihrer Position, Drehung und ihren Aktionen (siehe
  [Strukturinstanzen](#strukturinstanzen-eine-lebendige-referenz)).

> **Tipp:** Drücken Sie überall `Strg/Cmd+K`, um die **Befehlspalette** zu
> öffnen — eine durchsuchbare Liste aller Aktionen dieser Anleitung, nach
> Namen.

## Die zwei Werkzeuge

### Platzierwerkzeug (`2`)

Wählen Sie einen Stein aus der Palette, fahren Sie ins Ansichtsfenster und
klicken Sie, um ihn zu platzieren. Ein durchscheinender Geist zeigt genau,
wo der Stein landen wird. Fahren Sie über die Fläche eines vorhandenen
Steins, um zu stapeln oder anzusetzen.

> **Tipp:** Drücken Sie **Escape**, um zum Auswahlwerkzeug zurückzukehren.

### Auswahlwerkzeug (`1`)

Klicken Sie auf Steine, um sie auszuwählen, und verschieben, drehen oder
löschen Sie sie dann. Hier verbringen Sie die meiste Zeit, sobald die
Grundform steht.

## Steine auswählen

ForkBuild gibt Ihnen genaue Kontrolle über die Auswahl:

| Aktion | Ergebnis |
|---|---|
| **Klick** auf einen Stein | Wählt ihn aus (ersetzt die aktuelle Auswahl) |
| **Strg/Cmd + Klick** | Nimmt den Stein in die Auswahl auf oder entfernt ihn daraus |
| **Umschalt + Klick** | Fügt den Stein der Auswahl hinzu |
| **Umschalt + Ziehen** | Zieht einen Rahmen — wählt alles darin aus |
| **Strg/Cmd + Umschalt + Ziehen** | Rahmenauswahl, die der aktuellen Auswahl *hinzugefügt* wird |
| **Strg/Cmd + A** | Alle Steine der Kreation auswählen |
| **Escape** | Die Auswahl aufheben |

> **Warum das wichtig ist:** Alles, was größer als ein einzelner Stein ist,
> bedeutet, mit *vielen* Steinen auf einmal zu arbeiten. Lernen Sie den
> Auswahlrahmen mit Umschalt-Ziehen früh — so greifen Sie am schnellsten
> eine ganze Wand.

## Verschieben, drehen und löschen

Mit einem oder mehreren ausgewählten Steinen:

| Taste | Aktion |
|---|---|
| **Pfeiltasten** | Schrittweise nach links/rechts/vorn/hinten verschieben |
| **Bild↑ / Bild↓** | Schrittweise nach oben / unten verschieben |
| **R** | Um 90° im Uhrzeigersinn drehen |
| **Umschalt + R** | Um 90° gegen den Uhrzeigersinn drehen |
| **Entf / Rücktaste** | Die ausgewählten Steine entfernen |

Wenn Sie mehrere Steine auswählen, drehen sie sich um ihren **gemeinsamen
Mittelpunkt**, sodass ein ganzer Abschnitt als eine Einheit schwenkt.

## Steinfarben

Jede Steinart hat ihre eigene Standardfarbe, aber Sie können Ihre eigene
wählen:

- **Vor dem Platzieren** — sobald im Reiter **Steine** der Baubibliothek
  ein Stein ausgewählt ist, klicken Sie auf sein Farbfeld **Farbe** und
  wählen Sie eine Farbe. Jeder Stein, den Sie danach platzieren, verwendet
  sie, und der Platziergeist zeigt sie bereits an. Wählen Sie eine andere
  Steinart, gilt wieder deren eigene Standardfarbe, bis Sie erneut eine
  wählen.
- **Nach dem Platzieren** — wählen Sie einen oder mehrere Steine aus und
  nutzen Sie das Farbfeld **Farbe** im Abschnitt **Auswahl**, um sie alle
  auf einmal umzufärben. Jede Änderung lässt sich wie jede andere
  Bearbeitung rückgängig machen (`Strg/Cmd+Z`). Für eine ausgewählte
  Strukturinstanz wird das Farbfeld nicht angeboten — bearbeiten Sie
  stattdessen das eigene Dokument der Struktur (siehe
  [Strukturinstanzen](#strukturinstanzen-eine-lebendige-referenz) unten).

Die Farbe eines Steins wird mit Ihrer Kreation gespeichert und reist mit
ihr, wenn Sie sie veröffentlichen oder teilen.

## Genaue Transformationen: Zahleneingabe, Ausrichten und Wiederholen

Die eingeklappten Abschnitte des Felds Auswahl bieten neben dem Gizmo und
den Tasten oben genauere Wege, eine Auswahl zu bewegen:

- **Genaue Position & Drehung** — geben Sie genaue Werte für
  X/Y/Z/Drehung ein, statt zu ziehen. Schalten Sie zwischen **Absolut**
  (die Werte sind ein Ziel für Drehpunkt/Ausrichtung der Auswahl) und
  **Versatz** (die Werte werden als Differenz addiert) um und drücken Sie
  dann **Anwenden** (oder `Enter` in einem Feld). Ein leeres Feld bedeutet
  „unverändert lassen“, nie null. **Felder zurücksetzen** leert die Felder,
  ohne die Auswahl zu berühren.
- **Ausrichten & Verteilen** (unter **Ausrichten, verteilen,
  wiederholen**) — neun Schaltflächen, um die Kanten oder Mittelpunkte der
  ganzen Auswahl an einer Weltachse auszurichten (Links/Mitte/Rechts,
  Unten/Mitte/Oben, Vorn/Mitte/Hinten), dazu drei, um sie gleichmäßig zu
  verteilen (X/Y/Z verteilen). Ausrichten braucht **2 oder mehr Steine**
  in der Auswahl, Verteilen **3 oder mehr**.
- **Wiederholen** (ebenfalls unter **Ausrichten, verteilen,
  wiederholen**) — erstellt **N** weitere Kopien der Auswahl, gleichmäßig
  entlang einer Achse verteilt. Würde eine Kopie kollidieren, wird gar
  keine erstellt.

Jede davon ist **ein Rückgängig-Schritt**, genau wie das Ziehen des Gizmos
oder ein Tastaturschritt — das Verhalten Feld für Feld finden Sie in der
[Steuerungsreferenz](ControlsReference.md#transformieren--feld-für-genaue-werte-nur-editor).

Die Schaltfläche **Fokussieren** im Feld Auswahl richtet die Kamera auf die
ausgewählten Steine aus, ohne etwas zu ändern.

> **Kollisionen werden blockiert.** Ziehen am Gizmo oder schrittweises
> Verschieben mit der Tastatur prüft das Ergebnis gegen jeden Stein
> außerhalb der Auswahl. Würde beim Loslassen ein Mitglied auf einem davon
> landen, wird die ganze Bewegung verworfen statt übernommen — jeder Stein
> der Auswahl springt genau dorthin zurück, wo er begonnen hat, ohne neuen
> Rückgängig-Eintrag. Umordnen von Steinen *innerhalb* Ihrer eigenen
> Auswahl (etwa zwei Steine per Drehung tauschen) gilt nie als Kollision.

## Kopieren, einfügen und duplizieren

| Taste | Aktion |
|---|---|
| **Strg/Cmd + C** | Die ausgewählten Steine kopieren |
| **Strg/Cmd + V** | Sie einfügen (leicht versetzt, damit Sie sie sehen) |
| **Strg/Cmd + D** | Die Auswahl an Ort und Stelle duplizieren — Kopieren und Einfügen in einem Schritt |

Kopieren und Einfügen ist ideal für wiederkehrende Elemente — bauen Sie ein
Fenster und kopieren Sie es dann über eine Fassade. **Duplizieren**
erledigt dasselbe mit einer einzigen Geste und einem einzigen
Rückgängig-Schritt und lässt Ihre Zwischenablage unberührt: Ein früheres
Strg+C lässt sich noch einfügen, nachdem Sie etwas anderes dupliziert
haben. Das Duplikat wird Ihre neue Auswahl, der natürliche Ablauf ist also
auswählen → duplizieren → ziehen oder schrittweise an seinen Platz
verschieben. Duplizieren funktioniert mit jeder Auswahl — losen Steinen,
einer ganzen Gruppe oder einer einzelnen
[Strukturinstanz](#strukturinstanzen-eine-lebendige-referenz).

## Rückgängig und Wiederholen

Jede Änderung wird festgehalten, sodass Sie immer zurückgehen können:

| Taste | Aktion |
|---|---|
| **Strg/Cmd + Z** | Die letzte Aktion rückgängig machen |
| **Strg/Cmd + Y** *(oder Strg/Cmd+Umschalt+Z)* | Sie wiederholen |

Zehn Steine zu verschieben zählt als **ein** Rückgängig-Schritt, sodass
Rückgängig auch bei großen Bauwerken überschaubar bleibt.

## Gruppen

Mit Gruppen können Sie Sammlungen von Steinen benennen und
wiederverwenden — etwa „Dach“ oder „Fenster“.

**Eine Gruppe erstellen:**
1. Wählen Sie einige Steine aus.
2. Öffnen Sie im Feld Auswahl den Abschnitt **Gruppen & Bauplan**, klicken
   Sie auf **Neue Gruppe** und geben Sie ihr dann mit **Gruppe umbenennen**
   (unten) einen Namen.

**Eine Gruppe verwenden:** Klicken Sie in der Liste auf den Namen einer
Gruppe, um sie (und ihre Steine) auszuwählen — die Liste steht im Feld
Auswahl, wenn nichts ausgewählt ist, und sonst unter **Gruppen &
Bauplan**. Diese Schaltflächen wirken auf die gerade ausgewählte Gruppe:

| Schaltfläche | Was sie tut |
|---|---|
| **Gruppe umbenennen** | Den Namen der Gruppe ändern |
| **Gruppe duplizieren** | Die ganze Gruppe *und* ihre Steine kopieren |
| **Gruppe löschen** | Die Gruppe löschen (die Steine selbst bleiben) |
| **Zur Gruppe hinzufügen** | Fügt Ihre aktuelle Auswahl der Gruppe hinzu |
| **Aus Gruppe entfernen** | Entfernt Ihre aktuelle Auswahl aus der Gruppe |

> **Gut zu wissen:** Eine Gruppe auszuwählen wählt nur ihre Steine aus —
> die Gruppe selbst ändert sich nie. Und das Löschen einer Gruppe entfernt
> nur das *Etikett*, nicht die Steine darin.

## Strukturen: zusammensetzen, forken und Ihre persönliche Bibliothek

Der Reiter **Strukturen** der Baubibliothek (siehe
[Der Aufbau](#der-aufbau) oben) bietet zwanzig fertige Strukturen — Häuser,
Scheunen, einen Brunnen, einen Markt, eine Mühle, eine Brücke und mehr, in
fünf Kategorien — sowie **Meine Strukturen**, Ihre persönliche Sammlung
von allem, was Sie aus einem Bauwerk gespeichert haben. Mit jeder davon
können Sie drei verschiedene Dinge tun, und sie sind aus verschiedenen
Gründen wichtig:

- **Platzieren** (Klick auf die Karte) — kopiert die Steine der Struktur
  direkt in das Dokument, an dem Sie gerade arbeiten, sodass sie Teil
  eines größeren Bauwerks wird. Das ist die alltägliche Aktion.
- **Als neues Dokument forken** (im Menü **⋮** der Karte) — beginnt ein
  ganz neues, unabhängiges Dokument, das als genaue Kopie dieser Struktur
  startet.
- **In Meine Strukturen forken** (nur bei eingebauten Karten, im Menü
  **⋮**) — fügt die Struktur Ihren eigenen **Meine Strukturen** hinzu,
  ganz ohne Dokument. Siehe
  [Meine Strukturen](#meine-strukturen-ihre-persönliche-bauplanbibliothek)
  unten.
- **Info** (im Menü **⋮** der Karte) — ein schreibgeschützter Blick auf
  Name, Kategorie, Anzahl der Steine, Grundfläche, Höhe, Quelle und
  Beschreibung einer Struktur.
- Ein eigenes **gespeichertes Dokument** als **Strukturinstanz**
  platzieren — eine lebendige, wiederverwendbare Referenz statt einer
  Kopie — über das Auswahlmenü **Zuletzt** in der Werkzeugleiste, nicht
  über die Baubibliothek. Siehe
  [Strukturinstanzen](#strukturinstanzen-eine-lebendige-referenz) unten.

### Eine Struktur in Ihr Dokument platzieren

Klicken Sie im Reiter **Strukturen** auf eine beliebige Karte — eine
eingebaute oder eine Ihrer eigenen **Meine Strukturen** —, und eine
durchscheinende Geistvorschau der ganzen Struktur erscheint und folgt
Ihrem Zeiger über den Boden, genau wie beim Platzieren eines einzelnen
Steins:

1. Bewegen Sie den Zeiger, um den Geist zu positionieren.
2. Drücken Sie `R` / `Umschalt+R`, um ihn in 90°-Schritten zu drehen.
3. Klicken Sie, um zu übernehmen — jeder Stein der Struktur wird Ihrem
   Dokument als ein **Rückgängig-Schritt** hinzugefügt. Eine belegte
   Position färbt den Geist rot und verweigert den Klick, genauso wie ein
   einzelner Stein sich nicht auf einen anderen setzen lässt.
4. `Escape` bricht ab — nichts wird hinzugefügt, und Sie kehren zu dem
   Werkzeug zurück, das Sie vorher benutzt haben.

Die Steine, die Sie erhalten, sind ab dem Moment, in dem sie landen,
gewöhnliche Steine in Ihrem Dokument — nicht von dem zu unterscheiden, was
Sie von Hand platziert haben, und frei zu bearbeiten, auszuwählen, zu
gruppieren oder zu löschen. Mehrere Strukturen zu platzieren ist ein
schneller Weg zu einer Szene: Haus anklicken, platzieren; Scheune
anklicken, daneben platzieren; Brunnen anklicken, in den Hof platzieren.

### Eine Struktur als neues Dokument forken

Öffnen Sie das Menü **⋮** einer Karte und klicken Sie auf **Als neues
Dokument forken**, um eine ganz neue eigene Kreation zu beginnen, die als
genaue Kopie dieser Struktur startet — genau dieselben Steine, mit jedem
Werkzeug dieser Anleitung bearbeitbar, in einem eigenen Dokument, statt in
das eingefügt zu werden, was Sie gerade geöffnet haben. Forken ändert nie
die Kopie der Bibliothek selbst: Forken Sie das Haus zehnmal, ist jedes
ab dem Klick auf Forken eine eigene, unabhängige Kreation.

### Meine Strukturen: Ihre persönliche Bauplanbibliothek

Etwas gebaut, das sich wiederzuverwenden lohnt? Wählen Sie die Steine aus,
aus denen es besteht (ein ganzes Gebäude oder nur einen Teil), und klicken
Sie auf **Bauplan erstellen** — die Schaltfläche steht im Abschnitt
**Gruppen & Bauplan** des Felds Auswahl, sobald Sie Steine ausgewählt
haben, und in jedem Fall in der Befehlspalette (`Strg/Cmd+K`). Ein kleiner
Dialog fragt nach einem **Namen**, einer **Kategorie** und einer
optionalen **Beschreibung**, mit einer Live-Vorschau dessen, was Sie
speichern; klicken Sie auf **Bauplan erstellen**, und die Struktur wird
auf ihren eigenen lokalen Ursprung normalisiert und sofort in **Meine
Strukturen** gespeichert, einem neuen Abschnitt unten im Reiter
Strukturen, direkt unter den eingebauten Kategorien.

Es gibt einen zweiten Weg, wie eine Struktur in Meine Strukturen landet,
ohne dass Sie etwas auswählen oder erst bauen müssen: Öffnen Sie das Menü
**⋮** einer **eingebauten** Karte und klicken Sie auf **In Meine
Strukturen forken**. Sie wird genau so hinzugefügt, wie sie ist — kein
Dokument wird erstellt, nichts herausgelöst —, und lässt sich daher sofort
umbenennen, exportieren oder platzieren wie jeder andere Eintrag Ihrer
Bibliothek.

Eine Struktur in **Meine Strukturen** funktioniert genau wie eine
eingebaute — klicken Sie, um sie in Ihr aktuelles Dokument zu platzieren,
oder forken Sie sie als neues Dokument — mit zwei zusätzlichen Aktionen im
Menü **⋮**:

| Aktion | Was sie tut |
|---|---|
| **Umbenennen** | Den Namen ändern (Kategorie und Beschreibung bleiben, wie sie sind) |
| **Entfernen** | Sie aus Ihrer Bibliothek löschen |

**Meine Strukturen** speichert immer nur die *Struktur selbst* — einen
Namen und eine Menge Steine. Das Entfernen einer Struktur berührt nie
etwas, das Sie schon damit gebaut haben: Überall, wo Sie sie bereits
platziert oder hineingeforkt haben, bleiben die Steine genau so, wie sie
sind. Und sie wird nie an Ort und Stelle bearbeitet — wenn Sie ändern
möchten, was eine gespeicherte Struktur baut, platzieren Sie sie in ein
Dokument, bearbeiten Sie dieses Dokument und nutzen Sie dann erneut
**Bauplan erstellen** (wahlweise unter einem neuen Namen, etwa „Bauernhof
Deluxe“ — er wird ein eigener, getrennter Eintrag in Meine Strukturen,
kein Ersatz für das Original).

> **Gut zu wissen:** Meine Strukturen existiert auf diesem Gerät. Es ist
> nicht an Ihre Identität gebunden und wird nirgends automatisch
> synchronisiert — wie Sie eine Struktur auf ein anderes Gerät bringen oder
> jemand anderem geben, steht unter
> [Baupläne teilen](#baupläne-teilen-export-und-import) unten.

### Baupläne teilen: Export und Import

Jede Struktur — eine eingebaute oder eine eigene — kann das Gerät, auf dem
sie liegt, als portable Datei verlassen, ohne je Teil der geteilten,
veröffentlichten Welt zu werden:

- **Bauplan exportieren** (im Menü **⋮** jeder Karte) lädt sie als kleine
  JSON-Datei herunter — einen eigenständigen Schnappschuss von Name,
  Kategorie, Schlagwörtern, Beschreibung und Steinen dieser Struktur.
- **Bauplan importieren** (Schaltfläche neben der Überschrift **Meine
  Strukturen**) liest eine Bauplandatei wieder ein und fügt sie Ihren
  eigenen Meine Strukturen als neuen, unabhängigen Eintrag hinzu — eine
  frische Kopie mit eigener Identität, nie mit ihrer Herkunft verknüpft.
  Dieselbe Datei zweimal zu importieren ergibt zwei getrennte Einträge,
  nicht einen, der den anderen stillschweigend überschreibt. Eine
  fehlerhafte oder unbekannte Datei wird mit einer Erklärung abgelehnt,
  statt stillschweigend etwas Kaputtes zu erzeugen.

So geben Sie einem Freund ein Bauwerk oder nehmen Ihre eigenen Strukturen
zwischen Ihren Geräten mit: auf der einen Seite exportieren, die Datei auf
beliebigem Weg senden, auf der anderen importieren.

**Alle exportieren** (neben **Bauplan importieren**, sobald Sie eigene
Strukturen haben) lädt alle Strukturen in Meine Strukturen als eine Datei
herunter, jede mit ihren Zuschreibungen und Abstammungsansprüchen.
**Bauplan importieren** liest auch diese Datei und überspringt jedes
Design, das schon in Meine Strukturen ist, sodass ein zweimaliger Import
keine Duplikate erzeugt. Um auch von allem anderen eine Kopie zu behalten,
nutzen Sie [Ihre Daten](13-YourData.md).

### Urheberschaft beanspruchen

Eine Struktur mit einer Bauplan-Identität (die meisten gespeicherten haben
eine) kann außerdem eine **Zuschreibung durch die Gemeinschaft** tragen —
einen signierten Nachweis, wer beansprucht, sie entworfen zu haben. Öffnen
Sie das Feld **Info** der Struktur über ihre Karte, und Sie finden:

- **Urheberschaft beanspruchen** — signiert unter Ihrer aktuellen
  Identität einen Anspruch, dass Sie einer ihrer Autoren sind. Mehrere
  Personen können dasselbe Design unabhängig voneinander beanspruchen; kein
  Anspruch überschreibt oder ersetzt je einen anderen.
- **Zuschreibung exportieren** / **Im Netzwerk veröffentlichen** — sobald
  Sie es beansprucht haben, teilen Sie diesen Anspruch als Datei oder
  kündigen Sie ihn Ihren verbundenen Peers an.
- **Für dieses Design erneut signieren** — Ansprüche, die vor dem 28.
  September 2026 erstellt wurden, nutzten eine ältere Art von
  Design-Fingerabdruck, die ein anderes Design kopieren kann; sie zählen
  daher nicht mehr, und das Feld sagt, wie viele es gibt. Ist einer davon
  Ihrer und ist dies wirklich Ihr Design, signiert diese Schaltfläche Ihren
  Anspruch erneut. Prüfen Sie zuerst das Design: Die Schaltfläche erscheint
  bei jedem Design, das den alten Fingerabdruck teilt.

Das ist optional und völlig getrennt vom Platzieren, Forken oder Teilen
der Struktur selbst — es ist für Fälle gedacht, in denen Sie Ihren Namen
so an ein Design heften möchten, dass andere es unabhängig überprüfen
können, statt einfach zu vertrauen. Was mit einem Anspruch nach der
Veröffentlichung geschieht und wie Sie ihm unabhängige externe Nachweise
anhängen, steht unter
[Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md).

## Strukturinstanzen: eine lebendige Referenz

Platzieren (oben) kopiert die Steine einer Struktur einmal in Ihr
Dokument. Manchmal möchten Sie stattdessen eine **lebendige** Kopie von
etwas, das Sie schon gebaut haben — jedes gespeicherte Dokument, nicht nur
etwas aus Ihrer Bibliothek —, die bei jedem Hinsehen mit ihrer Quelle
übereinstimmt. Das ist eine **Strukturinstanz**: Sie verweist auf das
Quelldokument, statt seine Steine zu kopieren, sodass spätere Änderungen
an der Quelle jede Instanz automatisch aktualisieren.

1. Öffnen Sie das Auswahlmenü **Zuletzt** in der Werkzeugleiste. (Es
   erscheint, sobald Sie mindestens ein Dokument gespeichert haben.)
2. Klicken Sie neben einem gespeicherten Dokument auf **Platzieren**. Ein
   Klick auf den Namen des Dokuments öffnet es dagegen und ersetzt, was
   Sie geöffnet haben.
3. Fahren Sie über den Boden, drücken Sie `R` zum Drehen und klicken Sie
   zum Platzieren — genau wie bei einem Stein.

Eine Instanz ist eine lebendige *Referenz* auf dieses Dokument, keine
Kopie seiner Steine: Dasselbe Dokument kann beliebig oft platziert
werden, und spätere Änderungen an den Steinen des Quelldokuments
aktualisieren jede seiner Instanzen. Wählen Sie eine Instanz mit dem
Auswahlwerkzeug (`1`) aus, und die Seitenleiste zeigt:

| Bedienelement | Was es tut |
|---|---|
| Im Ansichtsfenster ziehen, oder das [Gizmo](InteractiveTransformGizmo.md) | Verschieben / drehen, wie bei einem Stein |
| Pfeiltasten / Bild↑ / Bild↓ | Schrittweise verschieben |
| **Felder X / Z / Drehung °, dann Anwenden** | Eine genaue Position und Ausrichtung festlegen — die Höhe (Boden-Y) folgt immer dem Gelände und ist kein Zielwert, den Sie festlegen |
| **Drehen ↻ / ↺** | Um genau 90° drehen |
| **Duplizieren** (`Strg/Cmd+D`) | Eine weitere Instanz derselben Struktur platzieren |
| **Löschen** | Diese Instanz entfernen — das Quelldokument bleibt unberührt |
| **Quelldokument bearbeiten** | Das referenzierte Dokument selbst öffnen, um zu ändern, wie jede seiner Instanzen aussieht |

Der *Inhalt* einer platzierten Struktur wird immer über ihr Quelldokument
bearbeitet — die Steine einer Instanz lassen sich nicht direkt bearbeiten,
und genau das hält jede ihrer Instanzen synchron.

## Dokumenteigenschaften

Jede Kreation hat einen **Titel**, eine optionale **Beschreibung**, eine
**Lizenz** und eine Einstellung **Wer es in der Welt platzieren darf** —
festgelegt im Dialog **Dokumenteigenschaften**, der sich mit der
Schaltfläche **✎** neben dem Dokumenttitel oben in der Seitenleiste des
Editors öffnet (in der Weltansicht ist es die Schaltfläche **Metadaten
bearbeiten**). Ein neues Dokument beginnt ohne Lizenz, was bedeutet, dass
niemand sonst es forken kann, bis Sie eine wählen. Die Beschreibung
erscheint als Auszug auf seiner Karte im Repository und ist dort auch
durchsuchbar; die Lizenz legt fest, ob — und wie — andere es forken
dürfen. Was jede Lizenz bedeutet, steht unter
[Veröffentlichen & Forken](04-PublishingAndForking.md).

## Ton

Jede Änderung, die Sie machen, hat ihren eigenen kurzen Klang, sodass Sie
hören, was passiert ist, ohne hinzusehen: ein Klicken, wenn ein Stein oder
eine Struktur platziert wird, ein Plopp, wenn einer entfernt wird, ein
Ticken für eine Verschiebung und ein Doppelticken für eine Drehung, eine
schnelle Folge von Pieptönen für Einfügen oder Duplizieren, ein heller
Ping für eine neue Farbe, zwei Töne für das Gruppieren, eine Glocke für
das Benennen eines Ortes, ein fallender Piepton für Rückgängig und ein
steigender für Wiederholen und ein kleiner Akkord beim Speichern.
Änderungen, die ein Mitwirkender im selben Dokument macht, sind lautlos.

Schalten Sie den Ton mit der Schaltfläche **Ton** oben rechts in der
Ansicht oder mit `M` aus oder ein (aufgeführt in der Übersicht
Tastenkürzel, `?`); der Regler daneben stellt die Lautstärke ein. Es ist
dieselbe Einstellung wie in der Weltansicht und wird auf diesem Gerät
gespeichert. Der Ton beginnt mit Ihrem ersten Klick oder Tastendruck, wie
Browser es verlangen.

## Speichern, veröffentlichen, neu beginnen

- **Speichern** (`Strg+S`) — Ihre Arbeit auf diesem Gerät behalten.
- **Veröffentlichen** — mit allen teilen (siehe
  [Veröffentlichen & Forken](04-PublishingAndForking.md)).
- **Neu** — eine frische, leere Kreation beginnen.
- **Exportieren** — die aktuelle Kreation als JSON-Datei herunterladen, um
  eine Kopie zu behalten oder sie auf ein anderes Gerät zu bringen. Die
  Dateien nutzen ein kompaktes Format, das Steine als Tabelle speichert.
- **Importieren** — eine exportierte Datei als neue Kreation mit eigener
  Identität öffnen; nichts wird behalten, bis Sie **Speichern**. Dateien,
  die frühere Versionen exportiert haben, lassen sich weiterhin öffnen (sie
  werden beim Laden umgewandelt), aber ForkBuild 1.0.0 und älter kann von
  dieser Version exportierte Dateien nicht öffnen.
- **Zuletzt** — etwas wieder öffnen, das Sie früher gespeichert haben (es
  erscheint nach dem ersten Speichern; klicken Sie auf den Namen eines
  Dokuments, um es zu öffnen). Sobald Sie genug Dokumente gespeichert
  haben, erscheint ein Filterfeld, mit dem Sie direkt eines nach Namen
  ansteuern. Jeder Eintrag hat außerdem eine Schaltfläche
  **Platzieren** — siehe
  [Strukturinstanzen](#strukturinstanzen-eine-lebendige-referenz) —, um
  ihn Ihrem *aktuellen* Dokument hinzuzufügen, statt es zu ersetzen.
  **Alle Dokumente exportieren** ganz unten lädt alle gespeicherten
  Dokumente als eine Datei herunter; **Importieren** liest sie wieder ein,
  speichert die Dokumente, die dieses Gerät nicht hat (öffnen Sie sie über
  Zuletzt), überspringt unveränderte, die es hat, und speichert eine Kopie
  neben jedem, das es in einer anderen Version hat. Ungespeicherte
  Änderungen sind nicht enthalten, speichern Sie also vorher.

## Kamerasteuerung

- **Ziehen** — um die Szene kreisen
- **Scrollen** — hinein- und herauszoomen
- **Pos1** — die Kamera auf die Standardansicht zurücksetzen

## Auf Telefon oder Tablet

Der Editor funktioniert mit Touch. Ziehen Sie mit einem Finger zum
Umkreisen, mit zwei zum Schwenken, und ziehen Sie zwei Finger zusammen
zum Zoomen. Ein Tippen wählt aus oder platziert, ein Ziehen nie. Auf einem
schmalen Bildschirm öffnet sich die Seitenleiste über die Schaltfläche
**Werkzeuge** oben rechts in der Szene. Eine Leiste unten in der Szene hat
**Rückgängig**, **Wiederholen**, **Drehen**, **Löschen**, **Mehrfach**
(jedes Tippen fügt der Auswahl einen Stein hinzu oder entfernt ihn),
**Rahmen** (ziehen, um einen Auswahlrahmen aufzuziehen; die Kamera bleibt
still, bis Sie es ausschalten) und **Mehr**, das die Befehlspalette
öffnet. Einzelheiten unter
[Touchscreens](ControlsReference.md#touchscreens).
