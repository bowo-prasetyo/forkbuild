<!-- translation-of: docs/user/09-PublicationsAndEvidence.md source-hash: 324c4a96e01cda7a -->
# 09 — Veröffentlichungen & externe Nachweise

<!-- languages -->
[English](../09-PublicationsAndEvidence.md) · **Deutsch** · [Bahasa Indonesia](../id/09-PublicationsAndEvidence.md) · [日本語](../ja/09-PublicationsAndEvidence.md)
<!-- /languages -->

> **Teilweise experimentell.** Die Seite Veröffentlichungen ist eine
> reguläre Funktion: ihre Liste und Status, das Entfernen unbrauchbarer
> Veröffentlichungen, das Ankündigen auf Nostr oder Arweave, das Speichern
> auf IPFS oder Arweave und das Prüfen, Importieren oder Holen des
> Snapshots einer Karte. Der Rest ist **Experimentell**: Er funktioniert,
> kann sich aber in einer späteren Version ändern oder entfernt werden, und
> was er erzeugt, wird möglicherweise nicht übernommen. Die Seite
> kennzeichnet jeden solchen Teil mit einem Abzeichen **Experimentell**
> (**Exp.** auf einem Reiter): jede Art der Verankerung, die Wallets,
> Steem, entferntes IPFS-Pinning, die Reiter **Dezentralisierung &
> Nachweise**, **Platzierungen & IPFS** und **Verlauf**, die Abschnitte zu
> Besitz bei Peers und zur Zusammenfassung im Reiter **Snapshot** sowie den
> ganzen Bereich **Wallet, Archiv & Herausgeberwerkzeuge**. Die Anleitungen
> [11](11-EvidenceAndStorage.md) und [12](12-ArchiveAndLeaderboards.md)
> sagen, welche ihrer Abschnitte experimentell sind. Bauen, Speichern,
> Veröffentlichen im Repository, Forken, Identitäten und Peers hängen von
> nichts davon ab.

Nichts hiervon ist nötig, um ForkBuild zu nutzen. Überspringen Sie es, wenn
Sie nur bauen, veröffentlichen und erkunden möchten.

Die Seite **Veröffentlichungen** ist eine technischere Ebene als das
Repository. Im Repository geht es um Dokumente und Welten; auf der Seite
Veröffentlichungen geht es um **signierte Ansprüche** wie „Ich habe diese
Struktur entworfen“ oder „Ich nenne diesen Ort X“ und um die optionale
Tiefe, die Sie einem Anspruch geben können:

