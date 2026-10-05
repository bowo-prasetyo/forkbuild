<!-- translation-of: docs/user/03-WorldView.md source-hash: 60040bc00f156b0b -->
# 03 — Weltansicht

<!-- languages -->
[English](../03-WorldView.md) · **Deutsch** · [Español](../es/03-WorldView.md) · [Français](../fr/03-WorldView.md) · [Bahasa Indonesia](../id/03-WorldView.md) · [日本語](../ja/03-WorldView.md) · [한국어](../ko/03-WorldView.md) · [Português (Brasil)](../pt-BR/03-WorldView.md)
<!-- /languages -->

Die Weltansicht ist der geteilte 3D-Raum, in dem **jede veröffentlichte
Kreation Seite an Seite existiert**. Fliegen Sie herum, suchen Sie, was Sie
suchen, entdecken Sie, was andere in der Nähe gebaut haben, und
untersuchen Sie ihre Steine — die Weltansicht ist eine schreibgeschützte
Fläche zum Erkunden, nie ein zweiter Ort zum Bauen. Sobald Sie etwas
ändern möchten, gibt Ihnen **Eine Kopie bearbeiten** eine unabhängige Kopie
im Editor, dem einzigen Ort, an dem in ForkBuild gebaut wird — siehe
[Eine Kopie bearbeiten](#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen)
unten.

Die einzigen Ausnahmen sind Anmerkungen, kein Bauen: Regionen der Welt und
[Wahrzeichen](#wahrzeichen--einen-ort-markieren-den-man-sich-merken-sollte)
benennen und ein freigelassenes Tier mit **G** als Schmuck in die Welt
einbringen (siehe
[Avatare & Anwesenheit](06-AvatarsAndPresence.md#eine-welt-mit-einem-tier-schmücken)).

## Die Weltansicht öffnen

Klicken Sie im **Repository** bei einer beliebigen Kreation auf
**Erkunden** — oder rufen Sie direkt die URL einer Welt auf. Sie erscheinen
neben dieser Kreation in der geteilten Welt.

## Herumfliegen

- **Linke Maustaste ziehen** — die Kamera umkreisen lassen
- **Rechte Maustaste ziehen** — schwenken
- **Scrollen** — hinein- und herauszoomen
- **Pos1** (die Taste oder die Schaltfläche **Start** im Feld) — zu Ihrer
  eigenen Welt zurückkehren (siehe unten)

Während Sie sich bewegen, werden Welten in der Nähe automatisch **nach-
und ausgeladen**. Das Feld links liest sich von oben nach unten: was Sie
ansehen (die Kopfzeile), wohin Sie gehen können (Start, Orte und die
Reiter Erkunden / Karte / Gegenden), was um Sie herum ist (In der Nähe),
dann Ihre eigenen Werkzeuge — Suche, Avatar und Meine Geteilte Welt. Ganz
unten zeigt es:

- **Sichtbare Welten** — die anderen Welten, die gerade um Sie herum
  geladen sind (ausgeblendet, solange nur die Welt geladen ist, in der Sie
  sind, die die Kopfzeile ohnehin nennt)
- **Welten in der Nähe** — klicken Sie auf eine, um direkt dorthin zu
  fliegen

Oben im Abschnitt **In der Nähe** von Erkunden finden Sie außerdem zwei
Schaltflächen, **Hier erkunden** und **Was ist hier?** — siehe
[Welten finden](#welten-finden) unten.

Fahren Sie über die Welt, zeigt eine kleine Karte unten rechts in der
Ansicht, was unter dem Zeiger ist, sodass das Feld selbst nie springt,
während Sie die Maus bewegen.

Der Boden selbst wird für alle auf dieselbe Weise aus einem gemeinsamen
Seed erzeugt — Gras, Strand, Fels, Wald und Ackerland, Seen, gewundene
Flüsse und das offene Meer folgen alle der Höhe und Feuchtigkeit des
Geländes, nicht einer zufälligen Verteilung. Das Land rund um den Ursprung
ist immer trocken; wer etwa tausend Einheiten hinauswandert, erreicht eine
Küste, an der der Boden über einen Schelf in tiefes, dunkleres blaues Meer
abfällt. Ihr Avatar watet in einen See oder ins Meer, wird langsamer, je
höher das Wasser steigt, und sobald das Wasser tiefer ist als seine halbe
Größe, schwimmt er (siehe [Schwimmen und Tauchen](06-AvatarsAndPresence.md#schwimmen-und-tauchen)).
Tauchen Sie unter, wird die Sicht blaugrün: Seetang wiegt sich am Grund,
und kleine Fischschwärme ziehen im offenen Wasser ihre Kreise — für alle
dieselben Fische an denselben Stellen. Es ist Kulisse: Nichts daran lässt
sich bearbeiten, und es sieht gleich aus, egal wer es wann ansieht.

Waldboden trägt aus demselben Seed seine eigene Mischung von Baumarten —
Nadelbäume, wo es feuchter ist, Laubbäume, wo es trockener ist, und
Buschwerk am Rand des Graslands —, und Rehe (im Wald) und Kaninchen (auf
Grasland) erscheinen als weitere vom Seed bestimmte Kulisse daneben. Bäume
bleiben genau dort, wo sie stehen. Tiere wandern langsam um die Stelle
herum, an der sie platziert wurden, nie mehr als ein paar Schritte davon
entfernt, halten an und drehen sich dabei — Kaninchen hoppeln, Rehe
schreiten mit einem Nicken des Kopfes. Wenn sie stehen, grasen sie mit dem
Kopf im Gras oder sehen auf und umher (ein Kaninchen macht Männchen).
Kommen Sie einem nahe, dreht es den Kopf, um Sie zu beobachten — ein
grasendes Reh hält inne und hebt den Kopf, und ein Kaninchen macht
Männchen, wenn Sie nahe herankommen —, direkt von hinten kann es Sie
aber nicht sehen. Tiere laufen nie weg und wechseln nie ihren Ort
Ihretwegen: Die Reaktion gibt es nur auf Ihrem Bildschirm, und die Tiere
anderer Menschen beobachten stattdessen sie. Kaninchen haben lange,
aufrechte Ohren und einen Stummelschwanz; Rehe tragen die Ohren seitlich
abstehend und haben einen kurzen Schwanz. Ihre Wege ergeben sich aus
demselben Seed und der Uhrzeit, sodass jeder, der im selben Moment auf
denselben Ort blickt, dieselben Tiere an denselben Stellen sieht.
Wildtiere blockieren Ihren Weg zu Fuß genau wie ein Baum, wohin auch immer
ein Tier gewandert ist — siehe
[Mit Ihrem Avatar gehen](06-AvatarsAndPresence.md#mit-ihrem-avatar-gehen) —,
und nichts davon lässt sich bearbeiten.

Eine Welt kann auch **Bewohner** haben — Menschen, die dort leben und um
ihr Zuhause herumspazieren, um Gebäude herum statt durch sie hindurch, und
die sich zum Grüßen zu Ihnen drehen, wenn Sie näher kommen; sprechen Sie
einen an, und er erzählt Ihnen, was es in der Umgebung gibt. Anders als
Wildtiere sind sie Teil des eigenen Inhalts der Welt: Ihr Autor fügt sie
hinzu. Siehe [Bewohner](06-AvatarsAndPresence.md#bewohner).

## Ton

Die Weltansicht spielt leise Hintergrundklänge, die zu Ihrem Ort passen:
Wind auf hohem und felsigem Gelände, Vogelgesang in Wäldern, Grillen auf
Feldern und Grasland, Wellen am Seeufer und rauschendes Wasser neben einem
Fluss. Die Bäume um Sie herum hören Sie nach ihrer Art: raschelndes Laub in
Laubwäldern und Buschwerk, Wind, der durch Nadelbäume seufzt, umso lauter,
je näher sie sind. Alles blendet über, wenn Sie von einer Landschaft in
eine andere gehen.

Auch Ihr Avatar macht eigene Geräusche. Schritte halten den Takt seines
Gehens oder Rennens und ändern sich mit dem Untergrund: Gras, knirschendes
Laub im Wald, weicher Sand am Strand, Stein auf hohem und felsigem
Gelände, Platschen in einem See oder Fluss und ein hohles Klopfen auf
Steinen. Springen macht ein Rauschen und Landen einen dumpfen Aufprall,
schwerer nach einem längeren Fall. Fahren Sie ein Fahrzeug, hören Sie es:
die Reifen und den Freilauf eines Fahrrads, das Surren eines Motorrads, das
Brummen eines Autos oder das Sirren einer Drohne, ansteigend, wenn Sie
schneller werden, und verklingend, wenn Sie absteigen. Auf- und Absteigen
haben ebenfalls ihren eigenen Klang (die Klingel und der Ständer eines
Fahrrads, der Kickstarter eines Motorrads, eine Autotür und die Zündung,
die anlaufenden und auslaufenden Rotoren einer Drohne), und Bremsen bei
Tempo lässt Reifen oder Bremsbeläge quietschen, umso lauter, je schneller
Sie waren.

Die Änderungen, die Sie hier an einer Welt vornehmen, haben dieselben
kurzen Klänge wie im Editor: ein Wahrzeichen oder eine Region benennen,
einen Bewohner hinzufügen oder entfernen, ein Tier zum Schmuck machen oder
zurück sowie Rückgängig und Wiederholen. Änderungen eines Mitwirkenden sind
lautlos.

Auch die Tiere und Menschen um Sie herum hören Sie, aus der Richtung, in
der sie sind, und leiser, je weiter weg sie sind. Ein Reh schnaubt und ein
Kaninchen klopft mit dem Fuß, wenn es aufmerksam aufblickt, und noch einmal,
erschrocken, wenn Sie nahe kommen; Sie hören ihre Schritte, während sie
vorbeiwandern. Ein Tier zu fangen macht ein Rascheln und ein aufsteigendes
Zupfen, es freizulassen dasselbe absteigend. Ein Bewohner summt ein
freundliches „hm-hm“, wenn er sich zum Grüßen dreht, murmelt mit eigener
Stimme, wenn er mit Ihnen spricht, und seine Schritte sind zu hören, wenn
er vorbeispaziert. Jeder Besucher hört dasselbe Reh im selben Moment
aufblicken, denn wann ein Tier das tut, ist Teil der Welt.

Auch die Avatare anderer Menschen sind zu hören: ihre Schritte auf dem
jeweiligen Untergrund und ihre Sprünge und Landungen, von dort aus, wo sie
sind. Nur Menschen, die Sie sehen können, sind zu hören; blenden Sie andere
Avatare aus, verstummen sie. Wer ein Fahrzeug fährt, ist bis zu 40 m weit
beim Fahren zu hören: sein Motor steigt und fällt mit dem Tempo, sein Auf-
und Absteigen und ein Quietschen, wenn er scharf abbremst (das Bremsen
selbst wird nicht gesendet, daher gilt ein harter Halt dafür). Nur die
Motoren der drei nächsten Fahrer spielen, damit eine Menge den Rest nicht
übertönt.

Klänge um Sie herum werden **in 3D** platziert: vorn oder hinten, oben oder
unten sowie links oder rechts, und sie drehen sich mit, wenn Sie die
Kamera drehen. Am besten mit Kopfhörern. Die Schaltfläche **3D** neben dem
Lautstärkeregler wechselt zu einfachem Links und Rechts (**Stereo**), was
zu einem langsamen Gerät oder zu Lautsprechern besser passen kann.

Alles wird in Ihrem Browser erzeugt, daher wird nichts heruntergeladen und
nie ein Klang gesendet. Andere hören Ihre Schritte und Ihr Fahrzeug so,
wie Sie ihre hören: Ihr Browser erzeugt sie dort, wo er Ihren Avatar
bereits gehen oder fahren sieht.

Browser lassen eine Seite erst Ton abspielen, wenn Sie mit ihr
interagieren; der Ton beginnt also mit Ihrem ersten Klick, Tippen oder
Tastendruck. Schalten Sie ihn mit der Schaltfläche **Ton** oben rechts in
der Ansicht (auf einem Telefon unten rechts) oder mit `M` aus oder ein und
stellen Sie mit dem Regler daneben die Lautstärke ein; auf einem Telefon
oder Tablet nutzen Sie die Lautstärketasten des Geräts. ForkBuild merkt
sich Ihre Wahl, einschließlich 3D oder Stereo, auf diesem Gerät. Der Ton
pausiert, solange der Tab verborgen ist.

## Orientierung und Orte

Neben den Kamerakoordinaten zeigt ein kleiner **Kompass**, in welche
Richtung Sie blicken (er ist schreibgeschützt — er bewegt nie die Kamera).
Eine Reihe von Schaltflächen oben im Feld dient dem Fortbewegen:

- **Start** bringt Sie — Kamera und Avatar — zurück zu Ihrer eigenen
  aktuellen Welt, der, die Sie geöffnet oder zuletzt fokussiert haben,
  statt zum festen Ursprung (0,0,0) der geteilten Karte. Es setzt Sie
  knapp außerhalb der Grundfläche Ihrer Welt ab, nie mitten hinein, selbst
  wenn der Inhalt dieser Welt um ihren lokalen Ursprung zentriert ist.
  Haben Sie in dieser Sitzung noch keine eigene Welt fokussiert, weicht es
  stattdessen auf diesen gemeinsamen Ursprung aus — jederzeit auch über
  **Orte** unten erreichbar, dort dauerhaft unter „Welt“ aufgeführt.
  Wandern Sie so weit, dass Ihre eigene Welt aus dem Blick ausgeladen wird
  (zu Fuß oder mit einem Fahrzeug), verlieren Sie den Heimweg nicht; Start
  bringt Sie trotzdem dorthin zurück.
- **Orte** öffnet eine Liste aller Orte, die diese Sitzung gerade kennt,
  gruppiert in **Welt**, **Strukturen**, **Wahrzeichen** und **Gegenden** —
  jeweils mit einer Schaltfläche **Fokussieren**. Wie Suche und Hier
  erkunden/Was ist hier? bewegt Fokussieren nur die Kamera; es lädt,
  wählt oder bearbeitet nie etwas.
- **👥 N online** ist die Schaltfläche **Mitglieder**: Sie zählt, wer da
  ist, und öffnet per Klick das Feld Mitglieder der Welt. Eine
  Schaltfläche **Lobby** folgt, wenn die Welt eine öffentliche Lobby hat.
- **?** zeigt die Kamera- und Gehsteuerung (ziehen zum Umkreisen, scrollen
  zum Zoomen sowie WASD, Umschalt und Leertaste, während Sie Ihren Avatar
  steuern); klicken Sie erneut, um sie auszublenden.

**Benachrichtigungen** ist die Schaltfläche 🔔 in der Kopfzeile der App,
neben Anmelden, und daher auf jeder Seite da, nicht nur in der
Weltansicht. Sie öffnet Ihren **Benachrichtigungsverlauf** — eine
dauerhafte Aufzeichnung der an Ihre Identität gerichteten
Benachrichtigungen, die jüngste Aktivität zuerst. Derzeit erzeugt nur
eines eine: wenn jemand eine Veröffentlichung kommentiert, die Sie
veröffentlicht haben (siehe
[Kommentare](09-PublicationsAndEvidence.md#kommentare) unten) — jeder
Eintrag zeigt, was wann passiert ist, und eine Schaltfläche **Erkunden**
bringt Sie zur Welt dieser Veröffentlichung: In der Weltansicht fliegt sie
Sie dorthin, überall sonst öffnet sie die Weltansicht dort. Es ist ein
schlichtes schreibgeschütztes Protokoll, kein Posteingang: Es gibt keinen
Gelesen/Ungelesen-Status, kein Ausblenden eines Eintrags und keine Zahl
auf der Schaltfläche selbst. Es lädt einmal beim Öffnen und erneut nur,
wenn Sie auf **Aktualisieren** klicken; es aktualisiert sich nie im
Hintergrund. Es hängt an Ihrer angemeldeten Identität, nicht an der Welt
oder dem Dokument, das Sie gerade geöffnet haben.

Der Kompass zeigt die Himmelsrichtungen (N, O, S, W) und Ihre aktuelle
Richtung in Grad, dazu kleine Punkte für Strukturen, Mitwirkende und
Wahrzeichen in der Nähe — fahren Sie über einen für seine Beschriftung,
oder sehen Sie in die lesbare Liste unter dem Kompass.

### Erkunden, Karte und Gegenden — drei Arten zu stöbern, nie gleichzeitig

Unter den Navigationsschaltflächen sitzen drei Reiter: **Erkunden**,
**Karte** und **Gegenden**. Das sind die drei wichtigsten, einander
ausschließenden Arten der Weltansicht, sich umzusehen — einen zu öffnen
schließt immer den gerade offenen anderen, sodass Sie nie mit mehreren
überlappenden Feldern zum Stöbern gleichzeitig hantieren.

- **Erkunden** ist der Standard. Es zeigt das Ankunfts-/Willkommensfeld
  (wer da ist und einige vorgeschlagene Ziele) sowie einen Abschnitt **In
  der Nähe** mit einklappbaren Gruppen — **Gegenden**, **Wahrzeichen**,
  **Personen**, **Ortsnamen** (siehe
  [Ortsnamen in der Nähe](#ortsnamen-in-der-nähe--ansprüche-von-jedem-entdecken)
  unten), **Beanspruchte Bauwerke** (siehe
  [Beanspruchte Bauwerke](#beanspruchte-bauwerke--die-bauwerke-anderer-dort-wo-ihre-herausgeber-sie-hinstellen)
  unten, nur sichtbar, wenn es eines gibt) und **Begegnungen in der Welt**
  (siehe
  [Begegnungen in der Welt](#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
  unten) — jeweils nur ein Name, eine Entfernung und eine kompakte
  Schaltfläche **Hin** (Begegnungen in der Welt und Ortsnamen zeigen
  stattdessen eigene, anders aufgebaute Inhalte, unten beschrieben).
  Gegenden, Wahrzeichen und Personen erscheinen nur, wenn sie etwas
  enthalten; sind alle drei leer, sagt das eine einzige Zeile. Klicken Sie
  auf den Titel einer Gruppe, um sie aufzuklappen — die Weltansicht merkt
  sich, welche Gruppen Sie offen gelassen haben, auch wenn Sie zu Karte
  oder Gegenden wechseln und zurückkommen.
- **Karte** öffnet dieselbe flache Weltkarte von oben, die unten
  beschrieben ist.
- **Gegenden** öffnet das Verzeichnis geografischer Orte, das unter
  [Geografische Orte](#geografische-orte) unten beschrieben ist.

Der Wechsel zwischen Erkunden, Karte und Gegenden lädt nie ein Dokument,
bearbeitet nichts und bewegt Ihren Avatar nicht — er ändert nur, was dieses
Feld gerade zeigt, dieselbe Grenze „Navigieren ≠ Ändern“, die jedes andere
Navigationselement der Weltansicht bereits einhält.

### Begegnungen in der Welt — Veröffentlichungen und Avatare, die Ihre Peers teilen

Die Gruppe **Begegnungen in der Welt** im Abschnitt In der Nähe von
Erkunden ist eine eigene kleine flache Karte — getrennt von der unten
beschriebenen Weltkarte —, die zweierlei einzeichnet, wovon Ihnen Ihre
verbundenen Peers erzählt haben: andere **Veröffentlichungen** (siehe
[Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md)),
die in der Nähe platziert sind, und die **Avatare** anderer Menschen, jede
als eigene Markierung neben einer Markierung für Sie.

Klicken Sie auf eine Markierung, um ein Feld zur Untersuchung zu öffnen:

- Die Markierung einer **Veröffentlichung** zeigt Titel, Herausgeber, ob
  sie signiert ist, ihre Position und wie viele Anker externer Nachweise
  und Snapshot-Platzierungen sie hat.
- Die Markierung eines **Avatars** zeigt Anzeigename, Eigentümer und
  Position.

Bietet mehr als ein verbundener Peer dieselbe Begegnung an, erscheint eine
Liste **Quelle wählen**, damit Sie wählen, wessen Kopie Sie untersuchen.
Wie alles andere in der Weltansicht dient das nur dem Ansehen — nichts
hier bewegt Ihre Kamera oder bearbeitet etwas.

Haben Sie **Geteilte Welt entdecken** (unten) ausgeführt und hat das für
die ausgewählte Veröffentlichung eine dezentrale Spur ergeben — einen Ort
auf Arweave oder Nostr —, zeigt eine Zeile **Ort**, welche verwendet wird.
Passt mehr als eine Spur, erscheint stattdessen eine Liste **Ort wählen**:
Wählen Sie eine, und Material/Überprüfung unten laden von diesem Ort. Bis
Sie wählen, wird von keinem etwas geladen, und eine Wahl für eine
Begegnung wird nie auf eine andere übertragen.

Eine ausgewählte Veröffentlichung zeigt darunter außerdem zwei weitere
Statusblöcke. **Material** / **Überprüfung** versuchen, den Inhalt dieser
Veröffentlichung tatsächlich zu laden und ihn kryptografisch gegen das zu
prüfen, was für ihn beansprucht wurde. Bei Inhalten, die dieses Gerät
selbst schon hat, funktioniert das direkt; bei allem, was Ihnen ein Peer
gezeigt hat, steht normalerweise stattdessen **Unavailable** (nicht
verfügbar) / **Unverifiable** (nicht überprüfbar) da — es sei denn, Sie
haben für dieselbe Veröffentlichung gesondert **Geteilte Welt entdecken**
(unten) ausgeführt; dann wird eine dort gefundene, aufgelöste dezentrale
Spur auch hier verwendet, und Material / Überprüfung können genauso
**Available** (verfügbar) / **Verified** (überprüft) ergeben wie bei einer
direkten Entdeckung. So oder so sagt eine Zeile **Quelle** unter Material,
woher der untersuchte Inhalt tatsächlich stammt — **Local** (lokal, schon
auf diesem Gerät) oder **Decentralized** (dezentral, über eine aufgelöste
Spur auf Arweave/Nostr abgerufen) —, eine schlichte Tatsache über diese
eine Beobachtung, nie eine Vertrauensbewertung. Sobald dieses Gerät das
eigene Material der Veröffentlichung besitzt, erscheint eine Schaltfläche
**Verteilen** — klicken Sie darauf, um einen Dialog **Verteilen** zu
öffnen, statt jede Speicherauswahl, jede Schaltfläche und jedes Ergebnis
dauerhaft auf dem Bildschirm zu lassen. Das Schließen des Dialogs
(**Schließen**, Klick außerhalb oder Escape) verliert nie etwas, das er
erzeugt hat: Erneut geöffnet zeigt er genau das Ergebnis, den Fehler oder
den laufenden Zustand, in dem Sie ihn verlassen haben — der Dialog ist
reine Darstellung, nichts daran hängt davon ab, ob er gerade offen ist.

Der Dialog öffnet sich mit einem Satz Einstellungen, der für alles gilt,
was er verteilt: einem **Speicher** — **Arweave**, **IPFS (lokales
Kubo)**, **IPFS (entferntes Pinning)** (das jedes Mal einen frisch
eingegebenen Endpunkt und Zugangsdaten braucht; nichts davon wird je
gespeichert), **Steem** oder **Blurt** (experimentell, siehe
[Steem](11-EvidenceAndStorage.md#steem) und
[Blurt](11-EvidenceAndStorage.md#blurt)) — und einem **Substrat für
Ankündigung / Entdeckung** (**Arweave**, **Blurt**, **Nostr** oder **Steem**). Beide
beginnen mit Ihren gespeicherten Anbieterpräferenzen. Speicher listet nur
die Backends, auf denen dieses Gerät tatsächlich einen Snapshot platzieren
kann (plus entferntes Pinning), sodass Sie keines wählen können, das nur
auf halbem Weg scheitern würde.

Sind beide Protokolle unten verfügbar, steht direkt unter diesen
Einstellungen eine kombinierte Schaltfläche **Verteilen** — die
Hauptaktion, die den Signierten Anspruch und den Snapshot zusammen mit den
obigen Einstellungen verteilt. Sie ändert an keinem der beiden Protokolle
etwas: Jedes läuft weiterhin unabhängig, jedes meldet weiterhin in seinen
eigenen Abschnitt unten, und ein Fehlschlag bei einem wird nie vom anderen
verdeckt oder blockiert es — sie führt die beiden allerdings nacheinander
aus, nie gleichzeitig, da beide dieselbe verbundene Wallet-Erweiterung um
eine Signatur bitten können und zwei gleichzeitige Signieranfragen bei
Erweiterungen tatsächlich zu Fehlern führen. Jeder Abschnitt unten hat
außerdem seine eigene kleinere Schaltfläche **Nur Signierten Anspruch
verteilen** / **Nur Snapshot verteilen**, mit denselben Einstellungen —
nützlich, wenn Sie nur eines der beiden möchten oder nur die
fehlgeschlagene Hälfte wiederholen wollen. (Ist nur ein Protokoll
verfügbar, heißt die Schaltfläche seines Abschnitts einfach **Signierten
Anspruch verteilen** oder **Snapshot verteilen**.)

Der Abschnitt **Signierter Anspruch** verfolgt, ob die Veröffentlichung
gesondert über Arweave/Nostr verteilt wurde, und zeigt für **Material** und
**Entdeckung** **Absent** (fehlt), bis das geschehen ist. Das Verteilen
lädt das Material hoch und kündigt es an. Beide Schritte werden von einer
Browsererweiterung signiert: einer Arweave-Wallet (etwa Wander) für
Arweave und einer Nostr-Signiererweiterung (etwa nos2x) für Nostr. Ohne die
passende Erweiterung endet der Versuch mit „Das Verteilen konnte nicht
abgeschlossen werden.“ und dem Grund. Ein erfolgreicher Versuch zeigt die
ID der Veröffentlichung, ihren Ort unter **Material** und ihre
Ankündigungs-ID unter **Entdeckung** — eine Zeile Entdeckung pro Relay,
wenn Sie mehrere [Nostr-Relays](10-NetworkSettings.md#nostr-relays)
konfiguriert haben.

Der Abschnitt **Snapshot**, direkt darunter im selben Dialog, hat dieselben
Voraussetzungen und braucht dieselben Erweiterungen, nutzt aber ein
anderes Protokoll: Snapshots (siehe
[Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md#lokaler-snapshot))
werden unabhängig vom Verteilen des Signierten Anspruchs platziert und
entdeckt, daher teilt dieser Abschnitt nie Zustand, Verlauf oder Ergebnis
mit dem Abschnitt Signierter Anspruch darüber — nur die Einstellungen. Ein
Klick zeigt genau, was zurückkam: einen **Inhalts-Hash**, einen **Fundort**
und eine **Ankündigungs**-ID — oder „Keine Ankündigung“, wenn die
Platzierung gelang, die Nostr-Ankündigung aber nicht, was als
Teilergebnis gemeldet wird, nie als Fehler. Ein echter Fehlschlag zeigt
stattdessen den schlichten Hinweis „Das Verteilen des Snapshots konnte
nicht abgeschlossen werden.“ Weder Zustand noch Ergebnis eines Abschnitts
wird irgendwo gespeichert — eine andere Begegnung auszuwählen oder die
Seite zu verlassen löscht sie.

**Eine Veröffentlichung, die Ihnen ein Peer hier gezeigt hat, bleibt nicht
in Begegnungen in der Welt hängen, sobald sie sich tatsächlich auflöst.**
In dem Moment, in dem das Material einer von einem Peer gezeigten
Veröffentlichung **Available** erreicht — ihr Inhalt lädt wirklich und ist
gültig —, wird sie auch in denselben Katalog aufgenommen, der hinter der
eigenen Suche des [Repositorys](04-PublishingAndForking.md#das-repository)
und jeder Autorenseite steht, genau so, als wäre sie auf gewöhnlichem Weg
gefunden worden: Auch eine Suche im Repository oder das Öffnen der Seite
ihres Autors fördert sie jetzt zutage, und sie bleibt dort auch nach einem
Neuladen. Es gibt kein eigenes Abzeichen und keine Kennzeichnung „über
einen Peer gefunden“, sobald sie drin ist — eine Karte im Repository oder
ein Eintrag auf einer Autorenseite sieht so oder so gleich aus, da Ihr
eigenes Gerät den Inhalt zu diesem Zeitpunkt unabhängig überprüft hat; nur
*wie Sie zuerst davon gehört haben*, war anders.

### Geteilte Welt entdecken — dezentrale Netzwerke direkt durchsuchen

Ebenfalls in der Gruppe Begegnungen in der Welt, aber ohne Klick auf eine
Markierung und ganz ohne verbundenen Peer, gibt es eine Schaltfläche
**Entdeckung Geteilter Welten**, die ein eigenes kleines Fenster öffnet.
Darin liegt das Feld **Geteilte Welt entdecken**: Geben Sie eine **ID der
Geteilten Welt** und das **Entdeckungs-Tag** ein, unter dem sie verteilt
wurde, und klicken Sie dann auf **Geteilte Welt entdecken**, um Arweave
und Nostr direkt danach zu fragen. Das Feld für das Entdeckungs-Tag ist
mit dem eigenen gemeinsamen Kampagnen-Tag von ForkBuild vorbelegt — dem,
das eine aus dieser App verteilte Veröffentlichung verwendet hätte —,
sodass Sie im üblichen Fall nur die ID der Geteilten Welt eingeben müssen;
es bleibt ein schlichtes, frei bearbeitbares Feld, falls Sie es auf ein
anderes Tag richten müssen. Das Ergebnis zeigt eine Zeile **Entdeckung**
(**Unavailable** — nicht verfügbar —, **Resolved** — aufgelöst — oder
**Ambiguous** — mehrdeutig —, wenn für denselben Ort mehr als eine
unabhängige Spur auftaucht) und, sobald aufgelöst, dieselbe Anzeige für
Material/Quelle/Überprüfung wie oben beschrieben, mit genau denselben
Feldern und Worten. Derzeit löst sich das nur für eine Ihrer eigenen
Veröffentlichungen auf — eine, die Sie signiert haben und lokal noch
besitzen und deren eigener beanspruchter Ort zu dem passt, was das
Netzwerk meldet —; betrachten Sie es also als „Ist meine Veröffentlichung
wirklich unversehrt da draußen?“ statt als allgemeine Suche in den Werken
aller anderen. Das Schließen des Fensters behält, was Sie eingegeben oder
gefunden haben — erneut geöffnet macht es genau dort weiter, wo Sie
aufgehört haben, bis Sie erneut suchen oder die Seite verlassen.

Sobald ein entdecktes Ergebnis **Verified** ergibt, erscheint eine
Schaltfläche **Geteilte Welt auswählen**; ein Klick darauf hält dieses
Ergebnis als „die Veröffentlichung, mit der Sie gerade arbeiten“ fest,
danach in einem eigenen kleinen Hinweis darunter angezeigt. Auswählen ist
nur diese ausdrückliche Wahl — es verteilt nie, überprüft nicht erneut und
fließt nicht in Ihre lokale Auswahl oben ein — und es bleibt bestehen,
auch wenn Sie eine weitere Suche ausführen, bis Sie etwas anderes wählen
oder die Seite verlassen. Nur ein überprüftes Ergebnis ist je auswählbar;
bei allem, was **Rejected** (abgelehnt), **Unverifiable** oder noch nicht
aufgelöst ist, wird die Schaltfläche nie angeboten.

Die Felder mit Markierungen unter Begegnungen in der Welt zeigen immer nur,
was Ihnen ein gerade oder kürzlich verbundener Peer tatsächlich erzählt
hat; die Gruppe selbst zeigt **Hier gibt es noch nichts zu entdecken.**,
bis mindestens einer es getan hat. Geteilte Welt entdecken ist die einzige
Ausnahme — es funktioniert auch ganz ohne verbundenen Peer, da es ein
dezentrales Netzwerk direkt abfragt. Wie Sie sich mit jemandem verbinden,
steht unter
[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md).

### Ortsnamen in der Nähe — Ansprüche von jedem entdecken

**Ortsnamen**, die vierte Gruppe unter In der Nähe, zeigt signierte
Ortsnamensansprüche für die Regionen der Welt, die gerade um Sie herum
liegen — ganz ohne verbundenen Peer. Wie Geteilte Welt entdecken oben
durchsucht es ein dezentrales Netzwerk (Nostr) direkt nach Ansprüchen, die
einer Region in Ihrer Nähe zugeordnet sind; anders als alles andere unter
In der Nähe beginnt es standardmäßig eingeklappt, da ein entdeckter,
unüberprüfter Anspruch etwas Neues und Ungewohntes auf dieser Seite ist.

Jede Zeile zeigt den beanspruchten Namen, ungefähr wo er liegt, wer ihn
beansprucht hat und wann. Zwei Schaltflächen werden angeboten:

- **Navigieren** bewegt Ihre Kamera zur eigenen Region des Anspruchs —
  genau wie **Hin** anderswo unter In der Nähe. Es übernimmt, überprüft
  oder tut nie etwas mit dem Anspruch, und es benennt nie etwas um.
- **Übernehmen** speichert den Anspruch auf Ihrem eigenen Gerät und
  unterzieht ihn derselben Signaturprüfung, die ein Anspruch von einem
  verbundenen Peer bereits durchläuft (siehe
  [Eine von einem Peer empfangen](09-PublicationsAndEvidence.md#eine-von-einem-peer-empfangen)).
  Einmal übernommen, ist er einfach ein bekannter Anspruch wie jeder
  andere — die Schaltfläche Übernehmen der Zeile wird durch **✓ Bereits
  gespeichert** ersetzt, und denselben Anspruch erneut zu übernehmen
  bestätigt nur, dass sich nichts geändert hat.

Zwei Ansprüche, die dasselbe Gelände benennen, erscheinen hier beide —
diese Liste kürt nie einen „Sieger“, und einen zu übernehmen ist nie eine
Aussage, dass er richtiger ist als ein anderer. Schlägt die Entdeckung
selbst fehl (keine Relay-Verbindung oder ein Abfragefehler), sagt das ein
kleiner Hinweis, aber die Ansprüche, die Sie schon gesehen haben, bleiben
auf dem Bildschirm; es wird nie als „es gibt keine Ansprüche in der Nähe“
behandelt. Wie ein Anspruch überhaupt veröffentlicht wird, steht unter
[Einen Ort benennen](09-PublicationsAndEvidence.md#einen-ort-benennen).

### Beanspruchte Bauwerke — die Bauwerke anderer, dort, wo ihre Herausgeber sie hinstellen

Während Sie gehen, lädt ForkBuild Snapshots herunter, die in Ihrer Nähe
angekündigt sind (siehe den automatischen Weg unter
[Meine Geteilte Welt](#meine-geteilte-welt--ihren-eigenen-snapshot-verteilen-ohne-peers)).
Die Ankündigung eines Snapshots kann sagen, wo sein Herausgeber ihn
platziert hat, aber das ist nur ein **Anspruch**: Niemand hat ihn geprüft,
und ihm blind zu vertrauen ließe jeden ein Bauwerk auf Ihres setzen. Daher
wird ein beanspruchtes Bauwerk als **Geist** gezeigt — seine Steine
durchscheinend an der beanspruchten Position gezeichnet — und wird nie von
selbst zu einer echten Platzierung.

Es gibt eine Ausnahme, und sie braucht keinen Klick. Wenn ein Herausgeber
seinen Snapshot verteilt, trägt die Ankündigung auch seine eigene
**signierte Platzierung**. Sobald dieses Gerät die Geteilte Welt dieses
Bauwerks kennt (sie ist in Ihrem Repository, oder Sie **überprüfen** sie),
prüft ForkBuild, ob die Platzierung mit dem eigenen Schlüssel dieser
Geteilten Welt signiert ist, und zeigt das Bauwerk in diesem Fall fest,
genau dort, wo sein Herausgeber es hingestellt hat. Es bleibt seine
Platzierung, nicht Ihre: Sie können sie nicht verschieben oder entfernen.
Verschiebt er sie später und verteilt erneut, verschiebt sie sich auch bei
Ihnen. Eine von jemand anderem signierte Position bleibt ein Geist.

Ein Geist wird nur gezeichnet, wenn:

- seine Position in Ihrer Nähe ist (Ihre Kartenzelle oder die darum
  herum, etwa 1.000 Einheiten in jede Richtung), und er verschwindet
  wieder, wenn Sie weggehen;
- sein Inhalt heruntergeladen wurde und zu seinem Inhalts-Hash passt;
- dieses Gerät noch keine Platzierung dieses Bauwerks hat — sobald es eine
  hat, wird stattdessen das echte Bauwerk gezeigt;
- an genau dieser Stelle noch nichts platziert ist, was dieses Gerät kennt
  — ein Anspruch weicht immer einer echten Platzierung.

Einen Geist können Sie in der 3D-Ansicht nicht auswählen, untersuchen,
bearbeiten oder forken. Sehr große Bauwerke werden nur teilweise gezeichnet
(die ersten paar tausend Steine).

Jeder Geist bekommt außerdem eine Zeile in der Gruppe **Beanspruchte
Bauwerke**, der nächste zuerst: Titel, Entfernung und Position sowie
„beansprucht von …“ — Titel und Autor stammen aus dem eigenen Inhalt des
Bauwerks und sind genauso unüberprüft wie seine Position. Jede Zeile hat:

- **Navigieren** — bewegt die Kamera, um die beanspruchte Stelle
  anzusehen. Sonst ändert sich nichts.
- **Überprüfen** — sichtbar, solange dieses Gerät den signierten
  Datensatz der Geteilten Welt dieses Bauwerks noch nicht hat. Es sucht den
  Datensatz auf Nostr und Arweave, prüft seine Signatur und prüft, ob er
  genau die Geteilte Welt dieses Bauwerks ist und genau den Inhalt nennt,
  den der Geist zeigt. Stimmt alles, wird die Geteilte Welt Ihrem
  Repository hinzugefügt, und die Zeile ändert sich zu „signiert von
  *Name* (Schlüssel did:key:…)“. Wenn nicht, sagt die Zeile, warum: Nichts
  wurde angekündigt (der Herausgeber hat möglicherweise nur den Snapshot
  verteilt — die kombinierte Schaltfläche **Verteilen** kündigt beides
  an), keine Kopie war gültig signiert, oder die signierte Geteilte Welt
  nennt einen anderen Inhalt. Überprüfen nimmt einen Anspruch nie von
  selbst an; trug die Ankündigung aber die signierte Platzierung des
  Herausgebers, erscheint das Bauwerk jetzt fest dort, wo er es
  hingestellt hat (siehe oben), und der Geist verschwindet.
- **Position annehmen** — der einzige Weg, einem Anspruch zu vertrauen. Es
  platziert das Bauwerk an der beanspruchten Position mit einer
  *eigenen* Platzierung, von Ihnen signiert wie jede andere Platzierung,
  und von da an ist es ein normales Bauwerk in Ihrer Welt. Es ist erst
  aktiv, wenn dieses Gerät den signierten, überprüften Datensatz der
  Geteilten Welt des Herausgebers hat — über **Überprüfen**, wenn er die
  Welt mit Ihnen teilt (siehe
  [Mit verbundenen Peers teilen](04-PublishingAndForking.md#mit-verbundenen-peers-teilen);
  sie erscheint dann in Ihrem Repository), oder wenn die
  [Begegnung in der Welt](#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
  eines verbundenen Peers dafür **Available** erreicht — und nur, wenn
  diese Geteilte Welt genau den Inhalt nennt, den der Geist zeigt. Es
  bleibt außerdem deaktiviert, wenn der Herausgeber dieser Geteilten Welt
  **Nur ich darf es platzieren** gewählt hat (siehe
  [Wählen, wer es platzieren darf](04-PublishingAndForking.md#wählen-wer-es-platzieren-darf)).
  Wann immer es deaktiviert ist, sagt die Zeile, warum.

  **Was überprüft bedeutet.** Es beweist, dass das Bauwerk genau der
  Inhalt einer Geteilten Welt ist, die mit dem angezeigten Schlüssel
  signiert ist. Es beweist nicht, wer diesen Schlüssel hat — jeder kann
  einen erzeugen und sich „bob“ nennen —, und es beweist nicht die
  Position, die weiterhin nur beansprucht ist. Position annehmen
  funktioniert auch bei Schlüsseln, die Sie nicht kennen; ob Sie einem
  vertrauen, entscheiden Sie.
- **Ausblenden** — entfernt diesen Geist und seine Zeile, bis Sie die
  Weltansicht verlassen. Nichts wird gemeldet oder gelöscht.

### Info — was sehe ich mir an?

Neben den meisten Schaltflächen **Hin** — in den Zeilen unter In der Nähe
von Erkunden und im Feld Orte — finden Sie außerdem eine Schaltfläche
**Info**. Während Hin Ihre Kamera bewegt, öffnet Info ein kleines Feld,
das beschreibt, was Sie ausgewählt haben, ohne etwas zu bewegen: was es
ist, wie weit entfernt es ist, in welchem benannten Ort es liegt („Sie sind
in Weidendorf“) oder in der Nähe welches möglichen geografischen Ortes es
ist („Sie sind in der Nähe von Kawahara-Dorf“), wenn keines von beiden
sicher bekannt ist. Von dort aus können Sie weiterhin **Hin** drücken, um
dorthin zu reisen, **Auf der Karte zeigen**, um es auf der Weltkarte zu
sehen, **Namen** (bei einem benannten Ort), um Namen aus der Gemeinschaft
dafür zu sehen oder zu veröffentlichen, oder **Eine Kopie bearbeiten**, um
es im Editor zu öffnen — siehe unten. Info selbst tut nichts davon von
sich aus.

### Eine Kopie bearbeiten — etwas in den Editor übernehmen

Wo immer die Weltansicht Ihnen etwas Bestimmtes zeigt — eine Region, ein
Wahrzeichen, eine platzierte Struktur, einen Stein oder bloßen Boden —,
hat das Feld, das es beschreibt, eine weitere Schaltfläche: **Eine Kopie
bearbeiten**. Sie erstellt eine unabhängige Kopie des Dokuments, das
tatsächlich enthält, was Sie angesehen haben — nie die ganze Welt, nie das
Original eines anderen — und öffnet sie direkt im Editor, bereit zum
Weiterbauen. Zwei Felder bieten sie an: das Feld **Fokus** (die
Schaltfläche Info in den Zeilen von Erkunden/Orte, für eine
Region/ein Wahrzeichen/eine Struktur) und das Feld **Untersuchung** (ein
direkter Klick in die 3D-Ansicht, für einen Stein, bloßen Boden oder eine
platzierte Struktur) — dieselbe Aktion, dieselbe Schaltfläche, egal auf
welchem Weg Sie dorthin gekommen sind.

- Bei einem **Wahrzeichen**, einer **Region**, einem **Stein** oder
  **bloßem Boden** ist es das Weltdokument, zu dem sie gehören.
- Bei einer **platzierten Struktur** ist es der eigene Inhalt der
  Struktur — nicht die Welt, in der sie gerade steht.

Das Original wird nie berührt — ForkBuild sagt Ihnen, sobald Ihre Kopie
bereit ist, genau wie bei jedem anderen Fork (siehe
[Veröffentlichen & Forken](04-PublishingAndForking.md)). Kann die Kopie
nicht erstellt werden — meistens, weil die Quelle eine über einen Peer
oder ein dezentrales Netzwerk gefundene Geteilte Welt ist, deren Material
noch nicht verfügbar ist oder deren Lizenz das Forken verbietet —, sagt
ein Dialog **Forken nicht möglich** genau, warum, und bietet **Zurück zur
Geteilten Welt** an, um Sie dorthin zurückzubringen, wo Sie begonnen haben,
statt Sie in einem leeren Editor-Dokument zurückzulassen (siehe
[Wenn ein Fork nicht möglich ist](04-PublishingAndForking.md#wenn-ein-fork-nicht-möglich-ist)).
Ein **geografischer Ort** und ein **Mitwirkender** bieten nie Eine Kopie
bearbeiten an — ein geografischer Ort ist eine Gruppierung der eigenen
Regionen mehrerer Menschen ohne ein eigenes Dokument zum Kopieren (öffnen
Sie stattdessen eine seiner Regionen), und eine Person ist überhaupt kein
Dokument.

**Das ist dieselbe Aktion wie die eigene Schaltfläche „Forken“ im
Repository, in der Autorenansicht und unter Begegnungen in der Welt** —
siehe
[Forken: machen Sie es zu Ihrem eigenen](04-PublishingAndForking.md#forken-machen-sie-es-zu-ihrem-eigenen).
Welche Bezeichnung Sie auch anklicken, Sie erhalten dasselbe Ergebnis: eine
ganz neue, unabhängige Kopie, das Original genau so, wie es war, und
dieselben Lizenzregeln. „Eine Kopie bearbeiten“ ist hier nur anders
formuliert, weil Sie bereits das eine bestimmte Ding ansehen, das kopiert
wird, statt es aus einer Liste auszuwählen.

Das ist die *einzige* Tür aus der schreibgeschützten Fläche der
Weltansicht hinaus. Alles andere hier — Herumfliegen, Suche, Hier
erkunden/Was ist hier?, der Kompass, die Karte, Info — sieht nur hin.

### Wahrzeichen — einen Ort markieren, den man sich merken sollte

Anders als eine Struktur (ein platziertes Gebäude, das Sie oder jemand
anderes gebaut hat) oder eine Kompassanzeige (jeweils neu daraus
abgeleitet, wo Sie stehen) ist ein **Wahrzeichen** etwas, das Sie bewusst
erstellen: ein benannter Punkt — „Alte Brücke“, „Schöne Aussicht“ — mit
optionaler Beschreibung, genau dort gesetzt, wo Ihr Avatar gerade steht.

Haben Sie Bearbeitungsrechte für die Welt, in der Sie sind, zeigt der
Abschnitt Wahrzeichen im Feld **Orte** eine Schaltfläche **+ Wahrzeichen
hinzufügen**. Geben Sie ihm einen Titel (und optional eine Beschreibung)
und klicken Sie auf **Hier setzen** — es erscheint sofort für Sie und
Augenblicke später für jeden anderen Mitwirkenden in derselben Welt, auf
dem Kompass, in deren eigenem Feld Orte und als ansteuerbares Ziel. Jeder
mit Bearbeitungsrechten kann jedes Wahrzeichen der Welt umbenennen, neu
beschreiben oder entfernen, nicht nur die Person, die es erstellt hat —
Wahrzeichen sind Inhalt der Welt, für den dieselben
Zusammenarbeitsrechte gelten wie für alles andere, was Sie gemeinsam
bauen, nie eine persönliche, private Markierung, die nur Sie sehen oder
berühren können.

### Die Weltkarte

Der Reiter **Karte** öffnet eine flache Ansicht von oben auf alles, was
diese Sitzung in der Welt gerade kennt — benannte Orte, Wahrzeichen,
Strukturen, alle anderen, die da sind, und eine Markierung für Sie.
Scrollen Sie oder nutzen Sie +/−, um zu zoomen, klicken Sie auf eine leere
Stelle, um die Karte zu schwenken, und klicken Sie auf einen Ort oder eine
Person, um Ihre Kamera direkt dorthin zu bewegen. Nichts an der Karte lässt
sich bearbeiten, und sie anzusehen ändert nie etwas — sie ist einfach ein
Weg, die Geografie, die die Mitwirkenden einer Welt bereits gebaut und
benannt haben, auf einmal zu sehen statt Wahrzeichen für Wahrzeichen.

### Geografische Orte

Der Reiter **Gegenden** öffnet ein Verzeichnis jedes **geografischen
Ortes**, den diese Sitzung erkannt hat — Orte, die mehrere Menschen
unabhängig voneinander benannt oder beschrieben haben (als Region — siehe
den Abschnitt Gegenden im Feld Orte) und die sich als ungefähr dasselbe
Gelände herausstellen. Klicken Sie auf eine Zeile, um ihre eigene
Detailansicht zu öffnen: wie viele Beschreibungen und Welten sie umfasst,
ihre eigenen **Namen aus der Gemeinschaft** und die Schaltflächen **Zum Ort
gehen** / **Auf der Karte zeigen**. Klicken Sie auf **← Zurück** (oder
drücken Sie Escape), um zum Verzeichnis zurückzukehren — wechseln Sie zu
Karte oder Erkunden und später zurück zu Gegenden, öffnet sich genau die
Ansicht wieder, die Sie verlassen haben, Detail oder Liste.

Der Abschnitt Namen aus der Gemeinschaft eines Ortes zeigt zunächst nur
seine wichtigsten Namen, mit einer Schaltfläche **Weitere Namen**, um die
vollständige gereihte Liste zu sehen — und alles jenseits von „einen
eigenen Namen veröffentlichen“ (andere geografische Beschreibungen, der
rohe Anspruchsverlauf, Import/Export) liegt hinter einer Aufklappung
**Mehr**, sodass der häufige Fall — „Wie nennen andere das, und wie nenne
ich es?“ — nie mit allem anderen konkurriert, was das Namenssystem kann.

> Einen Namen zu veröffentlichen kündigt ihn Ihren verbundenen Peers auf
> dieselbe Weise an wie das Beanspruchen der Urheberschaft einer Struktur —
> siehe
> [Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md),
> wenn Sie jeden Anspruch, den dieses Gerät veröffentlicht oder erfahren
> hat, an einem Ort sehen möchten.

## Kamera und Bearbeitung

Die Kopfzeile zeigt zwei Dinge, die sich wirklich unterscheiden können:

```
Kamera: Alices Burg · Bearbeitung: Bobs Burg
```

**Kamera** ist, wohin Sie gerade blicken — zu einer Welt fliegen oder auf
die Schaltfläche **Fokussieren** eines Suchergebnisses klicken bewegt die
Kamera dorthin. **Bearbeitung** ist das Dokument, auf das Ihre nächste
Aktion (ein Wahrzeichen oder eine Region hinzufügen, Metadaten bearbeiten,
veröffentlichen) tatsächlich wirken würde — ein Klick auf einen Stein oder
eine Platzierung oder auf die Schaltfläche **Auswählen** eines Such- oder
Ortsergebnisses ändert es, *ohne* die Kamera zu bewegen. (Die Steine selbst
werden nur im Editor geändert — siehe
[Eine Kopie bearbeiten](#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen)
oben.)

Meist bewegen sich beide zusammen (Fokussieren tut beides), aber zwei
Kreationen können sich genau dieselbe Stelle der Welt teilen — fokussieren
Sie erst die eine, dann die andere, bewegt sich die Kamera beim zweiten Mal
nirgendwohin, und doch sagt Ihnen die Kopfzeile, welche Sie jetzt
bearbeiten. Herumfliegen und Dinge ansehen ändert nie von selbst, was Sie
bearbeiten; das tut nur das tatsächliche Auswählen eines Steins oder eines
Dokuments.

„Hin“, in den Zeilen unter In der Nähe von Erkunden und im Feld Info,
bezeichnet dieselbe Kamerabewegung wie die Schaltflächen „Fokussieren“ in
Suche, Orte und Platzierung — nur die Beschriftung unterscheidet sich;
jede bewegt die Kamera. Was sie sonst tut — ob sie auch das Dokument
ändert, das Sie bearbeiten, wie es das eigene Fokussieren der
[Suche](#suche--welche-veröffentlichungen-passen-dazu) tut —, hängt
weiterhin genau so vom Kontext ab, wie im eigenen Abschnitt jedes Feldes
beschrieben; „Hin“ statt „Fokussieren“ zu sagen ändert daran nichts.

## Meine Welten — Welten, in denen Sie wirklich waren

Klicken Sie in der oberen Leiste auf **Meine Welten**, um jede Welt zu
sehen, die dieses Gerät schon besucht hat, die zuletzt besuchte zuerst,
jeweils mit Titel, Autor und, soweit bekannt, der Zahl der Strukturen und
Wahrzeichen. Klicken Sie auf die Schaltfläche **Weiter erkunden** einer
Karte, um direkt zurückzufliegen — derselbe frische Einstieg in die
Weltansicht wie die eigene Schaltfläche **Erkunden** im Repository und in
der Autorenansicht (siehe
[Das Repository](04-PublishingAndForking.md#das-repository)), nur
formuliert für eine Welt, die Sie schon besucht haben, statt für eine, die
Sie zum ersten Mal finden.

Das ist ein rein lokaler, persönlicher Verlauf — nie eine geteilte oder
veröffentlichte Liste und nicht dasselbe wie das Repository oder ein
Suchergebnis: Eine Welt erscheint hier erst, wenn Sie sie tatsächlich
betreten haben, und sie bleibt hier (nur auf diesem Gerät), auch wenn Sie
nie etwas Eigenes veröffentlichen oder teilen. Noch nirgends gewesen?
**Durchsuchen Sie das Repository**, um Ihre erste zu finden.

## Welten finden

Es gibt drei Wege, etwas in der geteilten Welt zu finden, und jeder
beantwortet eine andere Frage.

### Suche — welche Veröffentlichungen passen dazu?

Das Feld **Suche** sucht nach **Titel oder Autor**, über alles
Veröffentlichte — nicht nur über das, was gerade um Sie herum geladen ist.
Geben Sie einen Begriff ein und klicken Sie auf **Suchen**.

Optional können Sie die Suche auf einen **Ort** eingrenzen: Füllen Sie
X/Y/Z und einen **Radius** (in Welteinheiten) aus, und die Suche liefert
nur Ergebnisse innerhalb dieser Entfernung um diesen Punkt. Lassen Sie Ort
leer für eine reine Textsuche.

Jedes Ergebnis zeigt:

- 📍 seine Position
- 📏 wie weit entfernt es ist (nur bei einer Ortssuche)
- einen Hinweis, wenn die angezeigte Position eine **Standardposition**
  ist und keine, die der Autor tatsächlich gewählt hat (siehe
  [Position in der Welt](#position-in-der-welt) unten)

Klicken Sie auf **Fokussieren**, um dorthin zu fliegen.

### Hier erkunden / Was ist hier? — was ist gerade um mich herum?

Diese beiden Schaltflächen oben im Abschnitt In der Nähe von Erkunden
suchen **von dort aus, wo Ihre Kamera gerade ist** — Sie müssen keinen
Titel schon kennen oder Koordinaten eingeben.

- **Hier erkunden** durchsucht ein recht großes Gebiet um die Kamera und
  lässt Sie den Radius danach vergrößern oder verkleinern.
- **Was ist hier?** prüft nur die unmittelbare Umgebung — nützlich, wenn
  Sie wissen möchten: „Ist genau hier, wo ich stehe, irgendetwas?“

Beide öffnen den Dialog **Ort erkunden**:

```
📍 Mitte: 100.0, 50.0, 250.0
⭕ Radius: 25 Welteinheiten

3 von 3 auffindbaren Dokumenten werden angezeigt

📍 Rathaus             📏 4.2 Welteinheiten entfernt
von alice
[Fokussieren] [Auswählen] [Untersuchen]
```

Jedes Ergebnis bietet drei verschiedene Aktionen:

| Schaltfläche | Was sie tut |
|---|---|
| **Fokussieren** | Fliegt die Kamera dorthin *und* macht es zu dem, das Sie bearbeiten |
| **Auswählen** | Macht es zu dem, das Sie bearbeiten, **ohne** die Kamera zu bewegen |
| **Untersuchen** | Klappt eine Zusammenfassung an Ort und Stelle auf — Titel, Autor, Status, Position, Eigentümer —, ohne etwas zu bewegen |

Dieser Dialog verschiebt nie von selbst eine Platzierung, bearbeitet kein
Dokument und veröffentlicht nichts — er dient nur dem Umsehen und der
Wahl, wohin es als Nächstes geht.

### Dokumente hier

Sagt das Infofeld einer Platzierung, dass andere Dokumente genau ihre
Position teilen, klicken Sie auf **Ansehen**, um **Dokumente hier** zu
öffnen — eine schlichte Liste aller an dieser Stelle, jeweils mit eigener
Schaltfläche **Fokussieren**. Hier erscheinen nur Dokumente, die noch
tatsächlich veröffentlicht sind — wurde eines je zurückgezogen, fehlt es
einfach in der Liste, statt als Zeile aufzutauchen, mit der Sie nichts
anfangen können.

## Einen Stein untersuchen — oder eine platzierte Struktur

Klicken Sie auf einen beliebigen Stein, um das Feld **Untersuchung** zu
öffnen, das Ihnen sagt:

- was für ein Stein es ist
- seine Position und Drehung
- zu welcher Welt und welchem Gebäude er gehört
- wer die Welt erstellt hat

Nutzen Sie **Stein fokussieren**, um ganz heranzuzoomen, oder **Welt
fokussieren**, um zur Ausgangsposition dieser Kreation zu springen. Direkt
daneben forkt eine Schaltfläche **Eine Kopie bearbeiten** die Welt, zu der
dieser Stein gehört, und öffnet die Kopie im Editor — das Original bleibt
unberührt. Ein Klick auf bloßen Boden innerhalb einer Kreation öffnet
dieselbe Art von Feld (Position sowie die enthaltende Welt und ihr Autor,
ohne steinspezifische Felder) mit einer eigenen Schaltfläche **Eine Kopie
bearbeiten**, aus demselben Grund: Zum Forken müssen Sie nicht erst etwas
Bemerkenswertes finden, sondern nur irgendwo in die Welt klicken, auf der
Sie aufbauen möchten.

Klicken Sie auf eine **platzierte Struktur** (eine Instanz eines ganzen
Dokuments, aus dem Editor in eine Kreation gesetzt — siehe
[Der Editor](02-TheEditor.md#strukturinstanzen-eine-lebendige-referenz)),
und dasselbe Feld zeigt stattdessen, worauf sie verweist: den Titel ihres
Quelldokuments, lokale Position und Weltposition, Drehung, Bodenhöhe sowie
Titel und Autor der enthaltenden Welt. In der Weltansicht ist das
schreibgeschützt — es gibt kein Gizmo, kein Zahlenfeld, nichts zum Ziehen.
Klicken Sie auf **Quelle öffnen**, um direkt im Editor das referenzierte
Dokument selbst zu öffnen; jede andere Instanz davon, wo auch immer sie
platziert ist, spiegelt wider, was Sie dort bearbeiten. Ihre eigene
Schaltfläche **Eine Kopie bearbeiten**, direkt neben Quelle öffnen, zielt
auf dasselbe referenzierte Dokument statt auf die Welt, die es nur
positioniert — wenn Sie lieber an einer unabhängigen Kopie arbeiten und
jede andere Instanz (und das Original) unberührt lassen möchten, nutzen
Sie diese statt Quelle öffnen.

Jede Schaltfläche „Eine Kopie bearbeiten“ in der Weltansicht — hier und im
eigenen Feld Fokus einer Region, eines Wahrzeichens oder einer Struktur —
ist dieselbe Aktion; siehe
[Eine Kopie bearbeiten](#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen)
oben.

## Dokumentinformationen und Platzierung

Unter der Kopfzeile finden Sie zwei Felder für das Dokument, das Sie gerade
bearbeiten:

- **Dokumentinformationen** — Titel, Beschreibung, Lizenz, wer es
  platzieren darf, Status und (bei einem Fork) aus welcher Welt es geforkt
  wurde. Klicken Sie auf **Metadaten bearbeiten**, um Titel,
  Beschreibung, Lizenz oder wer es platzieren darf zu ändern.
- **Platzierung** — *wo* dieses Dokument im geteilten Raum liegt, in
  **Welteinheiten** (dem eigenen Koordinatensystem von ForkBuild, keine
  GPS-Koordinaten — eine Welteinheit entspricht einem Meter echter Länge).
  Klicken Sie auf **Verschieben**, um ihm direkt neue X/Y/Z-Koordinaten zu
  geben, oder nutzen Sie die Schaltflächen ± (1 / 10 / 100 Welteinheiten),
  um die aktuelle Position vor dem Bestätigen relativ zu verschieben.
  **Fokussieren** fliegt dorthin.

Das sind absichtlich zwei getrennte Felder: Was eine Kreation *ist* und wo
sie *liegt*, sind zwei verschiedene Fragen, und eine Platzierung zu
verschieben bearbeitet nie das Dokument selbst (oder umgekehrt).

### Position in der Welt

Belegt bereits ein anderes Dokument genau die Stelle, an die Sie
verschieben, sehen Sie vor der Bestätigung eine Warnung mit einer Liste,
wer dort ist — einen Ort zu teilen ist erlaubt (eine Hofszene und das
Gebäude darum können zu Recht am selben Ort liegen), ForkBuild sorgt nur
dafür, dass Sie es zuerst sehen.

### Platzierungen, die Ihnen nicht gehören

Gehört eine Platzierung jemand anderem, zeigt das Feld Platzierung
**🔒 Platziert von &lt;Name&gt; — Sie können diese Platzierung ansehen,
aber nicht verschieben.**, und die Schaltfläche **Verschieben** ist
deaktiviert. Sie können sie trotzdem **fokussieren**, untersuchen und mit
**Eine Kopie bearbeiten** auf dem aufbauen, was dort ist; nur *wo sie im
geteilten Raum liegt*, darf allein ihr Eigentümer verschieben.

### Warum kann ich die Bauwerke anderer platzieren?

Ein echtes Gebäude lässt sich nicht aufheben und woanders hinstellen,
daher mag es seltsam wirken, dass ForkBuild Sie das veröffentlichte
Bauwerk eines jeden platzieren lässt, wo Sie möchten. Ein veröffentlichtes
Bauwerk ist kein einzelner physischer Gegenstand. Es ist fester Inhalt,
erkennbar an seinem Inhalts-Hash, ähnlich wie eine Datei oder ein
Git-Repository. Eine **Platzierung** ist ein eigener, signierter Datensatz,
der sagt: „Zeige dieses Bauwerk hier.“ Sie verweist auf das Bauwerk; sie
kopiert es nicht. Dasselbe Bauwerk kann viele Platzierungen haben, und
jede zeigt genau denselben veröffentlichten Inhalt.

Das Bauwerk eines anderen zu platzieren verschiebt oder verändert dessen
also nie:

- **Seine Platzierung bleibt, wo er sie hingestellt hat.** Nur er kann sie
  verschieben (siehe
  [Platzierungen, die Ihnen nicht gehören](#platzierungen-die-ihnen-nicht-gehören)
  oben).
- **Ihre Platzierung ist von Ihnen signiert** und sagt nur, wo *Sie* sein
  Bauwerk zeigen.
- **Das Bauwerk behält seinen Autor und seinen Verlauf.** Es ist weiterhin
  genau der Inhalt, den er veröffentlicht hat, und jeder kann das gegen
  Hash und Signatur prüfen.

Es gibt auch keine einzelne, zentrale Welt, die entscheidet, wem welches
Grundstück gehört. Jede Welt zeigt die Platzierungen, die sie angenommen
hat. Deshalb erscheint ein Bauwerk, das jemand in Ihrer Nähe ankündigt,
nur als Geist, bis Sie **Position annehmen** wählen (siehe
[Beanspruchte Bauwerke](#beanspruchte-bauwerke--die-bauwerke-anderer-dort-wo-ihre-herausgeber-sie-hinstellen)).
Niemand kann ohne Ihr Einverständnis ein Bauwerk in Ihre Welt setzen.

Einige Gründe, ein Bauwerk zu platzieren, das Sie nicht gemacht haben:

- **Kuratieren**, etwa eine Galeriewelt, die Bauwerke sammelt, die Ihnen
  gefallen.
- **Eine Szene zusammenstellen**, etwa die Burg eines Freundes neben Ihr
  Dorf stellen.
- **Es unverändert wiederverwenden.** Platzieren Sie es, wenn Sie es
  unverändert möchten, und nutzen Sie
  [Eine Kopie bearbeiten](#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen)
  nur, wenn Sie es ändern möchten.

Ein Herausgeber, der das nicht möchte, kann beim Veröffentlichen **Nur ich
darf es platzieren** wählen (siehe
[Wählen, wer es platzieren darf](04-PublishingAndForking.md#wählen-wer-es-platzieren-darf)).
Sie können sein Bauwerk dann weiterhin finden, ansehen und, wenn die
Lizenz es erlaubt, forken, aber nicht platzieren.

### Warum können zwei Bauwerke an derselben Stelle stehen?

Im echten Leben können zwei Gebäude nicht am selben Ort stehen. In
ForkBuild können sie es, weil eine Platzierung kein Land belegt. Sie ist
nur eine signierte Notiz „Zeige dieses Bauwerk hier“, und zwei Notizen
können dieselbe Stelle nennen.

ForkBuild erlaubt das mit Absicht:

- **Niemand vergibt Land.** Es gibt keinen zentralen Server, der
  entscheidet, wer zuerst da war, und ForkBuild kürt nie einen Sieger
  zwischen zwei signierten Platzierungen. Beide bleiben gültig.
- **Jedes Gerät kennt andere Platzierungen.** Eine Stelle, die auf dem
  Gerät Ihres Freundes belegt ist, kann auf Ihrem noch leer sein, bis die
  Platzierungen bei Ihnen ankommen. Eine strenge Regel „ein Bauwerk pro
  Stelle“ würde auf verschiedenen Geräten verschiedene Antworten geben,
  daher tut ForkBuild nicht so, als könnte es eine durchsetzen.
- **Manchmal will man es.** Eine Hofszene in einem Gebäude, eine ältere
  Version anstelle der neuen oder bewusst geschichtete Ausstellungsstücke
  sind alles Bauwerke, die an denselben Ort gehören.

Das heißt nicht, dass jeder Ihre Bauwerke bedrängen kann:

- **Sie werden vorher gewarnt.** **Verschieben …** listet vor Ihrer
  Bestätigung auf, was schon an einer Stelle ist, und ForkBuild verschiebt
  Ihr Bauwerk nie stillschweigend woandershin (siehe
  [Position in der Welt](#position-in-der-welt)).
- **Keine versehentlichen Duplikate.** **Hier eine Platzierung
  hinzufügen** verweigert, wenn genau dort, wo Sie sind, schon eine
  Platzierung liegt.
- **Der Anspruch eines anderen ist nur ein Geist.** Eine Position, die
  jemand anderes als der eigene Herausgeber des Bauwerks ankündigt, wird
  nur als durchscheinender Geist gezeigt, und nie an einer Stelle, an der
  dieses Gerät schon eine echte Platzierung kennt (siehe
  [Beanspruchte Bauwerke](#beanspruchte-bauwerke--die-bauwerke-anderer-dort-wo-ihre-herausgeber-sie-hinstellen)).
- **Nur der Eigentümer kann eine Platzierung verschieben oder entfernen**
  (siehe
  [Platzierungen, die Ihnen nicht gehören](#platzierungen-die-ihnen-nicht-gehören)).

ForkBuild prüft nur auf Bauwerke an genau demselben Punkt. Zwei Bauwerke an
benachbarten Punkten, deren Steine sich zufällig berühren, werden nicht
gemeldet. Die Begründung des Designs finden Sie unter
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(Englisch) und in den Regeln danach.

### Platzieren oder forken

Beides bringt das Bauwerk eines anderen in eine Ihrer Welten, aber es sind
verschiedene Dinge:

| | Platzieren | Forken (Forken oder Eine Kopie bearbeiten) |
|---|---|---|
| Was entsteht | Eine Platzierung: ein kleiner signierter Datensatz, wo das Bauwerk gezeigt wird | Ein neues Dokument mit neuen IDs, das Ihnen gehört |
| Das Bauwerk | Dieselbe Geteilte Welt, so gezeigt, wie sie veröffentlicht wurde | Ihre eigene Kopie, mit einem Vermerk, der auf das Original zurückverweist |
| Können Sie die Steine ändern? | Nein | Ja, im Editor |
| Wer ist der Autor | Der ursprüngliche Herausgeber | Sie, mit dem Original als Elternteil festgehalten |
| Geregelt durch | Die Einstellung **Wer es platzieren darf** des Herausgebers | Die Lizenz |
| Veröffentlichen | Nichts Neues wird veröffentlicht | Erstellt eine neue Geteilte Welt unter Ihrem Namen |

Platzieren ist wie das Verlinken derselben Datei von einer anderen Seite
aus; Forken ist wie das Klonen eines Repositorys, um an einer eigenen
Kopie zu arbeiten. Nur ein Fork ist also eine echte Kopie. Wer **Nur ich
darf es platzieren** gewählt hat, kann über seine Lizenz trotzdem Forks
erlauben, und ein Fork gehört dann Ihnen und lässt sich platzieren, wo Sie
möchten.

## Die Weltansicht ist schreibgeschützt — gebaut wird im Editor

Hier gibt es kein Platzierwerkzeug, kein Transformations-Gizmo, kein
Kopieren/Einfügen und keine Gruppen — Klicken, Ziehen oder ein Tastendruck
ändert nie einen Stein. Um auf etwas aufzubauen, nutzen Sie **[Eine Kopie
bearbeiten](#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen)** und
machen Sie im [Editor](02-TheEditor.md) weiter. Die oben in dieser
Anleitung aufgeführten Ausnahmen für Anmerkungen gelten weiterhin.

## Andere Mitwirkende sehen

Wenn mehrere Menschen in derselben Welt sind:

- **Andere Menschen sehen** — ihre Avatare erscheinen mit Anzeigenamen und
  Aktivitätshinweisen (z. B. „**Bob — erkundet die Umgebung**“).
- **Aktualisierungen in Echtzeit** — alles, was sie veröffentlichen (ein
  Wahrzeichen, einen Namen, einen frischen eigenen Fork), erscheint für Sie
  in dem Moment, in dem es geschieht.
- **Flüchtiger Aktivitätsfeed** — ein lokales Feld zeigt die jüngste
  Aktivität, damit Sie verstehen, was sich auch außerhalb Ihrer aktuellen
  Ansicht geändert hat. Dieser Feed ist vorübergehend und wird nicht
  gespeichert.

> **Anwesenheit beschreibt Aktivität; sie ändert nie von selbst etwas.**
> Räumliche Anwesenheit hilft Ihnen zu verstehen, was andere tun, aber nur
> eine tatsächliche Änderung — im Editor oder eine der Ausnahmen für
> Anmerkungen in der Weltansicht — ändert die geteilte Umgebung.

## Auch hier speichern und veröffentlichen

Die Kopfzeile hat die Schaltflächen **Speichern**, **Veröffentlichen** und
**Metadaten bearbeiten**, sobald Sie etwas bearbeiten, sodass Sie eine Welt
festhalten und teilen können, ohne sie zu verlassen. Die Statuszeile
(**🔒 Veröffentlicht** oder **✎ Fork wird bearbeitet**) zeigt immer, was
davon zutrifft.

Eine veröffentlichte Welt kann sich nie ändern. Ist die Welt, die Sie
bearbeiten, veröffentlicht, erstellt Ihre erste Änderung hier — ihre
Metadaten bearbeiten, ein Wahrzeichen oder eine Region hinzufügen oder
umbenennen oder sie mit einem Tier schmücken — automatisch Ihre eigene
bearbeitbare Kopie mit dem Titel *„Fork von &lt;ursprünglicher
Name&gt;“*, und ein kurzer Hinweis („Ihre eigene bearbeitbare Kopie wurde
erstellt — … bleibt unverändert“) sagt es Ihnen. Es gelten dieselben
Lizenzregeln wie für jeden anderen Fork (siehe
[Veröffentlichen & Forken](04-PublishingAndForking.md#forken-machen-sie-es-zu-ihrem-eigenen)).

### Meine Geteilte Welt — Ihren eigenen Snapshot verteilen, ohne Peers

Weiter unten im Feld, unter Suche und Avatar, sitzt ein Feld **Meine
Geteilte Welt**, das Titel und Autor Ihrer aktuellen Welt zeigt, sobald sie
tatsächlich veröffentlicht ist, sowie eine eigene Schaltfläche
**Verteilen**, die genau dieselbe Art von Dialog **Verteilen** öffnet, wie
oben für Begegnungen in der Welt beschrieben — sie teilt sich dieselbe
Komponente, sodass alles an ihrem Aufbau, ihrer kombinierten Schaltfläche
**Verteilen**, ihren gemeinsamen Einstellungen für Speicher/Substrat, ihren
Abschnitten **Signierter Anspruch**/**Snapshot** und ihrem Verhalten
„Schließen verliert nie ein Ergebnis“ genau so ist, wie unter
[Begegnungen in der Welt](#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
oben beschrieben. Der einzige Unterschied ist, *was* sie verteilt: Der
Dialog unter Begegnungen in der Welt wirkt immer auf die begegnete
Veröffentlichung, die Sie ausgewählt haben; dieser wirkt immer auf *Ihre
eigene aktuelle Welt*, und keiner teilt Zustand, Verlauf oder Ergebnis mit
dem anderen — **Nur Signierten Anspruch verteilen** verteilt hier den
Signierten Anspruch hinter Ihrer Welt genauso wie die eigene Schaltfläche
unter Begegnungen in der Welt; **Nur Snapshot verteilen** verteilt ihn
unter dem getrennten Snapshot-Protokoll — was dieser Unterschied bedeutet,
steht unter
[Lokaler Snapshot](09-PublicationsAndEvidence.md#lokaler-snapshot).
Entferntes IPFS-Pinning und die Verankerung auf Bitcoin/Base bleiben im
eigenen Veröffentlichungszentrum der Seite Veröffentlichungen (siehe
[Veröffentlichen auf IPFS](11-EvidenceAndStorage.md#veröffentlichen-auf-ipfs)
und
[Der Ablauf für Bitcoin-Anker](11-EvidenceAndStorage.md#der-ablauf-für-bitcoin-anker)) —
beide brauchen zuerst ein Konto oder eine verbundene Wallet, daher ist
keines davon hier eine Schaltfläche mit einem Klick.

Der Sinn von Meine Geteilte Welt ist, dass es nie davon abhängt, ob
Begegnungen in der Welt etwas zu zeigen hat. Begegnungen in der Welt zeigt
nur, was ein gerade oder kürzlich verbundener Peer Ihnen erzählt hat — ist
niemand sonst da, bleibt es leer. Meine Geteilte Welt braucht nichts davon:
Es ist immer da, wenn Sie eine Welt geöffnet haben, ob jemand in der Nähe
ist oder nicht und ob sie gerade veröffentlicht ist oder nicht (bis Sie
sie veröffentlichen, ist die Schaltfläche einfach deaktiviert, mit einem
Hinweis, dass es noch nichts zu verteilen gibt).

**Verteilen** und der Link zum Teilen stehen vorn. Die selteneren Aktionen
warten hinter **Mehr ▾**: **Snapshot exportieren**,
**Snapshot-Übereinstimmung prüfen**, **Diagnosewerkzeuge** (unten) und
**Veröffentlichung zurückziehen …**. Zurückziehen fragt einmal, bevor es
handelt — es entfernt die Welt aus dem Katalog, während ihre
Platzierungen, das Dokument und alle verteilten Kopien bleiben —, und
**Abbrechen** macht einen Rückzieher.
Bereits verteilte Kopien lassen sich nicht zurückholen, aber dieses Gerät
merkt sich, was Sie zurückgezogen haben, sodass die Suche des Repository in
den Netzwerken sie nicht wieder auflistet. Ergebnisse von Exportieren und Prüfen
bleiben im Feld, nachdem Sie das Menü schließen.

Wurde die geöffnete Welt von jemand anderem veröffentlicht (etwa eine, die
ein Peer mit Ihnen geteilt hat), heißt das Feld stattdessen **Geteilte
Welt** und lässt **Zurückziehen** und **Verteilen** weg: Nur der eigene
Herausgeber einer Welt kann sie zurückziehen oder verteilen. Ihre
Platzierungen, Snapshot-Werkzeuge, der Link zum Teilen und **Kommentare**
bleiben, sodass Sie die Kommentare zu jeder Welt weiterhin lesen und selbst
kommentieren können.

Unter all dem sitzt ein Abschnitt **Kommentare**, auf eine einzige Zeile
**▸ Kommentare (N)** eingeklappt, bis Sie darauf klicken (die Zahl bleibt
auch eingeklappt aktuell), und wie alles andere in diesem Feld auf Ihre
aktuelle Welt bezogen — wer kommentieren kann und was dann geschieht,
steht vollständig unter
[Kommentare](09-PublicationsAndEvidence.md#kommentare). Wie beim Verteilen
des Snapshots muss Ihre Welt zuerst veröffentlicht sein, damit Sie
tatsächlich einen Kommentar senden können; bis dahin bleibt das
Eingabefeld deaktiviert.

Eine Liste **Platzierungen (N)** zeigt jeden Ort, an dem diese Geteilte
Welt tatsächlich platziert ist, in der Reihenfolge, in der sie gefunden
wurden — Position, Revision und (wenn bekannt) Eigentümer, eine Zeile pro
Platzierung. Nichts hier wird auf „die neueste“ reduziert: Eine Geteilte
Welt kann wirklich an mehr als einem Ort stehen, und jede Platzierung, die
dieses Gerät entdecken kann, wird aufgeführt, nie nur eine einzige, zuletzt
aktualisierte stellvertretend für den Rest.

Jede Zeile hat ihr eigenes **Verschieben …** und **Entfernen …**, die genau
auf diese Platzierung wirken und auf keine andere. **Verschieben …** öffnet
für diese Platzierung denselben Dialog Platzierung verschieben mit X/Y/Z
(samt Überlappungswarnung). **Entfernen …** fragt einmal, bevor es diese
Platzierung aus der Welt nimmt; die Geteilte Welt, ihr Dokument und die
anderen Platzierungen bleiben, und das Entfernen der letzten Platzierung
heißt nur, dass das Bauwerk nirgends mehr erscheint, bis Sie es erneut
platzieren. Beide sind bei einer Platzierung deaktiviert, die jemand
anderes gemacht hat: Nur ihr Eigentümer kann sie verschieben oder
entfernen.

**Hier eine Platzierung hinzufügen**, unter der Liste, platziert dasselbe
Bauwerk *noch einmal* an der Position Ihres Avatars (oder, ohne Avatar,
der Kamera) — es verschiebt nie eine bestehende Platzierung; dafür nutzen
Sie deren **Verschieben …**. Es fügt eine Platzierung hinzu, keine Kopie:
Das Bauwerk bleibt eine einzige Geteilte Welt (siehe
[Platzieren oder forken](#platzieren-oder-forken)). Die Bestätigung nennt,
wo es platziert wurde und wie viele Platzierungen die Geteilte Welt jetzt
hat. Liegt genau dort, wo Sie sind, schon eine Platzierung, verweigert die
Schaltfläche und bittet Sie, sich zuerst woandershin zu bewegen, sodass
wiederholte Klicks keine unsichtbaren Duplikate an einer Stelle anhäufen
können. Eine leere Liste bedeutet nur, dass diese Geteilte Welt noch
nirgends platziert wurde; ein Lesefehler zeigt stattdessen seinen eigenen
schlichten Fehler.

Unter **Mehr** öffnet eine Schaltfläche **Diagnosewerkzeuge** — nur
vorhanden, wenn mindestens eine der Funktionen dahinter verfügbar ist —
ein kleines Fenster mit Werkzeugen zur schrittweisen Wiederherstellung von
Hand, für den Fall, dass die automatische Entdeckung oder Platzierung von
Snapshots nicht das Erwartete liefert: **Snapshots entdecken** durchsucht
alles, was unter dem gemeinsamen Entdeckungs-Tag der Kampagne angekündigt
wurde — erreichbar auch ohne verbundene Peers, ohne Begegnungen in der Welt
und noch ohne eigene Geteilte Welt; wählen Sie einen aus und klicken Sie
auf **Ausgewählten Snapshot auflösen**, um zu prüfen, ob er sich
tatsächlich abrufen lässt; von dort aus können Sie **Ausgewählten Snapshot
zuordnen** (passt er zum Inhalts-Hash dieser Geteilten Welt?) und,
unabhängig davon, **Ausgewählten Snapshot materialisieren** (seine Bytes
auf diesem Gerät speichern) — und jederzeit, sobald Sie einen Kandidaten
ausgewählt haben, übernimmt **Beanspruchte Position verwenden** die
Position, die der Snapshot selbst beansprucht, falls er eine hat. Einmal
materialisiert, fügen **Materialisierten Snapshot platzieren** und dann
**Platzierten Snapshot registrieren** ihn tatsächlich der Welt hinzu, die
Sie gerade ansehen, ohne Neuladen. Jeder dieser Schritte ist ein eigener,
ausdrücklicher Klick — nichts hier verkettet, wiederholt oder reiht einen
Kandidaten für Sie; es ist dieselbe Zurückhaltung, die jeder andere
manuelle Schritt-für-Schritt-Ablauf in ForkBuild schon einhält.

**Der automatische Weg, für den dieses Fenster die Ausweichlösung ist,
schöpft aus mehr als nur diesem Gerät.** Während Sie gehen, prüft ForkBuild
im Hintergrund regelmäßig auf Snapshot-Kandidaten — dieselbe Prüfung, die
**Snapshots entdecken** oben von Hand ausführt — und fasst zu einer Menge
von Kandidaten zusammen, was dieses Gerät schon lokal hat, was ein
verbundener Peer passiv geteilt hat (allein dadurch, dass er verbunden ist,
ohne eigenes Zutun) und was Nostr meldet. Ein Kandidat, der sich auflösen
lässt, wird still durch dieselbe Kette aus Auflösen → Materialisieren →
Platzieren → Registrieren geführt, wie oben beschrieben, und erscheint
genau wie jede andere Markierung unter **Begegnungen in der Welt** — es
gibt keine eigene Liste „automatisch entdeckt“ und keine Benachrichtigung,
und die manuellen Schaltflächen der Diagnosewerkzeuge oben funktionieren
weiterhin genau wie beschrieben, unverändert, für den Fall, dass dieser
passive Weg nicht zutage fördert, was Sie selbst suchen.

Der automatische Weg lädt nur Snapshots in Ihrer Nähe herunter: solche, die
in Ihrer Kartenzelle oder den Zellen darum herum (etwa 1.000 Einheiten in
jede Richtung) platziert sind oder als dort platziert angekündigt wurden,
plus die 20 neuesten, die nicht sagen, wohin sie gehören. Ein weiter
entfernter Snapshot wird heruntergeladen, sobald Sie in seine Nähe gehen.
Höchstens vier werden gleichzeitig heruntergeladen. Ein Snapshot, den
dieses Gerät schon heruntergeladen hat, wird nach derselben
Inhaltsprüfung aus dem eigenen Speicher gelesen, statt erneut
heruntergeladen zu werden.

## Verlauf — frühere Zustände in der Vorschau ansehen und wiederherstellen

Jede Änderung, die Sie hier vornehmen — ein Wahrzeichen oder eine Region
hinzufügen, umbenennen oder entfernen —, wird im Verlauf des Dokuments
festgehalten. Klicken Sie in der Kopfzeile auf **Verlauf**, um ihn zu
öffnen. Sie sehen eine nummerierte Liste mit Zeitstempeln, etwa:

```
1. Wahrzeichen „Alte Brücke“ erstellen
2. Region „Weidendorf“ aktualisieren
3. Wahrzeichen entfernen
```

Einträge, die Sie rückgängig gemacht haben, sind mit **rückgängig
gemacht** markiert. Ein Klick auf einen Eintrag wählt ihn nur aus; nichts
ändert sich, bis Sie eine der Schaltflächen drücken:

- **Vorschau** — zeigt, wie die Welt *direkt nach* dem ausgewählten
  Schritt aussah, neben der aktuellen, ohne etwas zu ändern. **Vorschau
  abbrechen** kehrt zur Gegenwart zurück.
- **Wiederherstellen** — macht den ausgewählten Schritt zu Ihrem
  **aktuellen** Zustand. Das Dokument bleibt mit ungespeicherten
  Änderungen zurück, sodass Sie noch entscheiden können, ob Sie es
  speichern. Es gibt keine eigene Bestätigung.
- **Schließen** — schließt das Feld.

## Wie geht es weiter?

Bereit zu teilen, was Sie gemacht haben, oder die Arbeit eines anderen neu
abzumischen? Weiter geht es mit
**[Veröffentlichen & Forken](04-PublishingAndForking.md)**.
