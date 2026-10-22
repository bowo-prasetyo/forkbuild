<!-- translation-of: docs/user/02-TheEditor.md source-hash: b275d31fdacad544 -->
# 02 — Der Editor

<!-- languages -->
[English](../02-TheEditor.md) · **Deutsch** · [Español](../es/02-TheEditor.md) · [Français](../fr/02-TheEditor.md) · [Bahasa Indonesia](../id/02-TheEditor.md) · [日本語](../ja/02-TheEditor.md) · [한국어](../ko/02-TheEditor.md) · [Português (Brasil)](../pt-BR/02-TheEditor.md)
<!-- /languages -->

Im Editor wird gebaut. Diese Anleitung behandelt die Werkzeuge, wie Sie
Steine auswählen und transformieren und wie Sie Ihr Bauwerk mit Gruppen
ordnen.

## Der Aufbau

![Der Editor](../img/de/editor.jpg)
*Oben die Werkzeugleiste; links die Werkzeuge, der Name des Bauwerks, das Feld Auswahl und die Baubibliothek; in der Mitte die 3D-Ansicht.*

```
┌─────────────────────────────────────────────────────────────┐
│ Werkzeugleiste: Speichern · Veröffentlichen · Neu ·         │
│   Exportieren · Importieren · Zuletzt · ⌨ Tastenkürzel      │
├──────────────────────┬──────────────────────────────────────┤
│ [Auswählen|Platzieren│                                      │
│ Bauwerkstitel     ✎  │                                      │
│ Auswahl              │          3D-Ansichtsfenster          │
│ Baubibliothek        │                                      │
│  [Steine|Strukturen] │                                      │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Werkzeugleiste** — zuerst **Speichern**, **Veröffentlichen** und
  **Neu**, dann **Datei**, ein Menü mit **Exportieren**, **3D-Modell** und
  **Importieren**; zuletzt geöffnete wieder öffnen und die Übersicht
  **⌨ Tastenkürzel** öffnen (auch `?`).
- **Werkzeuge** — wechseln Sie zwischen **Auswählen** (`1`) und
  **Platzieren** (`2`). **Platzieren** bleibt hervorgehoben, solange Sie
  einen Stein oder eine Struktur platzieren.
- **Bauwerkstitel** — der Name des geöffneten Bauwerks. Klicken Sie auf
  **✎**, um Titel, Beschreibung und Lizenz zu bearbeiten. Ob sie
  gespeichert ist, zeigt die Werkzeugleiste.
  Ein Klick auf den Titel selbst (**▸**) klappt dasselbe Feld **Über
  dieses Bauwerk** auf, das die Weltansicht zeigt, mit **Weiterlesen**
  für eine lange Beschreibung; **▾** klappt es wieder zu, und der Editor
  merkt sich Ihre Wahl.
- **Auswahl** — zeigt nur, was auf Ihre aktuelle Auswahl wirken kann;
  siehe [Das Feld Auswahl](#das-feld-auswahl) unten.
- **Baubibliothek** — ein Suchfeld und zwei Reiter. Tippen Sie einen Teil
  eines Namens ein, oder sagen Sie mit eigenen Worten, was Sie brauchen:
  *über den Fluss* findet die Brücke, *schlafen* das Bett. Die Wörter, unter
  denen jeder Stein und jede Struktur gefunden wird, kommen mit der App,
  daher wird nichts irgendwohin gesendet.
  - **Steine** — alles, was Sie mit dem Platzierwerkzeug setzen können,
    als Kacheln in sechs Abschnitten (Grundformen, Tragwerk, Dächer &
    Treppen, Öffnungen, Details, Natur): neunundfünfzig Teile, von halben
    Würfeln, runden Steinen und Baumstämmen bis zu Sattel- und Kegeldächern,
    Walmdächern, die ein ganzes Haus in einem Stück decken (4x4, 4x6 und
    6x6), und einem langen Satteldach 2x4, Fensterrahmen und Rundfenstern,
    Zäunen, Bänken, Büschen und Kiefern, Möbeln für die Räume, die Sie
    betreten (ein Tisch, ein Bett, ein Herd und ein Regal, unter Details),
    und einer **Laterne**, die in der Weltansicht nachts leuchtet (siehe
    [Tag und Nacht](03-WorldView.md#tag-und-nacht)). Klicken Sie auf eine, um sie auszuwählen
    (und zum Platzierwerkzeug zu wechseln); dann erscheint ein Farbfeld
    **Farbe** zum Wählen ihrer Farbe — siehe [Steinfarben](#steinfarben)
    unten.
    **Schräge 45°**, **Flache Schräge 2x1**, **Treppe**, **Breite Treppe** und
    **Diagonalstrebe 2x2** steigen zu einer Seite hin an; drehen Sie einen Stein zweimal (**R**, **R**), damit er in
    die andere Richtung zeigt. Eine Diagonalstrebe und eine um 180° gedrehte
    Kopie ergeben ein Kreuz.
  - **Strukturen** — zweiundzwanzig fertige Strukturen in fünf Kategorien
    (Wohnen, Landwirtschaft, Gewerbe, Gemeinschaft, Infrastruktur) und
    drei größere **Schaustücke** sowie
    Ihre eigenen **Meine Strukturen**. Klicken Sie auf eine Karte, um sie
    zu platzieren — siehe
    [Strukturen: zusammensetzen, remixen und Ihre persönliche Bibliothek](#strukturen-zusammensetzen-remixen-und-ihre-persönliche-bibliothek)
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

## Jetzt ausprobieren: ein Haus zum Fertigbauen

**Jetzt ausprobieren** auf **Start** öffnet ein eigenes Haus, das noch
nicht fertig ist: Seine Wände stehen und sein Raum ist eingerichtet, aber
es hat kein Dach. Eine Karte oben bei den Werkzeugen gibt Ihnen die
Aufgabe, einen Schritt nach dem anderen (**Schritt 1 von 4**), jeder mit
einer Schaltfläche, die den passenden Stein wählt und zu Platzieren
wechselt:

1. **Ein Dach**: Klicken Sie auf **Dach wählen** (**Walmdach 6x6**) und
   dann irgendwo auf das Haus: Das Dach kommt oben auf die Wände.
2. **Ein Schornstein**: Klicken Sie auf **Schornstein wählen** und dann
   irgendwo auf das Haus: Er kommt über dem Herd durchs Dach.
3. **Ein Weg zur Tür**: Klicken Sie auf **Stein wählen** und dann viermal
   irgendwo auf das Haus: Die Steine reihen sich von der Türschwelle aus auf.
4. **Ein Garten**: Klicken Sie auf **Busch wählen** und stellen Sie vier
   Dinge ums Haus, wohin Sie möchten. Büsche, ein Zaun, ein Rasen, ein
   Felsen, ein Baum oder eine Laterne aus der Baubibliothek zählen alle.

Jeder Schritt zählt die Steine, die Sie hinzufügen, in beliebiger
Reihenfolge, und Rückgängig geht einen Schritt zurück. Solange die Aufgabe
offen ist, wartet die Karte **Ihr erstes Bauwerk** eingeklappt, damit es
immer nur eine Anleitung gibt. Sind alle vier Schritte erledigt, sagt die
Karte, dass das Haus jetzt Ihnen gehört, mit **Veröffentlichen** (dasselbe
Veröffentlichen wie in der Werkzeugleiste, das Sie auch jederzeit nutzen
können) und **Weiterbauen**, das die Karte wegräumt.

Jedes andere fertige Bauwerk (die Karten auf **Start**, die Ideen einer
Challenge oder eines, das Sie unter **Neu** im Editor wählen) öffnet
stattdessen mit einer Karte **Machen Sie es zu Ihrem eigenen**. Klicken Sie
auf **Baum wählen** (es wählt einen Baum und wechselt zu Platzieren) und dann
neben dem Bauwerk auf den Boden. Sobald etwas Eigenes darin steht, bietet die
Karte ebenso **Veröffentlichen** an. Auf einem Telefon liegt die Karte über
der 3D-Ansicht, über den Touch-Schaltflächen, weil die Werkzeuge dort
eingeklappt sind.

## Ihr erstes Bauwerk

Wenn Sie den Editor auf einem Gerät zum ersten Mal öffnen, steht unten
links in der 3D-Ansicht eine Karte **Ihr erstes Bauwerk** (auf einem Telefon
beginnt sie eingeklappt als kleine Schaltfläche **Erstes Bauwerk · 0/6** oben links, und solange ein Haus aus **Jetzt ausprobieren** seine Aufgabe offen hat, wartet sie ebenfalls eingeklappt).
Sie listet sechs Schritte auf und zeigt einen Hinweis zum nächsten:

1. **Einen Stein platzieren**
2. **Einen auf einen anderen setzen**: einen Stein auf einen anderen setzen.
3. **Etwas Eigenes hinzufügen**: Setzen Sie fünf eigene Steine, einen nach
   dem anderen. Eine aus der Baubibliothek eingesetzte Struktur zählt nicht.
4. **Ihr Bauwerk speichern**
5. **Veröffentlichen und einen Link teilen**: veröffentlichen, dann **Link
   kopieren** oder **Teilen …**.
6. **Hineingehen**: auf **Hineingehen** neben dem Link klicken, den
   Veröffentlichen zeigt (oder in der Karte), und in der Weltansicht durch die
   Tür Ihres Bauwerks hineingehen (siehe
   [Hineingehen](04-PublishingAndForking.md#hineingehen)).

Jeder Schritt wird abgehakt, sobald Sie ihn erledigen, in beliebiger
Reihenfolge; Rückgängig und Wiederholen zählen nicht. Sind alle sechs
erledigt, feiert die Karte und bietet **Andere Bauwerke ansehen** oder
**Weiterbauen** an, dann verschwindet sie; war sie schon fertig, bevor Hineingehen ein Schritt
war, bleibt sie weg. **–** klappt sie zur kleinen
Schaltfläche ein; **Anleitung ausblenden** blendet sie auf diesem Gerät
dauerhaft aus. Um sie zurückzuholen, öffnen Sie die Befehlspalette
(**Strg+K**) und führen **Anleitung zum ersten Bauwerk** aus. Auf einem
Gerät, auf dem schon Arbeit gespeichert ist, beginnt die Anleitung
ausgeblendet.

## Die zwei Werkzeuge

### Platzierwerkzeug (`2`)

Wählen Sie einen Stein aus der Palette, fahren Sie ins Ansichtsfenster und
klicken Sie, um ihn zu platzieren. Ist noch kein Stein gewählt, beginnt
Platzieren mit einem **Würfel**, sodass der erste Klick immer etwas setzt.
Ein durchscheinender Geist zeigt genau, wo der Stein landen wird. Fahren
Sie über die Fläche eines vorhandenen Steins, um zu stapeln oder
anzusetzen. Ein Stein, den Sie auf einen anderen setzen, ruht auf dem
höchsten Stein darunter, nicht in ihm: Ein Dach, das Sie mitten auf den
Boden eines Hauses fallen lassen, sitzt auf seinen Wänden, und ein Balken
über zwei Pfosten auf den Pfosten.

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
| **Strg/Cmd + A** | Alle Steine des Bauwerks auswählen |
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
| **T** | Auf die nächste Seite kippen |
| **Umschalt + T** | In die andere Richtung kippen |
| **Entf / Rücktaste** | Die ausgewählten Steine entfernen |

Wenn Sie mehrere Steine auswählen, drehen sie sich um ihren **gemeinsamen
Mittelpunkt**, sodass ein ganzer Abschnitt als eine Einheit schwenkt.

**T** kippt jeden ausgewählten Stein an Ort und Stelle auf seine nächste
Seite: Ein Pfosten liegt dann als Balken, eine Wand wird zum Boden, eine
Schräge steht kopf als Überhang. Jeder Stein behält die Höhe seiner
Unterseite, und das Kippen ist ein Schritt zum Rückgängigmachen. Nach vier
Drücken steht ein Stein wieder aufrecht. Beim Platzieren kippt **T**
stattdessen den Stein, den Sie gleich setzen. Eine platzierte Struktur wird
gedreht, nicht gekippt. Ältere Versionen von ForkBuild (1.3.0 und früher)
zeigen gekippte Steine aufrecht.

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
  stattdessen das eigene Bauwerk der Struktur (siehe
  [Strukturinstanzen](#strukturinstanzen-eine-lebendige-referenz) unten).

Neben jedem Farbfeld **Farbe** steht eine Reihe von **Dorffarben** (Putz,
Stein, Ziegel, Dachrot, Eiche, Laub, Himmel und mehr), die gut
zusammenpassen: Ein Klick wählt eine davon, für die nächsten Steine oder
für die Auswahl. Mit dem Farbfeld können Sie weiterhin jede Farbe wählen.

Die Farbe eines Steins wird mit Ihrem Bauwerk gespeichert und reist mit
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

Während Sie gemeinsam bauen (**Mit mir bauen**, unten), nimmt Rückgängig nur
Ihre eigenen Schritte zurück, nie die eines Freundes, und zwar auf allen
Bildschirmen zugleich; Wiederholen stellt sie wieder her. Hat ein Freund
seitdem verändert, was Ihr Schritt bewirkt hat (etwa den Stein gelöscht, den
Sie platziert haben), wird dieser Schritt übersprungen, und der Editor sagt es
Ihnen. Wenn jemand beitritt, beginnt Rückgängig für alle von dort an neu: Der
Neue hatte die vorher gemachten Schritte nie.

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

## Strukturen: zusammensetzen, remixen und Ihre persönliche Bibliothek

Der Reiter **Strukturen** der Baubibliothek (siehe
[Der Aufbau](#der-aufbau) oben) bietet zweiundzwanzig fertige Strukturen — Häuser,
Scheunen, einen Brunnen, einen Markt, eine Mühle, eine Brücke und mehr, in
fünf Kategorien — und drei größere **Schaustücke** (eine Burg, eine
Hafeninsel und einen Dorfplatz), sowie **Meine Strukturen**, Ihre persönliche Sammlung
von allem, was Sie aus einem Bauwerk gespeichert haben. Mit jeder davon
können Sie drei verschiedene Dinge tun, und sie sind aus verschiedenen
Gründen wichtig:

- **Platzieren** (Klick auf die Karte) — kopiert die Steine der Struktur
  direkt in das Bauwerk, an dem Sie gerade arbeiten, sodass sie Teil
  eines größeren Bauwerks wird. Das ist die alltägliche Aktion.
- **Als neues Bauwerk remixen** (im Menü **⋮** der Karte) — beginnt ein
  ganz neues, unabhängiges Bauwerk, das als genaue Kopie dieser Struktur
  startet.
- **In Meine Strukturen remixen** (nur bei eingebauten Karten, im Menü
  **⋮**) — fügt die Struktur Ihren eigenen **Meine Strukturen** hinzu,
  ganz ohne Bauwerk. Siehe
  [Meine Strukturen](#meine-strukturen-ihre-persönliche-bauplanbibliothek)
  unten.
- **Info** (im Menü **⋮** der Karte) — ein schreibgeschützter Blick auf
  Name, Kategorie, Anzahl der Steine, Grundfläche, Höhe, Quelle und
  Beschreibung einer Struktur.
- Ein eigenes **gespeichertes Bauwerk** als **Strukturinstanz**
  platzieren — eine lebendige, wiederverwendbare Referenz statt einer
  Kopie — über das Auswahlmenü **Zuletzt** in der Werkzeugleiste, nicht
  über die Baubibliothek. Siehe
  [Strukturinstanzen](#strukturinstanzen-eine-lebendige-referenz) unten.

### Eine Struktur in Ihr Bauwerk platzieren

Klicken Sie im Reiter **Strukturen** auf eine beliebige Karte — eine
eingebaute oder eine Ihrer eigenen **Meine Strukturen** —, und eine
durchscheinende Geistvorschau der ganzen Struktur erscheint und folgt
Ihrem Zeiger über den Boden, genau wie beim Platzieren eines einzelnen
Steins:

1. Bewegen Sie den Zeiger, um den Geist zu positionieren.
2. Drücken Sie `R` / `Umschalt+R`, um ihn in 90°-Schritten zu drehen.
3. Klicken Sie, um zu übernehmen — jeder Stein der Struktur wird Ihrem
   Bauwerk als ein **Rückgängig-Schritt** hinzugefügt. Eine belegte
   Position färbt den Geist rot und verweigert den Klick, genauso wie ein
   einzelner Stein sich nicht auf einen anderen setzen lässt.
4. `Escape` bricht ab — nichts wird hinzugefügt, und Sie kehren zu dem
   Werkzeug zurück, das Sie vorher benutzt haben.

Die Steine, die Sie erhalten, sind ab dem Moment, in dem sie landen,
gewöhnliche Steine in Ihrem Bauwerk — nicht von dem zu unterscheiden, was
Sie von Hand platziert haben, und frei zu bearbeiten, auszuwählen, zu
gruppieren oder zu löschen. Mehrere Strukturen zu platzieren ist ein
schneller Weg zu einer Szene: Haus anklicken, platzieren; Scheune
anklicken, daneben platzieren; Brunnen anklicken, in den Hof platzieren.

### Eine Struktur als neues Bauwerk remixen

Öffnen Sie das Menü **⋮** einer Karte und klicken Sie auf **Als neues Bauwerk
remixen**, um ein ganz neues eigenes Bauwerk zu beginnen, das als
genaue Kopie dieser Struktur startet — genau dieselben Steine, mit jedem
Werkzeug dieser Anleitung bearbeitbar, in einem eigenen Bauwerk, statt in
das eingefügt zu werden, was Sie gerade geöffnet haben. Remixen ändert nie
die Kopie der Bibliothek selbst: Remixen Sie das Haus zehnmal, ist jedes
ab dem Klick auf Remixen ein eigenes, unabhängiges Bauwerk.

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
**⋮** einer **eingebauten** Karte und klicken Sie auf **In Meine Strukturen
remixen**. Sie wird genau so hinzugefügt, wie sie ist — kein
Bauwerk wird erstellt, nichts herausgelöst —, und lässt sich daher sofort
umbenennen, exportieren oder platzieren wie jeder andere Eintrag Ihrer
Bibliothek.

Eine Struktur in **Meine Strukturen** funktioniert genau wie eine
eingebaute — klicken Sie, um sie in Ihr aktuelles Bauwerk zu platzieren,
oder remixen Sie sie als neues Bauwerk — mit zwei zusätzlichen Aktionen im
Menü **⋮**:

| Aktion | Was sie tut |
|---|---|
| **Umbenennen** | Den Namen ändern (Kategorie und Beschreibung bleiben, wie sie sind) |
| **Entfernen** | Sie aus Ihrer Bibliothek löschen |

**Meine Strukturen** speichert immer nur die *Struktur selbst* — einen
Namen und eine Menge Steine. Das Entfernen einer Struktur berührt nie
etwas, das Sie schon damit gebaut haben: Überall, wo Sie sie bereits
platziert oder hineingeremixt haben, bleiben die Steine genau so, wie sie
sind. Und sie wird nie an Ort und Stelle bearbeitet — wenn Sie ändern
möchten, was eine gespeicherte Struktur baut, platzieren Sie sie in ein
Bauwerk, bearbeiten Sie dieses Bauwerk und nutzen Sie dann erneut
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
  Nach **Im Netzwerk veröffentlichen** bietet das Feld **Verteilen** an,
  das den Anspruch auch in dezentrale Netzwerke bringt (siehe
  [Verteilung](Distribution.md)).
- **Für dieses Design erneut signieren** — Ansprüche, die vor dem 28.
  September 2026 erstellt wurden, nutzten eine ältere Art von
  Design-Fingerabdruck, die ein anderes Design kopieren kann; sie zählen
  daher nicht mehr, und das Feld sagt, wie viele es gibt. Ist einer davon
  Ihrer und ist dies wirklich Ihr Design, signiert diese Schaltfläche Ihren
  Anspruch erneut. Prüfen Sie zuerst das Design: Die Schaltfläche erscheint
  bei jedem Design, das den alten Fingerabdruck teilt.

Das ist optional und völlig getrennt vom Platzieren, Remixen oder Teilen
der Struktur selbst — es ist für Fälle gedacht, in denen Sie Ihren Namen
so an ein Design heften möchten, dass andere es unabhängig überprüfen
können, statt einfach zu vertrauen. Was mit einem Anspruch nach der
Veröffentlichung geschieht und wie Sie ihm unabhängige externe Nachweise
anhängen, steht unter
[Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md).

## Strukturinstanzen: eine lebendige Referenz

Platzieren (oben) kopiert die Steine einer Struktur einmal in Ihr
Bauwerk. Manchmal möchten Sie stattdessen eine **lebendige** Kopie von
etwas, das Sie schon gebaut haben — jedes gespeicherte Bauwerk, nicht nur
etwas aus Ihrer Bibliothek —, die bei jedem Hinsehen mit ihrer Quelle
übereinstimmt. Das ist eine **Strukturinstanz**: Sie verweist auf das
Ursprungsbauwerk, statt seine Steine zu kopieren, sodass spätere Änderungen
an der Quelle jede Instanz automatisch aktualisieren.

1. Öffnen Sie das Auswahlmenü **Zuletzt** in der Werkzeugleiste. (Es
   erscheint, sobald Sie mindestens ein Bauwerk gespeichert haben.)
2. Klicken Sie neben einem gespeicherten Bauwerk auf **Platzieren**. Ein
   Klick auf den Namen des Bauwerks öffnet es dagegen und ersetzt, was
   Sie geöffnet haben.
3. Fahren Sie über den Boden, drücken Sie `R` zum Drehen und klicken Sie
   zum Platzieren — genau wie bei einem Stein.

Eine Instanz ist eine lebendige *Referenz* auf dieses Bauwerk, keine
Kopie seiner Steine: Dasselbe Bauwerk kann beliebig oft platziert
werden, und spätere Änderungen an den Steinen des Ursprungsbauwerks
aktualisieren jede seiner Instanzen. Wählen Sie eine Instanz mit dem
Auswahlwerkzeug (`1`) aus, und die Seitenleiste zeigt:

| Bedienelement | Was es tut |
|---|---|
| Im Ansichtsfenster ziehen, oder das [Gizmo](InteractiveTransformGizmo.md) | Verschieben / drehen, wie bei einem Stein |
| Pfeiltasten / Bild↑ / Bild↓ | Schrittweise verschieben |
| **Felder X / Z / Drehung °, dann Anwenden** | Eine genaue Position und Ausrichtung festlegen — die Höhe (Boden-Y) folgt immer dem Gelände und ist kein Zielwert, den Sie festlegen |
| **Drehen ↻ / ↺** | Um genau 90° drehen |
| **Duplizieren** (`Strg/Cmd+D`) | Eine weitere Instanz derselben Struktur platzieren |
| **Löschen** | Diese Instanz entfernen — das Ursprungsbauwerk bleibt unberührt |
| **Ursprungsbauwerk bearbeiten** | Das referenzierte Bauwerk selbst öffnen, um zu ändern, wie jede seiner Instanzen aussieht |

Der *Inhalt* einer platzierten Struktur wird immer über ihr Ursprungsbauwerk
bearbeitet — die Steine einer Instanz lassen sich nicht direkt bearbeiten,
und genau das hält jede ihrer Instanzen synchron.

## Bauwerkeigenschaften

Jedes Bauwerk hat einen **Titel**, eine optionale **Beschreibung**, eine
**Lizenz** und eine Einstellung **Wer es in der Welt platzieren darf** —
festgelegt im Dialog **Bauwerkeigenschaften**, der sich mit der
Schaltfläche **✎** neben dem Bauwerkstitel oben in der Seitenleiste des
Editors öffnet (in der Weltansicht ist es die Schaltfläche **Metadaten
bearbeiten**). Ein neues Bauwerk beginnt ohne Lizenz, was bedeutet, dass
niemand sonst es remixen kann, bis Sie eine wählen. Die Beschreibung
erscheint als Auszug auf seiner Karte in **Entdecken** und ist dort auch
durchsuchbar; die Lizenz legt fest, ob — und wie — andere es remixen
dürfen. Was jede Lizenz bedeutet, steht unter
[Veröffentlichen & Remixen](04-PublishingAndForking.md).

Die Schaltflächen **Titel vorschlagen** und **Beschreibung vorschlagen**
unter dem Titel bieten Ideen aus den Steinen des Bauwerks: seine Strukturen
aus der Baubibliothek, seine wichtigsten Teile und Farben und bei einem
Remix, was es dem Bauwerk hinzugefügt hat, von dem es stammt (*Mühle mit
Speicher mit Scheune*). Drücken Sie **Titel vorschlagen** erneut für
die nächste Idee. Eine vorgeschlagene Beschreibung füllt eine leere oder
kommt hinter das, was Sie geschrieben haben. Es sind nur Vorschläge, auf
Ihrem Gerät ermittelt; ändern Sie sie, wie Sie möchten.

Eine lange Beschreibung liest sich mit etwas Formatierung besser. Das
Feld **Über dieses Bauwerk**, der Ortsbrowser in der Weltansicht und ein
Steem- und Blurt-Beiträge zeigen sie an:

| Schreiben Sie | Ergebnis |
|---|---|
| eine Leerzeile | einen neuen Absatz (ein einfacher Zeilenumbruch bleibt ein Zeilenumbruch) |
| `## Materialien` am Zeilenanfang | eine Überschrift |
| `- ` (oder `* `) am Zeilenanfang | einen Listenpunkt |
| `**Wort**` | **fett** |
| `*Wort*` | *kursiv* |
| `\*`, `\#`, `\-` | das Zeichen selbst |

