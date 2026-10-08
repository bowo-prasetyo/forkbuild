<!-- translation-of: docs/Privacy.md source-hash: d70bfd90aa9c35dd -->
# Datenschutz

<!-- languages -->
[English](../../Privacy.md) · **Deutsch** · [Español](../es/Privacy.md) · [Français](../fr/Privacy.md) · [Bahasa Indonesia](../id/Privacy.md) · [日本語](../ja/Privacy.md) · [한국어](../ko/Privacy.md) · [Português (Brasil)](../pt-BR/Privacy.md)
<!-- /languages -->

ForkBuild hat keine Konten und verfolgt Sie nicht. Es speichert Ihre
Arbeit in Ihrem eigenen Browser und spricht nur für die Funktionen mit
anderen Computern, die das brauchen, dazu eine anonyme Besucherzählung,
einmal am Tag, wenn ein Link zum Teilen benutzt wird und wenn es installiert wird, damit seine
Entwickler ungefähr wissen, wie viele Menschen es nutzen und Bauwerke teilen
(siehe „Besucherzählung“ unten, auch dazu, wie Sie sie abschalten). Diese Seite listet auf, was es speichert, und jeden Server,
den es kontaktieren kann, und wann.

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
  **Netzwerkeinstellungen** eingeben;
- ob dieser Browser an der täglichen Besucherzählung teilnimmt, und an
  welchem Tag zuletzt;
- Veröffentlichungen anderer Leute, die dieses Gerät gefunden und geprüft
  hat, von Peers, aus Links, aus der Weltansicht oder aus der Suche des
  Repositorys in den Netzwerken, und bei den in den Netzwerken gefundenen,
  wo der signierte Eintrag jeder einzelnen gelesen wurde;
- die IDs der Veröffentlichungen, die Sie auf diesem Gerät zurückgezogen
  haben, damit die Suche des Repositorys in den Netzwerken Kopien, die Sie
  früher verteilt haben, nicht wieder auflistet.
- an welche Netzwerke dieses Gerät jeden Ihrer Kommentare gesendet hat, und
  wann, damit jeder Kommentar zeigen kann, wohin er ging.
- für jede Woche der Bau-Challenge, die Sie öffnen, die IDs der in den
  Netzwerken gefundenen Beiträge, damit ihre Seite sie vor der Suche wieder
  anzeigt.

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

Auf der offiziellen Seite behält der Browser über den Service Worker der
Seite außerdem die eigenen Dateien von ForkBuild (Code, Stylesheet, Symbole
und die Sprache, die Sie nutzen), damit ForkBuild ohne Verbindung öffnet und
sich als App installieren lässt. Es sind für alle dieselben Dateien, und
nichts von Ihnen steckt darin. Ob Benachrichtigungen auf diesem Gerät
eingeschaltet sind, wird mit Ihren Einstellungen gespeichert (siehe
„Benachrichtigungen auf diesem Gerät“ unten).

## Was andere sehen können

- **Alles, was Sie veröffentlichen**, ist öffentlich: sein Inhalt, Titel,
  Beschreibung und Lizenz sowie der öffentliche Schlüssel Ihrer Identität,
  die es signiert. Sobald andere eine Kopie haben, können Sie sie nicht
  zurücknehmen. Wenn Sie es über Nostr oder Arweave verteilen, nennt seine Ankündigung
  auch seine Tags (als `forkbuild-tag:<tag>`), sodass jeder die Bauwerke mit
  einem Tag finden kann, etwa die Beiträge zur Challenge einer Woche.
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

## Besucherzählung

Einmal am Tag, wenn ForkBuild an diesem Kalendertag zum ersten Mal auf
diesem Gerät geöffnet wird, lädt die offizielle Website
(`https://bowo-prasetyo.github.io/forkbuild/`) ein winziges Bild von
GoatCounter (`forkbuild.goatcounter.com`), einem Zähler, der keine Cookies
setzt. Mehr sendet sie nicht:

