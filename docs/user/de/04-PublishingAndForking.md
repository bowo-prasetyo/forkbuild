<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: 0014d74c59859c59 -->
# 04 — Veröffentlichen & Remixen

<!-- languages -->
[English](../04-PublishingAndForking.md) · **Deutsch** · [Español](../es/04-PublishingAndForking.md) · [Français](../fr/04-PublishingAndForking.md) · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

Das ist das Herz von ForkBuild. **Veröffentlichen** teilt Ihr Bauwerk mit
der Welt. **Remixen** erlaubt jedem, eine eigene Kopie eines Bauwerks zu
machen und es weiterzuentwickeln, wobei sein ganzer Verlauf erhalten bleibt.
(Manche Meldungen und Entwicklerdokumente nennen einen Remix einen *Fork*,
wie in ForkBuild.)

## Ihr Bauwerk veröffentlichen

1. Bauen Sie etwas im Editor.
2. Geben Sie ihm einen Titel — Veröffentlichen verweigert ein Bauwerk
   ohne Titel oder eine leere — und, optional, eine Beschreibung und eine
   Lizenz: Klicken Sie in der Seitenleiste auf **✎** neben dem
   Bauwerkstitel, um **Bauwerkeigenschaften** zu öffnen.
3. Klicken Sie auf **Veröffentlichen**. Beim ersten Mal fragt ein einziges
   Blatt alles, was Veröffentlichen noch wissen muss, mit einer schon
   gewählten Antwort für jede Frage:
   - **Ihr Name**, auf einem Gerät, das noch keinen hat, mit einem
     Vorschlag (etwa *Baumeister 427*): Überschreiben Sie ihn mit Ihrem
     eigenen, wenn Sie möchten. Veröffentlichen signiert das Bauwerk damit
     (siehe [Ihr Name & Ihre Identität](05-IdentityAndLogin.md)).
   - **Andere dürfen es remixen**, eingeschaltet, für ein Bauwerk ohne
     Lizenz (siehe [Andere remixen lassen](#andere-remixen-lassen)).
   - **Alle können es finden**, eingeschaltet, wenn dieses Gerät zum ersten
     Mal veröffentlicht (siehe [Wer kann es finden?](#wer-kann-es-finden)).

   Nehmen Sie den Haken bei einer der beiden Wahlen weg, wenn Sie möchten,
   und klicken Sie dann auf **Als … veröffentlichen** (oder
   **Veröffentlichen**). **Weiterbauen** schließt das Blatt und
   veröffentlicht nichts. **Erweitert** enthält **Ohne Namen
   veröffentlichen**, was es ohne Autor und ohne Link veröffentlicht. Ein
   gesperrter Name oder einer von mehreren wird nach dem Blatt erfragt.
   Veröffentlichen speichert das Bauwerk auch.

Ihr Bauwerk erscheint jetzt unter **Entdecken** auf diesem Gerät, wo Sie
sie suchen, öffnen und remixen können, mit Ihrem Namen als Autor. Andere
sehen sie, sobald Sie ihren Link teilen, oder sofort, wenn Sie unter
[Wer kann es finden?](#wer-kann-es-finden) **Alle** gewählt haben. Sie
erhält außerdem einen eigenen Platz in der geteilten Welt (siehe [Wo ein Bauwerk steht](#wo-ein-bauwerk-steht)), sodass
**Erkunden** immer ein Ziel hat — siehe
[Welten finden](03-WorldView.md#welten-finden).

### Hineingehen

Neben dem Link zeigt die Meldung nach dem Veröffentlichen **Hineingehen**
(**Darum herumgehen** bei einem Bauwerk ohne Tür). Es öffnet die Weltansicht
mit Ihrem Avatar auf dem Boden vor der Tür des Bauwerks, ihr zugewandt; die
Tür schwingt auf, wenn Sie darauf zugehen, und hineinzugehen (**W**, auf dem
Handy der Joystick) hakt den letzten Schritt von
[Ihr erstes Bauwerk](02-TheEditor.md#ihr-erstes-bauwerk) ab. Die Tür ist der
Haupteingang des Bauwerks: Eine Tür in einer massiven Wand oder einem Turm,
hinter der man nicht stehen kann, zählt nicht, und an ein Bauwerk ohne Tür
kommen Sie von vorn. Die Karte **Ihr erstes Bauwerk** bietet dieselbe
Schaltfläche an, sobald das Bauwerk veröffentlicht ist.

> **Hinweis:** Veröffentlichen speichert Ihr Bauwerk auf diesem Gerät.
> Seine Karte in **Entdecken** sagt, wo dieses Gerät das
> Verteilen festgehalten hat (zum Beispiel **Gespeichert auf IPFS ·
> Angekündigt auf Nostr**), oder **Auf diesem Gerät ist keine Verteilung
> verzeichnet.** Sichern Sie es unter [Ihre Daten](13-YourData.md), um in
> der Zwischenzeit eine Kopie zu behalten.
> Bis Sie wählen, wohin Ihre Bauwerke gehen, sendet Veröffentlichen von selbst
> nichts irgendwohin. Ein [Link](#einen-link-teilen), den Sie kopieren, bringt das
> Bauwerk zu dem, dem Sie ihn geben. Sobald Sie ein Netzwerk wählen (siehe
> [Wohin es geht](#wohin-es-geht--ein-bauwerk-beim-veröffentlichen-senden)), sendet jedes Veröffentlichen das Bauwerk auch
> dorthin, damit andere es finden, ohne mit Ihnen verbunden zu sein.
> [**Mit Peers teilen**](#mit-verbundenen-peers-teilen) bietet es den Menschen an, mit denen Sie
> verbunden sind.

## Einen Link teilen

Sobald **Veröffentlichen** gelingt, zeigt der Hinweis im Editor auch
**Teilen …** (wo Ihr Gerät ein Teilen-Menü hat), **Link kopieren**,
**Bild speichern** und **Einbetten**, darunter den Link. Dieselben Schaltflächen stehen in der
Weltansicht unter **Meine Geteilte Welt**.

- **Das Bauwerk steckt im Link.** Vorher muss nichts verteilt werden, und
  keine Wallet und kein Konto ist beteiligt: Der Link trägt
  Ihre signierte Geteilte Welt und das Bauwerk selbst. Wer ihn öffnet, auf
  jedem Gerät, landet bei Ihrem Bauwerk (siehe
  [Was ein Link öffnet](#was-ein-link-öffnet)). ForkBuild prüft die Signatur und
  ob das Bauwerk dazu passt, bevor es etwas zeigt; ein veränderter oder
  abgeschnittener Link sagt das.
- **Er zeigt, was er ist.** In eine Chat-App, eine E-Mail oder einen
  Beitrag eingefügt, zeigt der Link den Titel Ihres Bauwerks, Ihren Namen
  und ein Bild des Bauwerks, gezeichnet vom Link-Server von ForkBuild, der
  jeden, der ihn öffnet, weiter zu ForkBuild schickt. Ein veränderter Link
  zeigt nur „A shared build“.
- **Er braucht eine Signatur.** Veröffentlichen Sie unter einem Namen; ein
  Bauwerk ohne Namen (**Ohne Namen veröffentlichen**) bekommt keinen Link.
- **Ein kurzer Link, sobald es an alle gesendet ist.** Ging das Bauwerk an
  **Alle** (siehe [Wer kann es finden?](#wer-kann-es-finden)), bieten die
  Schaltflächen stattdessen einen kurzen Link von etwa 90 Zeichen an, der
  das Bauwerk nennt, statt es zu enthalten: Wer ihn öffnet, bekommt das
  Bauwerk von den öffentlichen Nostr-Relays, an die es gesendet wurde, und
  es wird geprüft wie bei einem Link. Er passt in jeden Chat, auch in
  Discord und Telegram, und funktioniert für Bauwerke mit bis zu etwa
  2.000 Steinen. Bauwerke, die bei ihrem Link bleiben, behalten den langen
  Link, denn das Bauwerk ist nirgendwo sonst. Ein kurzer Link funktioniert,
  solange ein Relay das Bauwerk behält; antwortet keines, sagt die Seite
  das und bietet **Erneut versuchen** an.
- **Größe.** Ein Bauwerk mit bis zu etwa 500 Steinen passt hinein; der Link
  der mitgelieferten Burg hat etwa 3.700 Zeichen. E-Mail und die meisten
  Chat-Apps und sozialen Netzwerke behalten einen so langen Link, Discord
  und Telegram begrenzen aber, wie lang eine Nachricht sein darf. Ein
  größeres Bauwerk sagt, dass es für einen Link zu groß ist: Verteilen Sie
  es, um einen zu erhalten.
- **Sobald es verteilt ist**, bieten die Schaltflächen den kürzeren Link an,
  der nennt, wo die Geteilte Welt gespeichert ist, und der auch Ihre
  Platzierung mitbringt (siehe [Verteilung](Distribution.md)). Ein Link, der
  sein Bauwerk enthält, trägt Ihre Platzierung nicht, daher stellt die
  Weltansicht das Bauwerk dorthin, wo sie Bauwerke ohne Platzierung
  hinstellt.
- **Bild speichern** lädt ein PNG des Bauwerks in 1200 × 630 herunter, mit
  seinem Titel und „Eigene Version auf ForkBuild bauen“ am unteren Rand,
  zum Posten dort, wo ein Link allein kein Bild zeigt.
- **Video machen** nimmt ein kurzes Video des Bauwerks auf, das Sie selbst
  auf YouTube, Shorts, TikTok oder Reels hochladen: einen **Zeitraffer**, in
  dem es Stein für Stein vom Boden aufwächst, oder einen **Drehteller**, auf
  dem es sich einmal dreht, jeweils **Breit (16:9)** oder **Hoch (9:16)**. Sein
  Name läuft am unteren Rand mit, und am Ende steht, wer es gebaut hat (mit
  allen, die mitgebaut haben) und wo man es remixen kann. Das Video entsteht
  auf Ihrem Gerät, so lange wie es läuft (höchstens eine halbe Minute), und
  landet in Ihren Downloads; nichts wird hochgeladen. **Titel kopieren** und
  **Beschreibung kopieren** geben Ihnen dann Text zum Einfügen: wer es gebaut
  hat, den Link zu Ihrem Bauwerk, einen Link zu ForkBuild und die Lizenz.
  Das Video eines Remixes nennt auch, wer sein Original gebaut hat, und die
  Beschreibung eines nicht kommerziellen Bauwerks sagt, dass damit kein Geld
  verdient werden darf. **Video machen** gibt es bei jedem veröffentlichten
  Bauwerk; hat es jemand anderes gebaut, sagt es Ihnen deshalb vor der
  Aufnahme, was die Lizenz des Bauwerks verlangt: Namensnennung, kein damit
  verdientes Geld (CC BY-NC) oder vorher zu fragen (Alle Rechte vorbehalten
  oder keine Lizenz). Lassen Sie den Tab während der Aufnahme im Vordergrund; ist er verdeckt,
  pausiert sie.
  Ist **Mit Musik** angehakt, wie es ist, solange Sie es nicht abwählen, wird
  die Musik von ForkBuild mit aufgenommen und klingt unter der Schlusskarte
  aus.
- Ein **Rundgang**, die dritte Art unter **Video machen**, wird in der
  Weltansicht gefilmt: Sie öffnet sich bei Ihrem Bauwerk, Ihr Avatar beginnt
  ein paar Schritte davor, geht zur Tür (die aufschwingt) und hinein und
  sieht sich im Raum um, mit den Geräuschen der Weltansicht (Vögel oder
  Grillen, Wind, Schritte, die Tür) und, wenn Sie **Mit Musik** nicht
  abwählen, ihrer Musik. Gefilmt wird nur die 3D-Ansicht, nie die
  Bedienfelder, und es dauert so lange, wie das Video läuft (etwa 15
  Sekunden). Ein Bauwerk ohne Tür wird stattdessen angesteuert. Musik und
  Geräusche sind im Video, auch wenn Sie sie ausgeschaltet haben. Ein Link,
  der ein großes Bauwerk enthält, ist zu lang für eine YouTube-Beschreibung,
  daher wird er weggelassen, und Video machen sagt es; veröffentlichen Sie mit
  **Wer kann es finden?** auf **Alle** für einen kurzen Link.
  Unter **Kamera** folgt **Hinter dem Avatar** ihm von knapp dahinter, und
  **Durch seine Augen** filmt, was er sieht, als ginge der Zuschauer selbst
  hinein.
  **Mit einem Schwenk um das Bauwerk beginnen**, angehakt, solange Sie es
  nicht abwählen, eröffnet das Video mit einer Kamerafahrt halb um Ihr Bauwerk
  herum, bevor der Rundgang beginnt. Durch seine Augen geht der Avatar weiter
  bis zur freiesten Stelle im Raum und wird mit einem Weitwinkel gefilmt, wie
  bei Hausrundgängen, sodass auch ein kleiner Raum ganz zu sehen ist.
  Während gefilmt wird, zeigt die Weltansicht genau das Format des Videos,
  breit oder hoch, mit Balken daneben, sodass Sie sehen, was ins Video kommt.

Das Kopieren oder Teilen eines Links und das Öffnen eines Links werden
anonym gezählt, wie der tägliche Besuch; siehe
[Tägliche Besucherzählung](13-YourData.md#tägliche-besucherzählung).

### Was ein Link öffnet

Ein Link zu einem Bauwerk, ob er das Bauwerk trägt oder nennt, wo es
gespeichert ist, öffnet die eigene Seite dieses Bauwerks:

- das Bauwerk, langsam drehend;
- sein Titel und wer es gemacht hat, dazu **Gebaut mit …** und die Namen,
  wenn Freunde es zusammen mit dem Autor gebaut haben (siehe
  [Mit mir bauen](02-TheEditor.md#mit-mir-bauen-gemeinsam-bauen-live)). Der
  Name des Autors und jeder Mitbauende öffnen die Seite dieser Person: die
  Bauten, die ihre Identität signiert hat, und die, in denen andere sie
  nennen;
- **Remix von „…“ von …**, wenn es ein Remix ist, und **N-mal geremixt**,
  wenn dieses Gerät Remixe davon gefunden hat (siehe
  [Remix-Zähler](#remix-zähler));
- **Was sich geändert hat**, unter **Remix von** bei einem Remix: was es
  hinzugefügt hat (die Strukturen der Baubibliothek und die Fenster, Türen,
  Bäume und anderen Teile unter seinen neuen Steinen), umgefärbt und entfernt
  hat, ermittelt aus den Steinen beider Bauwerke, wenn dieses Gerät das
  remixte Bauwerk lesen kann;
- sein **Stammbaum**: die Bauten, aus denen er geremixt wurde, bis zum
  Original, und die Remixe daraus und aus diesen, jeder als Link, wenn
  dieses Gerät ihn öffnen kann;
- **Eine Kopie bearbeiten**, die große Schaltfläche: Ihre eigene Kopie
  öffnet sich im Editor, bereit zum Ändern, ohne Konto. Sie hält fest,
  woher sie stammt, so behält der Urheber die Anerkennung, und **Zurück
  zur Welt** bringt Sie zum Original;
- **In der Welt darum herumgehen**, um es in der Weltansicht zu sehen.

Erlaubt die Lizenz Kopien, bietet die Seite auch **Als 3D-Modell
herunterladen** an (glTF, STL für den 3D-Druck oder OBJ; siehe
[Ein 3D-Modell herunterladen](02-TheEditor.md#ein-3d-modell-herunterladen)). Erlaubt die Lizenz des Bauwerks keine Kopien, sagt die Seite das und
bietet nur den Rundgang an.

Bei einem eigenen Bauwerk bietet die Seite keine Kopie davon an. Ist das
Bauwerk auf diesem Gerät gespeichert, ist der große Knopf **Weiterbauen**:
Er öffnet es im Editor so, wie Sie es gespeichert haben, bereit zum Ändern
und erneuten Veröffentlichen. Auf einem anderen Gerät sagt die Seite, dass
Sie es auf dem Gerät ändern, auf dem Sie es gebaut haben.

### Ein Bauwerk in eine Webseite einbetten

Ein Bauwerk, dessen Link es enthält, kann auch in einem Blogbeitrag oder auf
einer Webseite gezeigt werden, wo Leser es sich drehen sehen, ohne die Seite
zu verlassen:

1. Wählen Sie unter dem Link **Einbetten**. Darunter erscheint der Code zum
   Einfügen.
2. Wählen Sie **Code zum Einbetten kopieren** und fügen Sie ihn dort ein, wo
   die Seite HTML oder eine Einbettung (ein `<iframe>`) annimmt.

Auf der Seite dreht sich das Bauwerk langsam, und seitliches Ziehen dreht es
von Hand. Titel und Ersteller stehen unten, neben **Auf ForkBuild remixen**
(**In ForkBuild öffnen**, wenn seine Lizenz keine Kopien erlaubt), das die
eigene Seite des Bauwerks in ForkBuild in einem neuen Tab öffnet (siehe
[Was ein Link öffnet](#was-ein-link-öffnet)).

- **Das Bauwerk steckt im Code**, wie in seinem Link: Es muss nichts
  verteilt werden, und die Einbettung prüft Signatur und Bauwerk, bevor sie
  es zeigt.
- **Sie bleibt still.** Die Einbettung startet keine der Verbindungen von
  ForkBuild und speichert nichts im Browser des Lesers; siehe
  [Datenschutz](Privacy.md).
- **Websites, die Links selbst einbetten** (solche mit oEmbed, etwa Notion
  und Ghost), können stattdessen den Link von **Link kopieren** bekommen:
  Sie fragen den Link-Server von ForkBuild nach der Einbettung.
- **Websites, die `<iframe>`-Code entfernen**, wie die meisten sozialen
  Netzwerke, können sie nicht zeigen; teilen Sie dort den Link oder das Bild.

Auch das Kopieren des Codes und das Zeigen oder Öffnen einer Einbettung in
ForkBuild werden anonym gezählt.

## Wer kann es finden?

Wenn Sie zum ersten Mal auf **Veröffentlichen** klicken, hat sein Blatt
**Alle können es finden**, bereits angehakt:

- **Angehakt (Alle)**: Jedes Bauwerk, das Sie veröffentlichen, wird zusätzlich an alle
  gesendet. Es erscheint unter **Entdecken**, in der Challenge der Woche und
  auf ihrem Platz sowie in der Welt, für alle, die ForkBuild nutzen, ohne
  Link, Wallet oder Konto auf beiden Seiten. Direkt nach dem
  Veröffentlichen sagt der Editor „Veröffentlicht! Es wird an alle
  gesendet …“, dann „Veröffentlicht! Jetzt können alle es finden: unter
  „Entdecken“, in der Challenge und in der Welt.“ Waren die Netzwerke nicht
  erreichbar, sagt er das und bietet **Erneut versuchen** an; der Link
  funktioniert so oder so.
- **Nicht angehakt (nur wer den Link von Ihnen bekommt)**: Das Bauwerk bleibt auf diesem Gerät
  und in seinem Link. Die Meldung sagt „Nur wer den Link von Ihnen bekommt,
  kann es sehen.“ mit **Für alle auffindbar machen**, was dieses Bauwerk
  sendet und **Alle** von da an zur Wahl macht.

Die Antwort wird auf diesem Gerät gespeichert. Nachdem ein Bauwerk an alle
gesendet wurde, hält **Ab jetzt nur per Link** in derselben Meldung Ihre
nächsten Bauwerke bei ihren Links.

So funktioniert es: Das von Ihnen signierte Bauwerk wird als *Bauwerk-Notiz*
an die öffentlichen Nostr-Relays unter **Netzwerkeinstellungen** gesendet,
zusammen mit seinen Tags und seinem Platz in der Welt. Die Notiz ist mit
einem Schlüssel signiert, den dieses Gerät dafür erstellt (sein
*Trägerschlüssel*), nicht mit Ihrer Identität, sodass nichts installiert
werden muss. Alle, die die Notiz finden, öffnen sie genau so, wie sie Ihren
Link öffnen würden: Ihre Signatur und der Inhalt des Bauwerks werden zuerst
geprüft, und eine Notiz, die nicht passt, wird ignoriert. Ein Bauwerk, das
für eine Notiz zu groß ist (etwa 2.000 Steine), sagt das; teilen Sie seinen
Link oder wählen Sie unten, wohin es geht. Ohne Namen veröffentlichte
Bauwerke lassen sich nicht senden. Siehe [Datenschutz](Privacy.md).

### Wo ein Bauwerk steht

Ein veröffentlichtes Bauwerk erhält einen eigenen Platz in der geteilten
Welt, mit Raum darum herum, sodass sich die Welt wie ein weites, offenes
Land anfühlt:

- **Hier bauen** setzt ein Bauwerk an die gewählte Stelle;
- **alles andere**, auch ein Remix, erhält seinen eigenen Platz im Raster
  der Welt, gewählt anhand des Bauwerks selbst, sodass jedes Gerät es an
  dieselbe Stelle setzt;
- ein erneutes Veröffentlichen verschiebt ein Bauwerk nie.

Eine Einsendung zur Challenge wird genauso platziert. Solange jemand den
[Challenge-Platz](#der-challenge-platz) der Woche besucht, wird sie
außerdem rund um den Platz neben den anderen Einsendungen der Woche
gezeigt, ohne sie zu verschieben.

Um einen Remix neben das Bauwerk zu stellen, das er remixt, verschieben Sie
ihn dorthin: **Verschieben …** in den
[erweiterten Werkzeugen](WorldViewAdvancedTools.md#platzierungen) der
Weltansicht.

Alle, die das Bauwerk finden, sehen es an derselben Stelle, da sein Platz
mit ihm reist, von Ihnen signiert. Bauwerke, die vom 12. bis 17. Oktober
2026 veröffentlicht wurden, kamen stattdessen rund um den Challenge-Platz
und bleiben dort, bis ihre Erbauer sie verschieben: **Auf seinen
Rasterplatz** in **Platzierung verschieben** bringt eines auf seinen
Rasterplatz (siehe
[Position in der Welt](WorldViewAdvancedTools.md#position-in-der-welt)).

## Wohin es geht — ein Bauwerk beim Veröffentlichen senden

**Veröffentlichen** behält Ihr Bauwerk auf diesem Gerät und in seinen Links,
bis Sie wählen, wohin es geht, abgesehen vom Senden an alle (oben). Direkt
nach einem Veröffentlichen bietet die Meldung **Wählen, wohin es geht** (oder
**Weitere Netzwerke**, wenn es schon an alle gesendet wurde) neben dem Link
an, und **Ausblenden**.

**Wählen, wohin es geht** öffnet den Dialog **Wohin es geht**: Wählen Sie
einen **Speicher** (wo das Bauwerk selbst liegt: Arweave, IPFS, oder Steem
bzw. Blurt, wenn deren Schreiber an sind) und ein **Substrat für
Ankündigung / Entdeckung** (wo es angekündigt wird: Nostr, Arweave, Steem
oder Blurt) und klicken Sie auf **Senden**. **Bei jedem Veröffentlichen
hierhin senden** ist anfangs angehakt: Sobald ein Senden mit Häkchen
klappt, merkt sich dieses Gerät die Wahl, und **jedes Veröffentlichen danach
sendet das Bauwerk von selbst dorthin**. Der Hinweis sagt dann „Wird an
Nostr gesendet …“, danach „Veröffentlicht und an Nostr gesendet: Jetzt
können alle es finden.“ oder, wenn ein Senden scheitert, was schiefging, mit
**Erneut versuchen** und **Ändern, wohin es geht**. Entfernen Sie das Häkchen
(im Dialog, über **Ändern, wohin es geht**), um aufzuhören; dann behält
Veröffentlichen Bauwerke wieder auf diesem Gerät. Remote Pinning wird nie
gemerkt, weil sein Token nur für den Besuch gilt; wählen Sie es jedes Mal
im Dialog.

Nur ein signiertes Bauwerk wird von selbst gesendet; **Ohne Namen
veröffentlichen** sendet nichts. Die Wallet oder Erweiterung Ihres Browsers
für dieses Netzwerk (eine Arweave-Wallet wie Wander, eine Nostr-Erweiterung
wie nos2x, Steem oder Blurt Keychain) fragt bei jedem Senden nach Ihrer
Zustimmung, und Arweave und Blurt verlangen jedes Mal eine kleine Gebühr.
Ohne eine endet das Senden mit einem schlichten Hinweis „… konnte nicht
abgeschlossen werden“, und das Bauwerk bleibt hier veröffentlicht.

Der Dialog ist derselbe, den die Weltansicht verwendet — seine Einstellungen
**Speicher** und **Substrat für Ankündigung / Entdeckung** und die getrennten
Schaltflächen **Nur Snapshot verteilen** / **Nur Signierten Anspruch
verteilen** funktionieren wie unter
[Begegnungen in der Welt](WorldViewAdvancedTools.md#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen) beschrieben. Zwei Dinge
sind hier anders: Er wirkt immer auf genau die Geteilte Welt, die Ihr Klick
auf Veröffentlichen gerade erzeugt hat, und der **Snapshot** geht zuerst,
sodass **Senden** erst den Snapshot und dann den Signierten Anspruch sendet.
Den Dialog zu schließen (**Schließen**, Klick außerhalb oder Escape) verliert
nie etwas, das er erzeugt hat.

Das Ergebnis des Signierten Anspruchs erscheint in einem eigenen
Abschnitt:

| Feld | Bedeutung |
|---|---|
| **Geteilte Welt** | Die eigene ID der Geteilten Welt — bestätigt, um welche Geteilte Welt es bei diesem Ergebnis geht. |
| **Material** | Der Ort, den der Upload ergeben hat, oder „Noch nicht hochgeladen“, wenn er nicht abgeschlossen wurde. |
| **Entdeckung** | Die Ankündigungs-ID oder „Noch nicht angekündigt“, wenn sie nicht abgeschlossen wurde — eine Zeile pro Relay, wenn mehrere konfiguriert sind. |
| **Ihr Bauwerk** | Eine Schaltfläche **Erkunden**, die direkt zur Seite dieser Veröffentlichung in der Weltansicht springt — sichtbar, sobald die Veröffentlichung etwas zum Erkunden mitbringt, was praktisch immer der Fall ist. |

**Große Bauwerke.** Arweave-Speicher nimmt einen Snapshot von bis zu
256 KB, etwa achttausend Steine. Für alles Größere wählen Sie IPFS-Speicher
(einen lokalen IPFS-Knoten oder entferntes Pinning), der keine
Größenbegrenzung hat; wählen Sie trotzdem Arweave, sagt der Abschnitt
Snapshot, wie groß das Bauwerk ist, und bittet Sie, IPFS zu wählen, und
nichts wird hochgeladen. Peers, mit denen Sie verbunden sind, können
Bauwerke bis 64 MB direkt von Ihnen holen, ganz ohne Speicher.

Das eigene Ergebnis des Snapshots — ein **Inhalts-Hash**, ein **Fundort**
und eine **Ankündigungs**-ID oder „Keine Ankündigung“ bei einer
Platzierung, die ohne eine gelungen ist — ist völlig getrennt, da
Snapshots unabhängig vom Verteilen des Signierten Anspruchs platziert und
entdeckt werden; was dieser Unterschied bedeutet, steht unter
[Lokaler Snapshot](09-PublicationsAndEvidence.md#lokaler-snapshot).

Erneutes Veröffentlichen ersetzt den ganzen Hinweis durch einen neuen für
die neue Veröffentlichung; ihn auszublenden oder die Seite zu verlassen
löscht ihn. Weder der Hinweis noch das Ergebnis eines Abschnitts wird
irgendwo gespeichert; nur, wohin Ihre Bauwerke gehen.

## Mit verbundenen Peers teilen

Ein Bauwerk, das Sie veröffentlichen, steht nur in *Ihrem* **Entdecken**,
bis es an alle gesendet wird (siehe [Wer kann es finden?](#wer-kann-es-finden))
oder Sie es auf Nostr, Arweave, Steem oder Blurt verteilen (siehe
[Verteilung](Distribution.md)): Dann findet es **Entdecken** bei allen (siehe
[Von anderen verteilte Bauwerke](#von-anderen-verteilte-bauwerke)). Um
es in **Entdecken** von jemandem zu bringen, mit dem Sie verbunden sind
(siehe [Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)),
klicken Sie in **Entdecken** darunter auf **Mit Peers teilen**. Die
Schaltfläche erscheint nur bei Ihren eigenen veröffentlichten Welten.

- Teilen bietet die Welt allen an, die gerade verbunden sind, und allen,
  die sich später verbinden. **Geteilt ✓ · Erneut teilen** kündigt sie
  den jetzt Verbundenen erneut an.
- Auf deren Seite wird eine Welt, die einer ihrer **Freunde** oder
  **bekannten Peers** geteilt hat, von selbst ihrem **Entdecken**
  hinzugefügt, samt allem, was zum **Erkunden** nötig ist. Eine Welt, die
  jemand anderes geteilt hat, wartet unter **Mit Ihnen geteilt** oben in
  ihrem **Entdecken**, bis sie auf **Abrufen** klicken. Kein Gerät lädt
  ungefragt die Welt eines Fremden herunter. Jede steht dort mit ihrem
  Titel, damit sie wählen können; ihr Gerät stellt sicher, dass die Welt,
  die sie abrufen, die ist, die dieser Titel nennt. Eine Welt, die Sie
  geteilt haben, bevor Titel mitgeschickt wurden, steht dort als „Eine von
  … geteilte Welt“, bis Sie auf **Erneut teilen** klicken.
- Die Welt wird nur von Ihnen geholt, und nur solange Sie verbunden sind:
  Sind Sie offline, wartet **Abrufen**, bis Sie zurück sind, und ein Freund
  oder bekannter Peer erhält sie, sobald Sie sich wieder verbinden. Das
  Gerät prüft, dass die Welt von Ihnen signiert ist, bevor es sie
  hinzufügt, sodass niemand eine Kopie als seine ausgeben kann.
- Wie jedes Veröffentlichen lässt sich Teilen bei denen, die es schon
  erhalten haben, nicht zurücknehmen.

## Eine Lizenz wählen

### Andere remixen lassen

Wenn Sie ein Bauwerk ohne Lizenz zum ersten Mal veröffentlichen, hat das
Blatt von Veröffentlichen **Andere dürfen es remixen**, bereits angehakt:

- **Angehakt** setzt **CC BY 4.0**: Jeder darf es kopieren und ändern,
  solange Sie genannt werden, und jeder Remix zeigt, dass er von Ihrem
  stammt.
- **Nicht angehakt** setzt **Alle Rechte vorbehalten**: Man kann darum
  herumgehen, es aber nicht kopieren.

Remixen ist das, wofür ForkBuild da ist, darum ist es zuerst
eingeschaltet. **Weiterbauen** schließt das Blatt und veröffentlicht
nichts.

Ihre Antwort wird als Lizenz des Bauwerks gespeichert, Sie werden also nur
einmal gefragt; ändern können Sie sie jederzeit in den
**Bauwerkeigenschaften**. Ein Remix trägt bereits die Lizenz seines
Originals, beim Veröffentlichen eines Remixe wird also nie gefragt.

### Alle Lizenzen

Ein veröffentlichtes Bauwerk wird immer mit einer Lizenz angezeigt,
gewählt im Dialog **Bauwerkeigenschaften**:

| Lizenz | Bedeutung |
|---|---|
| **CC0 1.0 — Gemeinfrei** | Keine Rechte vorbehalten — jeder darf alles damit tun |
| **CC BY 4.0 — Namensnennung** | Jeder darf sie remixen und wiederverwenden, unter Nennung Ihres Namens |
| **CC BY-SA 4.0 — Namensnennung, Weitergabe unter gleichen Bedingungen** | Remixe müssen dieselbe Lizenz weitertragen |
| **CC BY-NC 4.0 — Namensnennung, Nicht kommerziell** | Remixen erlaubt, kommerzielle Nutzung nicht |
| **CC BY-ND 4.0 — Namensnennung, Keine Bearbeitungen** | Ansehen erlaubt, aber **Remixen nicht** |
| **Alle Rechte vorbehalten** | Ansehen erlaubt, aber Remixen nicht |
| **Keine Lizenz angegeben** | Remixen ist nicht erlaubt, bis Sie eine festlegen |

Lassen Sie ein Bauwerk ohne Lizenz, können andere es trotzdem öffnen
und erkunden — sie können es nur nicht remixen, bis Sie eine Lizenz
wählen, die es erlaubt.

### Ein Remix behält Ihre Nennung und Ihre Bedingungen

Ein Remix Ihres Bauwerks nennt Sie und behält die Bedingungen Ihrer Lizenz,
wie auch immer sein neuer Erbauer seine Lizenz in
**Bauwerkeigenschaften** ändert:

| Ihre Lizenz | Ein Remix davon darf tragen |
|---|---|
| **CC0 1.0** | Jede Lizenz |
| **CC BY 4.0** | Jede Lizenz außer CC0, die Ihre Nennung wegfallen ließe |
| **CC BY-SA 4.0** | Nur CC BY-SA 4.0 |
| **CC BY-NC 4.0** | Nur CC BY-NC 4.0, Alle Rechte vorbehalten oder keine Lizenz, sodass ein Remix eines nicht kommerziellen Bauwerks nie eines ist, das jemand verkaufen darf |

**Bauwerkeigenschaften** bietet einem Remix nur diese Lizenzen an, sagt,
wessen Bauwerk er remixt, und behält Ihre Nennung, welche auch gewählt
wird. Ihr eigenes Bauwerk zu remixen bindet Sie an nichts: Ihre Kopie darf
jede Lizenz tragen. Gespeicherte Bilder und Videos eines Bauwerks tragen
den Namen seines Erbauers.

### Wenn Ihr Bauwerk dem eines anderen ähnelt

Wenn Sie im Editor **Veröffentlichen** drücken, vergleicht ForkBuild Ihr Bauwerk mit
Bauwerken anderer, die dieses Gerät schon gesehen hat: solchen, die Sie
geöffnet, unter **Entdecken** gefunden oder in der Welt gesehen haben. Sieht
Ihres einem davon sehr ähnlich, sagt es das vor dem Veröffentlichen: welches
Bauwerk, von wem und wie viel davon gleich ist. Wenn Sie von deren Bauwerk
ausgegangen sind, öffnen Sie es und wählen Sie stattdessen
**Eine Kopie bearbeiten**, damit die Person genannt wird und ihre
Bedingungen erhalten bleiben (siehe [So remixen Sie](#so-remixen-sie)).
Erlaubt ihre Lizenz keine Kopien, fragen Sie sie zuerst. Ist es Ihre eigene
Arbeit, wählen Sie **Es ist meins, veröffentlichen**. Es fragt einmal pro
Besuch und hält Sie nie vom Veröffentlichen ab.

Was verglichen wird und was es nicht wissen kann:

- Es zählen nur die Steine, die Sie selbst platziert haben, also ähneln sich
  zwei Bauwerke, die mit demselben fertigen Haus begonnen haben, dafür
  nicht. Fertige Strukturen aus der Baubibliothek zählen auf keiner Seite
  mit, wo auch immer sie stehen und wie auch immer sie gedreht sind, auch wenn einige ihrer Steine verändert wurden: Die veränderten Steine zählen als Ihre. Ein
  Bauwerk mit weniger als 20 eigenen Steinen wird nicht
  verglichen: Kleine Bauwerke ähneln sich zu leicht.
- Ein Stein gilt als gleich, wenn es dieselbe Art Stein an derselben Stelle
  ist, auch wenn Ihr ganzes Bauwerk woanders steht, um eine Vierteldrehung gedreht oder gespiegelt ist. Farben und die Richtung einzelner Steine
  zählen nicht.
- Zwei Bauwerke ähneln sich, wenn der größte Teil beider gleich ist oder wenn
  fast das ganze eine (85 % oder mehr) im anderen steckt, sodass auch eine
  Kopie auffällt, der eigene Steine hinzugefügt wurden. Was sie gemeinsam
  haben, müssen mindestens 20 Steine von mindestens vier Arten sein: Mauern,
  ein Boden oder ein Kasten aus einer oder zwei Arten von Steinen oder die
  Mauern und das Dach zweier kleiner Häuser ähneln sich zu oft zufällig, um
  etwas zu sagen.
- Ihre eigenen Bauwerke, jedes Bauwerk im Stammbaum Ihres Bauwerks (woraus
  es geremixt wurde, seine Remixe und jeder andere Remix derselben Familie)
  und Bauwerke, die erst nach der ersten Veröffentlichung von Ihrem
  veröffentlicht wurden, bleiben außen vor.
- Ein Bauwerk, das jemand von Hand nach einem fremden nachgebaut hat oder
  aus Steinen, die daraus kopiert oder in **Meine Strukturen** gespeichert
  wurden, gehört nicht zu dessen Stammbaum: Nur **Eine Kopie bearbeiten**
  hält diese Verbindung fest. Ein solches Bauwerk wird wie jedes andere
  verglichen, denn genau dafür sind diese Hinweise da.
- Es kennt nur die Bauwerke, die dieses Gerät gesehen hat. Findet es nichts,
  heißt das also nicht, dass niemand etwas Ähnliches gebaut hat. Es ist ein
  Hinweis, kein Urteil: Bauwerke können sich zufällig ähneln, und nur Sie
  wissen, wie Sie Ihres gebaut haben. Nichts wird gesendet oder gespeichert.

### Wenn jemand Ihr Bauwerk so nutzt, wie es seine Lizenz nicht erlaubt

ForkBuild hat kein Unternehmen und keine Moderation in der Mitte: Bauwerke
reisen von Gerät zu Gerät, und ein Video oder Bild wird von der Person
gemacht und hochgeladen, die es postet, auf einer Seite, die ForkBuild
nicht betreibt. ForkBuild kann kein Video entfernen und Sie nicht daran
beteiligen. Was es tut: Es macht Ihre Bedingungen schwer zu übersehen und
schwer zu entfernen. Jedes veröffentlichte Bauwerk zeigt seine Lizenz,
jeder Remix und jedes Video nennt Sie, und wer ein Video Ihres Bauwerks
macht, erfährt vorher, was Ihre Lizenz verlangt. Jede Kopie von ForkBuild
hält sich daran, aber es ist kein Schloss: Wer den Code der App ändert,
könnte es übergehen, und was jemand außerhalb von ForkBuild tut, liegt bei
ihm.

Wenn jemand Ihr Bauwerk entgegen Ihrer Lizenz postet oder damit Geld
verdient:

1. **Fragen Sie zuerst.** Viele kennen die Lizenz nicht und fügen gern
   Ihren Namen und Link hinzu, nehmen ein Video herunter oder teilen, was es
   einbringt.
2. **Sichern Sie die Nachweise.** Die Veröffentlichung Ihres Bauwerks ist ein
   von Ihrer Identität signierter Anspruch mit seiner Lizenz, und sie kann
   auf Arweave verankert werden, für ein Datum, das niemand später ändern
   kann (siehe
   [Signierte Einträge & externe Nachweise](09-PublicationsAndEvidence.md)).
   Bewahren Sie auch Ihre gespeicherte Kopie und einen Link dazu auf.
3. **Nutzen Sie das Verfahren der Seite.** YouTube, TikTok und die anderen
   nehmen Urheberrechtsbeschwerden von der Person entgegen, deren Werk es
   ist. Reichen Sie nur eine ein, wenn die Nutzung wirklich nicht erlaubt
   ist: Ein Video *über* ein Bauwerk, etwa eine Rezension, kann in vielen
   Ländern auch ohne Erlaubnis zulässig sein.
4. **Fragen Sie bei Ernstem eine Anwältin oder einen Anwalt.** Das
   Urheberrecht ist von Land zu Land verschieden, und diese Anleitung ist
   keine Rechtsberatung.

In ForkBuild selbst können Sie jemanden **Blockieren** (siehe
[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)), sodass
Ihr Gerät keine Verbindung mehr zu dieser Person aufbaut.

## Wählen, wer es platzieren darf

Andere können Ihr veröffentlichtes Bauwerk normalerweise in ihren eigenen
Welten platzieren. Das fügt eine Platzierung Ihres Bauwerks hinzu, nie eine
Kopie davon, und verschiebt oder verändert Ihres nie (siehe
[Warum kann ich die Bauwerke anderer platzieren?](WorldViewAdvancedTools.md#warum-kann-ich-die-bauwerke-anderer-platzieren)).
Remixen ist davon getrennt und wird durch die Lizenz geregelt (siehe
[Platzieren oder remixen](WorldViewAdvancedTools.md#platzieren-oder-remixen)). Wenn Sie
nicht möchten, dass andere es platzieren, öffnen Sie
**Bauwerkeigenschaften** und stellen Sie **Wer es in der Welt platzieren
darf** ein:

| Einstellung | Bedeutung |
|---|---|
| **Jeder darf es platzieren** | Standard. Jeder kann es in seiner eigenen Welt platzieren, wo er möchte |
| **Nur ich darf es platzieren** | Nur Sie können es platzieren. Andere können es weiterhin finden, ansehen und (wenn die Lizenz es erlaubt) remixen, aber ForkBuild lässt sie es nicht platzieren |

Die Einstellung wird beim Veröffentlichen als Teil der Veröffentlichung
signiert, sodass niemand sie danach entfernen oder ändern kann. Das heißt
auch, dass sie nur für das gilt, was Sie nach der Wahl veröffentlichen.
Eine bereits veröffentlichte Veröffentlichung behält die Einstellung, mit
der sie veröffentlicht wurde; veröffentlichen Sie also erneut, wenn die
neue gelten soll.

Sie funktioniert genauso wie die Remix-Erlaubnis der Lizenz: Jede Kopie von
ForkBuild hält sich daran, aber sie ist kein Schloss. Wer den Code der App
ändert, könnte sie ignorieren, und sie kann keine Platzierung zurücknehmen,
die jemand vor Ihrer Wahl gemacht hat.

So oder so sehen andere Ihr Bauwerk dort, wo *Sie* es hingestellt haben,
sobald Sie seinen Snapshot senden, wie es Veröffentlichen tut, sobald Sie
gewählt haben, wohin Ihre Bauwerke gehen, oder mit **Verteilen** in der
Weltansicht: Die Ankündigung trägt Ihre signierte Platzierung, und ihr
ForkBuild zeigt das Bauwerk dort, sobald es Ihre Geteilte Welt kennt.
Verschieben Sie es und verteilen Sie erneut, und es verschiebt sich auch bei
ihnen.

## Ein veröffentlichtes Bauwerk bearbeiten

Ein veröffentlichtes Bauwerk ist **unveränderlich** — es kann sich
nachträglich nie ändern. Um auf einem aufzubauen, **remixen** Sie es
(unten) oder nutzen Sie **Eine Kopie bearbeiten** in der Weltansicht. In
der Weltansicht erstellt Ihre erste Änderung an einer veröffentlichten
Welt — ihren Metadaten, einem Wahrzeichen- oder Regionsnamen oder einem
Tierschmuck — automatisch Ihre eigene Kopie mit dem Titel *„Remix von
&lt;ursprünglicher Name&gt;“*, mit einer kurzen Bestätigung („Ihre eigene
bearbeitbare Kopie wurde erstellt — … bleibt unverändert“); siehe
[Auch hier speichern und veröffentlichen](03-WorldView.md#auch-hier-speichern-und-veröffentlichen).

Das Original wird nie berührt, egal wie sehr Sie Ihre Kopie ändern.

## Entdecken

**Entdecken** in der oberen Leiste (in älteren
Versionen *Repository* genannt) ist der durchsuchbare Katalog
aller veröffentlichten Bauwerke, die dieses Gerät kennt: Ihrer eigenen, solcher, die Peers mit
Ihnen geteilt haben, und solcher, die in dezentralen Netzwerken gefunden
wurden. Es ist so gebaut, dass es benutzbar bleibt, ob es zehn Bauwerke
enthält oder zehntausend.

### Fertige Bauwerke

Oben zeigt **Mit einem fertigen Bauwerk beginnen** die Bauwerke, die mit
ForkBuild kommen: eine Burg, eine Hafeninsel, einen Dorfplatz, ein Haus,
eine Mühle und eine Brücke. Sie sind da, noch bevor etwas veröffentlicht
oder gefunden wurde. Klicken Sie auf eines (**Remixen**), um Ihre eigene
Kopie im Editor zu öffnen; veröffentlicht wird nichts, bis Sie es selbst
veröffentlichen. Ein Klick auf die Überschrift klappt die Reihe ein.

Darunter zeigt **Wie Remixe wachsen** drei Beispielfamilien, die mit
ForkBuild kommen, jede eine Kette von Remixen eines fertigen Bauwerks: das
Haus, remixt zum Haus mit Veranda, das noch zweimal remixt wurde (Haus mit
Garten und Haus mit Turm); der Wachturm, remixt zum Leuchtturm und dann zum
Leuchtturm mit Wärterhaus; und die Mühle, remixt zur Mühle mit Speicher und
dann zum Bauernhof. Jedes ist sein Vorgänger mit mehr dazu, so wie ein Remix
von Ihnen. Ein Klick auf einen Namen öffnet Ihre eigene Kopie davon. Es sind
Beispiele der App, nie die Veröffentlichungen von jemandem; Sie finden sie
auch in der Baubibliothek unter **Strukturen**, Kategorie *Sammlung*.

### Von anderen verteilte Bauwerke

Jedes Mal, wenn Sie **Entdecken** (oder eine Autorenseite) öffnen, sucht es
auf Nostr, Arweave, Steem und Blurt nach Bauwerken, die andere dort verteilt
haben, und fügt die hinzu, die es überprüfen kann. Eine Zeile über der Liste
sagt, was es gerade tut, und dann, wie viele neue Bauwerke es gefunden
hat; **Erneut prüfen** sucht noch einmal.

- Hinzugefügt wird nur ein Bauwerk, dessen signierter Eintrag die Prüfung
  besteht: signiert mit dem Schlüssel, den er nennt, und genau das
  Bauwerk, das angekündigt wurde. Alles andere wird übersprungen, und ein
  Eintrag, der durchgefallen ist, wird nicht noch einmal abgerufen.
- Es prüft bis zu 20 neue Bauwerke auf einmal. Gibt es mehr, sagt die
  Zeile, wie viele für das nächste Mal übrig sind.
- Ein so gefundenes Bauwerk bleibt auch nach dem Neuladen in Ihrem
  **Entdecken**.
- Ihr Build ist noch nicht auf Ihrem Gerät. **Erkunden** holt ihn von dort,
  wo er gespeichert wurde, prüft ihn und öffnet ihn dann in der
  Weltansicht, genau wie beim Öffnen eines geteilten Links.

```
Suche [_________________________]  ☐ Beschreibungen einbeziehen  [Suchen]

Sortieren: [Zuletzt veröffentlicht ▾]  Gruppieren: [Keine ▾]  [Karten] [Liste]

1.248 Veröffentlichungen

┌─────────────────────────────────────────┐
│  [Vorschau]  Antike Stadt                │
│              Eine Rekonstruktion einer   │
│              römischen Stadt, die …      │
│              🔒 Veröffentlicht von alice │
│              16.8.2026 · CC BY 4.0       │
│              [Öffnen] [Forken] [Erkunden]│
└─────────────────────────────────────────┘

        [← Zurück]  1 2 3 4 5 … 125  [Weiter →]
```

- **Suchen** durchsucht standardmäßig Titel und Autor. Setzen Sie das
  Häkchen bei **Beschreibungen einbeziehen**, um auch in Beschreibungen zu
  suchen — das kann einen Moment länger dauern, da mehr gelesen werden
  muss, als die Liste normalerweise braucht.
- **Sortieren** bietet fünf Reihenfolgen: Zuletzt veröffentlicht, Zuerst
  veröffentlicht, Titel A–Z, Titel Z–A und Autor A–Z.
- **Gruppieren** fasst die Ergebnisse der aktuellen Seite nach Autor,
  Datum oder Lizenz zusammen — rein zum Stöbern; es ändert nicht, was
  gefunden wird oder wie viele Seiten es gibt.
- **Karten** eignet sich am besten zum visuellen Stöbern; **Liste** ist
  eine kompakte Tabelle — wechseln Sie dorthin, wenn Sie viele Ergebnisse
  schnell überfliegen.
- Die Seitennavigation ist ausdrücklich seitenweise statt endlos
  scrollend — „Seite 5“ meint also immer dasselbe, wenn Sie später
  zurückkommen.

Jedes Bauwerk bietet drei Aktionen:

| Schaltfläche | Was sie tut |
|---|---|
| **Öffnen** | Das Bauwerk in den Editor laden |
| **Remixen** | Es in Ihr eigenes bearbeitbares Bauwerk kopieren |
| **Erkunden** | In der Weltansicht dorthin fliegen |

(Die eigene Schaltfläche **Weiter erkunden** unter **Meine Welten** —
siehe
[Meine Welten](03-WorldView.md#meine-welten--welten-in-denen-sie-wirklich-waren) —
tut dasselbe wie **Erkunden** hier, nur formuliert für eine Welt, die Sie
schon besucht haben, statt für eine, die Sie zum ersten Mal finden.)

Klicken Sie auf den **Namen eines Autors**, um seine **Autorenansicht** zu
besuchen — ein Portfolio von allem, was er gemacht hat, einschließlich
seiner Originale und aller Remixe, die daraus gewachsen sind, mit genau
demselben Katalog für Suche, Sortierung und Seiten wie **Entdecken**, nur
auf diesen einen Autor beschränkt.

Eine Karte, deren Signatur gültig ist, hat außerdem eine Schaltfläche
**Folgen**, und eine Autorenansicht zeigt **Signiert von …** mit **Folgen**
für jede Identität, die unter diesem Namen veröffentlicht hat. Jemandem zu
folgen bringt seine neuen Werke auf Ihre Seite **Gefolgt** und in Ihre
Benachrichtigungen; siehe
[Personen folgen](07-PeerConnectionsAndFriends.md#personen-folgen).

**Entdecken** ist auch nicht auf das beschränkt, was von diesem Gerät
veröffentlicht oder direkt entdeckt wurde: Ein dezentrales Bauwerk, das ein Peer Ihnen in der eigenen Karte
[Begegnungen in der Welt](WorldViewAdvancedTools.md#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
der Weltansicht gezeigt hat, kommt, sobald ihr Inhalt sich tatsächlich
auflösen lässt, ebenfalls in diese Suche und in die Autorenansicht ihres
Autors und bleibt dort auch nach einem Neuladen. Sie wird nicht anders
angezeigt als alles andere hier.

## Remixen: machen Sie es zu Ihrem eigenen

**Remixen** macht ForkBuild besonders. Wenn Sie ein Bauwerk remixen:

- Erhalten Sie eine **ganz neue, unabhängige Kopie**, die Sie frei
  bearbeiten können.
- Bleibt das **Original unberührt** — Ihre Änderungen wirken sich nie
  darauf aus.
- **Weiß die Kopie, woher sie stammt**, sodass die Nennung nie verloren
  geht.

Es funktioniert genau wie das Forken eines Projekts in Git: Sie zweigen ab,
machen Ihr eigenes Ding, und der Stammbaum behält alle im Blick. (In der
Weltansicht geschieht es außerdem automatisch, sobald Sie eine
veröffentlichte Welt ändern — siehe
[Ein veröffentlichtes Bauwerk bearbeiten](#ein-veröffentlichtes-bauwerk-bearbeiten)
oben.)

> **In der Weltansicht auch „Eine Kopie bearbeiten“ genannt.** Es ist so
> oder so derselbe Vorgang, mit denselben Lizenzregeln und derselben
> Behandlung von [Keine Kopie möglich](#wenn-ein-remix-nicht-möglich-ist).
> Die eigene Anleitung der Weltansicht dazu steht unter
> [Eine Kopie bearbeiten](03-WorldView.md#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen).

### So remixen Sie

1. Finden Sie ein Bauwerk in **Entdecken** (oder in der Weltansicht).
2. Klicken Sie auf **Remixen**.
3. Die Kopie öffnet sich im Editor, mit dem Titel *„Remix von
   &lt;ursprünglicher Name&gt;“*.
4. Bauen Sie darauf auf, speichern und veröffentlichen Sie sie dann als
   Ihre eigene.

Ihr veröffentlichter Remix erscheint mit dem Vermerk **Remix von „…“ von …**,
der auf das Original zurückverweist.

### Remix-Zähler

Die Seite eines Bauwerks und seine Karte in **Entdecken** sagen, wie oft es
geremixt wurde (**3-mal geremixt**): wie viele verschiedene Bauwerke dieses
Gerät gefunden hat, die davon geremixt und veröffentlicht wurden. Ein
zweimal veröffentlichter Remix zählt einmal, und ein Bauwerk, das niemand
geremixt hat, zeigt nichts. Der Zähler ist nur, was dieses Gerät kennt,
ein anderes Gerät kann also eine andere Zahl zeigen, und er entscheidet
nie, was zuerst gezeigt wird.

Findet dieses Gerät den Remix eines Ihrer Bauwerke von jemand anderem,
bekommt Ihre 🔔 einen Eintrag **… hat Ihr Bauwerk geremixt**, einmal pro
Remix (und Ihr Gerät zeigt ihn auch an, wenn Sie
[Benachrichtigungen auf diesem Gerät](03-WorldView.md#benachrichtigungen-auf-diesem-gerät) eingeschaltet haben).

### Herzen

Tippen Sie bei einem Bauwerk, das Ihnen gefällt, auf **♡**: im Feld
**Über dieses Bauwerk** in der Weltansicht oder auf seiner Karte unter
**Entdecken**. Es wird zu **♥** und zeigt, wem das Bauwerk gefällt:
**Gefällt Ihnen und 11 anderen**. Ein Klick auf diese Zeile zeigt alle,
jeder Name ein Link zu seiner Seite. Ein erneutes Tippen auf **♥** nimmt Ihr
Herz zurück.

Ein Herz ist öffentlich. Es wird mit dem Namen signiert, mit dem Sie
angemeldet sind, an die mit Ihnen verbundenen Personen und an das unter
**Einstellungen → Ankündigung / Entdeckung → Herzen** gewählte Netzwerk
gesendet (Nostr, solange Sie nichts ändern; andere Nostr-Apps zeigen es dort
als Like), und der Erbauer bekommt in seiner 🔔 den Eintrag **… mag Ihr
Bauwerk**. Beim ersten Mal sagt ForkBuild das, bevor es gesendet wird. Wie der
Remix-Zähler ist die Zahl nur, was dieses Gerät gefunden hat, und sie
bestimmt nie, was zuerst gezeigt wird.

### Wenn ein Remix nicht möglich ist

Gelegentlich kann ein Remix nicht durchgeführt werden — meistens beim
Remixen einer Geteilten Welt, die über einen Peer oder ein dezentrales
Netzwerk gefunden wurde (siehe
[Signierte Einträge & externe Nachweise](09-PublicationsAndEvidence.md)),
statt eines gewöhnlichen Bauwerks in **Entdecken**. Statt Sie in ein leeres,
fremdes Editor-Bauwerk zu werfen, zeigt ForkBuild einen Dialog **Keine
Kopie möglich**, der genau nennt, was schiefgegangen ist:

- **Die Lizenz dieses Bauwerks erlaubt keine Kopien.** — siehe
  [Eine Lizenz wählen](#eine-lizenz-wählen) oben.
- **Dieses Bauwerk lässt sich gerade nicht abrufen.** — die Lizenz erlaubt
  Kopien, aber das Bauwerk selbst ist noch nicht auf diesem Gerät (oder
  über einen verbundenen Peer erreichbar).

So oder so bringt Sie die einzige Schaltfläche des Dialogs, **Zurück zum
Bauwerk**, dorthin zurück, wo Sie sie gefunden haben — in die Welt,
in der sie platziert war, oder zur Geteilten Welt selbst —, statt Sie ohne
Grundlage im Editor stehen zu lassen.

## Die wöchentliche Bau-Challenge

Jede Woche stellt ForkBuild ein Thema zum Bauen (ein Leuchtturm, eine
Brücke, ein Tiny House, …), von Montag bis Ende Sonntag (UTC). Start zeigt
es, und **Challenge** in der oberen Leiste öffnet seine Seite.

Es gibt 26 Themen, sodass ein halbes Jahr vergeht, bevor eines
wiederkommt, jedes mit Ideen zum Starten und einem Kniff, der die Beiträge der Woche
verschieden macht, etwa *„Machen Sie sie breit genug für den Heuwagen.“*
Jede vierte Woche ist stattdessen eine Remix-Woche (siehe unten).

1. **Mitmachen** öffnet im Editor ein leeres Grundstück für Sie, nach dem
   Thema benannt und schon mit dem Tag der Woche (etwa
   `#lighthouse-20261012`: das Thema und der Montag, an dem es begann), und
   die Strukturen der Woche stehen oben unter **Strukturen** in der
   Baubibliothek. Die Challenge ist auch die erste Wahl unter **Neu** im
   Editor, und **Ideen zum Starten** auf der Seite öffnen stattdessen eines
   dieser Bauwerke als Ihre eigene Kopie.
2. Bauen Sie es auf Ihre Art: Setzen Sie gern eine Idee ein und machen Sie
   sie zu Ihrer. Was Sie auch bauen, nimmt teil, solange es den Tag der
   Woche behält (fügen Sie ihn unter **Bauwerkeigenschaften → Tags** hinzu,
   wenn Sie anders begonnen haben).
3. Veröffentlichen Sie es vor Ende der Woche und teilen Sie den Link. Der
   Text des Links nennt die Challenge und ihren Tag, bereit für einen Post.

**Jahreszeiten-Themen.** Manche Themen gehören zu einer Jahreszeit: ein
Garten im Frühling, ein Sommerfest, ein Erntespeicher im Herbst, eine
Winterhütte oder ein Eislaufteich. Sie sind unter die anderen Themen
verteilt, sodass etwa alle sechs Wochen eines an der Reihe ist, die
Jahreszeiten nacheinander. Die Welt der Weltansicht bleibt die ganze Woche, von Montag bis Montag,
für alle in dieser Jahreszeit, sodass die Beiträge so zu sehen sind, wie sie
gemeint sind; die Seite der Challenge sagt das, solange die Woche läuft. Für
eine frühere oder spätere Jahreszeiten-Woche schlägt sie stattdessen vor,
diese Jahreszeit in der Weltansicht unter **Jahreszeit** zu wählen.

**Remix-Wochen.** Jede vierte Woche, beginnend mit der Woche vom
2. November 2026, ist eine Remix-Woche (`#remix-20261102`): Statt eines
Themas beginnt ein Beitrag als Ihre eigene Kopie eines Beitrags der Woche
davor. **Mitmachen** führt zur Seite der Challenge, die die Beiträge der
letzten Woche listet; **Remixen** bei einem davon öffnet Ihre Kopie im
Editor, mit dem Tag der Woche. Ihre Kopie weiß, wessen sie war, damit sein
Erbauer im Stammbaum genannt wird. Gab es letzte Woche keine Beiträge,
werden stattdessen die Beispiel-Remix-Familien angeboten.

Die Seite der Challenge listet die Beiträge, die dieses Gerät kennt: Ihre
eigenen veröffentlichten Bauwerke mit dem Tag und die anderer, die in den
Netzwerken gefunden wurden. Wird ein Bauwerk über Nostr, Arweave, Steem oder Blurt verteilt, nennt seine Ankündigung (auf Blurt sein Post) seine Tags, und die Seite fragt diese
Netzwerke bei jedem Öffnen nach dem Tag der Woche (**Erneut prüfen** fragt
noch einmal). Jeder gefundene Beitrag wird geprüft wie alles, was
**Entdecken** findet, und steht auch in **Entdecken**. Ein Bauwerk, das nur per Link geteilt wurde, wird so nicht gefunden, ebenso wenig eines, das nur vor dem 8. Oktober 2026 auf Steem angekündigt wurde, als Steem-Ankündigungen begannen, Tags zu nennen. Frühere Wochen bleiben über ihren Montag erreichbar (**Letzte
Woche: …**), ohne **Mitmachen**.

Beiträge erscheinen mit den neuesten zuerst, mit ihren Remix-Zahlen.
Niemand bewertet sie und nichts wird gerankt: Die Challenge ist ein Grund,
diese Woche etwas zu bauen und zu sehen, was andere aus derselben Idee
gemacht haben.

Wenn Beiträge voneinander oder aus anderen Bauten geremixt wurden, zeigt
**Stammbäume** unter den Beiträgen, woher sie stammen, ein Baum für jede
Kette von Remixen.
Eine Woche ohne Einsendungen zeigt stattdessen die Beispielfamilien (siehe [Fertige Bauwerke](#fertige-bauwerke)).

### Der Challenge-Platz

**Spazieren** im Hauptmenü bringt dich auf den Platz dieser Woche, und
ebenso **Über den Platz gehen** auf der Challenge-Seite, sobald eine Woche
Beiträge hat. Er ist der Dorfplatz der geteilten Welt: Die sechs fertigen
Bauwerke stehen für alle immer darum herum, jedes mit **Remixen**, und
gleich außerhalb davon stehen die Beiträge der Woche. Geh zwischen ihnen umher oder wähle einen im
Panel: **Navigieren** fliegt hin, **Öffnen** öffnet ihn wie **Erkunden**,
und **Eine Kopie bearbeiten** beginnt deine eigene Kopie.

- Nur die Beiträge der Woche stehen rund um den Platz: Der Platz der
  letzten Woche zeigt die Beiträge der letzten Woche, der dieser Woche die
  dieser Woche.
- Jeder Beitrag wird, solange du auf dem Platz bist, an einer Stelle rund
  um den Platz gezeigt. Das ist eine Kopie für die Ausstellung: Der eigene
  Platz des Bauwerks, draußen in der Welt, bleibt, wo er ist. Ein Beitrag,
  der rund um den Platz platziert wurde (wie Bauwerke, die vom 12. bis
  17. Oktober 2026 veröffentlicht wurden), steht dort selbst.
- Andere Bauwerke, die in der Nähe des Platzes stehen, werden weggelassen,
  solange du auf dem Platz bist, damit er nur seine Woche zeigt. Ihnen
  passiert nichts: Sie sind wieder da, wenn du gehst.
- Das Panel listet die ersten 24 veröffentlichten Beiträge. Die übrigen
  sind auf der Challenge-Seite.
- Beiträge aus den Netzwerken werden geladen und geprüft, so wie beim
  Öffnen ihres Links. Einer, der sich nicht laden lässt, fehlt, und das
  Panel sagt, wie viele es sind.
- Ein Beitrag, dessen Veröffentlicher **Nur ich darf es platzieren**
  gewählt hat, steht nicht auf dem Platz, denn ihn dort aufzustellen hieße,
  ihn zu platzieren. Er bleibt auf der Challenge-Seite.
- Ein an seiner Stelle gezeigter Beitrag ist ein Ausstellungsstück, keine
  Platzierung: Für niemanden wird etwas signiert oder gespeichert, und er
  verschwindet, wenn du gehst.
  Wie die übrige Weltansicht zeigt der Platz, was dieses Gerät kennt, also
  sehen zwei Besucher womöglich verschiedene Beiträge.

## Der Stammbaum

Weil jeder Remix seinen Elternteil festhält, kann ForkBuild die ganze
Abstammung eines Bauwerks zeichnen. In einer **Autorenansicht** sehen Sie
einen **Remix-Baum**:

```
Mittelalterliches Haus (Original)
└─ Remix von Mittelalterliches Haus (von Bob)
   └─ Remix von Remix von … (von Carol)
```

So kann ein großartiges Bauwerk ein ganzes Ökosystem von Varianten
anstoßen — und jeder in der Kette wird genannt.

Die eigene Seite eines Baus, geöffnet über einen geteilten Link, zeigt
dieselbe Abstammung als **Stammbaum**: woraus er geremixt wurde, bis zum
Original, dann den Bau selbst, dann die Remixe daraus, soweit dieses Gerät
sie kennt. Die Challenge-Seite zeigt einen für jede Kette von Beiträgen. Jeder
Bau im Stammbaum nennt seinen Autor und die Freunde, die ihn mit ihm gebaut
haben; sein Titel öffnet den Bau, und jeder Name die Seite dieser Person.

Unter jedem Remix im Stammbaum sagt eine Zeile, was er gegenüber dem
Bauwerk darüber geändert hat (*2 Büsche, 4 Rasenstücke und 6 weitere
Steine hinzugefügt*), wenn dieses Gerät beide lesen kann. Die fertigen
Familien auf der Seite der Herausforderung zeigen dasselbe.

### Ähnliche Bauwerke, die früher veröffentlicht wurden

Unter dem Stammbaum listet die Seite eines Bauwerks Bauwerke anderer auf,
die vor ihm veröffentlicht wurden und ihm sehr ähneln, unter denen, die
dieses Gerät gesehen hat: jeweils Titel und Autor, wie viel davon gleich ist
und wann es veröffentlicht wurde. So können Sie eine Kopie Ihres Bauwerks
finden: Öffnen Sie die Seite der Kopie, und wenn Ihres zuerst veröffentlicht
wurde und ihr ähnelt, steht es dort. Bauwerke werden so verglichen wie beim
Veröffentlichen (siehe
[Wenn Ihr Bauwerk dem eines anderen ähnelt](#wenn-ihr-bauwerk-dem-eines-anderen-ähnelt)),
nur dass jeder Stein zählt, der nicht zu einer fertigen Struktur aus der Baubibliothek (auch einer teilweise veränderten) gehört, denn nur das Gerät des Bauenden weiß, welche
Steine er selbst platziert hat.

Außen vor bleiben Bauwerke desselben Bauenden (und aller, die es mit ihm
gebaut haben), der ganze Stammbaum und Bauwerke, die danach veröffentlicht
wurden. „Vorher“ richtet sich nach dem Datum, mit dem jedes Bauwerk beim Veröffentlichen signiert wurde. Dieses Datum wählt sein Erbauer, daher stützt dieses Gerät es darauf, wann es jedes Bauwerk zuerst gesehen hat: Ein Bauwerk, das nur vor diesem datiert ist, hier aber später zuerst gesehen wurde, steht als „von seinem Erbauer auf … datiert, hier zuerst gesehen am …“ in der Liste, und ein nach diesem datiertes Bauwerk, das dieses Gerät zuerst gesehen hat, als „hier vor diesem gesehen“. Eine Kopie kann sich nicht allein durch ein früheres Datum an den Anfang stellen, und die 🔔 meldet Ihnen ein vor Ihrem datiertes Bauwerk, das dieses Gerät erst jetzt sieht, mit dem Hinweis, dass es vor Ihrem datiert ist.

Bauwerke können sich zufällig ähneln oder weil sie dieselbe fertige
Struktur auf ähnliche Weise verändert haben. Ein Bauwerk in dieser Liste
heißt also nicht, dass
jemand kopiert hat. Wenn Sie glauben, dass jemand Ihr Bauwerk so nutzt, wie
es seine Lizenz nicht erlaubt, siehe
[Wenn jemand Ihr Bauwerk so nutzt, wie es seine Lizenz nicht erlaubt](#wenn-jemand-ihr-bauwerk-so-nutzt-wie-es-seine-lizenz-nicht-erlaubt).
Hat dieses Gerät kein solches Bauwerk gesehen, wird nichts aufgelistet; das
heißt nicht, dass es keine gibt.

Das Feld **Über dieses Bauwerk** in der Weltansicht listet sie auch auf,
unter den Angaben zum Bauwerk. Und wenn dieses Gerät ein Bauwerk von jemand
anderem findet, das einem Ihrer sehr ähnelt und nach ihm veröffentlicht
wurde, bekommt Ihre 🔔 einen Eintrag
**… hat ein Bauwerk veröffentlicht, das Ihrem ähnelt**, einmal pro Bauwerk,
mit dem Anteil, der gleich ist; er öffnet dieses Bauwerk, dessen Seite Ihres
auflistet (Ihr Gerät zeigt ihn auch, wenn Sie
[Benachrichtigungen auf diesem Gerät](03-WorldView.md#benachrichtigungen-auf-diesem-gerät)
eingeschaltet haben). Remixe Ihrer Bauwerke zählen hier nicht: Sie nennen
Sie und haben [eine eigene Benachrichtigung](#remix-zähler).

Bei Ihren eigenen Bauwerken, und nur dort, sagt Ihre Karte unter **Entdecken** außerdem, wie viele Bauwerke
anderer, die nach Ihrem veröffentlicht wurden, ihm sehr ähneln
(**2 später veröffentlichte Bauwerke ähneln diesem**); ein Klick zeigt sie.
Ihre eigenen Bauwerke sind die, die Sie von diesem Gerät aus veröffentlicht
haben, und von Ihren anderen Geräten die, die mit einem Namen signiert sind,
dessen Schlüssel dieses Gerät hat. Nur Sie sehen das: Keine fremde Karte wird in der Liste, die alle
durchsehen, gekennzeichnet.

## Ein typischer kreativer Kreislauf

Hier ist der ganze Weg in einem Ablauf:

1. **Bauen** Sie etwas im Editor.
2. **Speichern** Sie es.
3. **Veröffentlichen** Sie es, und senden Sie es an alle oder teilen Sie
   seinen Link.
4. Jemand **findet** es — durch Suchen, durch Erkunden in der Nähe in der
   Weltansicht oder durch Stöbern auf Ihrer Autorenseite — und **remixt**
   es.
5. Diese Person **veröffentlicht** ihren Remix.
6. Andere **erkunden** beide in der Weltansicht, und der Baum wächst.

Das ist das offene Bau-Ökosystem, für das ForkBuild gemacht ist.

## Wie geht es weiter?

Halten Sie beim Bauen die [Steuerungsreferenz](ControlsReference.md) bereit
oder kehren Sie zurück und erkunden Sie die
[Weltansicht](03-WorldView.md) genauer.