Alles andere ist keine Formatierung: Links, Bilder und HTML bleiben
einfacher Text. Karten in **Entdecken** zeigen die Wörter der Beschreibung in einer Zeile, ohne
Formatierung.

**Tags** sagen, was das Bauwerk ist, etwa `japanisch tempel garten`: bis zu
5, durch Leerzeichen oder Kommas getrennt, jeweils aus Kleinbuchstaben,
Ziffern und Bindestrichen (Akzente fallen weg, aus `café` wird `cafe`). Hat
ein Bauwerk keine, füllt der Dialog das Feld mit Vorschlägen aus Titel und
Beschreibung, die Sie behalten, ändern oder löschen können; die Schaltflächen
unter dem Feld fügen weitere Vorschläge hinzu. Eine Abspaltung behält ihre
Tags. Ein Blurt-Beitrag listet sie nach denen von ForkBuild, sodass Leute,
die auf Blurt nach Tags stöbern, Ihr Bauwerk finden.

## Ton

Jede Änderung, die Sie machen, hat ihren eigenen kurzen Klang, sodass Sie
hören, was passiert ist, ohne hinzusehen: ein Klicken, wenn ein Stein oder
eine Struktur platziert wird, ein Plopp, wenn einer entfernt wird, ein
Ticken für eine Verschiebung und ein Doppelticken für eine Drehung, eine
schnelle Folge von Pieptönen für Einfügen oder Duplizieren, ein heller
Ping für eine neue Farbe, zwei Töne für das Gruppieren, eine Glocke für
das Benennen eines Ortes, ein fallender Piepton für Rückgängig und ein
steigender für Wiederholen und ein kleiner Akkord beim Speichern.
Änderungen, die ein Mitwirkender im selben Bauwerk macht, sind lautlos.

