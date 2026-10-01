<!-- translation-of: docs/user/07-PeerConnectionsAndFriends.md source-hash: 25e078a7afa72b20 -->
# 07 — Peer-Verbindungen & Freunde

<!-- languages -->
[English](../07-PeerConnectionsAndFriends.md) · **Deutsch** · [Bahasa Indonesia](../id/07-PeerConnectionsAndFriends.md) · [日本語](../ja/07-PeerConnectionsAndFriends.md)
<!-- /languages -->

ForkBuild verbindet Sie direkt mit den Browsern anderer Menschen — es gibt
keinen zentralen Server mit einer Freundesliste. Öffnen Sie in der oberen
Leiste **Peers**, um zu verwalten, mit wem Sie verbunden sind, wen Sie
kennen und mit wem Sie befreundet sind.

## Die Seite auf einen Blick

```
Peers                                       Ihre ID …N6KbN  [Vollständige ID kopieren]

Braucht Ihre Aufmerksamkeit   wartende Verbindungen, Freundschaftsanfragen
Personen  [Alle|Freunde|Gefolgt|Online]   eine Zeile pro Person
Mit jemand Neuem verbinden  [Einladen|Einladung einfügen|Über ID suchen|Öffentliche Lobby]
▸ Blockiert (N)               nur, wenn Sie jemanden blockiert haben
```

- **Braucht Ihre Aufmerksamkeit** erscheint nur, wenn etwas wartet: eine
  laufende Verbindung (mit ihrem Schritt, z. B. „Schritt 2 von 5: WebRTC
  verbindet“), eine Verbindung, die darauf wartet, dass Sie die Antwort der
  Gegenseite einfügen, eine fehlgeschlagene zum Ausblenden oder jemand,
  der Ihr Freund werden möchte (**Annehmen** / **Ablehnen**).
- **Personen** hat eine Zeile pro Person, egal wie viel Sie über sie
  wissen. Schlagwörter sagen, was sie für Sie ist — **Freund**,
  **Gemerkt**, **Gefolgt**, **Blockiert**, **Anfrage gesendet**, **Möchte
  befreundet sein** —, und ein grüner Punkt bedeutet online. Wer online
  ist, kommt zuerst, dann Freunde, dann alle anderen. Jede Zeile hat ihre
  Hauptaktion (**Chat** für einen Freund, **Neu verbinden**, wenn die
  Person offline ist, **Als Freund hinzufügen** für jemanden, mit dem Sie
  verbunden sind), und das Menü **⋯** enthält den Rest: **Umbenennen**
  (oder **Benennen & merken**), **Merken** / **Vergessen**, **Freundschaft
  beenden**, **Folgen** / **Nicht mehr folgen**, **Verbindungsdetails**,
  **Trennen** und **Blockieren** / **Blockierung aufheben**. Der Filter
  **Gefolgt** zeigt die Personen hier, denen Sie folgen.
- **Blockiert** ist unten eingeklappt und erscheint nur, wenn Sie jemanden
  blockiert haben.

