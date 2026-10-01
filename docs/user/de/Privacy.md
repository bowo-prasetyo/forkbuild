<!-- translation-of: docs/Privacy.md source-hash: 91943196a1dbc4fd -->
# Datenschutz

<!-- languages -->
[English](../../Privacy.md) · **Deutsch** · [Español](../es/Privacy.md) · [Bahasa Indonesia](../id/Privacy.md) · [日本語](../ja/Privacy.md)
<!-- /languages -->

ForkBuild hat keine Konten und keine Analyse. Es speichert Ihre Arbeit in
Ihrem eigenen Browser und spricht nur für die Funktionen mit anderen
Computern, die das brauchen. Diese Seite listet auf, was es speichert, und
jeden Server, den es kontaktieren kann, und wann.

## Was auf Ihrem Gerät bleibt

Alles Folgende liegt im Speicher dieses Browsers (der IndexedDB-Datenbank
`forkbuild`; Browser ohne IndexedDB nutzen `localStorage`, unter Schlüsseln,
die mit `forkbuild:` beginnen) und verlässt das Gerät nie, es sei denn, Sie
veröffentlichen, exportieren oder senden es:

- Ihre Dokumente, Kopien ungespeicherter Änderungen zur
  Absturzwiederherstellung und gespeicherte Strukturen;
- Ihre Identitäten: jeweils der öffentliche Schlüssel und der private
  Schlüssel, mit Ihrer Passphrase verschlüsselt, sofern Sie sie nicht ohne
  Passphrase erstellt haben;
- bekannte Peers, Freunde, die Personen, denen Sie folgen, Blockierungen,
  Chatverläufe und vorgemerkte Nachrichten (niemand erfährt, dass Sie ihm
  folgen, und nichts über ein Folgen wird je gesendet);
- Ihr Avatarprofil, Einstellungen (darunter, ob die Weltansicht Ton
  abspielt, wie laut und ob in 3D oder Stereo, und die von Ihnen gewählte
  Sprache; haben Sie keine gewählt, liest ForkBuild die bevorzugten Sprachen
  des Browsers auf dem Gerät und sendet sie nirgendwohin) sowie Benutzername
  und Zugangsdaten eines TURN-Servers, falls Sie sie unter
  **Netzwerkeinstellungen** eingeben.

Das Löschen der Daten dieser Website im Browser löscht all das, und es gibt
keine andere Kopie und keinen Weg, sie wiederherzustellen. Sichern Sie es
vorher mit **Ihre Daten → In eine Datei sichern**: Die Datei enthält alles
oben Genannte außer der Angabe, welche Identität angemeldet ist, ist mit
einer von Ihnen gewählten Passphrase verschlüsselt und bleibt, wo Sie sie
ablegen. ForkBuild lädt sie nie hoch. **Sicherung teilen** übergibt die
Datei an die App, die Sie auf Ihrem Gerät auswählen. Wenn Sie einen
Sicherungsordner wählen, behält der Browser die Berechtigung von ForkBuild
dafür, und ForkBuild bewahrt den Ordner und, wenn Sie es wünschen, einen
aus Ihrer Sicherungs-Passphrase abgeleiteten Schlüssel, der Sicherungen nur
erstellen (nie öffnen) kann, in einer separaten IndexedDB-Datenbank
`forkbuild-backup` auf; wann und wohin Sie zuletzt gesichert haben, wird mit
den übrigen Daten aufbewahrt, aber nicht in Sicherungen aufgenommen.

## Was andere sehen können

- **Alles, was Sie veröffentlichen**, ist öffentlich: sein Inhalt, Titel,
  Beschreibung und Lizenz sowie der öffentliche Schlüssel Ihrer Identität,
  die es signiert. Sobald andere eine Kopie haben, können Sie sie nicht
  zurücknehmen.
- **Peers, mit denen Sie sich verbinden**, erfahren den öffentlichen
  Schlüssel Ihrer Identität und Ihre IP-Adresse (eine direkte Verbindung
  braucht sie; ein TURN-Relay verbirgt sie vor dem Peer, aber nicht vor dem
  Relay). Verbundene Peers können Ihren Avatar und Ihre Anwesenheit gemäß
  deren Sichtbarkeitseinstellung sehen, einschließlich des Fahrzeugs, auf
  dem Sie fahren (Art und ID, nur gesendet, solange die Anwesenheit gesendet
  würde; wo Sie ein Fahrzeug abgestellt haben, wird nie gesendet), und Ihre
  Freunde können Ihnen Nachrichten schicken. Sie erhalten außerdem die
  Ankündigungen von Snapshots und Ortsnamen, die Ihr Gerät entdeckt hat,
  und erfahren so, in welchen Regionen der Welt Sie nach Ortsnamen gesucht
  haben (docs/AnnouncementIndex.md).
