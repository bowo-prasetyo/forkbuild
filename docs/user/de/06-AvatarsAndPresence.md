<!-- translation-of: docs/user/06-AvatarsAndPresence.md source-hash: 5914df7d440551c6 -->
# 06 — Avatare & Anwesenheit

<!-- languages -->
[English](../06-AvatarsAndPresence.md) · **Deutsch** · [Español](../es/06-AvatarsAndPresence.md) · [Français](../fr/06-AvatarsAndPresence.md) · [Bahasa Indonesia](../id/06-AvatarsAndPresence.md) · [日本語](../ja/06-AvatarsAndPresence.md) · [Português (Brasil)](../pt-BR/06-AvatarsAndPresence.md)
<!-- /languages -->

Ihr **Avatar** ist, wie andere Sie in der Weltansicht sehen — sein
Aussehen, seine Position und wie er sich bewegt. Diese Anleitung behandelt,
wie Sie ihn anpassen, festlegen, wer ihn sehen kann, und mit den Avataren
aller anderen umgehen.

## Ihren Avatar anpassen

Öffnen Sie in der oberen Leiste **Mein Avatar**:

1. Wählen Sie im Auswahlmenü eine **Vorlage** — einen Körpertyp (z. B.
   „Humanoid 01“). Eine flache Vorschau aktualisiert sich live, während Sie
   wählen.
2. Wählen Sie für jeden Teil, den die Vorlage festlegt (die eingebauten
   Vorlagen bieten **Haut, Haare, Hemd, Hose**), eine Option aus seinem
   Auswahlmenü und, wo die Vorlage es erlaubt, eine Farbe.
3. Schalten Sie in einer Checkliste die **Accessoires** ein, die die
   Vorlage anbietet. (Jeder Teil, der mehrere Auswahlen gleichzeitig
   erlaubt, erscheint als solche Checkliste; die Seite zeigt genau die
   Teile, die die gewählte Vorlage festlegt.)
4. Legen Sie Ihren **Anzeigenamen** fest (bis zu 60 Zeichen) — das ist der
   Name, der mit Ihrem Avatar und unter Peers/Unterhaltungen angezeigt
   wird.
5. Klicken Sie auf **Speichern**.

Ein Wechsel der Vorlage setzt das Aussehen auf deren eigene Standardwerte
zurück — Auswahlen werden nicht zwischen Vorlagen übernommen. Hier gibt es
keine 3D-Vorschau; Ihren tatsächlichen Avatar sehen Sie, wenn Sie (oder
jemand anderes) ihn zum ersten Mal in der Weltansicht ansehen.

## Wer Sie sehen kann: zwei unabhängige Einstellungen

Die Seite Mein Avatar hat zwei getrennte Sichtbarkeitseinstellungen. Man
verwechselt sie leicht, halten Sie sie also auseinander:

| Einstellung | Legt fest |
|---|---|
| **Sichtbarkeit der Anwesenheit** | Wer Ihre *Live-Position* erhält — ob und wo Sie sich in der Weltansicht bewegend zeigen |
| **Sichtbarkeit des Profils** | Wer Ihr *Aussehen* erhält — Vorlage, Farben, Accessoires, Anzeigename |

Beide bieten dieselben vier Stufen, und beide beginnen auf **Öffentlich**:

- **Öffentlich** — jeder Verbundene kann es sehen.
- **Freunde** — gegenseitige Freunde sowie alle Identitäten, die Sie
  ausdrücklich auflisten (fügen Sie Identitäts-IDs ein, eine pro Zeile).
  Das ist eine schlichte Erlaubnisliste, kein Ablauf mit Anfrage und
  Zustimmung — was „Freund“ bedeutet, steht unter
  [Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md).
- **Lokal** — nur andere ForkBuild-Tabs in genau diesem Browser; nie an
  einen Peer gesendet, nicht einmal an einen Freund.
- **Verborgen** — nie bekannt gegeben, an niemanden. So werden Sie
  unsichtbar.

Jeder Abschnitt hat seine eigene Schaltfläche zum Speichern — das
Speichern des einen speichert nie den anderen. „Gespeichert.“ erscheint
nach dem Speichern und verschwindet, sobald Sie diesen Abschnitt erneut
ändern, sodass es immer beschreibt, was Sie gerade sehen.

