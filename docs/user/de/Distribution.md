<!-- translation-of: docs/user/Distribution.md source-hash: 5cfbb171295f8928 -->
# Ihre Arbeit verteilen

<!-- languages -->
[English](../Distribution.md) · **Deutsch** · [Español](../es/Distribution.md) · [Français](../fr/Distribution.md) · [Bahasa Indonesia](../id/Distribution.md) · [日本語](../ja/Distribution.md) · [한국어](../ko/Distribution.md) · [Português (Brasil)](../pt-BR/Distribution.md)
<!-- /languages -->

Alles, was Sie in ForkBuild machen, beginnt auf Ihrem eigenen Gerät.
**Verteilen** bringt es in dezentrale Netzwerke, sodass Menschen, die nicht
mit Ihnen verbunden sind, es finden, abrufen und prüfen können, dass es von
Ihnen ist. Es ist freiwillig und etwas anderes als Veröffentlichen.

Diese Seite zeigt, was Sie verteilen können, wohin es gehen kann und was
Sie dafür brauchen. Jeder Abschnitt verweist auf die Anleitung mit den
Einzelheiten.

## Veröffentlichen, teilen, verteilen: drei verschiedene Dinge

| Aktion | Wohin es geht | Wer es bekommt | Anleitung |
|---|---|---|---|
| **Veröffentlichen** | Dieses Gerät, und sobald Sie gewählt haben, wohin Ihre Bauwerke gehen, auch dorthin | Bis dahin niemand sonst; danach alle | [Ihre Kreation veröffentlichen](04-PublishingAndForking.md#ihre-kreation-veröffentlichen), [Wohin es geht](04-PublishingAndForking.md#wohin-es-geht--ein-bauwerk-beim-veröffentlichen-senden) |
| **Mit Peers teilen** | Direkt zu den Menschen, mit denen Sie verbunden sind | Ihre verbundenen Peers, solange Sie online sind | [Mit verbundenen Peers teilen](04-PublishingAndForking.md#mit-verbundenen-peers-teilen) |
| **Verteilen** | Dezentrale Netzwerke (IPFS, Arweave, Nostr, Steem, Blurt) | Jeder, ganz ohne Verbindung zu Ihnen | Diese Seite |

Veröffentlichen sendet von selbst nichts irgendwohin, bis Sie wählen, wohin
Ihre Bauwerke gehen. Das wählen Sie im Editor unter **Wohin es geht**: Mit
angehaktem **Bei jedem Veröffentlichen hierhin senden** wird jedes
Veröffentlichen eines signierten Bauwerks auch dorthin verteilt. Entfernen
Sie das Häkchen, um aufzuhören.

Mit Peers teilen ist kein Verteilen. Peers behalten eine Kopie nur so
lange, wie sie möchten, und sonst kann sie niemand finden.

## Die drei Rollen, die ein Netzwerk spielen kann

Beim Verteilen kommen bis zu drei Arten von Netzwerk zum Einsatz, jede
getrennt gewählt:

| Rolle | Wie … | Was sie tut | Auswahl |
|---|---|---|---|
| **Inhalt** (Speicher) | Der Ort, an dem gedruckte Exemplare aufbewahrt werden | Hält die Bytes, etwa die Steine Ihrer Welt, damit andere sie abrufen können | **Arweave**, **Blurt** *(experimentell)*, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(experimentell)* |
| **Ankündigung / Entdeckung** | Ein Eintrag im Bibliothekskatalog | Veröffentlicht einen kleinen signierten Hinweis, dass Ihre Arbeit existiert und wo ihre Kopie liegt, damit andere sie finden können | **Nostr**, **Arweave**, **Steem** *(experimentell)*, **Blurt** *(experimentell)* |
| **Nachweis / Verankerung** *(experimentell, optional)* | Der Stempel eines Notars | Schreibt den Hash Ihres Inhalts in eine Blockchain, als Nachweis, dass er zu diesem Zeitpunkt existierte. Er speichert und kündigt nichts an. | **Bitcoin**, **Arweave**, **Base**, **Steem**, **Blurt** |

Die ersten beiden brauchen Sie zusammen. Gespeicherte Arbeit ohne
Ankündigung ist schwer zu finden, und eine Ankündigung ohne Gespeichertes
verweist auf nichts. **Verteilen** erledigt beides mit einem Klick.
Verankern ist ein Extra und geschieht separat auf der Seite
**Veröffentlichungen**.

Legen Sie Ihre übliche Wahl für jede Rolle unter
[Netzwerkeinstellungen](10-NetworkSettings.md) fest:
[Inhaltsanbieter](10-NetworkSettings.md#inhaltsanbieter),
[Anbieter für Ankündigung / Entdeckung](10-NetworkSettings.md#anbieter-für-ankündigung--entdeckung)
und [Nachweis-/Verankerungsanbieter](10-NetworkSettings.md#nachweis-verankerungsanbieter).
Diese füllen nur die erste Auswahl jeder Liste vor; sie zu speichern sendet
nie etwas.

## Was Sie verteilen können

| Was | Inhalt | Ankündigung / Entdeckung | Nachweis / Verankerung | Wo Sie es tun |
|---|---|---|---|---|
| **Der Signierte Anspruch Ihrer Welt** (der signierte Eintrag einer veröffentlichten Welt, genannt Geteilte Welt) | Arweave, IPFS, Steem oder Blurt | Nostr, Arweave, Steem oder Blurt | — | **Verteilen** nach dem Veröffentlichen im Editor; **Meine Geteilte Welt** in der Weltansicht; die Seite **Veröffentlichungen** |
| **Der Snapshot Ihrer Welt** (ihre Steine), mit dem Ort, an dem Sie sie platziert haben | Arweave, IPFS, Steem oder Blurt | Nostr, Arweave, Steem oder Blurt | — | Dieselben **Verteilen**-Dialoge (**Nur Snapshot verteilen** für nur diese Hälfte) |
| **Der Inhalts-Hash jeder Veröffentlichung** (eine Welt, ein Urheberschaftsanspruch oder ein Ortsname) | — | — | Bitcoin, Arweave, Base, Steem oder Blurt | Die Karte der Veröffentlichung auf der Seite **Veröffentlichungen** |
| **Die Urheberschaft einer Struktur** (Bauplan-Zuschreibung) | Arweave, IPFS, Steem oder Blurt | Nostr, Arweave, Steem oder Blurt | — | **Verteilen** im **Info**-Feld der Struktur, angeboten, sobald Sie **Im Netzwerk veröffentlichen**; die Seite **Veröffentlichungen** |
| **Ein Ortsname** (Ortsnamensanspruch) | Arweave, IPFS, Steem oder Blurt | Nostr, Arweave, Steem oder Blurt | — | **Verteilen** im Benennungsfeld der Weltansicht, angeboten, sobald Sie **Einen Namen veröffentlichen** (es kündigt den Namen im gewählten Netzwerk an); die Seite **Veröffentlichungen** für alle diese |
| **Ein Kommentar** zu einer Veröffentlichung | — | Nostr, Arweave, Steem oder Blurt, oder keines (**Nur lokal & Peers**) | — | **Kommentar senden**, unter Entdecken oder in der Weltansicht, im daneben gewählten Netzwerk; später **Verteilen** unter Ihrem eigenen Kommentar |

Der Snapshot einer Welt trägt Ihre signierte Platzierung mit sich, sodass
Menschen, die ihn abrufen, den Bau genau dort sehen, wo Sie ihn hingestellt
haben.

### Signierter Anspruch und Snapshot: zwei Hälften einer Welt

Eine veröffentlichte Welt wird in zwei getrennten Teilen verteilt:

| | Signierter Anspruch | Snapshot |
|---|---|---|
| **Wie …** | Eine notariell beglaubigte Katalogkarte | Das gedruckte Exemplar im Regal, beschriftet mit seinem Standort |
| **Was er enthält** | Den Titel der Welt, Sie als Urheber, ihre Lizenz, die Welt, von der sie geforkt wurde (falls vorhanden), und ihren **Inhalts-Hash**, einen Fingerabdruck der Steine, alles mit Ihrer Identität signiert | Jeden Stein der Welt, dazu Ihre signierte Platzierung: wo Sie sie in der Weltansicht hingestellt haben |
| **Größe** | Ein paar Kilobyte | So groß wie das Bauwerk: bis zu 256 KB auf Arweave, ohne Grenze auf IPFS |
| **Was er beweist** | Dass Sie diese Welt veröffentlicht haben, mit genau diesem Fingerabdruck | Für sich allein nichts; wer ihn abruft, prüft die Steine gegen den Inhalts-Hash |
| **Wofür er dient** | Teilen-Links, und **Geteilte Welt entdecken**, das Ihre Welt nachschlägt und prüft | Ihr Bauwerk in der Weltansicht, dort wo Sie es platziert haben, Menschen zu zeigen, die in der Nähe unterwegs sind |

Der Inhalts-Hash verbindet die beiden: Wer die Steine hat, kann prüfen, dass
sie zum Fingerabdruck in Ihrem signierten Eintrag passen.

Beide Hälften nutzen beide Rollen: Jede wird im gewählten Inhalts-Netzwerk
gespeichert und im gewählten Netzwerk für Ankündigung / Entdeckung
angekündigt. Mit IPFS und Nostr zum Beispiel speichert **Verteilen** den
Snapshot auf IPFS und kündigt ihn auf Nostr an, dann speichert es den
Signierten Anspruch auf IPFS und kündigt auch ihn auf Nostr an.

Jede Hälfte ist für sich nützlich. Deshalb melden die **Verteilen**-Dialoge
sie getrennt und lassen Sie eine davon mit **Nur Snapshot verteilen** oder
**Nur Signierten Anspruch verteilen** erneut versuchen:

- **Nur Snapshot:** Ihr Bauwerk erscheint in der Weltansicht für Menschen in
  der Nähe, aber kein signierter Eintrag der Veröffentlichung steht dahinter.
- **Nur Signierter Anspruch:** Man kann Ihre Welt finden und bestätigen, dass
  sie Ihnen gehört, ihre Steine aber nicht aus den Netzwerken abrufen. Peers,
  mit denen Sie verbunden sind, können sie weiterhin direkt von Ihnen
  bekommen, solange Sie online sind.

Einzelheiten:

- Signierter Anspruch und Snapshot:
  [Wohin es geht](04-PublishingAndForking.md#wohin-es-geht--ein-bauwerk-beim-veröffentlichen-senden),
  [Meine Geteilte Welt](WorldViewAdvancedTools.md#meine-geteilte-welt--ihren-eigenen-snapshot-verteilen-ohne-peers)
  und der [Verteilen-Dialog](WorldViewAdvancedTools.md#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
  selbst.
- Die Seite Veröffentlichungen:
  [Von der Seite Veröffentlichungen verteilen](09-PublicationsAndEvidence.md#von-der-seite-veröffentlichungen-verteilen),
  [Snapshot-Platzierungen](11-EvidenceAndStorage.md#snapshot-platzierungen) und
  [Veröffentlichen auf IPFS](11-EvidenceAndStorage.md#veröffentlichen-auf-ipfs).
- Verankern: [Externe Nachweise](11-EvidenceAndStorage.md#externe-nachweise),
  [Der Ablauf für Bitcoin-Anker](11-EvidenceAndStorage.md#der-ablauf-für-bitcoin-anker)
  und [Der Ablauf für Base-Anker](11-EvidenceAndStorage.md#der-ablauf-für-base-anker).
- Urheberschaft: [Die Urheberschaft einer Struktur beanspruchen](09-PublicationsAndEvidence.md#die-urheberschaft-einer-struktur-beanspruchen).
- Ortsnamen: [Einen Ort benennen](09-PublicationsAndEvidence.md#einen-ort-benennen).
- Kommentare: [Wie Kommentare reisen](09-PublicationsAndEvidence.md#wie-kommentare-reisen).

## Was bei Ihnen oder Ihren Peers bleibt

Nicht alles, was Sie erstellen, wird verteilt. Folgendes geht nie in die
oben genannten Netzwerke:

| Was | Wohin es geht | Anleitung |
|---|---|---|
| Eine Welt, die Sie **Mit Peers teilen** | Nur zu Ihren verbundenen Peers | [Mit verbundenen Peers teilen](04-PublishingAndForking.md#mit-verbundenen-peers-teilen) |
| Die aktuelle Position und das Aussehen Ihres Avatars | Verbundene Peers, so wie Ihre Sichtbarkeitseinstellungen es erlauben | [Wer Sie sehen kann](06-AvatarsAndPresence.md#wer-sie-sehen-kann-zwei-unabhängige-einstellungen) |
| Chatnachrichten und Sprachanrufe | Direkt an den Freund, mit dem Sie sprechen | [Chat & Unterhaltungen](08-ChatAndConversations.md) |
| Anker und Platzierungen, die Sie mit **Mit Peers synchronisieren** austauschen | Nur zu Ihren verbundenen Peers | [Dezentralisierung auf einen Blick](09-PublicationsAndEvidence.md#dezentralisierung-auf-einen-blick) |
| Ihre Identität, gespeicherte Strukturen, Fahrzeuge und Tiere, die Sie mitführen, Freunde, Einstellungen | Dieses Gerät, sofern Sie sie nicht exportieren oder sichern | [Ihre Daten](13-YourData.md) |

Um diese auf ein anderes Gerät zu bringen oder jemandem zu geben, nutzen Sie
die Exporte und die vollständige Sicherung unter [Ihre Daten](13-YourData.md).

## Was jedes Netzwerk braucht

Verteilen wird von einer Browsererweiterung oder Wallet signiert, die Sie
selbst installieren; ForkBuild sieht Ihre Schlüssel nie. Ohne die passende
Erweiterung endet der Versuch mit einem Hinweis, dass er nicht abgeschlossen
werden konnte.

| Netzwerk | Rollen | Sie brauchen | Grenzen und Hinweise |
|---|---|---|---|
| **Nostr** | Ankündigung / Entdeckung | Eine signierende Nostr-Erweiterung, etwa nos2x | Kündigt bei jedem Relay unter [Nostr-Relays](10-NetworkSettings.md#nostr-relays) gleichzeitig an; mehr Relays heißt, mehr Menschen können Sie finden |
| **Arweave** | Inhalt, Ankündigung / Entdeckung, Nachweis / Verankerung | Eine Arweave-Wallet-Erweiterung, etwa Wander | Speichert bis zu 256 KB pro Snapshot, etwa achttausend Steine; alles Größere wird vor dem Signieren abgelehnt. Dauerhaft: bleibt verfügbar, wenn Ihr Computer aus ist. Ein neuer Upload kann einige Minuten brauchen, bis er die Gateways erreicht. |
| **IPFS (Local Kubo)** | Inhalt | Ihr eigener IPFS-Knoten, standardmäßig unter `http://127.0.0.1:5001` | Keine Größenbegrenzung. Nur verfügbar, solange Ihr Knoten online ist, es sei denn, jemand anderes pinnt es. |
| **IPFS (Remote Pinning)** *(experimentell)* | Inhalt | Ein Konto bei einem Pinata-kompatiblen Pinning-Dienst | Keine Größenbegrenzung. Richten Sie den Dienst einmal unter [Inhaltsanbieter](10-NetworkSettings.md#inhaltsanbieter) ein; das Token wird einmal pro Besuch abgefragt und nie gespeichert. |
| **Steem** *(experimentell)* | Inhalt, Ankündigung / Entdeckung, Nachweis / Verankerung | Die Erweiterung Steem Keychain mit Ihrem Posting-Schlüssel und Ihr Konto unter [Netzwerkeinstellungen → Steem](10-NetworkSettings.md#steem) | Beiträge sind Antworten auf die monatlichen Threads von ForkBuild; eine Bestätigung pro Beitrag. Speichert etwa 2.500 Steine pro Beitrag, bis zu etwa 30.000 Steine in 20 Beiträgen. Verbraucht Resource Credits, die sich wieder auffüllen. |
| **Blurt** *(experimentell)* | Inhalt, Ankündigung / Entdeckung, Nachweis / Verankerung | Die Erweiterung Blurt Keychain (oder WhaleVault) mit Ihrem Posting-Schlüssel und Ihr Konto unter [Netzwerkeinstellungen → Blurt](10-NetworkSettings.md#blurt) | Ein Hauptbeitrag von Ihrem eigenen Konto pro Bauwerk, der seine Auszahlung behält; gespeicherte Daten stehen in Antworten darunter. Speichert etwa 2.500 Steine pro Antwort, bis zu etwa 30.000 Steine. Jede Transaktion kostet eine kleine Gebühr in BLURT. |
| **Bitcoin** *(experimentell)* | Nachweis / Verankerung | Die Erweiterung UniSat, mit Bitcoin auf einer nativen SegWit-Adresse (`bc1q…`) für die Gebühr | Erstellt über die Wallet-Schritte auf der Seite Veröffentlichungen |
| **Base** *(experimentell)* | Nachweis / Verankerung | Eine Browser-Wallet wie MetaMask oder Coinbase Wallet, im Netzwerk Base | Jeder Anker ist eine Transaktion, die Sie prüfen und signieren |

Ein Steem-Anker ist schnell und kostenlos, wird aber von den Witnesses von
Steem bezeugt statt durch Proof of Work: Nutzen Sie ihn zusätzlich zu einem
Bitcoin-Anker, nicht stattdessen. Siehe [Steem](11-EvidenceAndStorage.md#steem). Dasselbe gilt für
einen Blurt-Anker, der nichts kostet, wenn der Blurt-Beitrag Ihres Bauwerks
bereits dessen Inhalts-Hash trägt; siehe [Blurt](11-EvidenceAndStorage.md#blurt).

## Ein typischer Weg

1. **Veröffentlichen** Sie Ihre Welt im Editor (siehe
   [Ihre Kreation veröffentlichen](04-PublishingAndForking.md#ihre-kreation-veröffentlichen)).
2. Klicken Sie in dem erscheinenden Hinweis auf **Verteilen**. Sie können es
   auch später tun, in der Weltansicht unter **Meine Geteilte Welt**.
3. Wählen Sie einen **Speicher** und ein **Substrat für Ankündigung /
   Entdeckung**: zum Beispiel IPFS und Nostr, oder Arweave für beides.
   Klicken Sie auf **Verteilen**.
4. Es sendet den Snapshot, dann den Signierten Anspruch, und zeigt für
   jedes ein Ergebnis. Schlägt eine Hälfte fehl, wiederholen Sie nur diese
   mit ihrer eigenen Schaltfläche **Nur … verteilen**.
5. *Optional:* Verankern Sie die Veröffentlichung auf der Seite
   **Veröffentlichungen** (zum Beispiel mit **Auf Arweave verankern**), um
   festzuhalten, wann sie existierte.
6. Klicken Sie unter dem Ergebnis auf **Teilen …** oder **Link kopieren**.
   Der Link öffnet Ihr Bauwerk auf jedem Gerät, bereit zum Remixen oder für
   einen Rundgang.

Ein Bauwerk, das für Arweave zu groß ist (über 256 KB), kann stattdessen
auf IPFS. Peers, mit denen Sie verbunden sind, können Bauwerke bis 64 MB
direkt von Ihnen abrufen.

## Prüfen, ob es geklappt hat

- **Auf Ihrer eigenen Karte.** Die Karte Ihres Bauwerks unter
  **Entdecken** zeigt, wo dieses Gerät das Verteilen festgehalten hat: zum
  Beispiel **Gespeichert auf IPFS · Angekündigt auf Nostr** oder **Auf
  diesem Gerät ist keine Verteilung verzeichnet.** Siehe
  [Ihre Veröffentlichungen](13-YourData.md#ihre-veröffentlichungen).
- **Für andere.** Deren **Entdecken** findet Ihr Bauwerk auf Nostr,
  Arweave, Steem oder Blurt, sobald sie es das nächste Mal öffnen, sofern
  es unter dem üblichen Entdeckungs-Tag `forkbuild-publication`
  angekündigt wurde. Siehe
  [Von anderen verteilte Kreationen](04-PublishingAndForking.md#von-anderen-verteilte-kreationen).
- **Direkt in den Netzwerken.** **Geteilte Welt entdecken** in der
  Weltansicht sucht Ihre Welt auf Arweave und Nostr und prüft sie: Ist sie
  wirklich da draußen, und unversehrt? Siehe
  [Geteilte Welt entdecken](WorldViewAdvancedTools.md#geteilte-welt-entdecken--dezentrale-netzwerke-direkt-durchsuchen).
- **Auf der Seite Veröffentlichungen.** **IPFS-Inhalt überprüfen** ruft
  einen IPFS-Upload zurück und vergleicht ihn mit seinem Hash.
  **Nachweise überprüfen** prüft einen Anker.

Verteilen lässt sich nicht rückgängig machen: Sobald etwas gespeichert
oder angekündigt ist, haben andere vielleicht schon eine Kopie.
**Zurückziehen** entfernt eine Welt nur aus Ihrem eigenen Katalog. Dieses
Gerät merkt sich dann, die verteilten Kopien nicht wieder aufzulisten, wenn
Entdecken die Netzwerke durchsucht.
