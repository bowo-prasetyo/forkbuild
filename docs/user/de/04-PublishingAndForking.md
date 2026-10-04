<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: 1855909b2b8b1dec -->
# 04 — Veröffentlichen & Forken

<!-- languages -->
[English](../04-PublishingAndForking.md) · **Deutsch** · [Español](../es/04-PublishingAndForking.md) · [Français](../fr/04-PublishingAndForking.md) · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

<!-- stale -->
> **Hinweis:** Die englische Fassung dieser Seite wurde seit der Übersetzung geändert, daher ist diese Übersetzung möglicherweise nicht mehr aktuell. Siehe die [englische Fassung](../04-PublishingAndForking.md).
<!-- /stale -->

Das ist das Herz von ForkBuild. **Veröffentlichen** teilt Ihre Kreation mit
der Welt. **Forken** erlaubt jedem, eine Kreation zu kopieren und
weiterzuentwickeln — wobei der ganze Verlauf erhalten bleibt.

## Ihre Kreation veröffentlichen

1. Bauen Sie etwas im Editor.
2. Melden Sie sich an und stellen Sie sicher, dass Ihre Identität entsperrt
   ist (siehe [Identität & Anmeldung](05-IdentityAndLogin.md)).
   Veröffentlichen signiert die Kreation damit; abgemeldet veröffentlicht,
   hat sie keinen Autor.
3. Geben Sie ihr einen Titel — Veröffentlichen verweigert eine Kreation
   ohne Titel oder eine leere — und, optional, eine Beschreibung und eine
   Lizenz: Klicken Sie in der Seitenleiste auf **✎** neben dem
   Dokumenttitel, um **Dokumenteigenschaften** zu öffnen. Ein neues
   Dokument hat keine Lizenz, sodass niemand es forken kann, bis Sie eine
   wählen.
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
> Veröffentlichen sendet nie von selbst etwas irgendwohin. Das tun zwei
> getrennte, optionale Schritte: **Verteilen**, als Nächstes beschrieben,
> bringt die Veröffentlichung auf Arweave oder IPFS und kündigt sie auf
> Nostr oder Arweave an, damit andere sie finden können, ohne mit Ihnen
> verbunden zu sein; und
> [**Mit Peers teilen**](#mit-verbundenen-peers-teilen) bietet sie den
> Menschen an, mit denen Sie verbunden sind.

## Direkt aus dem Editor verteilen

Sobald **Veröffentlichen** gelingt, zeigt der Editor genau dort einen
kleinen Hinweis — „Geteilte Welt erfolgreich veröffentlicht.“ — mit einer
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
Sie sie auf Nostr, Arweave oder Steem verteilen (siehe
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

### Von anderen verteilte Kreationen

Jedes Mal, wenn Sie das Repository (oder eine Autorenseite) öffnen, sucht es
auf Nostr, Arweave und Steem nach Kreationen, die andere dort verteilt
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
| **Forken** | Es in Ihre eigene bearbeitbare Kreation kopieren |
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

**Forken** macht ForkBuild besonders. Wenn Sie eine Kreation forken:

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
2. Klicken Sie auf **Forken**.
3. Die Kopie öffnet sich im Editor, mit dem Titel *„Fork von
   &lt;ursprünglicher Name&gt;“*.
4. Bauen Sie darauf auf, speichern und veröffentlichen Sie sie dann als
   Ihre eigene.

Ihr veröffentlichter Fork erscheint mit dem Vermerk **„↳ Fork von …“**,
der auf das Original zurückverweist.

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