Schalten Sie den Ton mit der Schaltfläche **Ton** oben rechts in der
Ansicht oder mit `M` aus oder ein (aufgeführt in der Übersicht
Tastenkürzel, `?`); der Regler daneben stellt die Lautstärke ein. Es ist
dieselbe Einstellung wie in der Weltansicht und wird auf diesem Gerät
gespeichert. Der Ton beginnt mit Ihrem ersten Klick oder Tastendruck, wie
Browser es verlangen.

Beim Bauen spielt leise Musik, etwas lebhafter als in der Weltansicht. Die Schaltfläche **♪ Musik** neben dem Regler schaltet sie aus oder ein; es ist dieselbe Wahl wie in der Weltansicht.

## Speichern, veröffentlichen, neu beginnen

- **Speichern** (`Strg+S`) — Ihre Arbeit auf diesem Gerät behalten.
- **Veröffentlichen** — mit allen teilen (siehe
  [Veröffentlichen & Remixen](04-PublishingAndForking.md)). Veröffentlichen
  speichert es auch. Bei einem Bauwerk, das aus einem fertigen begonnen
  wurde und noch nichts Eigenes enthält, wird einmal nachgefragt:
  **Weiterbauen** oder **Trotzdem veröffentlichen**. Die Meldung danach ist
  eine einzige Leiste: **Hineingehen** und **Link kopieren**, und unter
  **Weitere Möglichkeiten zum Teilen** der Link selbst, **Bild speichern**,
  **Video machen** und **Einbetten**. Eine Erinnerung, der Identität, mit der Sie
  veröffentlicht haben, eine Passphrase zu geben, wartet bis zu Ihrer
  nächsten Veröffentlichung, wenn diese Identität gerade erst erstellt wurde.