- **Peers, bei Welten, die Sie teilen.** **Mit Peers teilen** im
  Repository bietet eine Ihrer veröffentlichten Welten allen an, mit denen
  Sie jetzt verbunden sind, und allen, die sich später verbinden,
  einschließlich Fremder aus einer Lobby: Sie erhalten ihren Eintrag und
  können die Welt selbst von Ihrem Gerät abrufen, solange Sie verbunden
  sind. Die Geräte Ihrer Freunde und bekannten Peers rufen sie von selbst
  ab, alle anderen nur, wenn sie auf **Abrufen** klicken. Eine Welt, die Sie
  nur **veröffentlichen**, wird nie an jemanden gesendet.
- **Jeder, solange Sie in einer öffentlichen Lobby sind.** Wenn Sie der
  öffentlichen Lobby (**Peers**) oder der Lobby einer Welt (**Lobby** in der
  Weltansicht) beitreten, werden der öffentliche Schlüssel Ihrer Identität
  und der von Ihnen gewählte Anzeigename für jeden aufgeführt, der diese
  Lobby öffnet. Die Lobby einer Welt verrät außerdem, welche Welt Sie
  geöffnet haben. Ihr Eintrag besteht, bis Sie die Lobby verlassen, die App
  schließen (dann bis zu 10 Minuten) oder die Karte abläuft. Er enthält
  keine Netzwerkadresse, aber jeder in der Lobby kann sich mit Ihnen
  verbinden, und ein Fremder, der sich verbindet, ist ein gewöhnlicher
  verbundener Peer: Er erfährt Ihre IP-Adresse, sieht Ihren Avatar und Ihre
  Anwesenheit, wie es Ihre Sichtbarkeitseinstellungen erlauben, und
  **tauscht Ankündigungen von Snapshots und Ortsnamen sowie Metadaten von
  Veröffentlichungen mit Ihnen aus, genau wie jeder verbundene Peer**, bevor
  Sie sich ihn merken oder sich mit ihm befreunden. Chat und Sprache
  erfordern weiterhin eine gegenseitige Freundschaft. **Blockieren** in der
  Lobby blendet jemanden in Ihren Lobby-Listen aus und blockiert ihn wie auf
  der Seite Peers (Anwesenheit, Profil, Chat und Freundschaftsanfragen).

## Server, die ForkBuild kontaktiert

Jedes Skript, jeder Stil und jede Schrift stammt von der Website, von der
die App ausgeliefert wird (siehe
[docs/Deployment.md](../../Deployment.md) (Englisch)). Eines beginnt von
selbst: etwa 10 Sekunden nach dem Öffnen der App und danach alle paar
Minuten, solange ihr Tab sichtbar ist, liest sie neue Ankündigungen von den
Nostr-Relays, dem Arweave-Gateway und den Steem-Knoten, die unter
**Netzwerkeinstellungen** konfiguriert sind (docs/AnnouncementIndex.md). Sie
liest nur Ankündigungen (kleine Verweise und signierte Ansprüche), nie
Inhalte, und veröffentlicht nichts. Alles andere geschieht nur, wenn Sie die
jeweilige Funktion nutzen, und jeder Server lässt sich unter
**Netzwerkeinstellungen** ändern. Jeder Server sieht Ihre IP-Adresse und
was Sie bei ihm anfragen.