Mit jemandem befreundet zu sein zeigt Ihren Avatar **nicht** von selbst —
diese beiden Einstellungen entscheiden, was tatsächlich geteilt wird,
unabhängig voneinander. Und sie betreffen nur *künftige* Aktualisierungen:
Wer Ihre Position oder Ihr Aussehen schon erhalten hat, behält es; es gibt
kein „vergiss mich“ aus der Ferne.

Sie können **Meinen Avatar zeigen** und **Andere Avatare zeigen** auch
direkt in der Weltansicht umschalten, als einfache Anzeigeschalter auf
Ihrer Seite. Solange Sie keinen eigenen Avatar haben, zeigt der Abschnitt
Avatar der Weltansicht nur **Andere Avatare zeigen** und einen Hinweis,
wie Sie einen erstellen; die Bedienelemente, die Ihren Avatar brauchen,
erscheinen, sobald Sie ihn haben.

## Andere Menschen in der Weltansicht sehen

Jeder, dessen Anwesenheit Sie empfangen dürfen (gemäß seiner eigenen
Sichtbarkeit der Anwesenheit), erscheint automatisch, während Sie sich
bewegen — für einen öffentlichen Avatar ist keine Freundschaftsanfrage
nötig. Klicken Sie auf einen Avatar (oder einen Eintrag im Feld **Avatare
in der Nähe** — eine einfache Liste aller in der Nähe, mit Entfernung und
aktueller Animation), um sein **Avatar-Infofeld** zu öffnen:

- Anzeigename und Avatarvorlage
- Eine Statuszeile — **Anwesend / Veraltet / Abwesend** und eine
  Vertrauensangabe (**Vertrauenswürdig / Unsigniert / Widersprüchlich**),
  die beschreibt, wie gut die Daten dieses Avatars überprüft sind
- Position, Entfernung (in Welteinheiten) und aktuelle Animation (Geht,
  Untätig, …)
