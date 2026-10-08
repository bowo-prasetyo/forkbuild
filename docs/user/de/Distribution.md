<!-- translation-of: docs/user/Distribution.md source-hash: 2c372aadfd2854d8 -->
# Ihre Arbeit verteilen

<!-- languages -->
[English](../Distribution.md) · **Deutsch** · [Español](../es/Distribution.md) · [Français](../fr/Distribution.md) · [Bahasa Indonesia](../id/Distribution.md) · [日本語](../ja/Distribution.md) · [한국어](../ko/Distribution.md) · [Português (Brasil)](../pt-BR/Distribution.md)
<!-- /languages -->

Alles, was ForkBuild erstellt, beginnt auf Ihrem eigenen Gerät. **Verteilen**
ist der separate, optionale Schritt, der Ihre Arbeit in dezentrale Netzwerke
bringt, sodass Menschen, die nicht mit Ihnen verbunden sind, sie finden,
abrufen und prüfen können. Diese Seite fasst an einer Stelle zusammen, was
Sie verteilen können, wohin es gehen kann und was Sie dafür brauchen. Jeder
Abschnitt verweist auf die Anleitung, die die Einzelheiten erklärt.

## Veröffentlichen, teilen, verteilen: drei verschiedene Dinge

| Aktion | Wohin es geht | Wer es bekommt | Anleitung |
|---|---|---|---|
| **Veröffentlichen** | Nur auf dieses Gerät | Noch niemand sonst | [Ihre Kreation veröffentlichen](04-PublishingAndForking.md#ihre-kreation-veröffentlichen) |
| **Mit Peers teilen** | Direkt zu den Menschen, mit denen Sie verbunden sind | Ihre verbundenen Peers, solange Sie online sind | [Mit verbundenen Peers teilen](04-PublishingAndForking.md#mit-verbundenen-peers-teilen) |
| **Verteilen** | Dezentrale Netzwerke (IPFS, Arweave, Nostr, Steem, Blurt) | Jeder, ganz ohne Verbindung zu Ihnen | Diese Seite |

Veröffentlichen sendet von sich aus nie etwas irgendwohin, und das Teilen mit
Peers ist kein Verteilen: Peers behalten eine Kopie nur, solange sie wollen,
und niemand sonst kann sie finden. Jedes Verteilen ist ein eigener,
ausdrücklicher Klick.

## Die drei Rollen, die ein Netzwerk spielen kann

Beim Verteilen kommen bis zu drei Arten von Netzwerk zum Einsatz, jede
getrennt gewählt:

| Rolle | Wie … | Was sie tut | Auswahl |
|---|---|---|---|
| **Inhalt** (Speicher) | Der Ort, an dem gedruckte Exemplare aufbewahrt werden | Hält die Bytes, etwa die Steine Ihrer Welt, damit andere sie abrufen können | **Arweave**, **Blurt** *(experimentell)*, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(experimentell)* |
| **Ankündigung / Entdeckung** | Ein Eintrag im Bibliothekskatalog | Veröffentlicht einen kleinen signierten Hinweis, dass Ihre Arbeit existiert und wo ihre Kopie liegt, damit andere sie finden können | **Nostr**, **Arweave**, **Steem** *(experimentell)*, **Blurt** *(experimentell)* |
| **Nachweis / Verankerung** *(experimentell, optional)* | Der Stempel eines Notars | Schreibt den Hash Ihres Inhalts in eine Blockchain, als Nachweis, dass er zu diesem Zeitpunkt existierte. Er speichert und kündigt nichts an. | **Bitcoin**, **Arweave**, **Base**, **Steem**, **Blurt** |

Speichern ohne Ankündigung heißt, dass niemand weiß, wo er suchen soll; eine
Ankündigung ohne Speicher verweist auf nichts. **Verteilen** erledigt beides
mit einem Klick. Verankern ist ein Extra und geschieht separat auf der Seite
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
| **Ein Kommentar** zu einer Veröffentlichung | — | Nostr, Arweave, Steem oder Blurt, oder keines (**Nur lokal & Peers**) | — | **Kommentar senden**, im Repository oder in der Weltansicht, im daneben gewählten Netzwerk; später **Verteilen** unter Ihrem eigenen Kommentar |

Der Snapshot einer Welt trägt Ihre signierte Platzierung mit sich, sodass
Menschen, die ihn abrufen, den Bau genau dort sehen, wo Sie ihn hingestellt
haben.

Einzelheiten:

- Signierter Anspruch und Snapshot:
  [Direkt aus dem Editor verteilen](04-PublishingAndForking.md#direkt-aus-dem-editor-verteilen),
  [Meine Geteilte Welt](03-WorldView.md#meine-geteilte-welt--ihren-eigenen-snapshot-verteilen-ohne-peers)
  und der [Verteilen-Dialog](03-WorldView.md#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
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
2. Klicken Sie in dem erscheinenden Hinweis auf **Verteilen** oder später in
   der Weltansicht unter **Meine Geteilte Welt**.
3. Wählen Sie einen **Speicher** und ein **Substrat für Ankündigung /
   Entdeckung**, zum Beispiel IPFS und Nostr oder Arweave für beides, und
   klicken Sie auf **Verteilen**. Es verteilt zuerst den Snapshot, dann den
   Signierten Anspruch, und meldet beides getrennt. Schlägt eine Hälfte fehl,
   wiederholen Sie nur diese Hälfte mit ihrer eigenen Schaltfläche
   **Nur … verteilen**.
4. Verankern Sie die Veröffentlichung optional auf der Seite
   **Veröffentlichungen** (zum Beispiel **Auf Arweave verankern**), um
   festzuhalten, wann sie existierte.
5. Klicken Sie unter dem Ergebnis auf **Teilen …** oder **Link kopieren**, um
   anderen einen Link zu geben, der Ihren Bau auf jedem Gerät öffnet,
   bereit zum Remixen oder für einen Rundgang in der Weltansicht.

Für einen Bau, der größer als die 256 KB von Arweave ist, wählen Sie IPFS.
Peers, mit denen Sie verbunden sind, können Bauten von bis zu 64 MB weiterhin
direkt von Ihnen abrufen.

## Prüfen, ob es geklappt hat

- Die Repository-Karte Ihres Baus zeigt, wo dieses Gerät das Verteilen
  festgehalten hat, zum Beispiel **Gespeichert auf IPFS · Angekündigt auf
  Nostr** oder **Auf diesem Gerät ist keine Verteilung verzeichnet.** Siehe
  [Ihre Veröffentlichungen](13-YourData.md#ihre-veröffentlichungen).
- Das Repository anderer Leute findet Ihre Veröffentlichung auf Nostr,
  Arweave, Steem oder Blurt, sobald sie es das nächste Mal öffnen, sofern sie
  unter dem üblichen Entdeckungs-Tag `forkbuild-publication` angekündigt
  wurde. Siehe
  [Von anderen verteilte Kreationen](04-PublishingAndForking.md#von-anderen-verteilte-kreationen).
- **Geteilte Welt entdecken** in der Weltansicht sucht Ihre Geteilte Welt
  direkt auf Arweave und Nostr und prüft sie; so beantwortet es die Frage
  „Ist meine Veröffentlichung wirklich da draußen, und zwar unversehrt?“.
  Siehe
  [Geteilte Welt entdecken](03-WorldView.md#geteilte-welt-entdecken--dezentrale-netzwerke-direkt-durchsuchen).
- Auf der Seite Veröffentlichungen ruft **IPFS-Inhalt überprüfen** einen
  IPFS-Upload zurück und vergleicht ihn mit seinem Hash, und
  **Nachweise überprüfen** prüft einen Anker.

Verteilen lässt sich nicht rückgängig machen: Sobald etwas angekündigt oder
gespeichert ist, haben andere vielleicht schon eine Kopie. **Zurückziehen**
entfernt eine Welt nur aus Ihrem eigenen Katalog, und dieses Gerät merkt
sich dann, die verteilten Kopien nicht wieder aufzulisten, wenn das
Repository die Netzwerke durchsucht.
