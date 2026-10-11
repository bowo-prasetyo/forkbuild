<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: c03b4c493f0a5c98 -->
# 04 — Veröffentlichen & Forken

<!-- languages -->
[English](../04-PublishingAndForking.md) · **Deutsch** · [Español](../es/04-PublishingAndForking.md) · [Français](../fr/04-PublishingAndForking.md) · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

Das ist das Herz von ForkBuild. **Veröffentlichen** teilt Ihre Kreation mit
der Welt. **Remixen** erlaubt jedem, eine Kreation zu kopieren und
weiterzuentwickeln — wobei der ganze Verlauf erhalten bleibt.

## Ihre Kreation veröffentlichen

1. Bauen Sie etwas im Editor.
2. Melden Sie sich an und stellen Sie sicher, dass Ihre Identität entsperrt
   ist (siehe [Identität & Anmeldung](05-IdentityAndLogin.md)).
   Veröffentlichen signiert die Kreation damit. Wenn Sie nicht angemeldet
   sind, bittet **Veröffentlichen** Sie, sich zuerst anzumelden oder eine
   Identität zu erstellen; **Unsigniert veröffentlichen** veröffentlicht sie
   dort ohne Autor und ohne Link.
3. Geben Sie ihr einen Titel — Veröffentlichen verweigert eine Kreation
   ohne Titel oder eine leere — und, optional, eine Beschreibung und eine
   Lizenz: Klicken Sie in der Seitenleiste auf **✎** neben dem
   Dokumenttitel, um **Dokumenteigenschaften** zu öffnen. Ein neues
   Dokument hat keine Lizenz; beim ersten Veröffentlichen fragt ForkBuild,
   ob andere es remixen dürfen (siehe [Andere remixen lassen](#andere-remixen-lassen)).
4. Drücken Sie **Speichern**, damit sie gespeichert ist.
5. Klicken Sie auf **Veröffentlichen**.

Ihre Kreation erscheint jetzt in **Ihrem eigenen Repository** auf diesem
Gerät, wo Sie sie suchen, öffnen und forken können, mit Ihrem Namen als
Autor. Andere sehen sie erst, wenn Sie sie teilen oder verteilen (siehe den
Hinweis unten). Sie erhält außerdem automatisch eine Position in der
geteilten Welt, sodass **Erkunden** immer ein Ziel hat — siehe
[Welten finden](03-WorldView.md#welten-finden).

> **Hinweis:** Veröffentlichen speichert Ihr Dokument bzw. Ihre Welt nur
> auf diesem Gerät. Ihre Karte im Repository sagt, wo dieses Gerät das
> Verteilen festgehalten hat (zum Beispiel **Gespeichert auf IPFS ·
> Angekündigt auf Nostr**), oder **Auf diesem Gerät ist keine Verteilung
> verzeichnet.** Sichern Sie es unter [Ihre Daten](13-YourData.md), um in
> der Zwischenzeit eine Kopie zu behalten.
> Veröffentlichen sendet nie von selbst etwas irgendwohin. Ein
> [Link](#einen-link-teilen), den Sie kopieren, bringt das Bauwerk zu dem,
> dem Sie ihn geben. Das tun zwei
> getrennte, optionale Schritte: **Verteilen**, weiter unten beschrieben,
> bringt die Veröffentlichung auf Arweave oder IPFS und kündigt sie auf
> Nostr oder Arweave an, damit andere sie finden können, ohne mit Ihnen
> verbunden zu sein; und
> [**Mit Peers teilen**](#mit-verbundenen-peers-teilen) bietet sie den
> Menschen an, mit denen Sie verbunden sind.

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
- **Er braucht eine Signatur.** Veröffentlichen Sie angemeldet; eine
  abgemeldet veröffentlichte Kreation bekommt keinen Link.
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

Das Kopieren oder Teilen eines Links und das Öffnen eines Links werden
anonym gezählt, wie der tägliche Besuch; siehe
[Tägliche Besucherzählung](13-YourData.md#tägliche-besucherzählung).

### Was ein Link öffnet

Ein Link zu einem Bauwerk, ob er das Bauwerk trägt oder nennt, wo es
gespeichert ist, öffnet die eigene Seite dieses Bauwerks:

- das Bauwerk, langsam drehend;
- sein Titel und wer es gemacht hat;
- **Remix von „…“ von …**, wenn es ein Remix ist, und **N-mal geremixt**,
  wenn dieses Gerät Remixe davon gefunden hat (siehe
  [Remix-Zähler](#remix-zähler));
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

## Direkt aus dem Editor verteilen

Sobald **Veröffentlichen** gelingt, zeigt der Editor genau dort einen
kleinen Hinweis — „Veröffentlicht! Teilen Sie den Link, oder schicken Sie es mit ‚Verteilen‘ in die offenen Netzwerke, damit alle es finden.“ — mit einer
Schaltfläche **Verteilen** daneben und **Ausblenden**, um ihn zu
schließen, ohne etwas zu tun. Ein Klick auf **Verteilen** öffnet einen
Dialog **Verteilen**, statt die Einblendung mit Auswahlfeldern und
Ergebnissen zu überladen, die Sie nur gelegentlich brauchen; das Schließen
(**Schließen**, Klick außerhalb oder Escape) verliert nie etwas, das er
erzeugt hat — erneut geöffnet zeigt er genau das Ergebnis, den Fehler oder
den laufenden Zustand, in dem Sie ihn verlassen haben.

Der Dialog ist derselbe, den die Weltansicht verwendet — seine
Einstellungen **Speicher** und **Substrat für Ankündigung / Entdeckung**,
die kombinierte Schaltfläche **Verteilen** und die getrennten
Schaltflächen **Nur Snapshot verteilen** / **Nur Signierten Anspruch
verteilen** funktionieren alle wie unter
[Begegnungen in der Welt](03-WorldView.md#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
beschrieben. Zwei Dinge sind hier anders: Er wirkt immer genau auf die
Geteilte Welt, die Ihr Klick auf Veröffentlichen gerade erzeugt hat, und
der Abschnitt **Snapshot** kommt zuerst, sodass die kombinierte
Schaltfläche zuerst den Snapshot und dann den Signierten Anspruch
ausführt.

Das Ergebnis des Signierten Anspruchs erscheint in einem eigenen
Abschnitt:

| Feld | Bedeutung |
|---|---|
| **Geteilte Welt** | Die eigene ID der Geteilten Welt — bestätigt, um welche Geteilte Welt es bei diesem Ergebnis geht. |
| **Material** | Der Ort, den der Upload ergeben hat, oder „Noch nicht hochgeladen“, wenn er nicht abgeschlossen wurde. |
| **Entdeckung** | Die Ankündigungs-ID oder „Noch nicht angekündigt“, wenn sie nicht abgeschlossen wurde — eine Zeile pro Relay, wenn mehrere konfiguriert sind. |
| **Repository** | Eine Schaltfläche **Erkunden**, die direkt zur Seite dieser Veröffentlichung in der Weltansicht springt — sichtbar, sobald die Veröffentlichung etwas zum Erkunden mitbringt, was praktisch immer der Fall ist. |

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

Wie jede andere Verteilen-Schaltfläche in dieser App braucht das Verteilen
eine Browsererweiterung zum Signieren — eine Arweave-Wallet (etwa Wander)
oder eine Nostr-Erweiterung (etwa nos2x); ohne eine endet es mit einem
schlichten Hinweis „… konnte nicht abgeschlossen werden“. Veröffentlichen
selbst verteilt nie etwas von sich aus: Verteilen geschieht nur durch
diesen späteren, getrennten, ausdrücklichen Klick. Erneutes
Veröffentlichen ersetzt die ganze Einblendung durch eine neue für die neue
Veröffentlichung; sie auszublenden oder die Seite zu verlassen löscht
sie — weder der Hinweis noch das Ergebnis eines Abschnitts wird irgendwo
gespeichert.

## Mit verbundenen Peers teilen

Eine Welt, die Sie veröffentlichen, steht nur in *Ihrem* Repository, bis
Sie sie auf Nostr, Arweave, Steem oder Blurt verteilen (siehe
[Verteilung](Distribution.md)): Dann findet sie das Repository aller (siehe
[Von anderen verteilte Kreationen](#von-anderen-verteilte-kreationen)). Um
sie in das Repository von jemandem zu bringen, mit dem Sie verbunden sind
(siehe [Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)),
klicken Sie im Repository darunter auf **Mit Peers teilen**. Die
Schaltfläche erscheint nur bei Ihren eigenen veröffentlichten Welten.

- Teilen bietet die Welt allen an, die gerade verbunden sind, und allen,
  die sich später verbinden. **Geteilt ✓ · Erneut teilen** kündigt sie
  den jetzt Verbundenen erneut an.
- Auf deren Seite wird eine Welt, die einer ihrer **Freunde** oder
  **bekannten Peers** geteilt hat, von selbst ihrem Repository
  hinzugefügt, samt allem, was zum **Erkunden** nötig ist. Eine Welt, die
  jemand anderes geteilt hat, wartet unter **Mit Ihnen geteilt** oben in
  ihrem Repository, bis sie auf **Abrufen** klicken. Kein Gerät lädt
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

Wenn Sie ein Bauwerk ohne Lizenz zum ersten Mal veröffentlichen, fragt
ForkBuild **Dürfen andere es remixen?**, bevor etwas veröffentlicht wird:

- **Ja, Remixe erlauben** setzt **CC BY 4.0**: Jeder darf es kopieren und
  ändern, solange Sie genannt werden, und jeder Remix zeigt, dass er von
  Ihrem stammt.
- **Nein, nur ansehen lassen** setzt **Alle Rechte vorbehalten**: Man kann
  darum herumgehen, es aber nicht kopieren.
- **Nicht jetzt** veröffentlicht nichts.

Ihre Antwort wird als Lizenz des Bauwerks gespeichert, Sie werden also nur
einmal gefragt; ändern können Sie sie jederzeit in den
**Dokumenteigenschaften**. Ein Fork trägt bereits die Lizenz seines
Originals, beim Veröffentlichen eines Forks wird also nie gefragt.

### Alle Lizenzen

Eine veröffentlichte Kreation wird immer mit einer Lizenz angezeigt,
gewählt im Dialog **Dokumenteigenschaften**:

| Lizenz | Bedeutung |
|---|---|
| **CC0 1.0 — Gemeinfrei** | Keine Rechte vorbehalten — jeder darf alles damit tun |
| **CC BY 4.0 — Namensnennung** | Jeder darf sie forken und wiederverwenden, unter Nennung Ihres Namens |
| **CC BY-SA 4.0 — Namensnennung, Weitergabe unter gleichen Bedingungen** | Forks müssen dieselbe Lizenz weitertragen |
| **CC BY-NC 4.0 — Namensnennung, Nicht kommerziell** | Forken erlaubt, kommerzielle Nutzung nicht |
| **CC BY-ND 4.0 — Namensnennung, Keine Bearbeitungen** | Ansehen erlaubt, aber **Forken nicht** |
| **Alle Rechte vorbehalten** | Ansehen erlaubt, aber Forken nicht |
| **Keine Lizenz angegeben** | Forken ist nicht erlaubt, bis Sie eine festlegen |

Lassen Sie eine Kreation ohne Lizenz, können andere sie trotzdem öffnen
und erkunden — sie können sie nur nicht forken, bis Sie eine Lizenz
wählen, die es erlaubt.

## Wählen, wer es platzieren darf

Andere können Ihre veröffentlichte Kreation normalerweise in ihren eigenen
Welten platzieren. Das fügt eine Platzierung Ihres Bauwerks hinzu, nie eine
Kopie davon, und verschiebt oder verändert Ihres nie (siehe
[Warum kann ich die Bauwerke anderer platzieren?](03-WorldView.md#warum-kann-ich-die-bauwerke-anderer-platzieren)).
Forken ist davon getrennt und wird durch die Lizenz geregelt (siehe
[Platzieren oder forken](03-WorldView.md#platzieren-oder-forken)). Wenn Sie
nicht möchten, dass andere es platzieren, öffnen Sie
**Dokumenteigenschaften** und stellen Sie **Wer es in der Welt platzieren
darf** ein:

| Einstellung | Bedeutung |
|---|---|
| **Jeder darf es platzieren** | Standard. Jeder kann es in seiner eigenen Welt platzieren, wo er möchte |
| **Nur ich darf es platzieren** | Nur Sie können es platzieren. Andere können es weiterhin finden, ansehen und (wenn die Lizenz es erlaubt) forken, aber ForkBuild lässt sie es nicht platzieren |

Die Einstellung wird beim Veröffentlichen als Teil der Veröffentlichung
signiert, sodass niemand sie danach entfernen oder ändern kann. Das heißt
auch, dass sie nur für das gilt, was Sie nach der Wahl veröffentlichen.
Eine bereits veröffentlichte Veröffentlichung behält die Einstellung, mit
der sie veröffentlicht wurde; veröffentlichen Sie also erneut, wenn die
neue gelten soll.

Sie funktioniert genauso wie die Fork-Erlaubnis der Lizenz: Jede Kopie von
ForkBuild hält sich daran, aber sie ist kein Schloss. Wer den Code der App
ändert, könnte sie ignorieren, und sie kann keine Platzierung zurücknehmen,
die jemand vor Ihrer Wahl gemacht hat.

So oder so sehen andere Ihr Bauwerk dort, wo *Sie* es hingestellt haben,
sobald Sie seinen Snapshot aus der Weltansicht oder direkt nach dem Veröffentlichen im Editor **verteilen**: Die
Ankündigung trägt Ihre signierte Platzierung, und ihr ForkBuild zeigt das
Bauwerk dort, sobald es Ihre Geteilte Welt kennt. Verschieben Sie es und
verteilen Sie erneut, und es verschiebt sich auch bei ihnen.

## Eine veröffentlichte Kreation bearbeiten

Eine veröffentlichte Kreation ist **unveränderlich** — sie kann sich
nachträglich nie ändern. Um auf einer aufzubauen, **forken** Sie sie
(unten) oder nutzen Sie **Eine Kopie bearbeiten** in der Weltansicht. In
der Weltansicht erstellt Ihre erste Änderung an einer veröffentlichten
Welt — ihren Metadaten, einem Wahrzeichen- oder Regionsnamen oder einem
Tierschmuck — automatisch Ihre eigene Kopie mit dem Titel *„Fork von
&lt;ursprünglicher Name&gt;“*, mit einer kurzen Bestätigung („Ihre eigene
bearbeitbare Kopie wurde erstellt — … bleibt unverändert“); siehe
[Auch hier speichern und veröffentlichen](03-WorldView.md#auch-hier-speichern-und-veröffentlichen).

Das Original wird nie berührt, egal wie sehr Sie Ihre Kopie ändern.

## Das Repository

Das **Repository** ist der durchsuchbare Katalog aller veröffentlichten
Kreationen, die dieses Gerät kennt: Ihrer eigenen, solcher, die Peers mit
Ihnen geteilt haben, und solcher, die in dezentralen Netzwerken gefunden
wurden. Es ist so gebaut, dass es benutzbar bleibt, ob es zehn Kreationen
enthält oder zehntausend.

### Fertige Bauwerke

Oben zeigt **Mit einem fertigen Bauwerk beginnen** die Bauwerke, die mit
ForkBuild kommen: eine Burg, eine Hafeninsel, einen Dorfplatz, ein Haus,
eine Mühle und eine Brücke. Sie sind da, noch bevor etwas veröffentlicht
oder gefunden wurde. Klicken Sie auf eines (**Remixen**), um Ihre eigene
Kopie im Editor zu öffnen; veröffentlicht wird nichts, bis Sie es selbst
veröffentlichen. Ein Klick auf die Überschrift klappt die Reihe ein.

### Von anderen verteilte Kreationen

Jedes Mal, wenn Sie das Repository (oder eine Autorenseite) öffnen, sucht es
auf Nostr, Arweave, Steem und Blurt nach Kreationen, die andere dort verteilt
haben, und fügt die hinzu, die es überprüfen kann. Eine Zeile über der Liste
sagt, was es gerade tut, und dann, wie viele neue Kreationen es gefunden
hat; **Erneut prüfen** sucht noch einmal.

- Hinzugefügt wird nur eine Kreation, deren signierter Eintrag die Prüfung
  besteht: signiert mit dem Schlüssel, den er nennt, und genau die
  Kreation, die angekündigt wurde. Alles andere wird übersprungen, und ein
  Eintrag, der durchgefallen ist, wird nicht noch einmal abgerufen.
- Es prüft bis zu 20 neue Kreationen auf einmal. Gibt es mehr, sagt die
  Zeile, wie viele für das nächste Mal übrig sind.
- Eine so gefundene Kreation bleibt auch nach dem Neuladen in Ihrem
  Repository.
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

Jede Kreation bietet drei Aktionen:

| Schaltfläche | Was sie tut |
|---|---|
| **Öffnen** | Das Dokument in den Editor laden |
| **Remixen** | Es in Ihre eigene bearbeitbare Kreation kopieren |
| **Erkunden** | In der Weltansicht dorthin fliegen |

(Die eigene Schaltfläche **Weiter erkunden** unter **Meine Welten** —
siehe
[Meine Welten](03-WorldView.md#meine-welten--welten-in-denen-sie-wirklich-waren) —
tut dasselbe wie **Erkunden** hier, nur formuliert für eine Welt, die Sie
schon besucht haben, statt für eine, die Sie zum ersten Mal finden.)

Klicken Sie auf den **Namen eines Autors**, um seine **Autorenansicht** zu
besuchen — ein Portfolio von allem, was er gemacht hat, einschließlich
seiner Originale und aller Forks, die daraus gewachsen sind, mit genau
demselben Katalog für Suche, Sortierung und Seiten wie das Repository, nur
auf diesen einen Autor beschränkt.

Eine Karte, deren Signatur gültig ist, hat außerdem eine Schaltfläche
**Folgen**, und eine Autorenansicht zeigt **Signiert von …** mit **Folgen**
für jede Identität, die unter diesem Namen veröffentlicht hat. Jemandem zu
folgen bringt seine neuen Werke auf Ihre Seite **Gefolgt** und in Ihre
Benachrichtigungen; siehe
[Personen folgen](07-PeerConnectionsAndFriends.md#personen-folgen).

Das Repository ist auch nicht auf das beschränkt, was von diesem Gerät
veröffentlicht oder direkt entdeckt wurde: Eine dezentrale Kreation im
Repository, die ein Peer Ihnen in der eigenen Karte
[Begegnungen in der Welt](03-WorldView.md#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
der Weltansicht gezeigt hat, kommt, sobald ihr Inhalt sich tatsächlich
auflösen lässt, ebenfalls in diese Suche und in die Autorenansicht ihres
Autors und bleibt dort auch nach einem Neuladen. Sie wird nicht anders
angezeigt als alles andere hier.

## Forken: machen Sie es zu Ihrem eigenen

**Remixen** macht ForkBuild besonders. Wenn Sie eine Kreation forken:

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
[Eine veröffentlichte Kreation bearbeiten](#eine-veröffentlichte-kreation-bearbeiten)
oben.)

> **In der Weltansicht auch „Eine Kopie bearbeiten“ genannt.** Es ist so
> oder so derselbe Vorgang, mit denselben Lizenzregeln und derselben
> Behandlung von [Forken nicht möglich](#wenn-ein-fork-nicht-möglich-ist).
> Die eigene Anleitung der Weltansicht dazu steht unter
> [Eine Kopie bearbeiten](03-WorldView.md#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen).

### So forken Sie

1. Finden Sie eine Kreation im **Repository** (oder in der Weltansicht).
2. Klicken Sie auf **Remixen**.
3. Die Kopie öffnet sich im Editor, mit dem Titel *„Fork von
   &lt;ursprünglicher Name&gt;“*.
4. Bauen Sie darauf auf, speichern und veröffentlichen Sie sie dann als
   Ihre eigene.

Ihr veröffentlichter Fork erscheint mit dem Vermerk **Remix von „…“ von …**,
der auf das Original zurückverweist.

### Remix-Zähler

Die Seite eines Bauwerks und seine Repository-Karte sagen, wie oft es
geremixt wurde (**3-mal geremixt**): wie viele verschiedene Bauwerke dieses
Gerät gefunden hat, die davon geforkt und veröffentlicht wurden. Ein
zweimal veröffentlichter Remix zählt einmal, und ein Bauwerk, das niemand
geremixt hat, zeigt nichts. Der Zähler ist nur, was dieses Gerät kennt,
ein anderes Gerät kann also eine andere Zahl zeigen, und er entscheidet
nie, was zuerst gezeigt wird.

Findet dieses Gerät den Remix eines Ihrer Bauwerke von jemand anderem,
bekommt Ihre 🔔 einen Eintrag **… hat Ihr Bauwerk geremixt**, einmal pro
Remix (und Ihr Gerät zeigt ihn auch an, wenn Sie
[Benachrichtigungen auf diesem Gerät](03-WorldView.md#benachrichtigungen-auf-diesem-gerät) eingeschaltet haben).

### Wenn ein Fork nicht möglich ist

Gelegentlich kann ein Fork nicht durchgeführt werden — meistens beim
Forken einer Geteilten Welt, die über einen Peer oder ein dezentrales
Netzwerk gefunden wurde (siehe
[Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md)),
statt eines gewöhnlichen Eintrags im Repository. Statt Sie in ein leeres,
fremdes Editor-Dokument zu werfen, zeigt ForkBuild einen Dialog **Forken
nicht möglich**, der genau nennt, was schiefgegangen ist:

- **Diese Geteilte Welt kann unter ihrer Lizenz nicht geforkt werden.** —
  die Lizenz dessen, was Sie forken wollten, erlaubt es nicht (siehe
  [Eine Lizenz wählen](#eine-lizenz-wählen) oben).
- **Das Material dieser Geteilten Welt ist derzeit nicht verfügbar.** —
  die Lizenz erlaubt das Forken, aber der eigentliche Inhalt ist noch
  nicht auf diesem Gerät (oder über einen verbundenen Peer erreichbar).

So oder so bringt Sie die einzige Schaltfläche des Dialogs, **Zurück zur
Geteilten Welt**, dorthin zurück, wo Sie sie gefunden haben — in die Welt,
in der sie platziert war, oder zur Geteilten Welt selbst —, statt Sie ohne
Grundlage im Editor stehen zu lassen.

## Die wöchentliche Bau-Challenge

Jede Woche stellt ForkBuild ein Thema zum Bauen (ein Leuchtturm, eine
Brücke, ein Tiny House, …), von Montag bis Ende Sonntag (UTC). Start zeigt
es, und **Challenge** in der oberen Leiste öffnet seine Seite.

1. **Mitmachen** öffnet ein Startbauwerk im Editor als Ihre eigene Kopie,
   schon mit dem Tag der Woche (etwa `#lighthouse-20261012`: das Thema und
   der Montag, an dem es begann). Die Challenge ist auch die erste Wahl unter
   **Neu** im Editor, und **Ideen zum Starten** auf der Seite öffnen weitere
   passende Bauwerke auf dieselbe Weise.
2. Machen Sie es zu Ihrem oder beginnen Sie neu auf einem leeren
   Grundstück: Was Sie auch bauen, nimmt teil, solange es den Tag der Woche
   behält (fügen Sie ihn unter **Dokumenteigenschaften → Tags** hinzu, wenn
   Sie anders begonnen haben).
3. Veröffentlichen Sie es vor Ende der Woche und teilen Sie den Link. Der
   Text des Links nennt die Challenge und ihren Tag, bereit für einen Post.

Die Seite der Challenge listet die Beiträge, die dieses Gerät kennt: Ihre
eigenen veröffentlichten Bauwerke mit dem Tag und die anderer, die in den
Netzwerken gefunden wurden. Wird ein Bauwerk über Nostr, Arweave, Steem oder Blurt verteilt, nennt seine Ankündigung (auf Blurt sein Post) seine Tags, und die Seite fragt diese
Netzwerke bei jedem Öffnen nach dem Tag der Woche (**Erneut prüfen** fragt
noch einmal). Jeder gefundene Beitrag wird geprüft wie alles, was das
Repository findet, und steht auch im Repository. Ein Bauwerk, das nur per Link geteilt wurde, wird so nicht gefunden, ebenso wenig eines, das nur vor dem 8. Oktober 2026 auf Steem angekündigt wurde, als Steem-Ankündigungen begannen, Tags zu nennen. Frühere Wochen bleiben über ihren Montag erreichbar (**Letzte
Woche: …**), ohne **Mitmachen**.

Beiträge erscheinen mit den neuesten zuerst, mit ihren Remix-Zahlen.
Niemand bewertet sie und nichts wird gerankt: Die Challenge ist ein Grund,
diese Woche etwas zu bauen und zu sehen, was andere aus derselben Idee
gemacht haben.

Wenn Beiträge voneinander oder aus anderen Bauten geremixt wurden, zeigt
**Stammbäume** unter den Beiträgen, woher sie stammen, ein Baum für jede
Kette von Remixen.

### Der Challenge-Platz

Sobald eine Woche Beiträge hat, bringt dich **Über den Platz gehen** auf
ihrer Seite in die Weltansicht, auf eine Lichtung in der gemeinsamen Welt,
wo die Beiträge der Woche in Ringen um einen offenen Platz stehen. Geh
zwischen ihnen umher oder wähle einen im Panel: **Navigieren** fliegt hin,
**Öffnen** öffnet ihn wie **Erkunden**, und **Eine Kopie bearbeiten**
beginnt deine eigene Kopie.

- Die ersten 24 veröffentlichten Beiträge stehen dort, die ältesten der
  Mitte am nächsten, sodass ein neuer Beitrag am äußeren Rand hinzukommt.
  Die übrigen sind auf der Challenge-Seite.
- Beiträge aus den Netzwerken werden geladen und geprüft, so wie beim
  Öffnen ihres Links. Einer, der sich nicht laden lässt, fehlt, und das
  Panel sagt, wie viele es sind.
- Ein Beitrag, dessen Veröffentlicher **Nur ich darf es platzieren**
  gewählt hat, steht nicht auf dem Platz, denn ihn dort aufzustellen hieße,
  ihn zu platzieren. Er bleibt auf der Challenge-Seite.
- Die Beiträge sind Ausstellungsstücke, keine Platzierungen: Für niemanden
  wird etwas signiert oder gespeichert, und sie verschwinden, wenn du gehst.
  Wie die übrige Weltansicht zeigt der Platz, was dieses Gerät kennt, also
  sehen zwei Besucher womöglich verschiedene Beiträge.

## Der Stammbaum

Weil jeder Fork seinen Elternteil festhält, kann ForkBuild die ganze
Abstammung einer Kreation zeichnen. In einer **Autorenansicht** sehen Sie
einen **Fork-Baum**:

```
Mittelalterliches Haus (Original)
└─ Fork von Mittelalterliches Haus (von Bob)
   └─ Fork von Fork von … (von Carol)
```

So kann eine großartige Kreation ein ganzes Ökosystem von Varianten
anstoßen — und jeder in der Kette wird genannt.

Die eigene Seite eines Baus, geöffnet über einen geteilten Link, zeigt
dieselbe Abstammung als **Stammbaum**: woraus er geremixt wurde, bis zum
Original, dann den Bau selbst, dann die Remixe daraus, soweit dieses Gerät
sie kennt.

## Ein typischer kreativer Kreislauf

Hier ist der ganze Weg in einem Ablauf:

1. **Bauen** Sie eine Kreation im Editor.
2. **Speichern** Sie sie.
3. **Veröffentlichen** Sie sie im Repository.
4. Jemand **findet** sie — durch Suchen, durch Erkunden in der Nähe in der
   Weltansicht oder durch Stöbern auf Ihrer Autorenseite — und **forkt**
   sie.
5. Diese Person **veröffentlicht** ihren Fork.
6. Andere **erkunden** beide in der Weltansicht, und der Baum wächst.

Das ist das offene Bau-Ökosystem, für das ForkBuild gemacht ist.

## Wie geht es weiter?

Halten Sie beim Bauen die [Steuerungsreferenz](ControlsReference.md) bereit
oder kehren Sie zurück und erkunden Sie die
[Weltansicht](03-WorldView.md) genauer.