Hinter der Liste stehen fünf unabhängige Aufzeichnungen — aktive
Verbindungen, bekannte Peers (Menschen, die Sie sich **merken** wollten,
eine private Notiz, die nie mit ihnen geteilt wird), Freunde (gegenseitig
und signiert), Gefolgt (siehe [Personen folgen](#personen-folgen)) und
Blockiert. Jemand kann ein Freund sein, ohne gemerkt zu sein, und so
weiter; die Zeile zeigt einfach, was jeweils zutrifft. Jemand, dem Sie
folgen, mit dem Sie aber nie verbunden waren, steht hier nicht; die Seite
**Gefolgt** listet alle auf, denen Sie folgen.

## Jemanden finden und sich verbinden

Es gibt keine Benutzernamen zum Suchen — jeder Peer wird über seine
kryptografische Identität angesprochen, daher beginnt eine Verbindung
immer mit dem Austausch von Identitätsangaben über einen Kanal, dem Sie
bereits vertrauen (Chat, E-Mail, persönlich). **Mit jemand Neuem
verbinden** zeigt jeweils einen Weg:

- **Einladen** — **Einladung erstellen**, dann kopieren und jemandem
  senden. Die Verbindung wartet unter **Braucht Ihre Aufmerksamkeit**;
  sobald die Person antwortet, fügen Sie ihre Antwort dort ein und klicken
  auf **Verbindung abschließen**.
- **Einladung einfügen** — die Empfängerseite: Fügen Sie eine Einladung
  ein, die Ihnen jemand geschickt hat, klicken Sie auf **Verbinden** und
  senden Sie die Antwort zurück, die Sie erhalten.
- **Über ID suchen** — suchen Sie über die vollständige Identitäts-ID
  einer Person unter Kandidaten, die Sie oder andere veröffentlicht haben,
  und klicken Sie dann auf **Verbinden**. Ihre Antwort geht über den
  Rendezvous-Server zurück, sodass die Verbindung sich von selbst
  herstellt; eine Antwort kopieren Sie nur von Hand, wenn das nicht
  möglich ist (Ihre Identität ist gesperrt, oder der Kandidat stammt aus
  einer gespeicherten Einladung). **Eine Einladung für später speichern**,
  darunter eingeklappt, fügt eine Einladung zu diesen Suchergebnissen
  hinzu, ohne sich zu verbinden.
- **Auffindbar sein** (im selben Reiter, unter **Sich von anderen finden
  lassen**) — veröffentlicht Ihre eigene Identität in einem
  Rendezvous-Netzwerk, sodass jemand, der Ihre Identitäts-ID bereits kennt,
  Sie ohne direkte Einladung finden und sich verbinden kann. Eine
  Veröffentlichung beantwortet einen Verbindungsversuch — schalten Sie es
  erneut ein, um wieder gefunden zu werden. Die Schaltfläche zeigt **Nicht
  mehr auffindbar sein**, solange Ihre Veröffentlichung noch darauf wartet,
  dass jemand antwortet; sie springt von selbst auf **Auffindbar sein**
  zurück, sobald sich jemand verbindet oder das Angebot geschlossen wird
  oder seine Einladung abläuft. Zum Veröffentlichen muss Ihre Identität
  entsperrt sein: Der Rendezvous-Server nimmt nur eine Veröffentlichung an,
  die von der darin genannten Identität signiert ist, sodass niemand sonst
  eine für Sie veröffentlichen oder zurückziehen kann. Der
  Standard-Rendezvous-Server antwortet nur der gehosteten ForkBuild-Website;
  wenn Sie ForkBuild von Ihrer eigenen Adresse betreiben (einschließlich
  `localhost`), nutzen Sie Einladungen oder fügen Sie unter
  **Rendezvous-Server** in den **Netzwerkeinstellungen** einen eigenen
  Server hinzu. Dieser Zustand gilt für die ganze App, sodass das
  Verlassen der Seite Peers und die Rückkehr ihn nicht zurücksetzt.
- **Öffentliche Lobby** — Menschen treffen, deren ID Sie nicht haben;
  siehe unten.

**Ihre ID** oben auf der Seite, mit **Vollständige ID kopieren**, ist das,
was jemand für **Über ID suchen** braucht. Das gekürzte `…letzte14Zeichen`
in den Zeilen dient nur dazu, Personen auf einen Blick zu unterscheiden,
und passt nie zu einer echten Suche.

Welchen Weg Sie auch nehmen, eine Verbindung durchläuft dieselben
Schritte: **Über Rendezvous entdeckt → WebRTC verbindet → Peer verbunden →
Identität wird authentifiziert → Authentifiziert** (oder
**Fehlgeschlagen**). **Verbindungsdetails** im Menü **⋯** einer
verbundenen Person zeigen ihre Identität, ihren öffentlichen Schlüssel und
den Hinweis, dass die *Verbindung* selbst nur für die Sitzung gilt, auch
wenn der Eintrag als bekannter Peer oder Freund sie überdauert. Die
Zeitanzeigen „online seit …“ und „Gestartet vor …“ zählen ab dem Moment,
in dem diese Verbindung tatsächlich hergestellt wurde, und zählen daher
richtig weiter, wenn Sie wegnavigieren und zurückkommen.

## Die öffentliche Lobby: Menschen treffen, die Sie noch nicht kennen

Über ID suchen braucht die vollständige Identitäts-ID einer Person. Die
**Öffentliche Lobby** ist dafür da, Menschen zu treffen, deren ID Sie
nicht haben. Es gibt eine Lobby für alle, auf der Seite **Peers** unter
**Mit jemand Neuem verbinden → Öffentliche Lobby**, und eine für jede
Welt, unter **Lobby** in der Weltansicht.

- **Lobby beitreten** führt Sie dort unter einem Anzeigenamen auf, den Sie
  wählen, neben dem Ende Ihrer Identitäts-ID. Jeder kann einen beliebigen
  Namen wählen; geprüft wird bei einer Verbindung die Identität. Der Name
  wird für das nächste Mal gespeichert.
- Solange Sie in einer Lobby sind, bleibt dieses Gerät auffindbar: Jeder
  darin kann bei Ihnen auf **Verbinden** klicken, und wenn das jemand tut,
  macht es sich sofort für die nächste Person bereit.
- **Verbinden** bei jemandem in der Liste verbindet Sie mit ihm genauso
  wie Über ID suchen, ohne dass etwas zu kopieren ist. Seine Karte zeigt
  **Verbinde …** und dann **Verbunden**, sobald der Handshake nachweist,
  wer er ist. Jemanden in der Lobby zu sehen verbindet nie von selbst mit
  ihm.
- **Blockieren** blendet jemanden in Ihren Lobby-Listen aus und blockiert
  ihn wie überall sonst auf dieser Seite.
- **Lobby verlassen** nimmt Sie sofort heraus. Der Beitritt gilt nur für
  diesen Besuch: Das Schließen der App verlässt jede Lobby (Ihr Eintrag
  kann bis zu 10 Minuten brauchen, um aus den Listen anderer zu
  verschwinden), und beim nächsten Öffnen werden Sie nie wieder in eine
  aufgenommen.

**Was jemand bekommt, der sich aus einer Lobby mit Ihnen verbindet.** Eine
Lobby-Verbindung ist ein gewöhnlicher verbundener Peer, schon bevor Sie
ihn sich merken oder sich mit ihm befreunden. Er erfährt Ihre IP-Adresse,
sieht Ihren Avatar und Ihre Anwesenheit, wie es Ihre
Sichtbarkeitseinstellungen erlauben, und Ihre Geräte **tauschen
Ankündigungen von Snapshots und Ortsnamen sowie Metadaten von
Veröffentlichungen aus**, genau wie mit jedem verbundenen Peer (siehe
[Datenschutz](Privacy.md)). Chat und Sprache erfordern weiterhin eine
Freundschaft. Welten, die Sie mit Peers geteilt haben, werden auch ihm
angeboten, aber sein Gerät holt eine nur, wenn er auf **Abrufen** klickt
(siehe
[Mit verbundenen Peers teilen](04-PublishingAndForking.md#mit-verbundenen-peers-teilen)).
Welten, die Ihre Freunde und bekannten Peers teilen, werden für Sie
automatisch geholt; die eines Fremden aus der Lobby nie.

**Relays nur bei Bedarf.** Jede Verbindung versucht zuerst einen direkten
Weg und nutzt das TURN-Relay des Rendezvous-Servers nur, wenn kein
direkter Weg funktioniert. Während Sie in einer Lobby warten, fordert Ihr
Gerät nie Relay-Zugangsdaten an; die Person, die sich mit Ihnen verbindet,
fordert nur dann welche an, wenn sie sie braucht. So bleibt das monatliche
Kontingent des Relays für Verbindungen, die tatsächlich zustande kommen.

Die Lobby braucht einen Rendezvous-Server (siehe **Rendezvous-Server** in
den **Netzwerkeinstellungen**) und eine entsperrte Identität.

## Merken, befreunden, blockieren

- **Merken** Sie sich jemanden (in seinem Menü **⋯**), um eine private,
  lokale Notiz über ihn zu behalten — ohne seine Zustimmung. **Umbenennen**
  gibt ihm einen Namen, den nur Sie sehen; für jemanden, den Sie sich nicht
  gemerkt haben, tut **Benennen & merken** beides. **Vergessen** entfernt
  die Notiz, nur lokal.
- **Als Freund hinzufügen** in der Zeile einer verbundenen Person bittet
  um eine gegenseitige Beziehung; sie sieht es unter **Braucht Ihre
  Aufmerksamkeit** mit **Annehmen** / **Ablehnen**, und Sie können
  währenddessen im Menü **⋯** die **Freundschaftsanfrage zurückziehen**.
  **Freundschaft beenden** beendet sie; dazu muss die Person verbunden
  sein, weil sie es empfangen muss. Freunde bekommen eine Schaltfläche
  **Chat** — siehe [Chat & Unterhaltungen](08-ChatAndConversations.md).
- **Blockieren** stoppt alles von dieser Identität — Anwesenheit, Profil,
  Chat, sogar Freundschaftsanfragen —, ohne sie zu benachrichtigen. Einen
  Freund zu blockieren entfernt die Freundschaft nicht, es bringt sie nur
  zum Schweigen; **Blockierung aufheben** (im Menü **⋯** oder in der Liste
  **Blockiert**) lässt Sie wieder von ihm hören, stellt aber nie wieder
  her, was das Blockieren in der Zwischenzeit verschluckt hat.

## Personen folgen

**Folgen** hält Sie über die Kreationen einer Person auf dem Laufenden,
wie das Folgen eines Kontos in einem sozialen Netzwerk, ohne dass einer
den anderen um etwas bitten muss.

- **Wo Sie folgen können.** **Folgen** erscheint auf Karten von
  Veröffentlichungen im Repository, neben **Signiert von …** auf der Seite
  eines Autors, im Menü **⋯** einer Person auf dieser Seite und als
  **Ihren Werken folgen** bei einem Avatar in der Weltansicht. Sie folgen
  einer *Identität*, nie einem eingegebenen Autorennamen: Mehrere
  Menschen können unter demselben Namen veröffentlichen, daher zeigt die
  Seite eines Autors ein **Folgen** pro Identität, die unter diesem Namen
  Werke signiert hat.
- **Die Seite Gefolgt** (**Gefolgt** in der oberen Leiste) listet die
  Menschen auf, denen Sie folgen, jeweils mit **Nicht mehr folgen**, und
  darunter ihre neuesten Werke, die dieses Gerät erreicht haben, das
  neueste zuerst. Klicken Sie auf einen Namen, um nur die Werke dieser
  Person zu sehen.
- **Benachrichtigungen.** Wenn eine neue Kreation von jemandem, dem Sie
  folgen, dieses Gerät erreicht, bekommt das Feld 🔔 einen Eintrag
  **Publication followed author published** (ein gefolgter Autor hat
  veröffentlicht), einmal pro Kreation, mit **Erkunden**, um sie zu
  öffnen.
- **Ihre geteilten Welten werden für Sie geholt.** Welten, die jemand, dem
  Sie folgen, mit verbundenen Peers teilt, werden automatisch abgerufen,
  wie schon bei Freunden und gemerkten Peers.
- **Ihre Ankündigungen werden länger aufbewahrt.** Dieses Gerät bewahrt
  einen Nachweis der Ankündigungen auf, die es gesehen hat, bis zu einer
  Grenze pro Entdeckungs-Tag. Ist ein Tag voll, werden zuerst die am
  längsten nicht gesehenen Einträge verworfen, aber Platzierungen von
  Bauwerken und Ortsnamen, die von Menschen signiert sind, denen Sie
  folgen, werden vor den übrigen behalten.

**Folgen ist privat und einseitig.** Die Liste wird auf diesem Gerät für
die Identität aufbewahrt, mit der Sie angemeldet sind. Sie wird nie
irgendwohin gesendet, die Menschen, denen Sie folgen, erfahren es nie, und
es gibt keine Followerzahlen: Ohne Server könnte sie niemand ehrlich
zählen. Folgen gibt der anderen Person auch nichts: keinen Chat, keinen
Blick auf Ihren Avatar, keinen Weg, Sie zu erreichen. Dafür ist weiterhin
die Freundschaft da.

**Was Folgen nicht tut.** Folgen sucht die Werke der Menschen, denen Sie
folgen, aus dem heraus, was dieses Gerät erreicht; es holt ihre Werke
nicht selbst. Kreationen kommen weiterhin auf den üblichen Wegen an:
Entdeckung von Welten in der Weltansicht, von verbundenen Peers geteilte
Welten und Links, die Sie öffnen. Nur Werke mit gültiger Signatur zählen,
sodass niemand auf Ihre Seite Gefolgt gelangt, indem er den Namen oder die
Identität eines anderen auf seine Werke schreibt. Werke von jemandem, den
Sie **blockiert** haben, bleiben verborgen, auch wenn Sie ihm folgen.

## TURN: Peer-Verbindungen weiterleiten, die keinen direkten Weg finden

Jede Peer-Verbindung beginnt mit dem Versuch, einen direkten Weg zwischen
zwei Browsern auszuhandeln, wobei die eigenen öffentlichen
Standard-STUN-Server von ForkBuild jeder Seite helfen, ihre erreichbare
Adresse herauszufinden. Für die meisten Verbindungen reicht das — aber
manche Netzwerke (ein symmetrisches NAT, eine restriktive
Firmen-Firewall) geben nie einen Weg preis, den STUN allein finden kann.
Bietet Ihr Rendezvous-Server ein TURN-Relay an, fragt ForkBuild beim Start
einer Verbindung (nie schon beim bloßen Öffnen der App) nach kurzlebigen
Relay-Zugangsdaten und nutzt sie automatisch. Der Server gibt pro Monat
eine begrenzte Zahl von Relay-Zugangsdaten aus; sind sie aufgebraucht,
werden Verbindungen weiterhin versucht, nur ohne Relay, bis zum nächsten
Monat. Um ein eigenes Relay zu nutzen, öffnen Sie **TURN-Server** in den
**Netzwerkeinstellungen** in der oberen Leiste (`/settings/turn-server`)
und konfigurieren Sie Ihr eigenes TURN-Relay: einen Server, der die Daten
der Verbindung tatsächlich weiterleitet, wenn kein direkter Weg aufgebaut
werden kann.

```
TURN-Server

Ihr eigenes TURN-Relay für Peer-Verbindungen, die keinen direkten oder per
STUN ausgehandelten Weg aufbauen können. Diese Einstellung betrifft nur den
Verbindungsaufbau; sie ändert weder die Identität von Peers noch die
Authentifizierung oder bestehende Verbindungen.

Sie müssen dies nicht ausfüllen, um ein Relay zu bekommen: Beim Start einer
Verbindung fragt ForkBuild bereits Ihre Rendezvous-Server (siehe
Rendezvous-Server) nach einem kurzlebigen TURN-Relay und nutzt es, wenn sie
eines anbieten. Fügen Sie hier nur ein Relay hinzu, wenn Sie selbst eines
betreiben oder bezahlen; es wird zusätzlich zu deren Relay verwendet, nie
stattdessen.

[ Eine turn:/turns:-URL pro Zeile (z. B. turn:relay.example:3478) ]

Benutzername   [______________]
Zugangsdaten   [______________]

[Speichern]   [Löschen]
```

Geben Sie eine oder mehrere `turn:`/`turns:`-URLs (eine pro Zeile), einen
**Benutzernamen** und **Zugangsdaten** ein — dasselbe gemeinsame
Zugangsdatenpaar wird für jede aufgeführte URL gesendet, nie ein eigenes
pro Server — und klicken Sie auf **Speichern**. Danach erscheint das
aktuelle Relay als „Aktuelles TURN-Relay (*N* URL(s)): `<Ihre URLs>` —
Benutzername: `<Ihr Benutzername>`“ — die Zugangsdaten selbst werden nach
dem Speichern nie wieder angezeigt, nur dass welche konfiguriert sind.
Klicken Sie auf **Löschen**, um es ganz zu entfernen.

**Hier gibt es absichtlich keine Schaltfläche „Auf Standard
zurücksetzen“.** Das Standard-Relay kommt, wie oben beschrieben, von den
Rendezvous-Servern; diese Seite hat also nichts Eingebautes, worauf sie
zurücksetzen könnte: Einen TURN-Server hier mitzuliefern hieße, seine
Zugangsdaten in der App zu veröffentlichen, damit jeder sie lesen und
verbrauchen kann. Lassen Sie die Seite leer, bekommen Sie trotzdem das
Relay der Rendezvous-Server, wenn sie eines anbieten; ohne Relay von
beiden verlassen sich Verbindungen allein auf STUN und direkte
Erreichbarkeit. Ihr eigenes Relay ist optional und etwas, das Sie selbst
stellen würden (viele WebRTC-Hosting-Anbieter bieten eines an), nur wenn
Verbindungen zu bestimmten Peers trotzdem immer wieder scheitern. Wie bei
jeder anderen Seite der Netzwerkeinstellungen wirkt eine Änderung hier
erst beim nächsten Laden der App.

## Neu verbinden

Ein bekannter Peer oder Freund, der nicht online ist, zeigt eine
Schaltfläche **Neu verbinden**, sogar ein Freund, den Sie sich nie gemerkt
haben. Sie öffnet denselben Einladungsaustausch wie **Einladen** /
**Einladung einfügen**, direkt in seiner Zeile, und führt immer einen
vollständigen, frischen Handshake aus, statt alte Verbindungsdaten
wiederzuverwenden. Authentifiziert sich ein Versuch zum Neuverbinden als
eine *andere* Identität als erwartet, lehnt ForkBuild ihn ab und schließt
die Verbindung mit einer ausdrücklichen Fehlermeldung, statt
stillschweigend demjenigen zu vertrauen, der geantwortet hat.

ForkBuild versucht das auch automatisch für Sie, für jede Identität unter
den bekannten Peers: sobald die App startet, jedes Mal, wenn Sie sich
jemanden merken, ihn vergessen oder eine Beziehung zu einem bekannten Peer
anders ändern, und jedes Mal, wenn Sie selbst auf **Auffindbar sein**
klicken, prüft es still, ob jeder davon gerade **Auffindbar sein**
eingeschaltet hat, und verbindet sich in diesem Fall, ohne dass Sie selbst
auf Neu verbinden klicken müssen. Zwei Freunde, die beide auf **Auffindbar
sein** klicken, verbinden sich also: Der zweite Klick findet den ersten.
Ein bekannter Peer, der gerade nicht auffindbar ist oder nicht erreicht
werden kann, wird einfach in Ruhe gelassen — es gibt keine
Wiederholungsschleife, die ihm nachjagt, keine Benachrichtigung über den
Versuch, und das Scheitern bei einer Identität beeinflusst nie eine
andere. Nutzen Sie **Neu verbinden**, wenn es sofort geschehen soll, statt
auf den nächsten automatischen Durchlauf zu warten.

## Wie geht es weiter?

Sobald Sie einen Freund gefunden haben, chatten Sie mit ihm in
**[Chat & Unterhaltungen](08-ChatAndConversations.md)**.