- **Diese Anleitung** — woher Ansprüche kommen, die Seite
  Veröffentlichungen, [Kommentare](#kommentare) und
  [Lokaler Snapshot](#lokaler-snapshot) (was Ihr Gerät besitzt).
- **[Netzwerkeinstellungen](10-NetworkSettings.md)** — Gateways, Relays,
  Anbieter und Server für Peer-Verbindungen. Nicht experimentell und für
  alle nützlich.
- **[Nachweise & Speicher](11-EvidenceAndStorage.md)** — externe Nachweise
  (Bitcoin, Base, Arweave, Steem), die Wallet-Abläufe,
  Snapshot-Platzierungen, Veröffentlichen auf IPFS und Steem.
- **[Archiv & Bestenlisten](12-ArchiveAndLeaderboards.md)** — das
  dauerhafte Beobachtungsarchiv, Verweise, Erfolge, Herausgeberkennungen
  und die Bestenlisten-Seiten.

## Zwei Bedeutungen von „veröffentlichen“

| | **Veröffentlichen** (Repository) | **Seite Veröffentlichungen** |
|---|---|---|
| Was es teilt | Ein Dokument oder eine Welt | Einen signierten Datensatz: eine Geteilte Welt, die Urheberschaft einer Struktur oder einen Ortsnamen |
| Wo Sie es sehen | Repository, Autorenansicht, Weltansicht | Die Seite **Veröffentlichungen** |
| Was Sie damit tun | Öffnen, erkunden, forken | Es prüfen, seinen Inhalt holen, es verteilen und verankern |
| Anleitung | [Veröffentlichen & Forken](04-PublishingAndForking.md) | Diese hier |

**Veröffentlichen** allein bringt eine Welt nicht auf die Seite
Veröffentlichungen. **Mit Peers teilen** tut es: Es signiert die Welt als
**Geteilte Welt**, die zu Peers reisen kann (siehe
[Eine Kreation aus dem Repository, dezentral](#eine-kreation-aus-dem-repository-dezentral)).

Die Seite Veröffentlichungen hat kein **Öffnen**, **Erkunden** oder
**Forken**, nicht einmal für eine Geteilte Welt. Sie zeigt den signierten
Datensatz, nicht die Welt. Um eine Geteilte Welt zu öffnen, zu erkunden
oder zu forken, suchen Sie sie im Repository, auf der Seite ihres Autors
oder in der Weltansicht. Eine, die Sie von einem Peer erhalten haben,
erscheint dort, sobald ihr Inhalt auf diesem Gerät ist. (Die einzige
Ausnahme ist **Im Editor öffnen** bei Ihrer eigenen Geteilten Welt, die
erneut veröffentlicht werden muss; siehe
[Bedeutung der Status](#bedeutung-der-status).)

Jeder Eintrag auf der Seite Veröffentlichungen ist eine
*Veröffentlichung*, und jede gehört zu einer von drei Arten:

| Art | Was sie ist |
|---|---|
| **Geteilte Welt** | Eine veröffentlichte Welt, als signierter Datensatz, der zwischen Peers und Netzwerken reisen kann |
| **Bauplan-Zuschreibung** | Ein Anspruch, dass Sie eine Struktur entworfen haben |
| **Ortsnamensanspruch** | Ein Name für eine Region oder ein Wahrzeichen |

Weltansicht, Editor und Repository nennen den signierten Datensatz einer
Welt ebenfalls **Geteilte Welt**, wie in **Meine Geteilte Welt**,
**Geteilte Welt entdecken** und **Zurück zur Geteilten Welt**.

## Was eine Veröffentlichung umgibt

Eine Veröffentlichung ist nur der signierte Datensatz. Alles andere, was
Sie auf ihrer Karte und um sie herum in der Weltansicht sehen, ist etwas,
das mit ihr getan oder an sie angehängt wird. Nichts davon ist eine Art
von Veröffentlichung, und nur die Veröffentlichung selbst ist
erforderlich:

| Begriff | Wie … | Was es ist |
|---|---|---|
| **Veröffentlichung** | das Buch selbst | Ein signierter Datensatz: eine Geteilte Welt, eine Bauplan-Zuschreibung oder ein Ortsnamensanspruch. Sie trägt den Hash ihres Inhalts und die Signatur ihres Herausgebers. |
| **Inhalt** | der Ort, an dem gedruckte Exemplare lagern | Die Bytes, um die es in der Veröffentlichung geht, etwa die Steine einer Welt. Sie liegen immer zuerst auf diesem Gerät; **Auf … speichern** legt eine Kopie auf IPFS, Arweave oder Steem ab, damit andere sie holen können. Siehe [Inhaltsanbieter](10-NetworkSettings.md#inhaltsanbieter). |
| **Snapshot** | ein gedrucktes Exemplar | Eine gespeicherte Kopie des Inhalts einer Veröffentlichung, etwa der Steine einer Welt, die andere holen und gegen ihren Hash prüfen können. Siehe [Lokaler Snapshot](#lokaler-snapshot). |
| **Platzierung** | das Regal, in dem das Exemplar steht | Ein signierter Nachweis, wo ein Bauwerk in der Welt steht. Eine Geteilte Welt kann mehrere haben. Siehe [Platzieren oder forken](03-WorldView.md#platzieren-oder-forken). |
| **Ankündigung / Entdeckung** | ein Eintrag im Bibliothekskatalog | Ein kleiner signierter Hinweis auf Nostr, Arweave oder Steem, dass die Veröffentlichung oder der Snapshot existiert und wo die Kopie ist, damit Menschen, die nicht mit Ihnen verbunden sind, sie finden können. Siehe [Anbieter für Ankündigung / Entdeckung](10-NetworkSettings.md#anbieter-für-ankündigung--entdeckung). |
| **Nachweis / Verankerung** *(experimentell)* | ein Notarstempel | Der Hash des Inhalts, in eine Blockchain-Transaktion geschrieben (Bitcoin, Base, Arweave oder Steem), als Nachweis, dass er zu diesem Zeitpunkt existierte. Sie speichert und kündigt nichts an. Siehe [Nachweise & Speicher](11-EvidenceAndStorage.md). |
| **Kommentare** | Leserrezensionen | Kommentare, die jeder Angemeldete an eine Veröffentlichung hängen kann, jeweils vom Kommentierenden signiert, nicht vom Herausgeber. Siehe [Kommentare](#kommentare). |

Sie erstellen also eine Veröffentlichung; dann können Sie, wenn Sie
möchten, ihren Inhalt speichern, sie ankündigen, verankern und (bei einer
Geteilten Welt) platzieren; und jeder kann sie kommentieren.

## Woher eine Veröffentlichung kommt

Auf der Seite Veröffentlichungen selbst erstellen Sie nie einen Anspruch.
Sie listet Ansprüche auf, die Sie anderswo erstellt haben, solche, die
Peers Ihnen gesendet haben, und Kreationen aus dem Repository, die in
dezentraler Form angekommen sind. Ortsnamensansprüche lassen sich auch
direkt über Nostr finden, ohne Peer; siehe
[Ortsnamen in der Nähe](03-WorldView.md#ortsnamen-in-der-nähe--ansprüche-von-jedem-entdecken).

### Die Urheberschaft einer Struktur beanspruchen

Öffnen Sie das Feld **Info** einer Struktur aus **Meine Strukturen** in der
Baubibliothek des Editors. Hat sie eine Bauplan-Identität (die meisten
gespeicherten Strukturen haben eine), bietet ihr Abschnitt **Zuschreibung
durch die Gemeinschaft**:

- **Urheberschaft beanspruchen** — signiert mit Ihrer aktuellen Identität
  einen Anspruch, dass Sie sie entworfen haben. Sichtbar, bis Sie sie
  beansprucht haben.
- **Zuschreibung exportieren** — speichert Ihren Anspruch als Datei, die
  Sie jemandem geben können.
- **Im Netzwerk veröffentlichen** — kündigt Ihren Anspruch jedem Peer an,
  mit dem Sie verbunden sind, was ihn auf dessen Seite Veröffentlichungen
  bringt, und auf Ihre.

### Einen Ort benennen

Öffnen Sie in der Weltansicht das Namensfeld einer Region oder eines
Wahrzeichens und nutzen Sie **Einen Namen veröffentlichen** (siehe
[Geografische Orte](03-WorldView.md#geografische-orte)). Das kündigt Ihren
verbundenen Peers einen signierten Anspruch an.

Damit ein Name auch über
[Ortsnamen in der Nähe](03-WorldView.md#ortsnamen-in-der-nähe--ansprüche-von-jedem-entdecken)
auffindbar ist, öffnen Sie im Namensfeld **Mehr**, suchen den Anspruch
unter **Alle Ansprüche** und klicken auf **Auf Nostr veröffentlichen**.
Das ist ein eigener Schritt: Keine der beiden Aktionen tut die andere. Ein
Erfolg nennt das erreichte Relay; ein Fehlschlag, meist weil keine
Nostr-Browsererweiterung installiert ist, zeigt den Fehler.

### Eine von einem Peer empfangen

Wenn Sie sich mit einem Peer verbinden (siehe
[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)), erhält Ihr
Gerät alles, was er veröffentlicht hat, nicht nur, was er veröffentlicht,
während Sie verbunden sind. Ein empfangener Anspruch ist nur ein gültig
signierter Datensatz: Sein Inhalt ist nicht auf Ihrem Gerät, bis Sie ihn
mit **Von Peers abrufen** (unten) holen.

### Eine Kreation aus dem Repository, dezentral

Eine Karte kann auch eine **Geteilte Welt** enthalten — dieselbe Art von
Objekt wie ein Eintrag im Repository, verpackt für die dezentrale Reise.
**Mit Peers teilen** im Repository erstellt eine für Ihre eigenen Welten
(siehe
[Mit verbundenen Peers teilen](04-PublishingAndForking.md#mit-verbundenen-peers-teilen)).
Sobald Sie eine hier mit **Erneut prüfen** oder **Von Peers abrufen**
auflösen, kommt sie in die Suche des Repositorys, auf die Seite ihres
Autors und in die Weltansicht und bleibt dort auch nach einem Neuladen.

## Die Seite Veröffentlichungen

Öffnen Sie in der oberen Leiste **Veröffentlichungen**. Sie listet jede
signierte Veröffentlichung auf, die dieses Gerät erfasst hat, Ihre oder die
eines Peers. Ganz unten enthält der eingeklappte Bereich **Wallet, Archiv &
Herausgeberwerkzeuge** seitenweite Werkzeuge in drei Reitern:
**Blockchain-Verankerung**, **Archivwerkzeuge** und **Verweise & Erfolge**
(siehe Anleitungen [11](11-EvidenceAndStorage.md) und
[12](12-ArchiveAndLeaderboards.md)). Der Link dorthin in der Einleitung
der Seite und in jedem Schritt, der zuerst eine beobachtete Wallet
braucht, öffnet ihn für Sie.

Jede Karte einer Veröffentlichung zeigt:

- Ihren Namen, sobald ihr Inhalt geprüft wurde: den Titel einer Geteilten
  Welt oder einen Ortsnamen. Andernfalls, oder bei einem
  Urheberschaftsanspruch, die Art der Veröffentlichung.
- Die Art der Veröffentlichung (unter dem Namen, wenn es einen gibt) und
  wer sie veröffentlicht hat, gekürzt auf die letzten paar Zeichen seiner
  ID.
- Ein **Statusabzeichen** (siehe
  [Bedeutung der Status](#bedeutung-der-status)), jedes Mal neu ermittelt,
  wenn die Seite lädt oder Sie auf **Erneut prüfen** klicken.
- Eine einzeilige Zusammenfassung des Anspruchs: Fingerabdruck und
  Beanspruchender einer Zuschreibung oder ein Ortsname und sein
  Beanspruchender.
- **Von Peers abrufen**, solange der Inhalt nicht verfügbar ist
  (deaktiviert, wenn kein Peer verbunden ist). Es fragt nacheinander jeden
  verbundenen Peer nach den Bytes und nimmt sie erst an, nachdem Ihr Gerät
  sie gegen den Inhalts-Hash geprüft hat.
- **Erneut prüfen** — ermittelt den Status jetzt neu.

Darunter zwei eingeklappte Abschnitte:

- **Verteilung** — die Veröffentlichung ankündigen, ihren Inhalt speichern
  und sie verankern. Speichern und Verankern beginnen jeweils mit einer
  Schaltfläche für den Anbieter, den Sie unter **Konfigurieren**
  gespeichert haben (**Auf IPFS speichern**, **Auf Steem verankern**),
  während jeder andere Anbieter unter **Weitere …optionen** eingeklappt
  ist. Ohne gespeicherten Anbieter, den sie nutzen kann, erscheinen
  stattdessen alle Optionen. Steem und entferntes IPFS-Pinning sind
  überall, wo sie angeboten werden, als **Experimentell** gekennzeichnet,
  ebenso der ganze Block **Nachweis / Verankerung**. Siehe
  [Von der Seite Veröffentlichungen verteilen](#von-der-seite-veröffentlichungen-verteilen)
  und [Nachweise & Speicher](11-EvidenceAndStorage.md).
- **Details**, in vier Reitern:

| Reiter | Was dort ist |
|---|---|
| **Snapshot** | [Lokaler Snapshot](#lokaler-snapshot): was dieses Gerät besitzt und wie man es bekommt. |
| **Dezentralisierung & Nachweise** *(Exp.)* | [Dezentralisierung](#dezentralisierung-auf-einen-blick), die [Nachweisliste](11-EvidenceAndStorage.md#die-nachweisliste) und die Transaktionsschritte für Bitcoin und Base. |
| **Platzierungen & IPFS** *(Exp.)* | Die Liste der [Snapshot-Platzierungen](11-EvidenceAndStorage.md#snapshot-platzierungen) und [Veröffentlichen auf IPFS](11-EvidenceAndStorage.md#veröffentlichen-auf-ipfs). |
| **Verlauf** *(Exp.)* | **Domänenübergreifende Zeitleiste zeigen**: jede IPFS- und Bitcoin-Beobachtung zu dieser Veröffentlichung in zeitlicher Reihenfolge. |

### Bedeutung der Status

| Abzeichen | Bedeutung |
|---|---|
| **Verfügbar** | Der Inhalt ist jetzt auf diesem Gerät. |
| **Inhalt nicht verfügbar** | Der Anspruch ist echt, aber der Inhalt ist noch nicht hier. Versuchen Sie **Von Peers abrufen**. |
| **Ungültiger Veröffentlichungsumschlag** / **Ungültige Veröffentlichungssignatur** | Der Datensatz ist fehlerhaft oder wurde nicht echt signiert. |
| **Der Inhalt passt nicht zu seinem eigenen Verweis** / **Ungültiger Inhalt** / **Ungültige Inhaltssignatur** | Der Inhalt passt nicht zu dem, was die Veröffentlichung behauptet. |
| **Eine domänenspezifische Prüfung ist fehlgeschlagen** | Wohlgeformt und signiert, besteht aber eine Prüfung nicht, die für ihre Art gilt. |
| **Nicht unterstützte Veröffentlichungsart** | Diese Version kann diese Art von Veröffentlichung nicht anzeigen. |

Diese beschreiben, ob der Datensatz gültig ist, nicht, ob das Design oder
der Name etwas taugt.

Eine Veröffentlichung, deren Status etwas anderes als **Verfügbar** oder
**Inhalt nicht verfügbar** ist, kann nicht geöffnet, verteilt oder
verankert werden und bekommt daher keine vollständige Karte. Diese werden
ganz unten auf der Seite in einer eingeklappten Gruppe „*N*
Veröffentlichungen, die nicht verwendet werden können“ gesammelt, jeweils
mit ihrem Status, dem Grund, **Erneut prüfen** und **Von diesem Gerät
entfernen**. Auch unter **Mehrere Veröffentlichungen verankern** fehlen
sie. Der häufigste Grund ist eine Veröffentlichung, die erstellt wurde,
bevor Inhalts-Hashes zu SHA-256 wurden: Nur ihr Autor kann das beheben,
indem er sie erneut veröffentlicht.

Ist eine davon **Ihre** (von einer Identität auf diesem Gerät signiert) und
nur wegen ihres alten Hashes durchgefallen, steht sie mit einem Abzeichen
**Ihre** an erster Stelle. Statt „ihr Autor muss sie erneut
veröffentlichen“ sagt sie Ihnen, wie:

| Art | So veröffentlichen Sie sie erneut |
|---|---|
| **Geteilte Welt** | Veröffentlichen Sie die Welt erneut aus dem Editor und dann im Repository darunter **Mit Peers teilen** (**Repository öffnen**). |
| **Bauplan-Zuschreibung** | Öffnen Sie im Editor das Feld **Info** der Struktur, **Für dieses Design erneut signieren**, dann **Im Netzwerk veröffentlichen** (**Editor öffnen**). |
| **Ortsnamensanspruch** | Öffnen Sie in der Weltansicht das Namensfeld des Ortes und nutzen Sie erneut **Einen Namen veröffentlichen**. |

Bei einer Welt geht die Karte noch einen Schritt weiter, wenn dieses Gerät
noch seinen eigenen Nachweis dessen hat, was Sie veröffentlicht haben: Sie
trägt den Namen der Welt (**Meine Burg** statt **Geteilte Welt**), und
**Im Editor öffnen** öffnet diese Welt, bereit zum erneuten
Veröffentlichen. Name und Link stammen aus Ihrem eigenen Nachweis, nie aus
dem Inhalt des alten Eintrags, den niemand prüfen kann. Ist der Nachweis
weg (Sie haben diese Welt inzwischen zurückgezogen), zeigt die Karte wie
oben **Repository öffnen**.

Die neue Kopie bekommt ihre eigene Karte; entfernen Sie dann die alte. Die
alte wird nie angenommen, auch wenn sie Ihre ist: Dieses Gerät speichert
auch Inhalte, die es von Peers erhalten hat, daher kann der alte Hash
nicht beweisen, welche Bytes Sie veröffentlicht haben.

**Von diesem Gerät entfernen** (oder **Alle *N* von diesem Gerät
entfernen** oben in der Gruppe) bittet um Bestätigung und vergisst die
Veröffentlichung dann hier. Es zieht nichts zurück und erreicht niemanden
sonst, und ein verbundener Peer, der die Veröffentlichung noch hat, kann
sie erneut ankündigen. Nur Veröffentlichungen in dieser Gruppe lassen
sich entfernen.

### Von der Seite Veröffentlichungen verteilen

**Verteilung → Ankündigung / Entdeckung** hat zwei Karten:

- **Veröffentlichung** kündigt die signierte Veröffentlichung selbst auf
  dem gewählten **Substrat** an (Arweave, Nostr oder Steem, das
  experimentell ist). Sie beginnt mit Ihrem
  [Anbieter für Ankündigung / Entdeckung](10-NetworkSettings.md#anbieter-für-ankündigung--entdeckung).
- **Snapshot** speichert den Inhalt unter **Inhalt** und kündigt ihn auf
  seinem eigenen **Substrat** an, das ebenfalls mit diesem Anbieter
  beginnt. Bei einer Welt ist es der eigene Snapshot der Welt, angekündigt
  zusammen mit dem Ort, an dem ihr Herausgeber sie platziert hat, wenn
  dieses Gerät diese signierte Platzierung hat — wie **Verteilen** in der
  Weltansicht. Bei jeder anderen Art ist es der Inhalt der
  Veröffentlichung, allein über seinen Hash angekündigt. Dieses Gerät
  braucht die Bytes: Bei einer Welt, die Sie nicht geöffnet haben, öffnen
  Sie sie zuerst in der Weltansicht oder holen Sie sie von einem Peer.

Das Ergebnis nennt das genutzte Substrat, etwa **Steem: Angekündigt**, und
sagt bei einer Welt, ob die Platzierung ihres Herausgebers mitging.
**Nicht angekündigt** bedeutet, dass nur die Ankündigung fehlgeschlagen
ist; der Inhalt wurde gespeichert.

## Kommentare

Jede angemeldete Identität kann jede Veröffentlichung kommentieren, die
sich auflösen lässt: eine Kreation aus dem Repository, einen
Urheberschaftsanspruch oder einen Ortsnamen. Es gibt keine Prüfung auf
Eigentum, keine Freundschaftspflicht und keine Moderation.

Kommentare finden Sie:

- im **Repository** und auf Autorenseiten: die Schaltfläche
  **Kommentieren** auf jeder Karte und in jeder Listenzeile;
- im Feld
  [Meine Geteilte Welt](03-WorldView.md#meine-geteilte-welt--ihren-eigenen-snapshot-verteilen-ohne-peers)
  der Weltansicht, in dessen Abschnitt **Kommentare**;
- bei einer ausgewählten **Begegnung in der Welt**: ihre Schaltfläche
  **Kommentieren**.

Jede zeigt die Kommentare, den ältesten zuerst, mit der Identität jedes
Autors. Angemeldet bekommen Sie ein Textfeld und **Kommentar senden**;
sonst einen Hinweis, sich anzumelden.

Kommentare sind dauerhaft: kein Bearbeiten, Löschen oder Antworten.

### Wie Kommentare reisen

Ein im **Repository** gesendeter Kommentar wird auf Ihrem Gerät
gespeichert, an die Peers gesendet, mit denen Sie verbunden sind, und im
neben **Kommentar senden** gewählten Netzwerk veröffentlicht (Nostr,
Arweave oder Steem; es beginnt mit Ihrem
[Anbieter für Ankündigung / Entdeckung](10-NetworkSettings.md#anbieter-für-ankündigung--entdeckung)),
damit auch Menschen ihn finden, die nicht verbunden waren. Das Schließen
des Abschnitts (**Kommentare ausblenden**) verwirft alles, was Sie
eingegeben, aber nicht gesendet haben. In der Weltansicht unter **Meine
Geteilte Welt** oder **Begegnungen in der Welt** gesendete Kommentare
werden vorerst nur auf Ihrem Gerät gespeichert.

Die Kommentare anderer erreichen Sie:

- von verbundenen Peers, sobald sie gesendet werden;
- aus den Netzwerken, wenn Sie die Kommentare einer Veröffentlichung
  öffnen und wann immer Sie auf **Nach neuen Kommentaren suchen** klicken.
  So sehen Sie Kommentare, die gesendet wurden, während Sie offline waren.

Die Zeile neben der Schaltfläche meldet die letzte Suche, etwa *2 neue
Kommentare gefunden* oder *Keine neuen Kommentare gefunden* (was nur die
Netzwerke abdeckt, die geantwortet haben). Ein nicht erreichbares Netzwerk
wird genannt (*Arweave nicht verfügbar*); antwortet keines, sehen Sie
*Nostr und Arweave nicht erreichbar — es werden die auf diesem Gerät
gespeicherten Kommentare angezeigt.* Nur Veröffentlichungen, deren
Kommentare Sie öffnen, werden geprüft. Die Signatur jedes geholten
Kommentars wird geprüft, und keiner wird doppelt gezählt.

Wenn jemand eine Veröffentlichung kommentiert, die Sie veröffentlicht
haben, erscheint ein Eintrag **Publication commented** (Veröffentlichung
kommentiert) in Ihrem
[Benachrichtigungsverlauf](03-WorldView.md#orientierung-und-orte) (die
Schaltfläche 🔔 in der Kopfzeile). Es ist derzeit die einzige Art von
Benachrichtigung, die ForkBuild hat.

## Lokaler Snapshot

Im Reiter **Snapshot** einer Karte beantwortet **Lokaler Snapshot** eine
Frage: Besitzt dieses Gerät gerade die Bytes für den Inhalt dieser
Veröffentlichung? Es prüft weder Signaturen noch Platzierungen und
kontaktiert das Netzwerk nur, wenn Sie auf eine der Abrufaktionen klicken.

### Prüfen, was Sie haben

**Lokalen Snapshot prüfen** (danach **Erneut prüfen**):

| Abzeichen | Bedeutung |
|---|---|
| **Verfügbar** | Die Bytes sind hier und passen zum Inhalts-Hash. |
| **Nicht verfügbar** | Unter diesem Hash wurde nie etwas gespeichert. |
| **Hash-Abweichung** | Unter diesem Hash ist etwas gespeichert, aber es passt nicht mehr. |

Zwei Menschen mit derselben Veröffentlichung können verschiedene Antworten
bekommen, weil ihr Speicher sich unterscheidet. Nach einer Prüfung lautet
eine Zeile *Publication: lokal bekannt / lokal nicht bekannt · Snapshot:
verfügbar / nicht verfügbar*: ob dieses Gerät die signierte
Veröffentlichung erfasst hat und ob es gültige Bytes besitzt.

### Die Bytes hereinholen

Drei Aktionen, jede ein eigener Klick:

**Snapshot importieren** — zeigt eine Dateiauswahl und ein Einfügefeld für
ein **Snapshot-Übertragungspaket der Veröffentlichung** (ein JSON-Bündel
mit dem Inhalt einer Veröffentlichung). Wählen Sie eines oder fügen Sie es
ein und klicken Sie dann erneut auf **Snapshot importieren**.

| Abzeichen | Bedeutung |
|---|---|
| **Importiert** | Gespeichert und gegen seinen Hash geprüft. |
| **Bereits verfügbar** | Passende Bytes waren schon hier. |
| **Import abgelehnt** | Die Bytes des Pakets passen nicht zu seinem eigenen Hash. |
| **Der Snapshot wurde nicht importiert** | Kein gültiges Paket. |

**Snapshot von Peer holen** — wählen Sie einen verbundenen Peer und
klicken Sie auf **Snapshot von Peer holen** (danach **… erneut**). Es
fragt nur diesen Peer.

| Abzeichen | Bedeutung |
|---|---|
| **Erhalten** | Die Bytes des Peers passen zum Inhalts-Hash. |
| **Bereits verfügbar** | Passende Bytes waren schon hier. |
| **Derzeit nicht verfügbar** | Der Peer hat nicht geantwortet oder hat sie nicht. |
| **Abgelehnt** | Die Bytes des Peers passten nicht. |

**Snapshot materialisieren**, aus einer Platzierung (siehe
[Snapshot-Platzierungen](11-EvidenceAndStorage.md#snapshot-platzierungen)),
ist der dritte Weg. Sobald einer der drei gelingt, nennt eine Zeile
**Quelle:** den jüngsten erfolgreichen: „Übertragungspaket“,
„Platzierung“ oder „Peer“.

### Peers fragen, was sie haben

*Experimentell*, ebenso wie die **Zusammenfassungen** unten.

**Snapshot-Besitz der Peers** fragt einen Peer, ob er die Bytes besitzt,
ohne sie zu holen: Wählen Sie einen Peer und klicken Sie auf **Beim Peer
prüfen** (danach **Erneut beim Peer prüfen**). Die Antwort, mit einer Zeit
**Beobachtet:**, lautet **Peer meldet: Snapshot verfügbar**, **Peer
meldet: Snapshot nicht verfügbar** oder **Keine Antwort vom Peer**. Eine
neue Prüfung ersetzt die letzte.

**Vergleich des Snapshot-Besitzes der Peers** fragt mehrere: Setzen Sie
Häkchen bei den Peers und klicken Sie auf **Ausgewählte Peers prüfen**
(danach **Ausgewählte Peers erneut prüfen**). Eine Tabelle zeigt die
Meldung jedes Peers (**Verfügbar**, **Nicht verfügbar** oder **Nicht
feststellbar**) und wann, sowie Summen. **Beobachtungsverlauf zeigen**
listet jede Prüfung dieses Besuchs auf, eine Zeile pro Prüfung (etwa
`20:21:04 — Alice → Verfügbar`); klicken Sie auf eine Zeile für die
vollständige Meldung, Veröffentlichung und den Inhalts-Hash. Eine Zeile
hält fest, was ein Peer in diesem Moment gesagt hat, und wird nie
umgeschrieben.

### Zusammenfassungen

- **Snapshot-Beschaffung**, oben im Abschnitt, sobald Sie etwas geprüft
  oder versucht haben: **Aktueller Besitz** (die Prüfung oben) und
  **Beschaffungsverlauf**, eine Zählung der Versuche dieses Besuchs nach
  Ergebnis und Quelle. Beides ist unabhängig: Ein gespeicherter Versuch
  heißt nicht, dass die Bytes noch hier sind. Sind sie es nicht, verweist
  ein Hinweis auf die drei Wege, sie hereinzuholen; nichts versucht es von
  selbst erneut. **Beschaffungsverlauf zeigen** listet jeden Versuch auf
  (etwa `20:16 — Peer → Hash-Abweichung`); klicken Sie auf einen für sein
  Ergebnis, die Veröffentlichung und den Inhalts-Hash.
- **Snapshot-Zustand**, darunter, stellt die Tatsachen nebeneinander, die
  Sie bei diesem Besuch gesammelt haben: **Inhalt**, **Lokaler Besitz**,
  **Beschaffung**, **Platzierungen** und **Beobachtungen der Peers**. Jeder
  Teil erscheint erst, wenn Sie ihn beobachtet haben, und sie werden nie zu
  einem Urteil zusammengefasst.

## Dezentralisierung auf einen Blick

*Experimentell.* Im Reiter **Dezentralisierung & Nachweise** vergleicht
**Dezentralisierung**, sobald eine Veröffentlichung einen Anker oder eine
Platzierung hat,
[Externe Nachweise](11-EvidenceAndStorage.md#externe-nachweise) und
[Snapshot-Platzierungen](11-EvidenceAndStorage.md#snapshot-platzierungen):

- **Publication: lokal bekannt / lokal nicht bekannt** — ob dieses Gerät
  die signierte Veröffentlichung erfasst hat.
- Zwei Karten damit, wie viele Ansprüche jeder Art bekannt sind und ob sie
  beim Inhalts-Hash übereinstimmen (**Übereinstimmung**) oder nicht
  (**Widerspruch**). Stimmt eine überein und widerspricht die andere, sagt
  das ein Satz; Übereinstimmung bei der einen bürgt nicht für die andere.
  Gibt es noch keine Ansprüche einer Art, steht dort stattdessen **Noch
  nichts zu vergleichen**.
- **Mit Peers synchronisieren** (danach **Erneut synchronisieren**) fragt
  jeden verbundenen Peer nach Ankern und Platzierungen, die Sie nicht
  haben, und meldet für jede Art **Neue Ansprüche** und **Bereits
  bekannt**.
- **Wissen des Replikats zeigen** listet für jeden Anker und jede
  Platzierung auf, wie dieses Gerät davon erfahren hat (**Beschaffung**:
  *Lokal erfahren*, *Über Paketimport erfahren* oder *Über Austausch mit
  Peers erfahren*), **Zuerst gesehen** und den aktuellen Zustand von
  **Überprüfung** / **Auflösung**. Es kontaktiert kein Netzwerk.

## Was ein Neuladen übersteht

Signierte Ansprüche und erfasste Tatsachen bleiben erhalten; Prüfungen,
Versuche und Ansichten in Arbeit nicht.

| Bleibt auf diesem Gerät | Wird beim Neuladen zurückgesetzt |
|---|---|
| Erfasste Nachweise und Platzierungen sowie das **Lokale Wissen** zu jedem | Ergebnisse von **Nachweise überprüfen** und **Snapshot auflösen** |
| Snapshot-Bytes, die Sie importiert, abgerufen oder materialisiert haben | Alles andere unter **Lokaler Snapshot**: Prüfungen, Versuchsverlauf, die Zeile **Quelle:**, Prüfungen und Vergleiche bei Peers |
| Zahlen unter **Dezentralisierung** (bei jedem Laden neu ermittelt) | Ergebnisse von **Mit Peers synchronisieren** |
| — | **Veröffentlichen auf IPFS**: die Anbieterkonfiguration, Ergebnisse, der angezeigte Verlauf und der Überprüfungsverlauf |
| Datensätze unter **Bitcoin-/Base-Ankerveröffentlichungen**, beim Finalisieren erstellt | Verbindung, Guthaben- oder Kontobeobachtung, Plan, Prüfung, Signatur, finalisierte Transaktion, Sendeergebnis und angezeigter Bestätigungs- oder Aufnahmeverlauf der Wallet-Abläufe |
| Das **Beobachtungsarchiv** der Veröffentlichungen (jede IPFS-Veröffentlichung und -Überprüfung, jedes Bitcoin-Senden, jede Bestätigung und jeder Inhaltsnachweis sowie jede Base-Aufnahme), bis **Archiv leeren** | — |
| Veröffentlichungsverweise und Herausgeberzuordnungen | Welche Karten und Zeilen Sie geöffnet hatten |
| Abgleichsentscheidungen und -beobachtungen (im Archiv aufbewahrt) | Eingefügte Peer-Archive, importierte Nachweisexporte, Filter, Vergleich von Nachweisexporten und Snapshot-Anspruch des Herausgebers |

Nach einem Neuladen sind die Ergebnisse eines Ablaufs oder einer
IPFS-Veröffentlichung weiterhin im
[Beobachtungsarchiv](12-ArchiveAndLeaderboards.md#das-beobachtungsarchiv-der-veröffentlichungen),
im Lebenszyklus eines Datensatzes oder (bei Bitcoin) unter Historische
Nachweise zu Bitcoin-Ankern zu sehen. Verbinden Sie die Wallet erneut oder
konfigurieren Sie den Pinning-Anbieter neu, um weiterzumachen.

## Wie geht es weiter?

Ihre Bauwerke teilen Sie weiterhin über
[Veröffentlichen & Forken](04-PublishingAndForking.md). Um hier weiter zu
gehen, lesen Sie [Nachweise & Speicher](11-EvidenceAndStorage.md).