- **Neu** — etwas Neues beginnen: ein **Leeres Grundstück** oder eines der
  fertigen Bauwerke (eine Burg, eine Hafeninsel, ein Dorfplatz, ein Haus,
  eine Mühle und eine Brücke) als Ihre eigene Kopie, ganz im Blick. Hat das
  Geöffnete ungespeicherte Änderungen, sagt Neu das zuerst; speichern Sie
  es, um sie zu behalten.
- **Datei** — ein Menü mit drei weiteren:
  - **Exportieren** — das aktuelle Bauwerk als JSON-Datei herunterladen, um
    eine Kopie zu behalten oder sie auf ein anderes Gerät zu bringen. Die
    Dateien nutzen ein kompaktes Format, das Steine als Tabelle speichert.
  - **3D-Modell** — das Bauwerk als 3D-Modell für andere Programme
    herunterladen (siehe [Ein 3D-Modell herunterladen](#ein-3d-modell-herunterladen)).
  - **Importieren** — eine exportierte Datei als neues Bauwerk mit eigener
    Identität öffnen; nichts wird behalten, bis Sie **Speichern**. Dateien,
    die frühere Versionen exportiert haben, lassen sich weiterhin öffnen (sie
    werden beim Laden umgewandelt), aber ForkBuild 1.0.0 und älter kann von
    dieser Version exportierte Dateien nicht öffnen.
  Wenn Sie das Bauwerk gemacht haben, signiert **Exportieren** die Datei,
  sodass jeder, der sie importiert, dem Namen und der Lizenz darin trauen
  kann. Ihre eigenen Bauwerke werden als sie selbst importiert. Das Bauwerk
  eines anderen öffnet sich als Ihre eigene Kopie, die ihn nennt, wenn seine
  Lizenz Remixe erlaubt; wenn nicht, oder wenn die Datei geändert wurde,
  nachdem ihr Urheber sie signiert hat, wird es nicht importiert. Die Datei
  trägt die Lizenz, die das Bauwerk beim Exportieren hat. Sie können ein
  Bauwerk also als **All Rights Reserved** veröffentlichen und trotzdem
  jemandem eine Kopie geben, auf der er aufbauen darf: Wählen Sie in
  **Bauwerkeigenschaften** eine andere Lizenz, exportieren Sie, und stellen
  Sie sie danach zurück. **Alle Bauwerke exportieren** und sein
  **Importieren** unter **Zuletzt** funktionieren genauso.
- **Zuletzt** — etwas wieder öffnen, das Sie früher gespeichert haben (es
  erscheint nach dem ersten Speichern; klicken Sie auf den Namen eines
  Bauwerks, um es zu öffnen). Sobald Sie genug Bauwerke gespeichert
  haben, erscheint ein Filterfeld, mit dem Sie direkt eines nach Namen
  ansteuern. Jeder Eintrag hat außerdem eine Schaltfläche
  **Platzieren** — siehe
  [Strukturinstanzen](#strukturinstanzen-eine-lebendige-referenz) —, um
  ihn Ihrem *aktuellen* Bauwerk hinzuzufügen, statt es zu ersetzen.
  **Alle Bauwerke exportieren** ganz unten lädt alle gespeicherten
  Bauwerke als eine Datei herunter; **Importieren** liest sie wieder ein,
  speichert die Bauwerke, die dieses Gerät nicht hat (öffnen Sie sie über
  Zuletzt), überspringt unveränderte, die es hat, und speichert eine Kopie
  neben jedem, das es in einer anderen Version hat. Ungespeicherte
  Änderungen sind nicht enthalten, speichern Sie also vorher.

## Mit mir bauen: gemeinsam bauen, live

**Mit mir bauen**, unter dem Namen des Bauwerks in der Seitenleiste,
erstellt einen Link, mit dem Freunde dieses Bauwerk gleichzeitig mit Ihnen
bauen. Schicken Sie ihn auf jedem Weg, der Ihnen passt; er erscheint auch
als QR-Code für ein Handy. Ein Freund, der ihn öffnet, wählt einen Namen, falls
noch nicht geschehen (seine Steine werden unter seinem Namen hinzugefügt),
klickt auf **Beitreten**, und Ihr Bauwerk öffnet sich in seinem Editor. Von
da an erscheint jeder Stein, den einer von Ihnen platziert, verschiebt,
umfärbt oder löscht, auf beiden Bildschirmen.

- Eine Leiste über der Szene zeigt, wer baut, jeden in seiner eigenen Farbe,
  und jeder von Ihnen sieht in dieser Farbe, wohin der andere zeigt und was
  er ausgewählt hat.
- **Rückgängig** (`Strg/Cmd + Z`) nimmt Ihren eigenen letzten Schritt auf
  allen Bildschirmen zurück, und **Wiederholen** stellt ihn wieder her; die
  Schritte Ihrer Freunde machen diese selbst rückgängig.
- Es muss Ihr eigenes Bauwerk sein: eines, das Sie begonnen haben, oder eine
  Kopie, die Sie erstellt haben. Ein Bauwerk, das Sie begonnen haben, bevor
  Sie einen Namen gewählt haben, wird Ihres, wenn Sie Freunde dazu einladen.
- Wer den Link in den ersten 30 Minuten öffnet, kann beitreten, solange das
  Bauwerk in Ihrem Editor geöffnet bleibt. Alle, die beigetreten sind,
  können bauen, bis Sie auf **Beenden** klicken, ein anderes Bauwerk öffnen
  oder den Editor verlassen. **Link** in der Leiste zeigt den Link erneut.
- Der Editor jedes Freundes behält seine eigene Kopie, auf seinem Gerät
  gespeichert. Wenn Sie aufhören, kann er sie behalten, aber was er ändert,
  erreicht Sie nicht mehr.
  Ein Freund, der keine Steine gesetzt hat, wird nicht genannt, daher bleibt
  seine Kopie Ihr Bauwerk: Aus einer Sicherung wiederhergestellt, folgt sie
  der Lizenz des Bauwerks, wie bei jedem anderen.
- Alle, deren Steine Ihr Bauwerk übernimmt, werden darauf genannt: Der
  Bereich des Bauwerks zeigt **Gebaut mit** und ihre Namen, und wenn Sie
  veröffentlichen, sagen es auch der geteilte Link und der Stammbaum, unter
  Ihrer Signatur. Die Kopie jedes Freundes zeigt dieselben Nennungen. Eine
  Kopie, die jemand anderes davon macht, beginnt ohne solche Nennungen;
  seine ist ein neues Bauwerk.
- Jeder genannte Name und der Autor eines geteilten Bauwerks öffnet die
  Seite dieser Person: die Bauwerke, die ihre Identität signiert hat, und
  die Bauwerke, auf denen andere sie nennen. Im Stammbaum öffnet der Titel
  jedes Bauwerks das Bauwerk, und die Namen seines Autors und seiner
  Mitbauenden öffnen deren Seiten. **Meine Welten** listet **Bauten, an denen Sie
  mitgebaut haben** auf, also die, auf denen ein Freund Sie genannt hat;
  jedes öffnet seine Welt, sobald es veröffentlicht ist. Ihre anderen
  Geräte listen sie ebenfalls auf, sobald sie mit diesem verbunden wurden
  (oder eine Kopie Ihrer Daten erhalten haben).
- Beim Beitreten werden Ihre beiden Geräte direkt verbunden, wie bei **Mit
  mir hier spazieren**: Jeder kann die IP-Adresse des anderen sehen. Niemand
  wird zu einem gemerkten Peer oder Freund, wenn Sie es nicht wählen. Es
  braucht einen Rendezvous-Server; die offizielle Website hat einen.

## Ein 3D-Modell herunterladen

**3D-Modell** unter **Datei** in der Werkzeugleiste lädt das Geöffnete als Datei herunter,
die andere 3D-Programme öffnen, erstellt auf diesem Gerät (nichts wird
hochgeladen):

- **glTF (.glb)** — in Farbe. Öffnet sich in Blender, dem 3D-Viewer von
  Windows, Game-Engines wie Godot und Unity und Online-Modellbetrachtern.
  Eine ForkBuild-Einheit ist ein Meter.
- **Für den 3D-Druck (.stl)** — einfarbig, in Millimetern im Maßstab 1:100
  (eine Tür ist 20 mm hoch, ein Würfel 10 mm), mit Z nach oben und auf dem
  Druckbett stehend, sodass ein Slicer (Cura, PrusaSlicer, Bambu Studio …)
  es druckfertig öffnet; skalieren Sie es dort, wenn Sie es größer wollen.
  Steine, die sich berühren oder überlappen, bleiben eigene Teile, die
  Slicer beim Slicen verbinden.
- **OBJ (.obj)** — in Farbe (als Vertexfarben), für ältere Programme.

Jeder Stein behält genau die Form und Farbe, die er in ForkBuild hat, und
Ihre platzierten Strukturen kommen mit, wenn sie auf diesem Gerät sind (die
Meldung sagt es, falls nicht). Jede Datei nennt das Bauwerk, seinen Urheber,
seine Lizenz und wovon es ein Remix ist: im Copyright und den Extras von
glTF, im STL-Header und als Kommentare im OBJ. Die Seite eines geteilten
Bauwerks bietet dieselben Downloads an, wenn seine Lizenz Kopien erlaubt
(siehe [Was ein Link öffnet](04-PublishingAndForking.md#was-ein-link-öffnet)).

## Das Bauwerk beschreiben

Drücken Sie `I` oder wählen Sie **Bauwerk beschreiben** in der
Befehlspalette, und der Editor sagt, woraus Ihr Bauwerk besteht: wie viele
Steine, etwa wie breit, tief und hoch es ist, welche Strukturen der
Baubibliothek darin stehen, die Fenster, Türen, Dächer, Bäume und anderen
Teile unter den übrigen Steinen und seine Hauptfarben, benannt nach den
Dorffarben. Ein Screenreader liest es vor; es bleibt auch oben in der
3D-Ansicht, bis Sie **Schließen** drücken, ein schneller Weg, ein Bauwerk zu
prüfen, ohne die Kamera darum herumzudrehen. Es wird auf Ihrem Gerät aus den
Steinen ermittelt, daher wird nichts gesendet. Das Bild eines Bauwerks auf
seinem geteilten Link und in einer Einbettung trägt dieselbe Beschreibung
für Screenreader.

## Befehle in eigenen Worten

Tippen Sie in der Befehlspalette (`Strg/Cmd+K`) mit eigenen Worten, was Sie
möchten, etwa *das Dach rot streichen*, *alle Fenster auswählen* oder *die
Bäume löschen*, und die erste Zeile, **Aus Ihren Worten**, sagt, was
geschieht und mit wie vielen Steinen: *4 Fenster in Hafenblau streichen*.
Drücken Sie `Enter` oder klicken Sie darauf, und es geschieht in einem
Schritt, den Sie rückgängig machen können. Verstanden werden Streichen,
Auswählen und Löschen; die Teile eines Bauwerks (Fenster, Türen, Dächer,
Treppen, Bögen, Zäune, Schornsteine, Möbel, Laternen, Bäume, Büsche, Felsen
und Rasen), *alles* oder die Auswahl (*diese*); und die Dorffarben mit
ihren Namen oder alltäglichen Wörtern (*rot*, *dunkelgrau*, *hellblau*). Es
funktioniert in jeder Sprache von ForkBuild, auf Ihrem Gerät; alles andere
sucht wie bisher in den Aktionen.

## Einen Befehl sprechen (Sprachsteuerung)

Drücken Sie `V` oder **🎤 Sprachsteuerung** oben in der 3D-Ansicht und
sagen Sie, was Sie möchten: *das Dach rot streichen*, *alle Fenster
auswählen*, *die Bäume löschen*, *rückgängig*. Drücken Sie `V` (oder
**Stopp**), wenn Sie fertig sind; ForkBuild sagt, was es gehört und getan
hat, in einem Schritt, den Sie rückgängig machen können. Es versteht
dieselben Wünsche wie [Befehle in eigenen Worten](#befehle-in-eigenen-worten)
und jede Aktion, die Sie beim Namen nennen. Eine Frage (*Wie lade ich einen
Freund ein?*) bietet **Das Handbuch fragen** an.

Beim ersten Mal erklärt es, was das Einschalten herunterlädt, einmalig etwa
70 MB: ein kleines Sprachmodell (Whisper) von Hugging Face und seine
Laufzeit von jsDelivr. Beides bleibt in diesem Browser, sodass die
Sprachsteuerung danach auch offline funktioniert. Was Sie sagen, wird auf
Ihrem Gerät aufgenommen und erkannt und nie gesendet (siehe
[Datenschutz](Privacy.md)). **Sprachsteuerung ausschalten** und
**Sprachmodell entfernen** stehen nach jedem Befehl im Sprachfeld. Es hört
die Sprache, in der ForkBuild angezeigt wird.

Auch die Weltansicht hört zu (siehe
[Sagen, wohin es geht](03-WorldView.md#sagen-wohin-es-geht-sprachsteuerung)).
Das Sprachmodell arbeitet im Hintergrund, sodass die Ansicht beim Zuhören nie
stockt, und es bleibt geladen, wenn Sie zwischen beiden wechseln.

## Kamerasteuerung

- **Ziehen** — um die Szene kreisen
- **Scrollen** — hinein- und herauszoomen
- **Pos1** — die Kamera auf die Standardansicht zurücksetzen

Ein Bauwerk öffnet sich schräg von oben gesehen, ganz im Bild.

### Hineinsehen

**Hineinsehen** oben links über der Ansicht (auf einem Telefon oben rechts,
unter **Werkzeuge**) schneidet das Bauwerk oberhalb seines Erdgeschosses
weg, wie die Weltansicht, wenn Sie hineingehen: Die Wände stehen bis etwa
Kopfhöhe, und die Räume zeigen sich samt Möbeln von oben. Bauen Sie darin
wie gewohnt: Ein Klick geht an dem vorbei, was weggeschnitten ist.
**Ganz zeigen** zeichnet wieder alles. Nichts wird entfernt; nur was
gezeichnet wird, ändert sich.

## Auf Telefon oder Tablet

Der Editor funktioniert mit Touch. Ziehen Sie mit einem Finger zum
Umkreisen, mit zwei zum Schwenken, und ziehen Sie zwei Finger zusammen
zum Zoomen. Ein Tippen wählt aus oder platziert, ein Ziehen nie. Auf einem
schmalen Bildschirm öffnet sich die Seitenleiste über die Schaltfläche
**Werkzeuge** oben rechts in der Szene. Eine Leiste unten in der Szene hat
**Rückgängig**, **Wiederholen**, **Drehen**, **Kippen**, **Löschen**, **Mehrfach**
(jedes Tippen fügt der Auswahl einen Stein hinzu oder entfernt ihn),
**Rahmen** (ziehen, um einen Auswahlrahmen aufzuziehen; die Kamera bleibt
still, bis Sie es ausschalten) und **Mehr**, das die Befehlspalette
öffnet. Auf einem Handy lässt sich die Werkzeugleiste über der Szene seitlich
scrollen, deshalb stehen **Speichern** und **Veröffentlichen** darin ganz vorn
(nach **← Zurück zur Welt**, wenn es das gibt). Einzelheiten unter
[Touchscreens](ControlsReference.md#touchscreens).
