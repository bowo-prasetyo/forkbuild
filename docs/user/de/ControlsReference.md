<!-- translation-of: docs/user/ControlsReference.md source-hash: 14214dca588aad38 -->
# Steuerungsreferenz

<!-- languages -->
[English](../ControlsReference.md) · **Deutsch** · [Español](../es/ControlsReference.md) · [Bahasa Indonesia](../id/ControlsReference.md) · [日本語](../ja/ControlsReference.md)
<!-- /languages -->

Jede Maus- und Tastaturbedienung in ForkBuild; Telefone und Tablets
behandelt [Touchscreens](#touchscreens). Die Weltansicht dient dem
Umsehen und Navigieren; jede Baubedienung (Auswahl zum Bearbeiten,
Transformationen, Gruppen, Zwischenablage, Platzieren und die
Befehlspalette) funktioniert nur im Editor. Die Tastenkürzel des Editors
sind dieselben, die in seiner Befehlspalette und der Übersicht **⌨
Tastenkürzel** stehen — wenn diese Seite und die Palette je voneinander
abweichen, hat die Palette recht und diese Seite einen Fehler.

Öffnen Sie im Editor die **Befehlspalette** mit `Strg/Cmd+K`, um jeden
der folgenden Bearbeitungsvorgänge nach Namen zu suchen.

## Kamera (beide Ansichten)

| Eingabe | Aktion |
|---|---|
| Linke Maustaste auf leerer Fläche ziehen | Umkreisen |
| Rechte Maustaste ziehen | Schwenken |
| Mausrad | Zoomen |
| `Pos1` | Editor: Kamera zurücksetzen (ignoriert, solange ein Gizmo gezogen wird). Weltansicht: Kamera und Avatar zu Ihrer eigenen aktuellen Welt zurückbringen — siehe [Weltansicht](03-WorldView.md#orientierung-und-orte) |

## Befehlsoberfläche (nur Editor)

| Eingabe | Aktion |
|---|---|
| `Strg/Cmd+K` | Befehlspalette |
| `?` | Übersicht Tastenkürzel (auch über die Schaltfläche „⌨ Tastenkürzel“ in der Werkzeugleiste erreichbar) — alle Tastenkürzel des Editors |

## Entdecken (Weltansicht)

Keine Tastenkürzel, sondern die eigene Art der Weltansicht, Dinge zu
finden — die vollständige Erklärung steht unter
[Weltansicht](03-WorldView.md#welten-finden).

| Bedienelement | Aktion |
|---|---|
| Suchfeld, **Suchen** | Veröffentlichungen nach Titel/Autor suchen, wahlweise innerhalb eines Radius um eine Koordinate |
| **Hier erkunden** | Den Dialog Ort erkunden öffnen, zentriert auf die aktuelle Position der Kamera |
| **Was ist hier?** | Dasselbe mit einem kleinen festen Radius — „was genau hier ist“ |
| **Fokussieren** bei einem Ergebnis | Die Kamera dorthin fliegen und es zum aktiven (bearbeiteten) Dokument machen |
| **Auswählen** bei einem Ergebnis | Es zum aktiven Dokument machen, ohne die Kamera zu bewegen |
| **Untersuchen** bei einem Ergebnis | An Ort und Stelle eine schreibgeschützte Zusammenfassung aufklappen |

## Orientierung & Navigation (Weltansicht)

Reine Kameranavigation — nichts davon lädt ein Dokument, ändert die
Auswahl oder bearbeitet etwas. Siehe
[Weltansicht](03-WorldView.md#orientierung-und-orte).

| Bedienelement | Aktion |
|---|---|
| Kompassanzeige | Schreibgeschützte Himmelsrichtung mit Markierungen für Strukturen und Geländemerkmale in der Nähe |
| **Start** | Kamera und Avatar zu Ihrer eigenen aktuellen Welt zurückbringen (oder zum gemeinsamen Ursprung, wenn Sie in dieser Sitzung noch keine eigene fokussiert haben) — siehe [Weltansicht](03-WorldView.md#orientierung-und-orte) |
| **Orte** | Eine Liste der Welt, ihrer Strukturen, Wahrzeichen und Gegenden öffnen, jeweils mit einer Schaltfläche **Fokussieren** |
| **?** | Die Kamera- und Gehsteuerung ein- oder ausblenden |
| 🔔 **Benachrichtigungen** (Kopfzeile der App, auf jeder Seite) | Ihren **Benachrichtigungsverlauf** öffnen — ein schreibgeschütztes Protokoll, keine Kameraaktion; siehe [Weltansicht](03-WorldView.md#orientierung-und-orte) |
| **Kamera**: Frei / Ich-Perspektive / Verfolgerperspektive / Vogelperspektive | Die Kamera in festem Abstand an Ihren eigenen Avatar koppeln, statt sie selbst zu fliegen; klicken Sie die aktive erneut an, um zu Frei zurückzukehren — siehe [Avatare & Anwesenheit](06-AvatarsAndPresence.md#kameraperspektive) |

### Ortsbeschreibungen nach Kontext

Während Sie sich durch die Welt bewegen, zeigt die Oberfläche abgeleiteten
Kontext wie:

- „**Wald · nahe Haus**“ — Sie sind in einem Wald, weniger als 50 Einheiten
  von einer Struktur entfernt
- „**Grasland · Fluss**“ — offenes Gelände neben einem Fluss
- „**Grasland · See · nahe Scheune**“ — Gelände, Wasser und die nächste
  Struktur

Diese Beschreibungen werden aus Ihrer Position, der Ökologie des Geländes,
den Gewässern und den Platzierungen von Strukturen berechnet — in der Welt
wird nichts gespeichert.

## Ton (beide Ansichten)

| Eingabe | Aktion | Hinweise |
|---|---|---|
| `M` | Ton aus- oder einschalten | Wie die Schaltfläche **Ton**; eine Einstellung für beide Ansichten, auf diesem Gerät gespeichert. Siehe [Weltansicht](03-WorldView.md#ton) und [den Editor](02-TheEditor.md#ton) |

## Avatarbewegung (Weltansicht)

Mit Ihrem Avatar direkt gehen, statt die Kamera zu fliegen — siehe
[Avatare & Anwesenheit](06-AvatarsAndPresence.md#mit-ihrem-avatar-gehen).

| Eingabe | Aktion | Hinweise |
|---|---|---|
| `W` / `A` / `S` / `D` | Bewegen / drehen | Gebäude, Bäume, Wildtiere und Bewohner in der Nähe blockieren wie eine Wand |
| `Umschalt` (gehalten) | Rennen | |
| `Leertaste` | Springen | |
| `Alt` + `W` / `S` | Dauerhaftes Gehen vorwärts/rückwärts starten | Geht nach dem Loslassen der Tasten weiter; ein gewöhnliches Tippen auf `W`/`S` ohne Alt beendet es |
| `Alt` + `Umschalt` + `W` / `S` | Dauerhaftes Rennen vorwärts/rückwärts starten | Gleiche Regel zum Beenden wie oben |

## Fahrzeuge (Weltansicht)

Siehe [Avatare & Anwesenheit](06-AvatarsAndPresence.md#fahrzeuge). Erfordert
den Modus Avatarsteuerung; ein Hinweis erscheint automatisch, wenn Sie
einem Fahrzeug nahe genug sind, um aufzusteigen.

| Eingabe | Aktion | Hinweise |
|---|---|---|
| `E` | Auf das Fahrzeug in der Nähe aufsteigen oder von Ihrem absteigen | Nur sichtbar/aktiv, wenn ein Fahrzeug in Reichweite ist oder Sie fahren |
| `W` / `S` | Beschleunigen / rückwärts | Ersetzt beim Fahren das Gehen zu Fuß |
| `A` / `D` | Die Blickrichtung Ihres Avatars drehen | Dieselbe Drehung wie zu Fuß — nicht das Lenken des Fahrzeugs |
| `←` / `→` (drücken) | Die angestrebte Fahrtrichtung des Fahrzeugs nach links/rechts drehen | Eine einzelne 45°-Drehung pro Druck — Gedrückthalten dreht nicht weiter |
| `Strg` (gehalten) | Bremsen | |
| `Q` (beim Fahren) | Das Fahrzeug, auf dem Sie sind, in Ihr Inventar stellen | Entfernt es aus der Welt; Sie steigen dabei ab |
| `Q` (nicht fahrend, mit einem Fahrzeug im Inventar) | Das aktuell gewählte abgestellte Fahrzeug hervorholen | Erzeugt es an Ihrer aktuellen Position und lässt Sie aufsteigen; standardmäßig das zuletzt abgestellte |
| `[` / `]` (mit 2 oder mehr Fahrzeugen) | Die Auswahl zum Hervorholen auf ein älteres / neueres abgestelltes Fahrzeug wechseln | Ändert nur, welches `Q` als Nächstes hervorholt — steigt nie selbst auf und entfernt nichts |

## Tiere (Weltansicht)

Siehe [Avatare & Anwesenheit](06-AvatarsAndPresence.md#tiere). Erfordert den
Modus Avatarsteuerung; ein Hinweis erscheint automatisch, wenn ein
fangbares Tier in der Nähe ist oder Sie eines tragen.

| Eingabe | Aktion | Hinweise |
|---|---|---|
| `F` (nahe einem fangbaren Tier) | Es fangen | Fügt es Ihrem Inventar hinzu und entfernt es aus der Welt |
| `F` (kein fangbares Tier nahe, aber eines im Inventar) | Das zuletzt gefangene Tier freilassen | Erzeugt es an Ihrer aktuellen Position, wieder fangbar |
| `G` (nahe einem Tier, das Sie freigelassen haben) | Die Welt damit schmücken | Speichert es als Schmuck in den Inhalt der Welt — nicht mehr fangbar; erfordert Bearbeitungsrechte. Ein Hinweis erscheint, wenn `G` etwas bewirken würde |
| `G` (nahe einem Tierschmuck, kein freigelassenes Tier in der Nähe) | Den Schmuck entfernen | Entfernt ihn aus der Welt und macht ihn wieder zu einem lebendigen, fangbaren Tier |

## Bewohner (Weltansicht)

Siehe [Avatare & Anwesenheit](06-AvatarsAndPresence.md#bewohner). Erfordert
den Modus Avatarsteuerung; die Schaltflächen **Hier einen Bewohner
hinzufügen** / **Bewohner entfernen** und **Sprechen** im Abschnitt Avatar
tun dasselbe ohne ihn.

| Eingabe | Aktion | Hinweise |
|---|---|---|
| `R` (auf offenem Boden, kein Bewohner direkt neben Ihnen) | Einen Bewohner hinzufügen, dessen Zuhause dort ist, wo Sie stehen | Wird in den Inhalt der Welt gespeichert; erfordert Bearbeitungsrechte. Nicht auf einem Dach, im Wasser oder beim Fahren |
| `R` (neben einem Bewohner) | Ihn aus seiner Welt entfernen | Ein Hinweis zeigt **[R] Bewohner entfernen**; rückgängig mit `Strg/Cmd+Z` |
| `T` (neben einem Bewohner) | Sprechen: Er erzählt, was es in der Umgebung gibt | Erscheint in einer Sprechblase über seinem Kopf; sprechen Sie erneut, um etwas anderes zu hören. Die Schaltfläche **Sprechen** im Abschnitt Avatar und auf dem Touchpad tut dasselbe |
| Schaltfläche **Fokus: …** (solange die Worte eines Bewohners zu sehen sind) | Ansehen, was er erwähnt hat | Nur die Kamera; Ihr Avatar bleibt, wo er ist. Angeboten für Wahrzeichen, Strukturen, Bauwerke und Fahrzeuge |

Ihr Inventar, abgestellte Fahrzeuge und freigelassene Tiere werden auf
diesem Gerät gespeichert und überstehen ein Neuladen — siehe
[Avatare & Anwesenheit](06-AvatarsAndPresence.md#was-ein-neuladen-übersteht).

## Auswahl (Editor; ein Klick auf einen Stein in der Weltansicht untersucht ihn nur)

| Eingabe | Aktion | Hinweise |
|---|---|---|
| Klick auf einen Stein | Ihn auswählen (ersetzt die Auswahl) | in der Weltansicht öffnet das nur das Feld Untersuchung — siehe [Weltansicht](03-WorldView.md#die-weltansicht-ist-schreibgeschützt--gebaut-wird-im-editor) |
| `Umschalt`-Klick | Stein zur Auswahl hinzufügen | |
| `Strg/Cmd`-Klick | Stein in die Auswahl aufnehmen oder daraus entfernen | |
| `Umschalt`-Ziehen | Rahmenauswahl (ersetzt die Auswahl) | `Strg/Cmd+Umschalt`-Ziehen fügt der Auswahl hinzu; einfaches Ziehen kreist mit der Kamera |
| `Strg/Cmd+A` | Alles auswählen | |
| `Esc` | Auswahl aufheben | Die eigene Escape-Reihenfolge des Editors, unten — Escape in der Weltansicht schließt nur das jeweils offene Feld |
| `Entf` / `Rücktaste` | Auswahl löschen — **nur Editor** | ein Rückgängig-Schritt; in der Weltansicht gar keine Tastenbelegung |
| Schaltfläche **Fokussieren** im Feld Auswahl — **nur Editor** | Die Kamera sofort auf den/die ausgewählten Stein(e) ausrichten | kein Tastenkürzel; nur die Kamera — berührt nie Dokument, Auswahl oder Rückgängig-Verlauf; nur für ausgewählte Steine, nicht für Strukturplatzierungen |

## Transformieren — Tastatur (nur Editor)

| Eingabe | Aktion |
|---|---|
| `→` / `←` | Auswahl entlang der X-Achse der Welt verschieben |
| `↑` / `↓` | Auswahl entlang der Z-Achse der Welt verschieben |
| `Bild↑` / `Bild↓` | Auswahl entlang der Y-Achse der Welt verschieben |
| `R` | Um +90° um den Drehpunkt der Auswahl drehen |
| `Umschalt+R` | Um −90° drehen |
| `Umschalt` beim Ziehen des Gizmos | Präzisionsmodus (0,1-fache Schritte) |

## Transformieren — Gizmo (nur Editor)

| Eingabe | Aktion |
|---|---|
| Über einen Griff fahren | Hebt ihn hervor |
| Einen Achsengriff ziehen (rot X / grün Y / blau Z) | Entlang dieser Achse verschieben (eingerastet) |
| Die Mittelfläche ziehen (bernsteinfarben) | Frei auf der Bodenebene verschieben |
| Den Drehring ziehen (lila) | Um den Drehpunkt drehen (eingerastet) |
| Loslassen | Übernehmen — genau ein Rückgängig-Schritt |
| `Esc` während des Ziehens | Abbrechen — nichts ändert sich, kein Verlauf |

Würde beim Ziehen oder schrittweisen Verschieben mehrerer Steine ein
Mitglied auf einem Stein außerhalb der Auswahl landen, bricht das
Loslassen dort die Geste ab, statt sie zu übernehmen — jeder Stein kehrt
genau dorthin zurück, wo er begonnen hat, ohne neuen Rückgängig-Eintrag.
Umordnen von Steinen innerhalb derselben Auswahl gilt nie als Kollision.

## Transformieren — Feld für genaue Werte (nur Editor)

Im Abschnitt **Genaue Position & Drehung** des Felds Auswahl.

| Eingabe | Aktion |
|---|---|
| In die Felder X/Y/Z/R tippen | Genaue Werte; leeres Feld = unverändert |
| Umschalter Absolut / Versatz | Ziel für den Drehpunkt oder einfache Differenz |
| `Enter` oder Anwenden | Ein Vorgang, ein Rückgängig-Schritt — nie eingerastet |
| `Esc` in einem Feld oder **Felder zurücksetzen** | Die Felder leeren (hebt nie die Auswahl auf) |

## Ausrichten & Verteilen (nur Editor)

Verfügbar im Abschnitt **Ausrichten, verteilen, wiederholen** des Felds
Auswahl und über die Palette. Ausrichten braucht **2 oder mehr Steine**,
Verteilen **3 oder mehr**. Beide wirken auf die Begrenzung der ganzen
Auswahl in **Weltachsen** und übernehmen einen Befehl.

## Wiederholen (nur Editor)

Ebenfalls im Abschnitt **Ausrichten, verteilen, wiederholen** des Felds
Auswahl. Erstellt **N** zusätzliche Kopien der Auswahl, gleichmäßig
entlang einer Achse versetzt, als **ein Rückgängig-Schritt** — der ganze
Stapel wird vor dem Erstellen auf Kollisionen geprüft, sodass eine
Kollision mittendrin das ganze Wiederholen blockiert, statt manche Kopien
zu erstellen und andere nicht.

| Eingabe | Aktion |
|---|---|
| Feld **Kopien** | Wie viele zusätzliche Kopien (das Original wird nie berührt) |
| Feld **Versatz** | Abstand zwischen den Kopien |
| **X / Y / Z wiederholen** | Entlang dieser Weltachse wiederholen |

## Strukturen (Baubibliothek) — nur Editor

Zusammensetzen, Forken und Ihre persönliche Bibliothek — siehe
[Der Editor](02-TheEditor.md#strukturen-zusammensetzen-forken-und-ihre-persönliche-bibliothek).

| Eingabe | Aktion | Hinweise |
|---|---|---|
| Klick auf eine Karte im Reiter **Strukturen** | In den Modus zum Platzieren einer Struktur wechseln; eine Geistvorschau folgt dem Zeiger | funktioniert mit einer eingebauten Struktur oder einer Ihrer eigenen **Meine Strukturen** |
| `R` / `Umschalt+R` beim Platzieren | Den wartenden Geist um ±90° drehen | dieselben Tasten wie bei der Vorschau eines Steins |
| Klick | Übernehmen — jeder Stein der Struktur landet als ein Rückgängig-Schritt | an einer belegten (roten) Position verweigert |
| `Esc` beim Platzieren | Abbrechen — nichts wird hinzugefügt | |
| Menü **⋮** der Karte, **Als neues Dokument forken** | Ein ganz neues Dokument beginnen, das als Kopie dieser Struktur startet | ändert nie den Bibliothekseintrag |
| Menü **⋮** einer eingebauten Karte, **In Meine Strukturen forken** | Sie unverändert zu Meine Strukturen hinzufügen | kein Dokument erstellt, nichts herausgelöst |
| Menü **⋮** jeder Karte, **Info** | Ein schreibgeschütztes Feld mit Name/Kategorie/Steinen/Grundfläche/Höhe/Quelle/Beschreibung zeigen | nie bearbeitbar |
| Auswahl mit **1 oder mehr Steinen**, dann **Bauplan erstellen** (Abschnitt **Gruppen & Bauplan** des Felds Auswahl oder Befehlspalette) | Einen kleinen Dialog öffnen (Name / Kategorie / Beschreibung + Vorschau); die Auswahl als neuen Eintrag in **Meine Strukturen** speichern | |
| Menü **⋮** einer Karte in **Meine Strukturen**, **Umbenennen** | Den Namen einer persönlichen Struktur ändern | nur persönliche Strukturen |
| Menü **⋮** einer Karte in **Meine Strukturen**, **Entfernen** | Sie aus Ihrer Bibliothek löschen | berührt nie Steine, die bereits daraus zusammengesetzt oder geforkt wurden |
| Menü **⋮** jeder Karte, **Bauplan exportieren** | Sie als portable JSON-Datei herunterladen | eingebaut oder persönlich |
| Schaltfläche **Bauplan importieren** (neben der Überschrift Meine Strukturen) | Eine Bauplandatei als neuen Eintrag in Ihre Bibliothek aufnehmen | frische Identität, auch bei einer erneut importierten Datei |

## Strukturinstanzen (Editor)

Eine **Strukturinstanz** platziert ein ganzes gespeichertes Dokument als
eine einzige auswählbare Einheit — eine lebendige Referenz, keine
Kopie — siehe
[Der Editor](02-TheEditor.md#strukturinstanzen-eine-lebendige-referenz).

| Eingabe | Aktion | Hinweise |
|---|---|---|
| Auswahlmenü **Zuletzt** in der Werkzeugleiste, Schaltfläche **Platzieren** eines Dokuments | In den Modus zum Platzieren einer Struktur für dieses Dokument wechseln | ein Klick auf den Namen des Dokuments öffnet es dagegen |
| `R` / `Umschalt+R` beim Platzieren | Die wartende Instanz um ±90° drehen | dieselben Tasten wie bei der Vorschau eines Steins |
| Klick auf eine platzierte Instanz (Auswahlwerkzeug) | Sie als eine Einheit auswählen, getrennt von einer Steinauswahl | |
| Im Ansichtsfenster ziehen, oder das Gizmo | Die Instanz verschieben / drehen | |
| `Strg/Cmd+D` | Duplizieren — platziert eine weitere Instanz desselben Dokuments | siehe [Duplizieren](#duplizieren-nur-editor) — bei ausgewählten Instanzen entsteht eine neue Instanz statt einer neuen Steinkopie |
| Felder **X / Z / Drehung** im Feld der Instanz, dann Anwenden | Eine genaue Position/Ausrichtung festlegen | Y (die Höhe) ergibt sich immer aus dem Gelände, nie ein Zielwert |
| **Quelldokument bearbeiten** im Feld der Instanz | Das referenzierte Dokument öffnen, um seine Steine zu ändern | jede Instanz aktualisiert sich, da eine Instanz eine lebendige Referenz ist |
| `Entf` / `Rücktaste` | Die Instanz entfernen | berührt nie das referenzierte Dokument |

## Gruppen (nur Editor)

Im Abschnitt **Gruppen & Bauplan** des Felds Auswahl; wenn nichts
ausgewählt ist, listet das Feld Ihre Gruppen auf, sodass Sie eine
anklicken können, um sie auszuwählen.

| Vorgang | Verfügbar, wenn |
|---|---|
| Neue Gruppe | Steine ausgewählt sind |
| Gruppe umbenennen / duplizieren / löschen | eine Gruppe ausgewählt ist |
| Zur Gruppe hinzufügen / Aus Gruppe entfernen | Steine und eine Gruppe ausgewählt sind |

Gruppentransformationen (verschieben/drehen/ausrichten/verteilen/genaue
Werte) wirken auf die aufgelösten Mitgliedssteine; die Mitgliedschaft
selbst ändert sich durch eine Transformation nie.

## Zwischenablage (nur Editor)

| Eingabe | Aktion | Hinweise |
|---|---|---|
| `Strg/Cmd+C` oder **Kopieren** im Feld Auswahl | Kopieren | erfordert eine Auswahl |
| `Strg/Cmd+V` oder **Einfügen** im Feld Auswahl | Einfügen | die Schaltfläche erscheint, sobald die Zwischenablage etwas enthält |

## Duplizieren (nur Editor)

| Eingabe | Aktion | Hinweise |
|---|---|---|
| `Strg/Cmd+D` | Die aktuelle Auswahl an Ort und Stelle duplizieren — ein Rückgängig-Schritt | funktioniert mit losen Steinen oder einer aufgelösten Gruppe; auch eine ausgewählte Strukturinstanz wird dupliziert — siehe [Strukturinstanzen](#strukturinstanzen-editor). Lässt die Zwischenablage (und einen wartenden Einfügeversatz) unberührt |

Das Duplikat wird die aktive Auswahl und ist so sofort bereit zum Ziehen
oder schrittweisen Verschieben.

## Verlauf

| Eingabe | Aktion | Wo |
|---|---|---|
| `Strg/Cmd+Z` | Rückgängig | Editor und Weltansicht |
| `Strg/Cmd+Umschalt+Z` oder `Strg/Cmd+Y` | Wiederholen | Editor und Weltansicht |

In der Weltansicht wirken Rückgängig und Wiederholen auf ihre
Anmerkungen: Wahrzeichen, Regionsnamen und Tierschmuck. Ihr Feld Verlauf
(siehe
[Weltansicht](03-WorldView.md#verlauf--frühere-zustände-in-der-vorschau-ansehen-und-wiederherstellen))
kann sie auch in der Vorschau zeigen und wiederherstellen.

## Nur Editor

| Eingabe | Aktion |
|---|---|
| `1` / `2` | Zwischen Auswahl- und Platzierwerkzeug wechseln |
| `Strg/Cmd+S` | Dokument speichern |

## Platzieren (nur Editor)

Diese Tasten gehören zum Platzierwerkzeug und erscheinen daher nicht in
der Befehlspalette (dort drehen `R`/`Umschalt+R` eine *Auswahl*). Die
Weltansicht hat gar kein Platzierwerkzeug.

| Eingabe | Aktion | Hinweise |
|---|---|---|
| Zeiger bewegen | Die Vorschau folgt der Bodenstelle/Steinfläche unter dem Zeiger | rot gefärbt, wenn die Position gerade belegt ist |
| `R` | Die wartende Vorschau um +90° drehen | bleibt beim Wechsel des Steins erhalten; wird zurückgesetzt, wenn Sie den Platziermodus verlassen. Vor dem ersten Überfahren gedrückt, dreht es die nächste Vorschau |
| `Umschalt+R` | Die wartende Vorschau um −90° drehen | |
| Klick | Die Vorschau als echten Stein übernehmen | an einer belegten (roten) Position verweigert |
| Farbfeld **Farbe** der Baubibliothek | Die Farbe für die nächsten Steine wählen, die Sie platzieren | wird auf die Standardfarbe der Steinart zurückgesetzt, wenn Sie eine andere Art wählen — siehe [Steinfarben](02-TheEditor.md#steinfarben) |

Um bereits platzierte Steine umzufärben, wählen Sie sie aus und nutzen Sie
das Farbfeld **Farbe** im Abschnitt Auswahl — ein Rückgängig-Schritt pro
Änderung.

## Touchscreens

Auf einem Telefon oder Tablet haben dieselben Aktionen Bedienelemente auf
dem Bildschirm. Sie erscheinen immer, wenn das Gerät einen Touchscreen
hat, sodass ein Laptop mit Touchscreen sie neben Tastatur und Maus zeigt.
Auf einem Bildschirm mit 720 Pixeln Breite oder weniger ordnet sich die
Seite außerdem um: Die Seitenlinks klappen hinter eine Schaltfläche
**Menü**, das Seitenfeld der Weltansicht öffnet sich über eine
Schaltfläche **Feld**, und die Seitenleiste des Editors wird zu einer
Schublade, die sich über eine Schaltfläche **Werkzeuge** öffnet.

### Kamera (beide Ansichten)

| Touch | Aktion |
|---|---|
| Mit einem Finger ziehen | Umkreisen |
| Mit zwei Fingern ziehen | Schwenken |
| Zwei Finger zusammenziehen | Zoomen |
| Tippen | Weltansicht: untersuchen, was Sie angetippt haben. Editor: wie ein Klick mit dem aktuellen Werkzeug |

### Gehen (Weltansicht)

Das Touchpad erscheint, solange der Modus Avatarsteuerung an ist; die
Schaltfläche **Gehen** über dem Joystick schaltet den Modus und damit das
Pad ein und aus.

| Bedienelement | Steht für die Tasten | Hinweise |
|---|---|---|
| Joystick | `W` / `A` / `S` / `D` | Nach oben schieben zum Vorwärtsgehen, seitwärts zum Drehen; Diagonalen drücken beide Tasten |
| Joystick bis zum Rand geschoben | `Umschalt` | Rennen |
| **Springen** | `Leertaste` | |
| **Automatisch** | `Alt` + `W`, dann `Alt` + `Umschalt` + `W`, dann `W` | Jedes Tippen: freihändig vorwärts gehen, dann rennen, dann anhalten. Zeigt **Automatisch: Gehen** / **Automatisch: Rennen**, solange es aktiv ist. Den Joystick vor oder zurück zu schieben hält es ebenfalls an; seitwärts lenkt nur |
| **Aufsteigen** / **Absteigen** | `E` | Sichtbar, wenn ein Fahrzeug in Reichweite ist oder Sie fahren |
| **Wegstellen** / **… hervorholen** | `Q` | Sichtbar, wenn Sie das Fahrzeug, auf dem Sie sind, wegstellen oder ein abgestelltes hervorholen können. Hervorholen nennt das Fahrzeug und, wenn Sie mehr als eines tragen, seinen Platz in der Liste (etwa 2/3) |
| **‹** / **›** neben Hervorholen | `[` / `]` | Mit 2 oder mehr Fahrzeugen: ein älteres oder neueres zum Hervorholen wählen |
| **Fangen** / **Freilassen** | `F` | Sichtbar, wenn ein fangbares Tier in der Nähe ist oder Sie eines tragen |
| **Schmücken** / **Schmuck entfernen** | `G` | Sichtbar nahe einem Tier, das Sie freigelassen haben, oder nahe einem Schmuck. Anders als `G` sagt ein verweigertes Schmücken (nicht angemeldet, keine Bearbeitungsrechte), warum |
| **↶** / **↷** | `←` / `→` | Beim Fahren: eine 45°-Lenkdrehung pro Tippen |
| **Bremsen** | `Strg` (gehalten) | Beim Fahren |

Die Schaltflächen des Pads ersetzen die Tastaturhinweise, die ausgeblendet
sind, solange es angezeigt wird. Für freihändiges Rückwärtsgehen (`Alt` +
`S`) gibt es keine Touch-Schaltfläche; wurde es über die Tastatur
gestartet, erscheint es als **Automatisch: Rückwärts**, und ein Tippen
darauf hält an.

### Bearbeiten (Editor)

Ein Tippen tut, was ein Klick tut: wählt mit dem Auswahlwerkzeug aus,
platziert mit dem Platzierwerkzeug. Ein Ziehen bewegt nur die Kamera,
sodass Umkreisen nie versehentlich einen Stein platziert oder die Auswahl
aufhebt. Touch kennt kein Überfahren, daher zeigt das Platzierwerkzeug vor
dem Tippen keine Vorschau; der Stein kommt dorthin, wo Sie tippen. Wenn Sie
einen Stein oder eine Struktur zum Platzieren wählen, schließt sich die
Werkzeug-Schublade, damit das nächste Tippen die Szene erreicht. Die
Leiste unten im Ansichtsfenster steht für die Tasten:

| Schaltfläche | Entspricht | Hinweise |
|---|---|---|
| **Rückgängig** / **Wiederholen** | `Strg/Cmd+Z` / `Strg/Cmd+Umschalt+Z` | |
| **Drehen** | `R` | Beim Platzieren dreht es den nächsten Stein oder die nächste Struktur vor dem Tippen; sonst dreht es die Auswahl |
| **Löschen** | `Entf` | |
| **Mehrfach** | `Strg/Cmd`-Klick | Solange es an ist, fügt jedes Tippen der Auswahl einen Stein hinzu oder entfernt ihn |
| **Rahmen** | `Umschalt`-Ziehen | Solange es an ist, zieht ein Ein-Finger-Ziehen einen Auswahlrahmen auf, statt die Kamera zu bewegen; ist auch **Mehrfach** an, fügt der Rahmen der Auswahl hinzu (`Strg/Cmd+Umschalt`-Ziehen). Die Kamera steht still, solange Rahmen an ist (ein zweiter Finger bricht den Rahmen ab, statt zu zoomen); schalten Sie es also aus, um sich wieder zu bewegen |
| **Mehr** | `Strg/Cmd+K` | Die Befehlspalette, die jede andere Bearbeitungsaktion erreicht |

Die Griffe des Gizmos funktionieren mit Touch genauso wie mit der Maus, ob
**Rahmen** an oder aus ist: einen Griff ziehen.

## Escape-Reihenfolge (Editor)

Escape hängt vom Kontext ab, in genau dieser Reihenfolge:

1. **Aktive Texteingabe** — leert das Feld bzw. verlässt es.
2. **Übersicht Tastenkürzel** — schließt die Übersicht (auch `?` schließt
   sie).
3. **Befehlspalette** — schließt die Palette.
4. **Aktive Gizmo-Geste** — bricht das Ziehen ab (kein Verlauf).
5. **Aktiver Auswahlrahmen** — bricht den Rahmen ab.
6. **Sonst** — hebt die Auswahl auf (im Platziermodus: beendet das
   Platzieren).

### Escape in der Weltansicht

Eine aktive Texteingabe hat Escape weiterhin auf dieselbe Weise; sonst
schließt Escape das jeweils offene Feld der Weltansicht (das Feld Fokus,
ein Namensfeld und so weiter).