- **Avatar folgen** — koppelt Ihre Kamera an seine Bewegung
- **Grüßen / Winken / Zeigen** — sendet dem Avatar eine einmalige Geste
- **Ihren Werken folgen** — folgt der Identität hinter dem Avatar, sodass
  ihre neuen Kreationen auf der Seite **Gefolgt** erscheinen (siehe
  [Personen folgen](07-PeerConnectionsAndFriends.md#personen-folgen)). Es
  erscheint nur, wenn die Anwesenheit des Avatars signiert ist, denn erst
  eine Signatur beweist, wessen Avatar es ist.

Ein fremder Avatar ist sonst nur zum Ansehen da — es gibt keinen Weg, den
Avatar eines anderen zu bewegen, zu bearbeiten oder zu löschen, nur
anzusehen, ihm zu folgen und Gesten zu senden.

Ob ein Avatar in der Nähe überhaupt erscheint, hängt davon ab, wohin Ihre
**Kamera** gerade blickt, nicht, in welche Richtung Ihr eigener Avatar
geht — beides kann in verschiedene Richtungen zeigen, meist direkt
nachdem Sie die Kamera frei herumgedreht haben. Jemand, der genau auf
Ihrem Weg steht, kann völlig unsichtbar sein, während Ihre Kamera
woanders hinsieht; drehen Sie die Kamera zurück zu ihm, und er erscheint
wieder.

## Mit Ihrem Avatar gehen

Die Kamera zu fliegen ([Weltansicht](03-WorldView.md#herumfliegen)) ist
eine Art, sich zu bewegen, aber Sie können mit dem **Modus
Avatarsteuerung** auch direkt mit Ihrem Avatar gehen. Um ihn
einzuschalten, müssen Sie angemeldet sein und unter **Mein Avatar** einen
Avatar gespeichert haben; setzen Sie dann im Abschnitt **Avatar** der
Weltansicht das Häkchen bei **Meinen Avatar steuern (WASD, Umschalt,
Leertaste)**. Bis dahin tun die Tasten nichts, und sie werden ignoriert,
solange ein Textfeld den Fokus hat — klicken Sie zuerst in die 3D-Ansicht.

| Taste | Aktion |
|---|---|
| **W / A / S / D** | Bewegen / drehen |
| **Umschalt** | Rennen (schnellere Bewegung) |
| **Leertaste** | Springen |
| **Alt + W / S** | Freihändiges dauerhaftes Gehen vorwärts/rückwärts — läuft weiter, nachdem Sie die Tasten loslassen |
| **Alt + Umschalt + W / S** | Dasselbe, aber rennend statt gehend |

Auf einem Telefon oder Tablet ersetzen ein Joystick und Schaltflächen auf
dem Bildschirm diese Tasten: Schieben Sie den Joystick zum Gehen und ganz
bis zum Rand zum Rennen, und tippen Sie auf **Springen**. Siehe
[Touchscreens](ControlsReference.md#gehen-weltansicht).

Beim Gehen gibt es Kollisionen mit geladenen Gebäuden, Bäumen und
Wildtieren in der Nähe — Sie können nicht durch Strukturen gehen, die um
Sie herum nachgeladen werden, nicht durch die Bäume, die als Teil des
Geländes erzeugt werden, und nicht durch ein Reh oder Kaninchen, das in
der Nähe grast (siehe [Weltansicht](03-WorldView.md#herumfliegen)).
Wildtiere blockieren Ihren Weg immer nur wie ein Baum, wohin auch immer ein
Tier gewandert ist — es dreht vielleicht den Kopf, um Sie zu beobachten,
weicht Ihnen aber nie aus und nimmt keinen Schaden, und ein Fahrzeug fährt
einfach hindurch; nur das Gehen zu Fuß wird aufgehalten. Ein Tier, das Sie
gefangen haben, blockiert nichts mehr. Ihr Avatar kann über platzierte
Strukturen gehen, senkrechte Flächen erklimmen und sich in unebenem
Gelände bewegen. Die Kamera folgt Ihrem Avatar natürlich, während Sie sich
bewegen.

**Avatar folgen** hält die Kamera an Ihren Avatar gekoppelt, während er
sich bewegt, statt frei zu kreisen. Sie können auch den Avataren anderer
Spieler folgen, um zu sehen, wohin sie gehen.

### Kameraperspektive

Neben Avatar folgen sitzt **Kamera**, eine Reihe von vier
Schaltflächen — **Frei**, **Ich-Perspektive**, **Verfolgerperspektive**
und **Vogelperspektive** —, um Ihre Kamera in festem Abstand an Ihren
eigenen Avatar zu koppeln, statt sie selbst zu fliegen. Wie Avatar folgen
brauchen sie einen lokalen Avatar (Mein Avatar), um aktiv zu sein.

- **Frei** ist die gewöhnliche Kreiskamera — der Standard der Weltansicht
  und das, wovon jede andere Kamerasteuerung in dieser Anleitung ausgeht.
- **Ich-Perspektive** setzt die Kamera auf Augenhöhe Ihres Avatars, mit
  Blick in seine Richtung.
- **Verfolgerperspektive** sitzt hinter und über Ihrem Avatar und blickt
  leicht nach unten — der klassische Blick „auf die eigene Figur“.
- **Vogelperspektive** blickt von hoch oben senkrecht nach unten, folgt
  der Position Ihres Avatars, ignoriert aber absichtlich seine
  Blickrichtung, sodass sich die Ansicht nie dreht, wenn Sie sich drehen.

Ein Klick auf die bereits aktive Schaltfläche kehrt zu **Frei** zurück.
Eine Kameraperspektive ist rein lokal — sie wird nie mit einem
Mitwirkenden geteilt und beeinflusst nie, was er sieht.

Die beiden Arten verhalten sich beim Drehen unterschiedlich: Mit einer
festen Perspektive (Ich-Perspektive oder Verfolgerperspektive) richtet
sich die Kamera bei jeder Bewegung neu nach der aktuellen Blickrichtung
Ihres Avatars aus, sodass sich Ihre Ansicht genau mit Ihnen dreht. Mit
**Frei** ist die Kamera absichtlich richtungsblind — Drehen auf der
Stelle, Gehen oder Aufsteigen auf ein Fahrzeug bewegt oder dreht sie nie
von selbst, nur Ihr eigenes Ziehen/Schwenken/Zoomen. Wenn Sie frei in eine
Richtung schauen und dann in eine andere losgehen, blickt die Kamera
weiter dorthin, wohin Sie sie zuletzt gerichtet haben, statt Ihnen zu
folgen.

### Freihändige dauerhafte Bewegung

Halten Sie **Alt**, während Sie **W** oder **S** tippen, beginnt Ihr Avatar
dauerhaft in diese Richtung zu gehen (oder, wenn auch **Umschalt**
gehalten wird, zu rennen) — er läuft weiter, auch nachdem Sie alle Tasten
losgelassen haben, genau wie ein Tempomat. Erneutes Tippen auf **W** oder
**S** *ohne* Alt beendet es und kehrt zur gewöhnlichen Bewegung mit
gehaltener Taste zurück; ebenso beendet es ein Tippen in die
Gegenrichtung, statt die Richtung umzukehren. Auf einer Tastatur gibt es
keine Anzeige auf dem Bildschirm, dass es aktiv ist — das einzige Zeichen
ist, dass Ihr Avatar von selbst weitergeht.

Auf einem Telefon oder Tablet tut die Schaltfläche **Automatisch** auf dem
Touchpad dasselbe: einmal tippen, um freihändig vorwärts zu gehen, noch
einmal zum Rennen und ein drittes Mal zum Anhalten. Solange sie aktiv ist,
zeigt sie **Automatisch: Gehen** oder **Automatisch: Rennen**. Den
Joystick vor oder zurück zu schieben hält sie ebenfalls an, genau wie ein
Tippen auf **W** oder **S**; seitwärts schieben dreht Sie nur, sodass Sie
während der automatischen Fahrt lenken können.

### Fahrzeuge

Manche Welten stellen ein Fahrrad, Motorrad, Auto oder eine Drohne bereit,
mit dem Ihr Avatar statt zu gehen fahren kann. Gehen Sie nahe genug heran,
und ein Hinweis sagt Ihnen, mit welcher Taste Sie aufsteigen:

| Taste | Aktion |
|---|---|
| **E** (nahe einem Fahrzeug) | Aufsteigen |
| **E** (beim Fahren) | Absteigen |
| **W / S** | Beschleunigen / rückwärts |
| **A / D** | Die Blickrichtung Ihres Avatars drehen — dieselbe dauerhafte Drehung wie zu Fuß, nicht das Lenken des Fahrzeugs |
| **← / →** (drücken) | Lenken — eine einzelne 45°-Drehung der angestrebten Fahrtrichtung pro Druck; Gedrückthalten dreht nicht weiter, für jede Drehung ist ein neuer Druck nötig |
| **Strg** (gehalten) | Bremsen |

Sobald Sie aufgestiegen sind, steuern **W/S** und **Strg** das Fahrzeug,
während **←/→** es lenken — es gibt keinen eigenen „Fahrmodus“, den Sie
einschalten müssten. **A/D** drehen weiterhin den Körper Ihres Avatars,
genau wie zu Fuß, und sind unabhängig vom Lenken. Beim Absteigen steht Ihr
Avatar an einer freien Stelle neben dem Fahrzeug wieder auf den Füßen.
Höchstgeschwindigkeit, Beschleunigung, Bremsen und Lenken eines Fahrzeugs
hängen davon ab, was für ein Fahrzeug es ist, und seine Kollisionsfläche
ist passend bemessen — derzeit sind das Fahrrad, Motorrad, Auto und
Drohne, die vier Fahrzeuge, die Welten tatsächlich platzieren und
darstellen. Ein Motorrad ist schneller als ein Fahrrad und seltener zu
finden, ein Auto noch schneller als ein Motorrad und noch seltener, und
eine Drohne ist das schnellste und seltenste von allen.

Eine Drohne steht still auf dem Boden, genau wie die anderen drei, bis Sie
aufsteigen und losfahren — **W** oder **S** gedrückt zu halten hebt sie vom
Boden ab; loslassen bringt sie wieder herunter. In der Luft fliegt sie über
Bäume, aber ein hohes Gebäude blockiert sie genauso wie ein Auto; Fliegen
heißt also nicht, die Geometrie der Welt zu ignorieren. Mitten in der Luft
können Sie nicht von einer Drohne absteigen — bringen Sie sie zuerst
zurück auf den Boden.

#### Ein Fahrzeug mitnehmen

Ein Fahrzeug weit entfernt von dort gefunden, wo Sie es später brauchen?
Drücken Sie beim Fahren **Q**, um es in Ihr Inventar zu stellen — es
verschwindet aus der Welt, und Sie steigen im selben Zug ab. Gehen Sie
irgendwo anders hin, drücken Sie ohne Fahrzeug erneut **Q**, und das
gewählte abgestellte Fahrzeug erscheint genau dort, wo Sie stehen, und Sie
sitzen schon darauf. Derzeit gibt es keine Grenze, wie viele Fahrzeuge Sie
gleichzeitig tragen können, und ein abgestelltes Fahrzeug taucht nie
wieder dort auf, wo Sie es gefunden haben.

Standardmäßig holt **Q** das Fahrzeug hervor, das Sie zuletzt abgestellt
haben. Tragen Sie mehr als eines, drücken Sie **[** oder **]**, um die
Auswahl rückwärts oder vorwärts durch alles zu wechseln, was Sie tragen —
der Hinweis zeigt, welches gewählt ist und seinen Platz (z. B. „Fahrrad
hervorholen (1/3)“), sodass Sie ein älteres finden, ohne sich durch
Hervorholen und erneutes Abstellen dorthin vorzuarbeiten. Der Wechsel
ändert nur, was **Q** als Nächstes hervorholt; er erzeugt oder entfernt
nie selbst etwas.

#### Mit anderen in der Nähe fahren

Wer Ihren Avatar sehen kann, sieht auch, was Sie fahren: Ihr Fahrrad,
Motorrad, Auto oder Ihre Drohne wird auf dessen Bildschirm unter Ihnen
gezeichnet, in Fahrtrichtung, und er hört den Motor, Ihr Auf- und
Absteigen und Ihr Bremsen (siehe „Ton“ in
[03 — Weltansicht](03-WorldView.md)). Deren Fahrzeuge sehen und hören Sie
genauso. Es folgt Ihrer Anwesenheitseinstellung: Wer Sie nicht sehen kann,
erfährt auch nicht, was Sie fahren.

Solange jemand anderes ein Fahrzeug fährt, verschwindet Ihre eigene Kopie
davon, und Sie können nicht aufsteigen; das Fahrzeug, das Sie selbst
fahren, bleibt immer Ihres. Wo ein Fahrzeug steht, wenn niemand es fährt,
wird allerdings nicht geteilt: Sobald jemand absteigt, erscheint es auf
Ihrem Bildschirm dort, wo Sie es zuletzt stehen sahen, was nicht der Ort
sein muss, an dem es abgestellt wurde. Ein mit **Q** abgestelltes oder an
einem neuen Ort hervorgeholtes Fahrzeug ist ebenso nur auf dem Bildschirm
seines Besitzers, bis er es fährt.

### Tiere

Manche Welten haben Wildtiere — Rehe in Wäldern, Kaninchen auf offenem
Grasland. Wilde Tiere wandern langsam um den Ort herum, an dem die Welt
sie platziert hat, und entfernen sich nie mehr als ein paar Schritte.
Gehen Sie nahe genug an eines heran, und ein Hinweis sagt Ihnen, dass Sie
es mit **F** fangen können. Fangen fügt es Ihrem Inventar hinzu (demselben
Inventar, in dem ein abgestelltes Fahrzeug liegt) und entfernt es aus der
Welt.

Gehen Sie irgendwo anders hin und drücken Sie erneut **F** — ist nichts
Fangbares in der Nähe, lässt das das zuletzt gefangene Tier genau dort
frei, wo Sie stehen, und es ist sofort wieder fangbar, falls Sie es
zurückhaben möchten. Ein freigelassenes Tier bleibt genau dort, wo Sie es
losgelassen haben, ist aber nicht erstarrt: Es grast, sieht sich um, dreht
sich ab und zu in eine neue Richtung und wendet den Kopf, um Sie zu
beobachten, wenn Sie näher kommen. Derzeit gibt es keine Grenze, wie viele
Tiere Sie tragen können, und ein gefangenes Tier stört nie ein Fahrzeug,
das Sie ebenfalls tragen, oder umgekehrt — sie teilen sich denselben
Rucksack, werden aber nie verwechselt.

#### Eine Welt mit einem Tier schmücken

Ein freigelassenes Tier lebt nur in Ihrer eigenen Sitzung. Um eines zu
einem dauerhaften Teil der Welt zu machen — etwa ein Kaninchen, das auf
etwas sitzt, das Sie gebaut haben —, stellen Sie sich neben ein Tier, das
Sie freigelassen haben, und drücken Sie **G**. Es wird zu einem
**Tierschmuck**: im eigenen Inhalt der Welt gespeichert, sodass es dabei
ist, wenn diese Welt veröffentlicht oder verteilt wird, und jeder, der sie
öffnet, es sieht, genau so wie das Tier, aus dem es entstanden ist. Es
bleibt an der Stelle, die Sie gewählt haben (ein Kaninchen auf einem Dach
läuft also nie herunter), grast aber, sieht sich um und dreht sich auf der
Stelle, und jeder, der die Welt öffnet, sieht es im selben Moment dasselbe
tun.

Ein Schmuck ist nur Dekoration — er kann nicht mit **F** gefangen werden.
Umentschieden? Stellen Sie sich daneben und drücken Sie erneut **G**: Der
Schmuck wird aus der Welt entfernt und wieder zu einem lebendigen,
fangbaren Tier. Ist beides in der Nähe, schmückt **G** zuerst mit einem
frisch freigelassenen Tier, so wie **F** das Fangen dem Freilassen
vorzieht. Nur Tiere, die Sie freigelassen haben, können zum Schmuck werden
— Wildtiere, die die Welt selbst platziert hat, nicht. Ein Hinweis
erscheint, wenn **G** in der Nähe etwas schmücken oder rückgängig machen
würde. Wie das Hinzufügen eines
[Wahrzeichens](03-WorldView.md#wahrzeichen--einen-ort-markieren-den-man-sich-merken-sollte)
erfordert das Schmücken, dass Sie angemeldet sind und Bearbeitungsrechte
für die Welt haben, in der Sie sind. In der veröffentlichten Welt eines
anderen kommt der Schmuck in Ihre eigene Kopie davon — sofern ihre Lizenz
das Forken erlaubt. Trifft nichts davon zu, tut **G** einfach nichts; die
Schaltfläche **Schmücken** auf dem Touchpad sagt stattdessen, warum.

### Bewohner

Eine Welt kann **Bewohner** haben: Menschen, die dort leben und um den Ort
herumspazieren, den sie ihr Zuhause nennen, und zwischen Ihren Gebäuden
ihrem Tag nachgehen. Um einen hinzuzufügen, stellen Sie sich auf offenen
Boden, wo er leben soll, und drücken Sie **R** (oder klicken Sie im
Abschnitt **Avatar** auf **Hier einen Bewohner hinzufügen**). Er erscheint
direkt neben Ihnen und ist ab dann Teil des eigenen Inhalts der Welt —
gespeichert, veröffentlicht und geforkt mit ihr, wie ein
[Wahrzeichen](03-WorldView.md#wahrzeichen--einen-ort-markieren-den-man-sich-merken-sollte).
Um einen hinzuzufügen, müssen Sie angemeldet sein und Bearbeitungsrechte
für die Welt haben, in der Sie sind; in der veröffentlichten Welt eines
anderen kommt der Bewohner in Ihre eigene Kopie davon. Umentschieden?
Stellen Sie sich neben einen Bewohner und drücken Sie erneut **R** (ein
Hinweis zeigt **[R] Bewohner entfernen**) oder machen Sie es mit
**Strg/Cmd+Z** rückgängig.

Bewohner bleiben innerhalb von etwa sechs Schritten um ihr Zuhause. Sie
gehen um Wände, Bäume und Wasser herum, nie hindurch, und machen ab und zu
eine Pause, um stehen zu bleiben und sich umzusehen. Jeder, der die Welt
öffnet, sieht jeden Bewohner im selben Moment am selben Ort, denn wo er
ist, ergibt sich aus der Welt und der Uhrzeit, nicht aus irgendetwas, das
zwischen Spielern gesendet wird. Sie sind fest: Sie stoßen an sie wie an
einen Baum. Sie bleiben aber nicht für Sie stehen und weichen nicht aus;
einer kann also direkt durch Sie hindurchgehen, während Sie stillstehen.

Bewohner bemerken Sie. Wenn einer steht und Sie innerhalb weniger Schritte
vor oder neben ihm sind, dreht er sich zu Ihnen, und wenn Sie direkt auf
ihn zugehen, winkt er. Er winkt einmal jedes Mal, wenn Sie herüberkommen.
Wie bei Tieren geschieht das nur auf Ihrem Bildschirm und nur für Ihren
eigenen Avatar.

Bewohner kennen außerdem ihre Nachbarschaft. Stellen Sie sich neben einen
und drücken Sie **T** (ein Hinweis zeigt **[T] Sprechen**; der Abschnitt
Avatar und das Touchpad haben ebenfalls eine Schaltfläche **Sprechen**),
und er erzählt Ihnen in einer Sprechblase über seinem Kopf das eine oder
andere über die Umgebung: ein Fahrrad oder ein Reh in der Nähe, ein
Wahrzeichen, eine in der Welt platzierte Struktur (mit Titel und Autor),
jemanden, der gerade da ist, den Ort, an dem er lebt, oder ein anderes
Bauwerk etwas weiter weg — zum Beispiel *„Das Bauwerk „Hügelburg“ von bob
steht etwa 3,6 km nordöstlich von hier.“* Entfernungen sind gerundet, und
Richtungen gelten von dort aus, wo der Bewohner steht (Norden ist dort,
wohin der Kompass zeigt). Sprechen Sie ihn erneut an, erwähnt er etwas
anderes. Die Sprechblase verschwindet nach ein paar Sekunden oder sobald
Sie weggehen.

Solange die Sprechblase zu sehen ist, erscheint unten in der Ansicht eine
Schaltfläche **Fokus** für jedes erwähnte Ding, das an seinem Platz
bleibt — ein Wahrzeichen, eine Struktur, ein Bauwerk oder ein Fahrzeug
(Tiere und Menschen ziehen weiter, daher bekommen sie keine). Klicken Sie
darauf, um die Kamera zum Ansehen hinüberzuschwenken, genau wie
**Fokussieren** im Feld Orte: Ihr Avatar bleibt neben dem Bewohner, und
erneutes Gehen bringt die Kamera zurück, wenn Avatar folgen an ist.

Was ein Bewohner sagt, ist das, was *Ihre* Kopie von ForkBuild weiß: die
Bauwerke in Ihrem Katalog, die Menschen, die mit Ihnen da sind, die
Fahrzeuge und Tiere, die Sie nicht genommen haben. Jemand anderes, der mit
demselben Bewohner spricht, kann anderes hören, und niemand sonst sieht je,
was er Ihnen gesagt hat. Er erwähnt nie ein Fahrzeug, das Sie abgestellt
haben oder fahren, eines, das jemand anderes fährt, oder ein Tier, das Sie
gefangen haben. Bauwerke werden mit Titel und Autor so genannt, wie ihre
Veröffentlichung sie angibt, genau wie überall sonst in der App.

Ein Bewohner braucht trockenen, offenen Boden: kein Dach, kein Wasser und
nicht, während Sie fahren. Der Abschnitt Avatar sagt, warum, wenn er dort,
wo Sie stehen, keinen hinzufügen kann. Bewohner sind keine Personen — sie
haben kein Profil, erscheinen nie unter Personen oder In der Nähe, lassen
sich nicht für Infos anklicken und geben Ihnen nie Aufgaben, Aufträge oder
Belohnungen — sie leben einfach dort und erzählen Ihnen, was es in der
Umgebung gibt, wenn Sie fragen.

#### Was ein Neuladen übersteht

Ihr Inventar — jedes Fahrzeug und Tier, das Sie tragen — wird auf diesem
Gerät gespeichert, ebenso die Fahrzeuge, die Sie irgendwo abgestellt oder
gefahren haben, und die Tiere, die Sie freigelassen haben, genau dort, wo
Sie sie gelassen haben. Ein Neuladen der Seite oder eine spätere Rückkehr
macht genau dort weiter, wo Sie waren.

### Räumliches Bewusstsein und Aktivität

Wenn andere da sind, sehen Sie Hinweise, die zeigen, was sie tun:

- „**Bob — erkundet die Umgebung**“ erscheint nahe seinem Avatar, während
  er herumfliegt oder -geht.
- „**Alice — sieht sich einen Stein an**“ zeigt, dass jemand sich etwas
  genau ansieht, ohne es zu ändern.

Diese Aktivitätshinweise werden aus räumlichen Anwesenheitsdaten abgeleitet
und helfen Ihnen zu verstehen, was andere gerade betrachten, ohne
ausdrückliche Absprache.

Aktivitätshinweise beschreiben nur, was jemand tut; sie ändern nie
etwas — siehe
[Andere Mitwirkende sehen](03-WorldView.md#andere-mitwirkende-sehen).

## Wie geht es weiter?

Finden Sie in
**[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)** Menschen,
mit denen Sie sich verbinden, und chatten Sie dann in
**[Chat & Unterhaltungen](08-ChatAndConversations.md)** mit Ihren Freunden.