| Wann | Server (Standard) | Was er erhält |
| --- | --- | --- |
| Sie machen sich unter **Peers** auffindbar oder suchen jemanden | der Rendezvous-Server (`forkbuild-rendezvous.prazjp.workers.dev`) | den öffentlichen Schlüssel Ihrer Identität und ein Verbindungsangebot, höchstens 15 Minuten aufbewahrt; die Identität, die Sie suchen; wenn Sie sich mit jemandem verbinden, den Sie gefunden haben, Ihre Verbindungsantwort (sie listet Ihre Netzwerkadressen auf), die nur diese Person abholen kann |
| Sie treten einer öffentlichen Lobby bei oder sehen in eine hinein | derselbe Rendezvous-Server | Ihre signierte Lobby-Karte (öffentlicher Schlüssel, Anzeigename, welche Lobby), höchstens 15 Minuten aufbewahrt und erneuert, solange Sie bleiben; in welche Lobby Sie hineinsehen |
| Eine Peer-Verbindung beginnt | STUN-Server (`stun.l.google.com`) | nichts außer einer Anfrage nach Ihrer öffentlichen IP-Adresse |
| Sie beginnen eine Peer-Verbindung, wenn der Rendezvous-Server ein Relay anbietet | `/turn-credentials` des Rendezvous-Servers, dann sein TURN-Relay (Cloudflare) | eine Anfrage nach kurzlebigen Relay-Zugangsdaten, höchstens etwa einmal pro Stunde; weitergeleiteter Verkehr ist durch WebRTC Ende-zu-Ende-verschlüsselt |
| Die App ist geöffnet und ihr Tab sichtbar (Synchronisierung der Ankündigungen im Hintergrund) | Nostr-Relays (`relay.damus.io`), ein Arweave-Gateway (`arweave.net`), Steem-Knoten (`api.steemit.com`) | Abfragen nach den Entdeckungs-Tags von ForkBuild: den gemeinsamen Tags für Snapshots und Kommentare sowie den Ortsnamen-Regionen und Kartenzellen, die Sie besucht haben |
| Sie verteilen oder entdecken Veröffentlichungen über Nostr | Nostr-Relays (`relay.damus.io`) | signierte Ankündigungen, die Sie veröffentlichen; Ihre Abfragen |
| Sie speichern oder holen Inhalte auf Arweave | ein Arweave-Gateway (`arweave.net`) | die Inhalte, die Sie veröffentlichen; was Sie abrufen |
| Sie holen Inhalte von IPFS | ein IPFS-Gateway (`ipfs.io`) oder Ihr eigener IPFS-Knoten (`127.0.0.1:5001`) | was Sie abrufen oder hinzufügen |
| Sie pinnen Inhalte bei einem entfernten Pinning-Dienst (*experimentell*) | der Dienst, den Sie eingeben | den Inhalt und das Token, das Sie für diesen einen Upload eingeben (nie gespeichert) |
| Sie speichern, kündigen an oder verankern auf Steem, oder entdecken Steem-Ankündigungen (*experimentell*) | Steem-API-Knoten (`api.steemit.com`, dann `api.justyy.com`); das Signieren läuft über die Erweiterung Steem Keychain | Ihren Steem-Kontonamen; was Sie posten (Ankündigungen, gespeicherte Inhalte, Anker), ist dauerhaft öffentlich auf der Chain, und Bearbeitungen lassen die frühere Version in ihrem Verlauf |
| Sie verteilen den Signierten Anspruch einer Veröffentlichung auf Steem (*experimentell*) | der Steem-Bildhoster (`steemitimages.com`) | ein 320×200-Bild des Bauwerks für die Vorschau des Beitrags, signiert mit Ihrem Steem-Posting-Schlüssel |
| Sie öffnen einen geteilten Link zu einer Veröffentlichung (`#/view/…`) | der Steem-Knoten, das Arweave-Gateway oder das IPFS-Gateway, das der Link nennt, dann die Ankündigungssubstrate, um sein Bauwerk zu finden | welchen Beitrag, welche Transaktion oder welche CID Sie öffnen |
| Sie verankern oder überprüfen Nachweise auf Bitcoin (*experimentell*) | eine Esplora-API (`blockstream.info`) | die Transaktion, die Sie senden oder nachschlagen |
| Sie überprüfen Nachweise auf Base (*experimentell*) | ein Base-JSON-RPC-Endpunkt (`mainnet.base.org`) | die Transaktion, die Sie nachschlagen |
| Sie verbinden eine Browser-Wallet (*experimentell*) | die Wallet-Erweiterung, die Sie wählen | was immer sie Sie bestätigen lässt |

ForkBuild sendet Ihren privaten Schlüssel, Ihre Passphrase oder Ihre
gespeicherten Dokumente nie an einen dieser Server.

**Relays werden nur bei Bedarf genutzt.** Eine Verbindung versucht immer
zuerst einen direkten Weg, dann einen über STUN gefundenen, und weicht nur
auf das TURN-Relay aus, wenn beides nicht klappt. Während Sie in einer
Lobby warten, fordern die Angebote, die Ihr Gerät bereithält, nie
Relay-Zugangsdaten an, sodass ein Aufenthalt in der Lobby das monatliche
Relay-Kontingent des Rendezvous-Servers nicht aufbraucht; die Person, die
sich mit Ihnen verbindet, fordert eines an, falls sie es braucht.

## Wenn Sie eine eigene Kopie betreiben

Eine Installation bestimmt die obigen Standardwerte: ihren
Rendezvous-Server (`peer/RendezvousConfig.js`), ob dieser Server ein
TURN-Relay anbietet (`server/rendezvous-worker/README.md`), und die übrigen
Standardwerte unter **Netzwerkeinstellungen**. Der Standard-Rendezvous-Server
akzeptiert nur den Ursprung der offiziellen Website, daher braucht eine
anderswo gehostete Kopie einen eigenen (siehe
[docs/Deployment.md](../../Deployment.md) (Englisch)). Wenn Sie ForkBuild
für andere hosten, passen Sie diese Seite an und nennen Sie Ihre Server.