- **Was GoatCounter erhält:** Ihre IP-Adresse und den User-Agent Ihres
  Browsers, wie bei jeder Webanfrage, dazu einen festen Pfad (`/`) und eine
  Zufallszahl, die verhindert, dass das Bild zwischengespeichert wird. Keine
  Seite, kein Dokument, keine Welt, keine Identität, kein Referrer und
  nichts, was ForkBuild speichert, ist enthalten; GoatCounter erfährt also
  nicht, was Sie in der App tun, nicht einmal, welche Seite Sie geöffnet
  haben.
- **Was es behält:** nur Summen: Besucher pro Stunde und pro Tag und aus
  welchen Browsern, Systemen, Ländern und Sprachen sie kamen, jeweils
  getrennt gezählt, sodass sie sich nicht miteinander verknüpfen lassen.
  Laut seiner Datenschutzerklärung
  (<https://www.goatcounter.com/help/privacy>) speichert es nie IP-Adressen
  oder den vollständigen User-Agent: Es hält sie bis zu 8 Stunden im
  Arbeitsspeicher, nur um einen wiederholten Besuch zu erkennen, ohne
  Cookies.
- **Die Summen kann jeder sehen**, im öffentlichen Dashboard unter
  <https://forkbuild.goatcounter.com/>.

Derselbe Zähler erfährt außerdem von drei Momenten beim Teilen eines
Bauwerks, jeweils als eine weitere Bildanfrage derselben Art, unter einem
eigenen festen Pfad:

- `/e/share-link`: ein Link zu einem Bauwerk wurde mit **Link kopieren**
  oder **Teilen …** kopiert oder geteilt;
- `/e/opened-shared-link`: ein geteilter Link hat ein Bauwerk geöffnet;
- `/e/remix-from-link`: ein über einen geteilten Link geöffnetes Bauwerk
  wurde in den Editor kopiert (höchstens einmal pro Bauwerk, solange die
  App geöffnet ist).

Ebenso erfährt er, wenn ForkBuild als App installiert wird
(`/e/installed`).

Ebenso erfährt er von Bauwerken, die in Seiten anderer Websites eingebettet
sind (siehe „Server, die ForkBuild kontaktiert“ unten):

- `/e/embed-code`: der Einbettungscode eines Bauwerks wurde mit
  **Einbetten → Code zum Einbetten kopieren** kopiert;
- `/e/embed-view`: ein eingebettetes Bauwerk wurde auf einer Seite gezeigt;
- `/e/embed-open`: ein eingebettetes Bauwerk wurde von dieser Seite aus in
  ForkBuild geöffnet.

Und wenn jemand bei der wöchentlichen Bau-Challenge mitmacht (**Mitmachen**
oder die Challenge unter **Neu** im Editor): `/e/challenge-join`.

Und wenn ForkBuild über einen Link aus einem seiner eigenen Launch-Posts
geöffnet wird, der auf `?ref=` und den Namen des Orts endet, an dem er
erschien (`hn`, `producthunt`, `reddit`, `itch`, `nostr`, `steem`, `blurt`, `edu` oder `github`; jeder andere Wert wird ignoriert): `/r/` und
dieser Name, etwa `/r/hn`, einmal. Die App nimmt `ref` danach aus der
Adresse, sodass ein Neuladen oder Weitergeben der Adresse es nicht noch
einmal sendet. Das zeigt, welche Posts Menschen gebracht haben, und nichts
darüber, wer sie sind oder was sie getan haben.

Jede sendet nur ihren Pfad und die Zufallszahl, nie den Link, das Bauwerk,
seinen Titel oder wer es gemacht hat. Welche Bauwerke über einen Link
geöffnet wurden, steht nur im Arbeitsspeicher der geöffneten Seite und ist
vergessen, sobald sie geschlossen wird.

Keine davon wird je gesendet:

- wenn Ihr Browser Global Privacy Control oder Do Not Track sendet;
- wenn Sie **Ihre Daten → Tägliche Besucherzählung → Diesen Browser
  mitzählen** abschalten (die Wahl bleibt nur in diesem Browser);
- von einer Kopie von ForkBuild, die anderswo als auf der offiziellen
  Website bereitgestellt wird, auch nicht von `localhost`.

Ein eingebettetes Bauwerk kann die Wahl **Diesen Browser mitzählen** nicht
lesen: Es öffnet keinen Speicher, und Browser halten den Speicher einer
Website innerhalb der Seiten anderer Websites ohnehin getrennt. Deshalb
folgen `/e/embed-view` und `/e/embed-open` nur den anderen beiden Regeln:
nie mit Global Privacy Control oder Do Not Track, und nur von der
offiziellen Website.

Der Code steht in `core/VisitorCount.js`,
`core/LaunchChannel.js`, `application/settings/CountDailyVisit.js`,
`application/settings/CountLaunchChannel.js`,
`application/settings/FunnelEventCounter.js`, `ui/counterHit.js`,
`ui/start.js` und `ui/embed/embedBoot.js`.

## Server, die ForkBuild kontaktiert

Jedes Skript, jeder Stil und jede Schrift stammt von der Website, von der
die App ausgeliefert wird (siehe
[docs/Deployment.md](../../Deployment.md) (Englisch)). Eines beginnt von
selbst: etwa 10 Sekunden nach dem Öffnen der App und danach alle paar
Minuten, solange ihr Tab sichtbar ist, liest sie neue Ankündigungen von den
Nostr-Relays, dem Arweave-Gateway sowie den Steem- und Blurt-Knoten, die unter
**Netzwerkeinstellungen** konfiguriert sind (docs/AnnouncementIndex.md). Sie
liest nur Ankündigungen (kleine Verweise und signierte Ansprüche), nie
Inhalte, und veröffentlicht nichts. Alles andere geschieht nur, wenn Sie die
jeweilige Funktion nutzen, und jeder Server lässt sich unter
**Netzwerkeinstellungen** ändern. Jeder Server sieht Ihre IP-Adresse und
was Sie bei ihm anfragen.

| Wann | Server (Standard) | Was er erhält |
| --- | --- | --- |
| Die App öffnet sich auf der offiziellen Website, höchstens einmal am Tag (siehe „Besucherzählung“) | GoatCounter (`forkbuild.goatcounter.com`) | eine Bildanfrage mit festem Pfad, ohne Referrer und ohne Cookie |
| Sie kopieren oder teilen auf der offiziellen Website einen Link zu einem Bauwerk, öffnen einen geteilten Link oder kopieren ein darüber geöffnetes Bauwerk in den Editor (siehe „Besucherzählung“) | GoatCounter (`forkbuild.goatcounter.com`) | eine Bildanfrage mit festem Pfad, der nennt, welcher der drei Momente es war, ohne Referrer und ohne Cookie |
| Sie installieren ForkBuild von der offiziellen Seite (siehe „Besucherzählung“) | GoatCounter (`forkbuild.goatcounter.com`) | eine Bildanfrage mit dem festen Pfad `/e/installed`, ohne Referrer und ohne Cookie |
| Auf der offiziellen Website kopieren Sie den Einbettungscode eines Bauwerks, oder ein eingebettetes Bauwerk wird gezeigt oder in ForkBuild geöffnet (siehe „Besucherzählung“) | GoatCounter (`forkbuild.goatcounter.com`) | eine Bildanfrage mit einem festen Pfad, der nennt, welcher der drei Fälle es war, ohne Referrer und ohne Cookie |
| Auf der offiziellen Website machen Sie bei der wöchentlichen Bau-Challenge mit (siehe „Besucherzählung“) | GoatCounter (`forkbuild.goatcounter.com`) | eine Bildanfrage mit dem festen Pfad `/e/challenge-join`, ohne Referrer und ohne Cookie |
| Sie öffnen die offizielle Website über den Link eines Launch-Posts (`?ref=…`, siehe „Besucherzählung“) | GoatCounter (`forkbuild.goatcounter.com`) | eine Bildanfrage mit dem festen Pfad `/r/<Kanal>`, ohne Referrer und ohne Cookie |
| Sie machen sich unter **Peers** auffindbar oder suchen jemanden | der Rendezvous-Server (`forkbuild-rendezvous.prazjp.workers.dev`) | den öffentlichen Schlüssel Ihrer Identität und ein Verbindungsangebot, höchstens 15 Minuten aufbewahrt; die Identität, die Sie suchen; wenn Sie sich mit jemandem verbinden, den Sie gefunden haben, Ihre Verbindungsantwort (sie listet Ihre Netzwerkadressen auf), die nur diese Person abholen kann |
| Sie treten einer öffentlichen Lobby bei oder sehen in eine hinein | derselbe Rendezvous-Server | Ihre signierte Lobby-Karte (öffentlicher Schlüssel, Anzeigename, welche Lobby), höchstens 15 Minuten aufbewahrt und erneuert, solange Sie bleiben; in welche Lobby Sie hineinsehen |
| Eine Peer-Verbindung beginnt | STUN-Server (`stun.l.google.com`) | nichts außer einer Anfrage nach Ihrer öffentlichen IP-Adresse |
| Sie beginnen eine Peer-Verbindung, wenn der Rendezvous-Server ein Relay anbietet | `/turn-credentials` des Rendezvous-Servers, dann sein TURN-Relay (Cloudflare) | eine Anfrage nach kurzlebigen Relay-Zugangsdaten, höchstens etwa einmal pro Stunde; weitergeleiteter Verkehr ist durch WebRTC Ende-zu-Ende-verschlüsselt |
| Die App ist geöffnet und ihr Tab sichtbar (Synchronisierung der Ankündigungen im Hintergrund) | Nostr-Relays (`relay.damus.io`), ein Arweave-Gateway (`arweave.net`), Steem-Knoten (`api.steemit.com`), Blurt-Knoten (`rpc.blurt.blog`) | Abfragen nach den Entdeckungs-Tags von ForkBuild: den gemeinsamen Tags für Snapshots und Kommentare sowie den Ortsnamen-Regionen und Kartenzellen, die Sie besucht haben |
| Sie öffnen das Repository oder eine Autorenseite | Nostr-Relays (`relay.damus.io`), ein Arweave-Gateway (`arweave.net`), Steem-Knoten (`api.steemit.com`), Blurt-Knoten (`rpc.blurt.blog`) | eine Abfrage nach dem gemeinsamen Veröffentlichungs-Tag (`forkbuild-publication`); dann eine Anfrage nach dem signierten Eintrag jeder neu angekündigten Veröffentlichung, höchstens 20 pro Besuch oder **Erneut prüfen** |
| Sie öffnen die Bau-Challenge einer Woche (**Challenge**) | Nostr-Relays (`relay.damus.io`), ein Arweave-Gateway (`arweave.net`) | eine Abfrage nach dem Tag dieser Woche (`forkbuild-tag:<tag>`); dann eine Anfrage nach dem signierten Datensatz jedes neu angekündigten Beitrags, höchstens 20 pro Besuch oder **Erneut prüfen** |
| Sie verteilen oder entdecken Veröffentlichungen über Nostr | Nostr-Relays (`relay.damus.io`) | signierte Ankündigungen, die Sie veröffentlichen; Ihre Abfragen |
| Sie speichern oder holen Inhalte auf Arweave | ein Arweave-Gateway (`arweave.net`) | die Inhalte, die Sie veröffentlichen; was Sie abrufen |
| Sie holen Inhalte von IPFS | ein IPFS-Gateway (`ipfs.filebase.io`) oder Ihr eigener IPFS-Knoten (`127.0.0.1:5001`) | was Sie abrufen oder hinzufügen |
| Sie pinnen Inhalte bei einem entfernten Pinning-Dienst (*experimentell*) | der Dienst, den Sie eingeben | den Inhalt und das Token, das Sie eingeben und das nur aufbewahrt wird, bis Sie die Seite schließen oder neu laden (nie gespeichert); Adresse und Feldnamen des Dienstes werden auf diesem Gerät aufbewahrt, sobald Sie sie unter **Inhaltsanbieter** speichern |
| Sie speichern, kündigen an oder verankern auf Steem, oder entdecken Steem-Ankündigungen (*experimentell*) | Steem-API-Knoten (`api.steemit.com`, dann `api.justyy.com`, dann `steemd.steemworld.org`); das Signieren läuft über die Erweiterung Steem Keychain | Ihren Steem-Kontonamen; was Sie posten (Ankündigungen, gespeicherte Inhalte, Anker), ist dauerhaft öffentlich auf der Chain, und Bearbeitungen lassen die frühere Version in ihrem Verlauf |
| Sie speichern, kündigen an oder verankern auf Blurt, oder entdecken Blurt-Beiträge (*experimentell*) | Blurt-API-Knoten (`rpc.blurt.blog`, dann `rpc.beblurt.com`, dann `rpc.drakernoise.com`); das Signieren läuft über die Erweiterung Blurt Keychain (oder WhaleVault) | Ihren Blurt-Kontonamen und die Konten, deren Beitragsverlauf gelesen wird (die, denen Sie folgen, und jedes Konto, das dieses Gerät unter den Tags von ForkBuild posten gesehen hat, auf diesem Gerät gemerkt); was Sie posten, ist dauerhaft öffentlich auf der Chain, unter Ihrem eigenen Konto, und Bearbeitungen lassen die frühere Fassung in seinem Verlauf. Jede Transaktion kostet Ihr Konto eine kleine Gebühr in BLURT |
| Sie verteilen den Signierten Anspruch einer Veröffentlichung auf Blurt (*experimentell*) | der Bildhoster von Blurt (`img-upload.blurt.blog`), direkt oder, wenn der Browser ihn nicht erreicht, über das `/blurt-image`-Relay des Rendezvous-Servers, das nichts speichert | ein 320×200-Bild des Bauwerks für die Vorschau des Beitrags, signiert mit Ihrem Blurt-Posting-Schlüssel |
| Sie verteilen den Signierten Anspruch einer Veröffentlichung auf Steem (*experimentell*) | der Steem-Bildhoster (`steemitimages.com`), direkt oder, wenn der Browser ihn nicht erreicht, über das `/steem-image`-Relay des Rendezvous-Servers, das nichts speichert | ein 320×200-Bild des Bauwerks für die Vorschau des Beitrags, signiert mit Ihrem Steem-Posting-Schlüssel |
| Jemand öffnet einen Link, der sein Bauwerk enthält (`/b/…`), oder eine Website zeigt eine Vorschau davon | der Rendezvous-Server (`forkbuild-rendezvous.prazjp.workers.dev`) | den Link, der das Bauwerk und seinen Signierten Anspruch enthält; er speichert nichts |
| Jemand öffnet eine Seite, in die ein Bauwerk eingebettet ist (`embed.html#…`) | die Website, von der ForkBuild bereitgestellt wird (`bowo-prasetyo.github.io`) | Anfragen nach den Dateien der Einbettung, ohne Referrer; nie das Bauwerk, das im Teil der Adresse steht, den Browser nicht senden |
| Eine Website oder ein Editor fragt, wie ein `/b/…`-Link eingebettet wird (oEmbed) | `/oembed` des Rendezvous-Servers (`forkbuild-rendezvous.prazjp.workers.dev`) | den Link, der das Bauwerk und seinen Signierten Anspruch enthält; er speichert nichts |
| Sie öffnen einen geteilten Link zu einer Veröffentlichung (`#/view/…`) | der Steem- oder Blurt-Knoten, das Arweave-Gateway oder das IPFS-Gateway, das der Link nennt, dann die Ankündigungssubstrate, um sein Bauwerk zu finden | welchen Beitrag, welche Transaktion oder welche CID Sie öffnen |
| Sie verankern oder überprüfen Nachweise auf Bitcoin (*experimentell*) | eine Esplora-API (`blockstream.info`) | die Transaktion, die Sie senden oder nachschlagen |
| Sie überprüfen Nachweise auf Base (*experimentell*) | ein Base-JSON-RPC-Endpunkt (`mainnet.base.org`) | die Transaktion, die Sie nachschlagen |
| Sie verbinden eine Browser-Wallet (*experimentell*) | die Wallet-Erweiterung, die Sie wählen | was immer sie Sie bestätigen lässt |

ForkBuild sendet Ihren privaten Schlüssel, Ihre Passphrase oder Ihre
gespeicherten Dokumente nie an einen dieser Server.

**Ein Link, der sein Bauwerk enthält** (von **Link kopieren** oder
**Teilen …** erstellt, bevor ein Bauwerk verteilt ist), trägt Ihre signierte
Geteilte Welt und das Bauwerk selbst. Er zeigt auf den Rendezvous-Server
(`forkbuild-rendezvous.prazjp.workers.dev/b/…`), damit Chat-Apps und soziale
Netzwerke den Titel des Bauwerks und ein Bild davon zeigen können: Wer den
Link öffnet, oder eine Website, die eine Vorschau davon zeigt, sendet ihn und
damit das Bauwerk an diesen Server. Er prüft die Signatur, zeichnet das Bild,
schickt Menschen weiter zur App (`#/s/…`, einem Teil der Adresse, den Browser
nie an einen Server senden) und speichert nichts. Cloudflare, das den Server
betreibt, kann die angefragten Adressen protokollieren. Einen Link zu
erstellen kontaktiert nichts. Wer den Link hat, sieht das Bauwerk, seinen
Titel, seine Beschreibung und den Namen des Autors sowie den öffentlichen
Schlüssel Ihrer Identität, wie bei jeder Geteilten Welt, die Sie verteilen.

**Ein eingebettetes Bauwerk** (der Code, den **Einbetten** kopiert: ein
`<iframe>` von `embed.html#…` auf der Website, von der ForkBuild
bereitgestellt wird) trägt dasselbe: Ihre signierte Geteilte Welt und das
Bauwerk. Die Seite, in die es eingefügt wird, lädt die Einbettung von dieser
Website, die weder das Bauwerk erfährt (es steht im Teil der Adresse, den
Browser nie an einen Server senden) noch die Seite drumherum (der Rahmen
sendet keinen Referrer). Im Browser des Lesers prüft die Einbettung die
Signatur und das Bauwerk, zeigt es und speichert nichts; sie startet keine
der Verbindungen der App, es werden also keine Peers, Relays oder anderen
Netzwerke kontaktiert. Wer die Seite sehen kann, sieht das Bauwerk, wie bei
seinem Link.

**Relays werden nur bei Bedarf genutzt.** Eine Verbindung versucht immer
zuerst einen direkten Weg, dann einen über STUN gefundenen, und weicht nur
auf das TURN-Relay aus, wenn beides nicht klappt. Während Sie in einer
Lobby warten, fordern die Angebote, die Ihr Gerät bereithält, nie
Relay-Zugangsdaten an, sodass ein Aufenthalt in der Lobby das monatliche
Relay-Kontingent des Rendezvous-Servers nicht aufbraucht; die Person, die
sich mit Ihnen verbindet, fordert eines an, falls sie es braucht.

## Benachrichtigungen auf diesem Gerät

Wenn Sie **Auf diesem Gerät benachrichtigen** (im Feld 🔔) einschalten,
zeigt Ihr Gerät Ihre neuen Benachrichtigungen selbst an, während ForkBuild
in einem Hintergrund-Tab oder als installierte App geöffnet ist. Dafür wird
kein Push-Dienst genutzt und nichts irgendwohin gesendet: Die geöffnete
Seite übergibt die Benachrichtigung Ihrem Browser, der sie über Ihr
Betriebssystem anzeigt. Der Text der Benachrichtigung (zum Beispiel der
Titel eines Bauwerks und der Name seines Urhebers) kann dann im
Benachrichtigungsverlauf Ihres Geräts bleiben, wie bei jeder App. Schalten
Sie es im selben Feld aus, oder blockieren Sie die Benachrichtigungen von
ForkBuild in den Website-Einstellungen des Browsers.

## Wenn Sie eine eigene Kopie betreiben

Eine Installation bestimmt die obigen Standardwerte: ihren
Rendezvous-Server (`peer/RendezvousConfig.js`), ob dieser Server ein
TURN-Relay anbietet (`server/rendezvous-worker/README.md`), und die übrigen
Standardwerte unter **Netzwerkeinstellungen**. Der Standard-Rendezvous-Server
akzeptiert nur den Ursprung der offiziellen Website, daher braucht eine
anderswo gehostete Kopie einen eigenen (siehe
[docs/Deployment.md](../../Deployment.md) (Englisch)). Wenn Sie ForkBuild
für andere hosten, passen Sie diese Seite an und nennen Sie Ihre Server.

Die Besucherzählung läuft nur auf der offiziellen Website, eine anderswo
gehostete Kopie zählt also nichts. Um Ihre eigenen Besucher zu zählen,
ändern Sie die Adressen in `core/VisitorCount.js` und den `img-src`-Eintrag
in der Content Security Policy von `index.html`.
