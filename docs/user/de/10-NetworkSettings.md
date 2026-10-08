<!-- translation-of: docs/user/10-NetworkSettings.md source-hash: 5024adaa9e307817 -->
# 10 — Netzwerkeinstellungen

<!-- languages -->
[English](../10-NetworkSettings.md) · **Deutsch** · [Español](../es/10-NetworkSettings.md) · [Français](../fr/10-NetworkSettings.md) · [Bahasa Indonesia](../id/10-NetworkSettings.md) · [日本語](../ja/10-NetworkSettings.md) · [한국어](../ko/10-NetworkSettings.md) · [Português (Brasil)](../pt-BR/10-NetworkSettings.md)
<!-- /languages -->

**Netzwerkeinstellungen** in der oberen Leiste verlinkt jede Seite, die
festlegt, mit welchen Servern ForkBuild spricht. Die meisten Menschen
müssen hier nie etwas ändern: Die Standardwerte funktionieren sofort.
Kommen Sie hierher, wenn ein Server ausgefallen ist, wenn Sie einen
eigenen betreiben oder um zu wählen, wo Ihre Veröffentlichungen
gespeichert und angekündigt werden.

Was jeder Server über Sie erfährt, steht unter [Datenschutz](Privacy.md).

## Die Seiten

| Seite | Route | Was sie festlegt |
|---|---|---|
| **Inhaltsanbieter** | `/settings/content-provider` | Wo **Auf … speichern** und **Bevorzugten Anbieter verwenden** neue Inhalte speichern und an welchen IPFS-Knoten sie gehen — siehe [unten](#inhaltsanbieter) |
| **Anbieter für Ankündigung / Entdeckung** | `/settings/announcement-discovery-provider` | Wohin Ihre Ankündigungen standardmäßig gehen: Nostr, Arweave, Steem oder Blurt — siehe [unten](#anbieter-für-ankündigung--entdeckung) |
| **Nachweis-/Verankerungsanbieter** | `/settings/anchor-provider` | Wo **Auf … verankern** verankert — siehe [unten](#nachweis-verankerungsanbieter) |
| **Arweave-Gateway** | `/settings/arweave-gateway` | Gateways zum Lesen von Arweave-Inhalten — siehe [unten](#arweave-gateway) |
| **IPFS-Gateway** | `/settings/ipfs-gateway` | Gateways zum Lesen von IPFS-Inhalten — siehe [unten](#ipfs-gateway) |
| **Bitcoin-Endpunkt** *(experimentell)* | `/settings/bitcoin-esplora` | Der Dienst, den die Bitcoin-Verankerung nutzt — siehe [unten](#bitcoin-endpunkt) |
| **Nostr-Relays** | `/settings/nostr-relay` | Relays zum Veröffentlichen und Entdecken über Nostr — siehe [unten](#nostr-relays) |
| **Steem** *(experimentell)* | `/settings/steem` | Ihr Steem-Konto und woher Steem gelesen wird — siehe [unten](#steem) |
| **Blurt** *(experimentell)* | `/settings/blurt` | Ihr Blurt-Konto und woher Blurt gelesen wird — siehe [unten](#blurt) |
| **STUN-Server** / **TURN-Server** | `/settings/stun`, `/settings/turn-server` | Hilfe für Peer-Verbindungen — siehe [TURN](07-PeerConnectionsAndFriends.md#turn-peer-verbindungen-weiterleiten-die-keinen-direkten-weg-finden) |
| **Rendezvous-Server** | `/settings/rendezvous` | Wie Peers einander finden — siehe [Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md) |

## Wie sich jede Seite verhält

- **Nach dem Speichern neu laden.** Änderungen wirken beim nächsten Laden
  der App (die Steem- und Blurt-Konten sind die Ausnahmen). Eine geöffnete
  Weltansicht oder ein geöffneter Editor nutzt die alten Einstellungen
  weiter, bis Sie neu laden.
- Jede Seite hat ihre eigene Schaltfläche **Speichern**. Ein
  fehlgeschlagenes Speichern zeigt den Grund und lässt die vorherige
  Einstellung, wie sie war; ein erfolgreiches zeigt „Gespeichert.“.
- Auswahllisten werden alphabetisch geordnet angezeigt.
- **Serverlisten kommen mit Standardwerten.** Die Seiten Arweave-Gateway,
  IPFS-Gateway, Bitcoin-Endpunkt, Nostr-Relays, Steem, Blurt, STUN und Rendezvous
  beginnen mit mehreren kostenlosen öffentlichen Servern, damit alles
  weiterläuft, wenn einer ausfällt. Die Seite sagt, ob die Standardwerte
  oder Ihre gespeicherten verwendet werden. Ist nichts gespeichert, enthält
  das Textfeld die Standardwerte, einen pro Zeile, bereit zum Bearbeiten.
  **Speichern** bleibt deaktiviert, bis Sie etwas ändern, sodass Sie
  verbesserte Standardwerte späterer Versionen weiter erhalten. **Auf
  Standard zurücksetzen** entfernt Ihre Liste.
- **Die Prüfung betrifft nur das Format.** Speichern lehnt alles ab, was
  keine wohlgeformte URL der richtigen Art ist, prüft aber nicht, ob der
  Server funktioniert; ein falscher Server zeigt sich später als
  fehlgeschlagener Lesevorgang.
- **Standardwerte sind Dienste Dritter.** Jeder sieht Ihre IP-Adresse und
  was die App bei ihm anfragt. Über ein Gateway gelesene Inhalte werden
  gegen ihren Inhalts-Hash geprüft, sodass ein Gateway keine anderen Bytes
  unterschieben kann.

## Inhaltsanbieter

Wählen Sie aus den Backends, die dieses Gerät registriert hat, auf
welchem Speicher **Auf … speichern** (die erste Schaltfläche im Block
**Inhalt** einer Veröffentlichung) und **Bevorzugten Anbieter verwenden**
eine Snapshot-Platzierung erstellen (siehe
[Einen bevorzugten Anbieter verwenden](11-EvidenceAndStorage.md#einen-bevorzugten-anbieter-verwenden)),
und klicken Sie auf **Speichern**. **Lokal** wird nicht angeboten, da jede
Veröffentlichung schon auf diesem Gerät gespeichert ist.

**IPFS (entferntes Pinning)** *(experimentell)* wird immer angeboten. Es
nutzt den unter **Entfernter Pinning-Dienst** (unten) eingerichteten
Dienst: Ist einer eingerichtet, legen **Auf IPFS (entferntes Pinning)
speichern** und **Bevorzugten Anbieter verwenden** den Inhalt dort ab, als
gewöhnliche IPFS-Platzierung; ist keiner eingerichtet, sagen sie das. Wählen
Sie es, ist außerdem in jedem Dialog **Verteilen** entferntes Pinning als
Speicher vorausgewählt.

Ein zweiter Abschnitt, **IPFS-Knoten**, legt den Knoten fest, an den neue
IPFS-Platzierungen gesendet werden. Standard ist ein lokaler Kubo-Knoten
unter `http://127.0.0.1:5001`. Geben Sie die API-URL eines anderen Knotens
ein und klicken Sie auf **Speichern**, oder auf **Standard der
Installation verwenden**, um zurückzukehren. Das Lesen von IPFS-Inhalten
betrifft es nicht; dafür gilt die Liste unter
[IPFS-Gateway](#ipfs-gateway).

Ein dritter Abschnitt, **Entfernter Pinning-Dienst** *(experimentell)*,
legt den Pinning-Dienst fest, auf den IPFS (entferntes Pinning) hochlädt:
seine **Adresse** und, falls der Dienst sie braucht, das **Anfragefeld**
für die Datei und das **Antwortfeld** mit der CID. **Speichern** bewahrt
diese auf diesem Gerät auf. Das **Token** wird nur aufbewahrt, bis Sie die
Seite schließen oder neu laden, und nie gespeichert; ein Dienst, der eines
braucht, lehnt Uploads ab, bis Sie es eingeben. Jeder Dialog **Verteilen**
und die Seite Veröffentlichungen beginnen mit diesem Dienst, und Sie können
ihn dort noch ändern. **Dienst vergessen** entfernt ihn.

## Anbieter für Ankündigung / Entdeckung

Wählen Sie **Arweave**, **Blurt** (experimentell), **Nostr** oder **Steem** (experimentell) als
Standardort, an dem Ihre Veröffentlichungen (Geteilte Welten,
Bauplan-Zuschreibungen und Ortsnamensansprüche), Snapshots und Kommentare
angekündigt werden. Es ist nur ein Standard: Jeder Dialog **Verteilen**,
die Verteilungsauswahl auf jeder Karte im Repository und die
Netzwerkauswahl neben **Kommentar senden** beginnen damit, und Sie können
sie für eine Aktion umstellen. Die Suche nach Inhalten anderer Personen
durchsucht immer alle.

Ein zweiter Abschnitt, **Kommentare**, gibt Kommentaren einen eigenen
Standard. **Wie der Anbieter für Ankündigung / Entdeckung oben**, die
Voreinstellung, behält die Auswahl oben bei. Wählen Sie stattdessen ein
Netzwerk oder **Nur lokal & Peers**, damit Kommentare in keinem Netzwerk
landen; dafür brauchen Sie kein Netzwerkkonto. Jedes Kommentarformular
beginnt damit, und neben **Kommentar senden** können Sie es für einen
Kommentar weiterhin ändern.

## Nachweis-/Verankerungsanbieter

Wählen Sie, wo **Auf … verankern** (die erste
Schaltfläche im Block **Nachweis / Verankerung** einer Veröffentlichung)
externe Nachweise erstellt: **Arweave**, **Bitcoin** *(experimentell)*, **Blurt** *(experimentell)* oder **Steem** *(experimentell)*, je
nachdem, was dieses Gerät registriert hat. Base wird nie angeboten, weil
jeder Base-Anker erfordert, dass Sie eine Wallet-Transaktion prüfen und
signieren. Mit Bitcoin gibt es keine Schaltfläche **Auf … verankern**: Der
Block zeigt alle Optionen und verweist auf die Wallet-Schritte; für echte
Bitcoin-Anker siehe
[Der Ablauf für Bitcoin-Anker](11-EvidenceAndStorage.md#der-ablauf-für-bitcoin-anker).

## Arweave-Gateway

Gateways zum Lesen von Arweave-Inhalten, eine `http://`- oder
`https://`-URL pro Zeile. Standard sind `https://arweave.net`,
`https://ardrive.net` und `https://permagate.io`.

Sie werden der Reihe nach versucht: Ein Lesevorgang geht nur dann zum
nächsten Gateway, wenn das aktuelle nicht erreichbar ist oder einen Fehler
liefert. Arweave-Inhalte werden über ihre Transaktions-ID adressiert,
sodass jedes Gateway dieselben Bytes liefert.

Diese Liste wird verwendet, wenn das Material einer Veröffentlichung aus
einer dezentralen Quelle abgerufen wird und wenn eine
Arweave-Snapshot-Platzierung aufgelöst oder materialisiert wird. Sie
ändert nicht, wohin Ihre eigenen Inhalte hochgeladen werden. Arweave-Anker
nutzen das erste Gateway der Liste zum Erstellen und Überprüfen.

## IPFS-Gateway

Gateways zum Lesen von IPFS-Inhalten, eine URL pro Zeile, der Reihe nach
versucht wie bei Arweave. Standard sind `https://ipfs.filebase.io`, `https://gateway.pinata.cloud`, `https://ipfs.io`, `https://dweb.link` und `https://4everland.io`.

Diese Liste wird verwendet, wenn eine IPFS-Snapshot-Platzierung aufgelöst
oder materialisiert wird, für **IPFS-Inhalt überprüfen**, zum Öffnen geteilter Links zu
Inhalten auf IPFS und wenn das Repository und die wöchentliche Challenge
in den Netzwerken gefundene Bauwerke lesen, deren Signierter Anspruch auf
IPFS liegt. Sie ändert nicht, wo Ihre eigenen Inhalte gepinnt werden.

Manche Gateways, darunter `https://ipfs.io` und `https://dweb.link`,
verweigern Anfragen von Webseiten für manche Inhalte oder blockieren sie
hinter einer Bot-Prüfung; die Standardwerte werden von verschiedenen
Betreibern betrieben, sodass ein Lesevorgang auf das nächste ausweicht.
Schlägt **Überprüfen** oder **Auflösen** bei Inhalten, von denen Sie wissen, dass sie da sind,
immer wieder mit „Failed to fetch“ fehl, fügen Sie ganz oben das Gateway
Ihres Pinning-Anbieters hinzu. Eine vor dem 8. Oktober 2026 gespeicherte
Liste behält ihre eigene Reihenfolge: **Auf Standard zurücksetzen** holt
die neuen Standardwerte zurück.

## Bitcoin-Endpunkt

*Experimentell.* Die Esplora-kompatible API, die die Bitcoin-Verankerung
nutzt, um Transaktionen zu senden, Bestätigungen zu prüfen, Wallet-Guthaben
abzufragen und den OP_RETURN-Nachweis eines Ankers zu überprüfen. Eine
`http://`- oder `https://`-URL pro Zeile; Standard sind
`https://blockstream.info/api` und `https://mempool.space/api`.

Eine Abfrage nutzt den ersten Endpunkt, der antwortet. Ein Sendevorgang
geht nur dann zum nächsten Endpunkt, wenn der vorherige nicht erreichbar
war, nie nachdem einer die Transaktion abgelehnt hat.

## Nostr-Relays

Relays für alles, was ForkBuild über Nostr veröffentlicht oder entdeckt:
Veröffentlichungen (Geteilte Welten, Bauplan-Zuschreibungen und
Ortsnamensansprüche), Snapshots und Kommentare. Eine `ws://`- oder
`wss://`-URL pro Zeile; Standard sind `wss://relay.damus.io`,
`wss://nos.lol` und `wss://relay.primal.net`. **Speichern** ersetzt die
ganze Liste und lehnt sie ab, wenn eine Zeile keine gültige URL ist.

Anders als Gateways werden Relays nicht der Reihe nach versucht:
Ankündigungen gehen an alle Relays gleichzeitig, und die Entdeckung fragt
alle Relays, sodass jedes zusätzliche Relay Ihre Inhalte für mehr Menschen
auffindbar macht, auch während ein anderes ausgefallen ist. Hier gibt es
keinen Status pro Relay; ein Ergebnis von **Verteilen** listet eine Zeile
**Entdeckung** pro Relay.

## Steem

*Experimentell.* Legen Sie unter **Posten** **Ihr Steem-Konto** fest (das
gilt sofort, ohne Neuladen); es wird zum Posten oder Speichern auf Steem
gebraucht — siehe [Steem](11-EvidenceAndStorage.md#steem). Zum Lesen von
Steem ist kein Konto nötig. Der Rest der Seite legt fest, woher Steem
gelesen wird:

- **API-Knoten**, eine `https://`-URL pro Zeile (Standard
  `https://api.steemit.com`, `https://api.justyy.com` und `https://steemd.steemworld.org`), der Reihe nach
  versucht.
- **Thread-Konten**, eines pro Zeile (Standard `forkbuild`): wessen
  monatliche Entdeckungs-Threads gelesen werden. Fügen Sie ein weiteres
  hinzu, wenn eine Gemeinschaft eigene Threads betreibt.
- **Erster zu lesender Monat** (Standard September 2026): ForkBuild liest
  jeden Monat von dort bis heute, höchstens die letzten 36 Monate.

Ist kein Steem-Knoten erreichbar, nennen **Nach neuen Kommentaren suchen**
und die Snapshot-Entdeckung Steem als nicht verfügbar, statt zu melden,
dass nichts gefunden wurde.

## Blurt

*Experimentell.* Legen Sie unter **Veröffentlichen** **Ihr Blurt-Konto**
fest (das gilt sofort, ohne Neuladen); es wird zum Posten, Speichern oder
Verankern auf Blurt gebraucht — siehe [Blurt](11-EvidenceAndStorage.md#blurt).
Zum Lesen von Blurt ist kein Konto nötig. Der Rest der Seite legt fest,
woher Blurt gelesen wird:

**API-Knoten**, eine `https://`-URL pro Zeile (Standard
`https://rpc.blurt.blog`, `https://rpc.beblurt.com` und `https://rpc.drakernoise.com`), der Reihe nach
versucht. ForkBuild findet Beiträge über Nexus, den Suchindex von Blurt,
der jeden Beitrag behält, egal wie alt, und überspringt einen Knoten, der
ihn nicht anbietet. Bietet kein Knoten Nexus an, greift es auf die eigene
Tag-Liste von Blurt zurück, die einen Beitrag nur bis zu seiner Auszahlung
nach sieben Tagen behält, und findet ältere Beiträge im Verlauf der Konten,
die es auf diesem Gerät unter dem Tag posten gesehen hat. Auch wenn Nexus
antwortet, liest ForkBuild die Tag-Liste daneben, falls Nexus einen Beitrag
auslässt; ist das so, liest es auch den Verlauf dieses Kontos, damit
dessen ältere Beiträge ebenfalls nicht fehlen.

Ist kein Blurt-Knoten erreichbar, nennen **Nach neuen Kommentaren suchen**
und die Snapshot-Entdeckung Blurt als nicht verfügbar, statt zu melden,
dass nichts gefunden wurde.
