<!-- translation-of: docs/user/11-EvidenceAndStorage.md source-hash: e1a0025c62a961df -->
# 11 — Nachweise & Speicher

<!-- languages -->
[English](../11-EvidenceAndStorage.md) · **Deutsch** · [Español](../es/11-EvidenceAndStorage.md) · [Français](../fr/11-EvidenceAndStorage.md) · [Bahasa Indonesia](../id/11-EvidenceAndStorage.md) · [日本語](../ja/11-EvidenceAndStorage.md) · [한국어](../ko/11-EvidenceAndStorage.md) · [Português (Brasil)](../pt-BR/11-EvidenceAndStorage.md)
<!-- /languages -->

> **Größtenteils experimentell.** Das Speichern von Inhalten auf IPFS oder
> Arweave über den Block **Verteilung → Inhalt** einer Karte
> ([Eine Platzierung erstellen](#eine-platzierung-erstellen) und
> [Einen bevorzugten Anbieter verwenden](#einen-bevorzugten-anbieter-verwenden))
> ist eine reguläre Funktion. Alles andere hier ist **Experimentell**:
> externe Nachweise und beide Wallet-Abläufe, die Liste der
> Snapshot-Platzierungen, entferntes IPFS-Pinning und Steem. Es kann sich
> in einer späteren Version ändern oder entfernt werden, und was es erzeugt,
> wird möglicherweise nicht übernommen. Die Seite kennzeichnet diese Teile
> mit einem Abzeichen **Experimentell**.

Jede Karte auf der Seite **Veröffentlichungen** (siehe
[Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md))
hat Abschnitte, um nachzuweisen, *wann* eine Veröffentlichung existierte,
und um ihren Inhalt irgendwo abzulegen, wo andere ihn holen können:

- **[Externe Nachweise](#externe-nachweise)** — Datensätze auf Bitcoin,
  Base, Arweave, Steem oder Blurt, dass der Inhalts-Hash einer Veröffentlichung zu
  einem bestimmten Zeitpunkt existierte.
- **[Der Ablauf für Bitcoin-Anker](#der-ablauf-für-bitcoin-anker)** und
  **[Der Ablauf für Base-Anker](#der-ablauf-für-base-anker)** —
  schrittweise Abläufe, die mit Ihrer eigenen Wallet eine echte
  Transaktion schreiben.
- **[Snapshot-Platzierungen](#snapshot-platzierungen)** — signierte
  Verweise darauf, wo der Inhalt geholt werden kann: IPFS, Arweave oder
  dieses Gerät.
- **[Veröffentlichen auf IPFS](#veröffentlichen-auf-ipfs)** — Hochladen zu
  einem entfernten Pinning-Dienst.
- **[Steem](#steem)** — Posten, Speichern und Teilen von Links auf Steem.
- **[Blurt](#blurt)** — Posten, Speichern und Verankern auf Blurt, von Ihrem
  eigenen Konto, mit Belohnungen.

Nachweise und Platzierungen beantworten verschiedene Fragen. Ein Anker
zeigt, dass ein Hash zu einem Zeitpunkt erfasst wurde; er sagt nichts
darüber, ob die Bytes noch geholt werden können. Eine Platzierung sagt, wo
die Bytes geholt werden können; sie sagt nichts darüber, wann der Anspruch
zuerst erhoben wurde.

## Externe Nachweise

*Experimentell.*

Ein hier aufgeführter Anker bedeutet nur, dass dieses Gerät einen gültig
signierten Datensatz besitzt, der sagt: „Dies wurde extern erfasst.“ Ob
die Erfassung wirklich stattfand, wird erst geprüft, wenn Sie auf
**Nachweise überprüfen** klicken. Nichts auf der Seite überprüft
automatisch: nicht beim Laden, nicht beim Eintreffen von Nachweisen, nicht
beim Aufklappen der Liste.

### Nachweise erstellen

Im Abschnitt **Verteilung** einer Veröffentlichungskarte hat der Block
**Nachweis / Verankerung** (als **Experimentell** gekennzeichnet) eine
Karte für jede Art von Nachweis, die ein Klick erstellen kann, jeweils mit
eigener Schaltfläche: **Arweave-Anker erstellen** und **Steem-Anker
erstellen**. Bitcoin- und Base-Anker haben keine solche Karte: Sie werden
über ihre Wallet-Schritte im Reiter **Details → Dezentralisierung &
Nachweise** der Karte erstellt, und der Block sagt das. Haben Sie einen
bevorzugten Anbieter gespeichert, sind diese Karten unter **Weitere
Verankerungsoptionen** eingeklappt, unter der eigenen Schaltfläche dieses
Anbieters (siehe
[Bei einem bevorzugten Anbieter verankern](#bei-einem-bevorzugten-anbieter-verankern)).
Jede erfasst den Inhalts-Hash der Veröffentlichung in einer Transaktion in
diesem Netzwerk, mit einem von drei Ergebnissen:

| Ergebnis | Bedeutung |
|---|---|
| **Anker erstellt** | Es hat funktioniert. Der neue Anker erscheint in der Liste, noch nicht überprüft. |
| **Erfassung abgelehnt** | Das Netzwerk wurde erreicht und hat abgelehnt. |
| **Es wurde kein Anker erstellt** | Das Netzwerk war nicht erreichbar, oder dieses Gerät kann dafür nicht signieren. |

- Für Bitcoin nutzen Sie
  [Der Ablauf für Bitcoin-Anker](#der-ablauf-für-bitcoin-anker); für Base
  [Einen Base-Anker in einem Schritt erstellen](#einen-base-anker-in-einem-schritt-erstellen).
- **Arweave-Anker erstellen** braucht eine Arweave-Wallet-Erweiterung,
  etwa Wander.
- **Steem-Anker erstellen** braucht die Erweiterung Steem Keychain und Ihr
  Steem-Konto, festgelegt unter
  [Netzwerkeinstellungen → Steem](10-NetworkSettings.md#steem).
- **Blurt-Anker erstellen** braucht die Erweiterung Blurt Keychain (oder
  WhaleVault) und Ihr Blurt-Konto, festgelegt unter
  [Netzwerkeinstellungen → Blurt](10-NetworkSettings.md#blurt).

Eine Veröffentlichung, die erstellt wurde, bevor Inhalts-Hashes zu SHA-256
wurden, wird nie verankert, weder mit diesen Schaltflächen noch mit den
Schritten für Bitcoin oder Base noch mit **Mehrere Veröffentlichungen
verankern**: Niemand sonst kann Inhalte gegen ihren alten Hash prüfen,
daher würde ein Nachweis davon nichts beweisen. Sie erhalten **Erfassung
abgelehnt** (oder, bei Bitcoin und Base, einen fehlgeschlagenen
Transaktionsschritt) mit dem Hinweis, sie erneut zu veröffentlichen, bevor
eine Wallet gefragt wird. Dasselbe gilt für Platzierungen, die mit **Es
wurde keine Platzierung erstellt** enden.

Nach einem Erfolg lautet die Schaltfläche **Weiteren …-Anker erstellen**,
was einen zweiten, unabhängigen Anker erstellt. Base-Anker werden anders
erstellt; siehe
[Einen Base-Anker in einem Schritt erstellen](#einen-base-anker-in-einem-schritt-erstellen).

**Steem-Anker sind schwächer als Bitcoin-Anker.** Sie kosten keine Gebühr,
nur Resource Credits (die sich wieder auffüllen), und der Block ist etwa
eine Minute später endgültig. Bis dahin zeigt die Karte **Waiting for
finality** (wartet auf Endgültigkeit), dann **Anchored** (verankert)
(oder, selten, **Not anchored** — nicht verankert —, wenn die Chain ihn
verworfen hat: erstellen Sie ihn erneut). **Nachweise überprüfen** meldet
in dieser ersten Minute **Überprüfung nicht verfügbar** und sagt danach,
wann und von welchem Witness der Block erfasst wurde. **Nachweise
untersuchen** zeigt die Zeit des Blocks sofort, aus einer Kopie des
signierten Blockheaders, die Ihr Gerät offline prüft. Ein Steem-Block wird
von etwa 21 nach Stake gewählten Witnesses signiert, nicht durch Proof of
Work gesichert, daher könnten genug von ihnen gemeinsam die Geschichte
umschreiben; die Karte sagt „Attested by Steem witnesses“ (von
Steem-Witnesses bestätigt). Nutzen Sie einen Steem-Anker als schnellen,
kostenlosen Nachweis zusätzlich zu einem Bitcoin-Anker, nicht
stattdessen.

**Blurt-Anker** werden auf dieselbe Weise von den Witnesses von Blurt
bestätigt und sind ebenso schwächer als Bitcoin-Anker. Hat dieses Gerät den
Snapshot Ihres Bauwerks bereits auf Blurt gepostet (angekündigt oder dort
gespeichert), ist dieser Beitrag der Anker: **Blurt-Anker erstellen** postet
nichts und kostet nichts. Andernfalls fügt es den Inhalts-Hash des Bauwerks
Ihrem aktuellen Blurt-Beitrag hinzu oder erstellt einen neuen, gegen eine
kleine Gebühr in BLURT. Endgültigkeit, **Nachweise überprüfen** und
**Nachweise untersuchen** funktionieren wie bei Steem, und die Karte verlinkt
den Beitrag.

**Mehrere Veröffentlichungen auf einmal auf Steem verankern.** Unter
**Wallet, Archiv & Herausgeberwerkzeuge → Blockchain-Verankerung** listet
**Mehrere Veröffentlichungen auf Steem verankern** Ihre erfassten
Veröffentlichungen auf. Setzen Sie Häkchen bei denen, die Sie möchten
(oder **Nicht verankerte auswählen**), und klicken Sie auf **N
Veröffentlichungen auf Steem verankern**. Eine Bestätigung in Keychain
verankert bis zu 64. Jede Veröffentlichung bekommt trotzdem ihren eigenen
Anker, der einzeln überprüft wird. **Mehrere Veröffentlichungen auf Blurt
verankern** funktioniert genauso, mit einer Bestätigung in Blurt Keychain.

### Bei einem bevorzugten Anbieter verankern

Der Link **Konfigurieren** im Block **Nachweis / Verankerung** öffnet
[Nachweis-/Verankerungsanbieter](10-NetworkSettings.md#nachweis-verankerungsanbieter),
wo Sie einen Standard wählen. Danach beginnt der Block mit einer
Schaltfläche, die nach ihm benannt ist, etwa **Auf Steem verankern**, die
dort mit denselben Ergebnissen verankert wie die Schaltflächen oben. Sie
zeigt **Wird verankert …**, während sie arbeitet, und am Ende Transaktion
und Inhalts-Hash des neuen Ankers. Jede andere Art bleibt einen Klick
entfernt unter **Weitere Verankerungsoptionen**. Das Speichern einer
Präferenz ändert weder diese Schaltflächen noch bestehende Anker.

Es gibt keine solche Schaltfläche, und alle Optionen erscheinen, wenn
nichts gespeichert ist, wenn der gespeicherte Anbieter auf diesem Gerät
nicht registriert ist oder wenn er Bitcoin ist: Ein Bitcoin-Anker wird
über seine Wallet-Schritte erstellt (siehe
[Der Ablauf für Bitcoin-Anker](#der-ablauf-für-bitcoin-anker)), und der
Block sagt das.

### Bei Peers entdecken

Verbundene Peers geben nur Nachweise weiter, die erstellt oder erneut
angekündigt werden, während Sie verbunden sind. **Bei Peers entdecken**
schließt die Lücke: Es fragt nacheinander jeden verbundenen Peer nach jedem
Anker, den er für diese Veröffentlichung kennt, einschließlich solcher, die
er von anderen erfahren hat. Nichts anderes auf der Seite kontaktiert einen
Peer.

| Meldung | Bedeutung |
|---|---|
| *N neue Nachweisansprüche bei Peers entdeckt.* | Sie stehen jetzt in der Liste unten. |
| *Bei Peers wurden keine neuen Nachweisansprüche entdeckt.* | Diese Peers hatten nichts Neues. Das heißt nicht, dass keine Nachweise existieren. |
| *Es war kein authentifizierter Peer verfügbar, der gefragt werden konnte.* | Verbinden Sie sich zuerst mit einem Peer (siehe [Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)). |
| *Die angeforderte Entdeckung bei Peers konnte nicht abgeschlossen werden.* | Etwas ist lokal fehlgeschlagen, bevor ein Peer gefragt wurde. |

Entdeckte Anker kommen unüberprüft an, Ihre früheren Überprüfungsergebnisse
bleiben erhalten, und derselbe Anker wird nie zweimal hinzugefügt.

### Die Nachweisliste

Im Reiter **Dezentralisierung & Nachweise** der Karte zeigt **Externe
Nachweise**, wie viele Anker bekannt sind, und bietet **Bei Peers
entdecken** (oben). **Nachweise zeigen** listet jeden für die
Veröffentlichung bekannten Anker nebeneinander auf, auch solche, die sich
widersprechen. Bei mehr als einem Anker kommt zuerst eine Zusammenfassung
**Inhaltsbindung**, die Anker pro Inhalts-Hash zählt und warnt, wenn sie
verschiedene Hashes beanspruchen. Sie sagt nicht, welcher richtig ist.

Jeder Anker zeigt:

| Feld | Bedeutung |
|---|---|
| **Fundort** | Wo das externe System die Erfassung zu finden angibt. |
| **Erfasst** | Die beanspruchte Erfassungszeit (beansprucht, bis Sie überprüfen). |
| **Veröffentlichung / Inhalts-Hash** | Was die Signatur dieses Ankers miteinander verbindet. |
| **Bestätigt von** | Die Identität, die den Anker signiert hat. |

- **Nachweise überprüfen** (danach **Erneut überprüfen**) prüft jetzt beim
  externen System; siehe
  [Ergebnisse der Überprüfung](#ergebnisse-der-überprüfung).
- **Nachweise untersuchen** zeigt den rohen Anspruch: die genaue Zeit, den
  Fundort und bei Bitcoin einen Link zu einem Block-Explorer und den rohen
  Nachweis. Es liest nur, was auf Ihrem Gerät ist. Ganz unten sagt
  **Lokales Wissen**, wie dieses Gerät von dem Anker erfahren hat:
  **Beschaffung** (*Lokal erfahren*, *Über Paketimport erfahren* oder
  *Über Austausch mit Peers erfahren*) und **Von diesem Replikat zuerst
  gesehen**. Es nennt nie den Peer und ist kein Vertrauenssignal.

### Ergebnisse der Überprüfung

| Bezeichnung | Bedeutung |
|---|---|
| **Unabhängig überprüft** | Das externe System bestätigt genau, was beansprucht wurde. |
| **Nachweis nicht unabhängig überprüft** | Echt signiert, aber dieses Gerät kann diese Art von Anker nicht extern prüfen. |
| **Überprüfung nicht verfügbar** | Das externe System war nicht erreichbar. Das ist nicht dasselbe wie ungültig. |
| **Ungültiger Nachweis** / **Ungültige Signatur** | Der Datensatz ist fehlerhaft oder wurde nicht echt signiert. |
| **Inhalt weicht ab** | Der Anker passt nicht zu dieser Veröffentlichung. |
| **Ungültiger externer Nachweis** | Das externe System sagt, dass der Anspruch falsch ist. |

Wurde ein Anker früher bei diesem Besuch überprüft und kann eine spätere
Prüfung das Netzwerk nicht erreichen, behält er einen Hinweis: „Dieser
Nachweis wurde früher unabhängig überprüft; die Überprüfung ist derzeit
nicht verfügbar.“

Base-Anker, ob hier erstellt oder empfangen, werden mit derselben
Schaltfläche **Nachweise überprüfen** überprüft.

### Abgleich von Bitcoin-Ankern

Die Karte eines Bitcoin-Ankers hat außerdem einen Abschnitt
**Bitcoin-Anker**. **Abgleichen** (danach **Erneut abgleichen**) stellt
zwei getrennte Fragen und zeigt beide Antworten:

| Bestätigung | Bedeutung |
|---|---|
| **Transaktion bestätigt** | Gemined; zeigt Blockhöhe, Block-Hash und Bestätigungen. |
| **Transaktion nicht bestätigt** | Nicht gefunden oder noch nicht gemined (beides wird nicht unterschieden). |
| **Bestätigungsstatus nicht verfügbar** | Konnte nicht geprüft werden. |

| Inhaltsnachweis | Bedeutung |
|---|---|
| **Hash passt zu OP_RETURN** | Die Transaktion trägt den beanspruchten Inhalts-Hash. |
| **Hash passt nicht zu OP_RETURN** | Sie tut es nicht, oder der Nachweis ist fehlerhaft. |
| **Inhaltsnachweis nicht verfügbar** | Konnte nicht geprüft werden. |

Eine bestätigte Transaktion, deren OP_RETURN nicht passt, wird so
angezeigt, wie sie ist. Die Bestätigung jedes Abgleichs wird zu
**Bestätigungsverlauf zeigen** hinzugefügt, die älteste zuerst; beim
Inhaltsnachweis wird nur das neueste Ergebnis gezeigt.

## Der Ablauf für Bitcoin-Anker

Ein schrittweiser Ablauf, der mit Ihrer eigenen Bitcoin-Wallet den
Inhalts-Hash einer Veröffentlichung in eine echte Transaktion schreibt.
Jeder Schritt ist ein eigener Klick.

> **Das gibt echte Bitcoin im Bitcoin-Mainnet aus.** Ab
> **Transaktionsplan erstellen** arbeitet es mit den echten Mitteln Ihrer
> Wallet, und **Transaktion senden** sendet eine echte Transaktion. Es
> gibt keinen Testmodus.

Alle seitenweiten Bereiche liegen unter **Wallet, Archiv &
Herausgeberwerkzeuge → Blockchain-Verankerung**, dem eingeklappten Bereich
ganz unten auf der Seite Veröffentlichungen; die Schritte pro
Veröffentlichung stehen auf der Karte jeder Veröffentlichung. Wo ein
Schritt zuerst eine beobachtete Wallet oder ein beobachtetes Guthaben
braucht, öffnet sein Link diesen Bereich für Sie.

### Was Sie brauchen

- Die Browsererweiterung **UniSat** (`window.unisat`); keine andere
  Bitcoin-Wallet wird bisher unterstützt.
- Ein Konto mit ausgebbaren Bitcoin an einer **nativen SegWit**-Adresse
  (beginnend mit `bc1q…`). Guthaben an Taproot- (`bc1p…`) oder
  Legacy-Adressen (`1…`, `3…`) kann beobachtet, aber nicht signiert
  werden; die Prüfung meldet es als nicht prüfbar.
- Eine Veröffentlichung auf Ihrer Seite Veröffentlichungen; die
  Transaktion verankert ihren Inhalts-Hash.

### Eine Wallet verbinden

Klicken Sie auf der Karte **Bitcoin-Wallet** auf **Bitcoin-Wallet
verbinden** und bestätigen Sie die Verbindung in der Erweiterung.
ForkBuild sieht nie Ihre Schlüssel, Ihre Seed-Phrase oder Ihr Passwort; es
erhält Ihre Adresse, Ihr Netzwerk und, solange verbunden, eine
Signierfunktion.

| Zustand | Bedeutung |
|---|---|
| **Verbunden** | Zeigt **Konto** und **Netzwerk**. |
| **Getrennt** | Noch nicht verbunden, oder Sie haben abgelehnt. |
| **Wallet nicht verfügbar** | Keine Erweiterung, sie ist gesperrt, oder sie ist nicht erreichbar. |

Die Verbindung wird überall auf der Seite genutzt. **Trennen** beendet
sie, und ein Neuladen vergisst sie. Eine Wallet in einem anderen Netzwerk
als dem Mainnet wird als Abweichung gemeldet; ForkBuild wechselt nie das
Netzwerk für Sie.

### Guthaben beobachten

Sobald verbunden, erscheint die Karte **Bitcoin-Guthaben**.
**Wallet-Guthaben beobachten** (danach **Guthaben aktualisieren**) liest,
was das Konto jetzt ausgeben kann. Es gibt nichts aus, reserviert nichts
und aktualisiert sich nicht von selbst.

| Zustand | Bedeutung |
|---|---|
| **Guthaben beobachtet** | Anzahl der UTXOs (**Guthaben-Eingänge zeigen** listet sie auf), ihre Summe, der Skripttyp und die Wechselgeldadresse (immer Ihr eigenes Konto). |
| **Nicht unterstütztes Adressformat** | Ein Adresstyp, für den es noch keine Gebührenunterstützung gibt, etwa Legacy `3…`. |
| **Guthaben nicht verfügbar** | Die Quelle des Guthabens war nicht erreichbar. |

Verbinden Sie sich danach in einem anderen Netzwerk neu, warnt ein
Hinweis, dass die Beobachtung veraltet ist.

### Einen Transaktionsplan erstellen

Im Reiter **Dezentralisierung & Nachweise** der Veröffentlichungskarte ist
**Bitcoin-Ankertransaktion → Transaktionsplan erstellen** aktiv, sobald
Sie ein Guthaben beobachtet haben. Es plant auf Grundlage der neuesten
Beobachtung, wählt die UTXOs vom größten an und berechnet die Gebühr.

| Zustand | Bedeutung |
|---|---|
| **Transaktionsplan erstellt** | Netzwerk, Inhalts-Hash, Eingänge, Gebühr, Wechselgeld, Eingang gesamt, die vollständige Liste der Ein- und Ausgänge und wann das Guthaben beobachtet und der Plan erstellt wurde. |
| **Transaktion kann nicht erstellt werden** | Meist kann das Guthaben die Gebühr nicht decken. |

Ein neuer Plan ersetzt alles, was zuvor geprüft, signiert oder gesendet
wurde.

### Prüfen und signieren

Ein Plan füllt sofort den Bereich **Bitcoin-Ankertransaktion prüfen**:
Netzwerk, Inhalts-Hash, Gebühr, Wechselgeld, Eingang gesamt, Ein- und
Ausgänge und ob das Netzwerk Ihrer Wallet zu dieser Transaktion passt.
**Geprüfte Transaktion signieren** (aktiv, wenn eine passende Wallet
verbunden ist) bittet die Wallet, zu signieren. ForkBuild prüft vorher, ob
das zu Signierende noch genau das ist, was Sie geprüft haben; wenn nicht,
wird die Wallet nicht gefragt.

| Zustand | Bedeutung |
|---|---|
| **Die Wallet hat eine signierte PSBT zurückgegeben** | Die Antwort enthält Signiermaterial für diese Transaktion. Es ist noch nicht überprüft; das ist der nächste Schritt. |
| **Signieren abgelehnt** | Sie oder die Wallet haben abgelehnt. |
| **Wallet nicht verfügbar** | Keine Wallet verbunden, oder sie ist nicht erreichbar. |
| **Signieren fehlgeschlagen** | Die Wallet hat etwas Unbrauchbares zurückgegeben. |

### Überprüfen und finalisieren

**Transaktion überprüfen & finalisieren** prüft die Signatur
kryptografisch, offline.

| Zustand | Bedeutung |
|---|---|
| **Transaktion finalisiert** | Die Signatur ist gültig. Zeigt die Transaktions-ID und unter **Rohe Transaktionsbytes** die finalisierte Transaktion. |
| **Signatur ungültig** | Falscher Schlüssel, falsche Signatur oder über die falschen Daten signiert. |
| **Finalisierung fehlgeschlagen** | Ein anderes unbrauchbares Ergebnis. |

Nur native SegWit-Eingänge (P2WPKH) können finalisiert werden. Das
Finalisieren erfasst außerdem eine
[Bitcoin-Ankerveröffentlichung](#bitcoin-ankerveröffentlichungen).

### Senden

**Transaktion senden** sendet die finalisierten Bytes unverändert an das
Bitcoin-Netzwerk.

| Zustand | Bedeutung |
|---|---|
| **Transaktion gesendet** | Vom Netzwerk angenommen, aber noch nicht gemined. |
| **Transaktion abgelehnt** | Abgelehnt. |
| **Senden nicht verfügbar** | Das Netzwerk war nicht erreichbar. |

**Erneut senden** sendet dieselben Bytes noch einmal. Nichts wiederholt
sich von selbst.

### Bestätigung beobachten

Nach dem Senden prüft **Bestätigung beobachten**, ob die Transaktion
gemined wurde, mit denselben drei Ergebnissen wie beim
[Abgleich von Bitcoin-Ankern](#abgleich-von-bitcoin-ankern). Jede Prüfung
wird zu **Bestätigungsverlauf zeigen** dieses Sendevorgangs hinzugefügt.
Diese Liste wird beim Neuladen geleert, aber jedes Ergebnis wird auch im
[Beobachtungsarchiv der Veröffentlichungen](12-ArchiveAndLeaderboards.md#das-beobachtungsarchiv-der-veröffentlichungen)
aufbewahrt.

### Was der Ablauf nicht tut

Selbst eine bestätigte Transaktion erstellt keinen Eintrag unter **Externe
Nachweise**, sodass andere sie nicht als Nachweis entdecken können. Die
Ansichten für Prüfen, Signieren und Senden werden durch einen neuen Plan,
eine neue Signatur oder ein Neuladen geleert. Erhalten bleiben der beim
Finalisieren erstellte Veröffentlichungsdatensatz und jedes Sende- und
Bestätigungsergebnis im Beobachtungsarchiv.

### Bitcoin-Ankerveröffentlichungen

Die Karte **Bitcoin-Ankerveröffentlichungen** listet einen Datensatz für
jede Transaktion auf, die dieses Gerät finalisiert hat: `{ Anker-ID,
Inhalts-Hash, txid, Netzwerk, erstellt am }`. Er entsteht, wenn
**Transaktion überprüfen & finalisieren** gelingt, ob das Senden später
klappt oder nicht, und hat keinen eigenen Status „bestätigt“ oder „gültig“.
**Veröffentlichungen zeigen** listet sie auf. Jede Zeile hat:

- **Beobachtungen untersuchen** — Zählungen aller Tatsachen zu Senden,
  Bestätigung, Inhaltsnachweis, Chain-Platzierung und Konsistenz, die das
  Archiv für diese Anker-ID enthält.
- **Lebenszyklus der Veröffentlichung zeigen** — dieselben Tatsachen in
  zeitlicher Reihenfolge, beginnend mit **Veröffentlichungsdatensatz
  erstellt**. Ein Schritt, zu dem nichts erfasst ist, fehlt einfach. Das
  Öffnen kontaktiert kein Netzwerk.

## Der Ablauf für Base-Anker

Dieselbe Idee auf **Base**, einem Ethereum-kompatiblen Netzwerk. Es ist
von Bitcoin getrennt: eigene Wallet, eigene Transaktion (eine Überweisung
an sich selbst, die den Inhalts-Hash als Daten trägt), eigene Begriffe.

> **Das gibt echte Mittel im Base-Mainnet aus, oder Testmittel auf Base
> Sepolia — je nachdem, in welchem Netzwerk Ihre Wallet ist.** ForkBuild
> wählt nie das Netzwerk für Sie.

### Was Sie brauchen

- Eine Browser-Wallet mit der Standardschnittstelle
  [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) `window.ethereum`,
  etwa Coinbase Wallet oder MetaMask.
- Ein Konto auf Chain-ID **8453** (Base-Mainnet) oder **84532** (Base
  Sepolia). Jede andere Chain wird als Abweichung gemeldet.
- Eine Veröffentlichung auf Ihrer Seite Veröffentlichungen.

### Eine Wallet verbinden und ein Konto beobachten

Klicken Sie auf der Karte **Base-Netzwerk** (unter **Wallet, Archiv &
Herausgeberwerkzeuge → Blockchain-Verankerung**) auf **Base-Wallet
verbinden** und bestätigen Sie. Die Zustände sind **Verbunden**,
**Getrennt** und **Wallet nicht verfügbar**, wie bei Bitcoin; **Trennen**
beendet die Verbindung, und ein Neuladen vergisst sie.

Dann liest **Base-Konto beobachten** (später **Beobachtung
aktualisieren**) Chain und Guthaben des Kontos:

| Abzeichen | Bedeutung |
|---|---|
| **Base-Konto beobachtet** | **Netzwerk**, **Chain-ID**, **Konto**, **Natives Guthaben** (in Wei) und wann beobachtet. |
| **Das verbundene Netzwerk ist nicht Base** | Zeigt die tatsächlich gefundene Chain-ID. |
| **Base-Konto nicht verfügbar** | Die Wallet war nicht erreichbar. |

### Einen Transaktionsplan erstellen

Im Reiter **Dezentralisierung & Nachweise** der Veröffentlichungskarte
erstellt **Base-Veröffentlichungstransaktion → Base-Transaktionsplan
erstellen** (aktiv, sobald Sie ein Konto beobachtet haben) eine
unsignierte Überweisung von Ihrem Konto an sich selbst, die den
Inhalts-Hash als Daten trägt.

| Zustand | Bedeutung |
|---|---|
| **Transaktionsplan erstellt** | Netzwerk, Chain-ID, Inhalts-Hash, Von/An (dieselbe Adresse), Wert, Nonce, Gaslimit, Höchstgebühr und Prioritätsgebühr (in Wei), die Daten und wann das Konto beobachtet und der Plan erstellt wurde. |
| **Base-Netzwerk nicht verfügbar** | Konto, Gebühr oder Nonce konnten nicht gelesen werden. |
| **Transaktion kann nicht erstellt werden** | Ein anderer Fehler. |

Ein neuer Plan ersetzt alles, was zuvor geprüft, signiert oder gesendet
wurde.

### Prüfen und signieren

Ein Plan füllt sofort die **Prüfung der Base-Transaktion** der Karte: Von,
An, Wert, Nonce, Gaswerte, Inhalts-Hash und Transaktionsdaten. **Geprüfte
Transaktion signieren** bittet die Wallet, genau diesen Plan zu signieren.

| Zustand | Bedeutung |
|---|---|
| **Die Wallet hat eine signierte Transaktion zurückgegeben** | Signiert, aber noch nicht überprüft. |
| **Signieren abgelehnt** | Sie oder die Wallet haben abgelehnt. |
| **Wallet nicht verfügbar** | Keine Wallet verbunden, oder sie ist nicht erreichbar. |
| **Signieren fehlgeschlagen** | Die Wallet hat etwas Unbrauchbares zurückgegeben. |

### Einen Base-Anker in einem Schritt erstellen

In derselben Prüfkarte signiert, finalisiert und sendet **Base-Anker
erstellen** die geprüfte Transaktion mit einem Klick und fügt sie dann der
Nachweisliste der Veröffentlichung hinzu. Es ist eine Alternative zu den
schrittweisen Schaltflächen, die weiterhin funktionieren.

| Abzeichen | Bedeutung |
|---|---|
| **Anker erstellt** | Gesendet; der neue Anker erscheint aufgeklappt in der [Nachweisliste](#die-nachweisliste). |
| **Erfassung abgelehnt** | Signieren, Finalisieren oder Senden wurde abgelehnt. |
| **Es wurde kein Anker erstellt** | Wallet oder Netzwerk waren nicht erreichbar. |

Danach lautet es **Weiteren Base-Anker erstellen**. Es nutzt Ihre Wallet
und sendet eine echte Transaktion.

### Überprüfen, finalisieren und senden

**Transaktion überprüfen & finalisieren** prüft die Signatur offline gegen
den geprüften Plan und ermittelt den Unterzeichner.

| Zustand | Bedeutung |
|---|---|
| **Transaktion finalisiert** | Gültig; zeigt den ermittelten Unterzeichner und den Transaktions-Hash. |
| **Signatur ungültig** | Falscher Schlüssel, falsche Signatur oder falsche Daten. |
| **Finalisierung nicht verfügbar** / **Finalisierung fehlgeschlagen** | Konnte nicht geprüft werden, oder ein anderes unbrauchbares Ergebnis. |

Das Finalisieren erfasst eine
[Base-Ankerveröffentlichung](#base-ankerveröffentlichungen). Dann sendet
**Transaktion senden** sie: **Transaktion gesendet** (mit der
**Transaktions-ID**; noch nicht in einen Block aufgenommen), **Transaktion
abgelehnt** oder **Senden nicht verfügbar**. **Erneut senden** sendet
dieselben Bytes noch einmal.

### Aufnahme beobachten

Nach dem Senden prüft **Transaktion beobachten** im Abschnitt **Aufnahme
der Base-Transaktion**, ob sie in einem Block ist:

| Abzeichen | Bedeutung |
|---|---|
| **Transaktion aufgenommen** | Base meldet einen Beleg: Block-Hash, Blocknummer, Transaktionsindex, Bestätigungen. Eine Reorganisation der Chain ist weiterhin möglich und wird nicht erkannt. |
| **Transaktion nicht aufgenommen** | Noch kein Beleg (ausstehend und nie gesendet werden nicht unterschieden). |
| **Aufnahmestatus nicht verfügbar** | Konnte nicht geprüft werden. |

**Transaktion erneut beobachten** ergänzt **Beobachtungsverlauf zeigen**.
Diese Liste wird beim Neuladen geleert, aber jede Beobachtung wird auch im
[Beobachtungsarchiv der Veröffentlichungen](12-ArchiveAndLeaderboards.md#das-beobachtungsarchiv-der-veröffentlichungen)
aufbewahrt.

### Base-Ankerveröffentlichungen

Wie bei Bitcoin führt die Karte **Base-Ankerveröffentlichungen** einen
Datensatz pro finalisierter Transaktion: `{ Inhalts-Hash, txid, Netzwerk,
erstellt am }`. **Veröffentlichungen zeigen** listet sie auf, und
**Lebenszyklus der Veröffentlichung zeigen** zeigt
**Veröffentlichungsdatensatz erstellt**, gefolgt von jeder
**Aufnahmebeobachtung Nr. N**. Base-Sendeergebnisse werden nicht
gespeichert, daher gibt es keinen Eintrag für das Senden.

Nur **Base-Anker erstellen** fügt einen Eintrag unter Externe Nachweise
hinzu; der schrittweise Ablauf tut das nie.

## Snapshot-Platzierungen

Eine Platzierung auf IPFS, Arweave oder Lokal zu erstellen ist eine
reguläre Funktion; die Liste im Reiter **Platzierungen & IPFS** und alles
nach [Einen bevorzugten Anbieter verwenden](#einen-bevorzugten-anbieter-verwenden)
ist *experimentell*.

Eine **Snapshot-Platzierung** ist ein signierter Anspruch, dass ein
Speicher-Backend — **IPFS**, **Arweave** oder der eigene **lokale**
Speicher dieses Geräts — die Bytes für den Inhalts-Hash einer
Veröffentlichung liefern kann. Es ist keine Garantie, dass sie morgen noch
da sind. Mehrere Platzierungen auf verschiedenen Backends und von
verschiedenen Menschen können nebeneinander bestehen; keine wird
bevorzugt.

### Eine Platzierung erstellen

Im Abschnitt **Verteilung** einer Veröffentlichungskarte hat der Block
**Inhalt** eine Karte pro Backend, mit **Lokal-Platzierung erstellen**,
**IPFS-Platzierung erstellen** oder **Arweave-Platzierung erstellen**.
Haben Sie einen bevorzugten Speicher gespeichert, beginnt der Block mit
einer Schaltfläche dafür, etwa **Auf IPFS speichern**, und klappt diese
Karten unter **Weitere Speicheroptionen** ein. Jede nimmt die Bytes, die
dieses Gerät für die Veröffentlichung besitzt, und übergibt sie an dieses
Backend:

- **Platzierung erstellt** — angenommen; darunter erscheint eine neue
  signierte Platzierung.
- **Es wurde keine Platzierung erstellt** — das Backend war nicht
  erreichbar, oder dieses Gerät besitzt den Inhalt nicht.

Danach lautet die Schaltfläche **Weitere …-Platzierung erstellen**. Eine
zu erstellen bedeutet nur, dass ein Backend die Bytes gerade angenommen
hat.

- **IPFS** braucht die API Ihres eigenen IPFS-Knotens, standardmäßig unter
  `http://127.0.0.1:5001` (änderbar unter
  [Inhaltsanbieter](10-NetworkSettings.md#inhaltsanbieter)). Ohne laufenden
  Knoten erhalten Sie **Es wurde keine Platzierung erstellt**.
- **Arweave** braucht eine Wallet-Erweiterung, etwa Wander.

Zum *Lesen* von IPFS-Platzierungen brauchen Sie keinen Knoten:
**Snapshot auflösen** und **Snapshot materialisieren** nutzen öffentliche
Gateways (siehe [IPFS-Gateway](10-NetworkSettings.md#ipfs-gateway)),
sodass Sie Inhalte holen können, die andere platziert haben.

### Einen bevorzugten Anbieter verwenden

**Auf … speichern** oben im Block **Inhalt** und **Bevorzugten Anbieter
verwenden** im Reiter **Details → Platzierungen & IPFS** der Karte
erstellen eine Platzierung auf dem Backend, das unter
[Inhaltsanbieter](10-NetworkSettings.md#inhaltsanbieter) gespeichert ist.
Das Speichern einer Präferenz ändert weder die ausdrücklichen
Schaltflächen noch bestehende Platzierungen. Ist nichts oder IPFS
(entferntes Pinning) gespeichert, zeigt der Block **Inhalt** jedes Backend
statt **Auf … speichern**.

| Bezeichnung | Bedeutung |
|---|---|
| **Platzierung erstellt** | Wie ein Klick auf die Schaltfläche dieses Backends. |
| **Es wurde keine Platzierung erstellt** | Keine Präferenz gespeichert. |
| **Bevorzugter Anbieter nicht gefunden** | Das gespeicherte Backend ist auf diesem Gerät nicht registriert, oder es ist IPFS (entferntes Pinning), das jedes Mal einen eingegebenen Endpunkt braucht. |

### Die Liste der Snapshot-Platzierungen

Im Reiter **Platzierungen & IPFS** der Karte listet **Platzierungen
zeigen** jede für die Veröffentlichung bekannte Platzierung auf: solche,
die Sie erstellt haben, solche, die ein Peer gesendet hat, und solche in
einem importierten Bauplanpaket.

| Feld | Bedeutung |
|---|---|
| **Fundort** | Wo das Backend die Bytes zu finden angibt. |
| **Platziert** | Die beanspruchte Platzierungszeit. |
| **Veröffentlichung** / **Inhalts-Hash** | Was die Signatur der Platzierung miteinander verbindet. |
| **Platziert von** | Die Identität, die sie signiert hat. |

Jede hat bis zu drei Schaltflächen:

- **Platzierung untersuchen** — die eigenen Felder der Platzierung und bei
  IPFS ein Gateway-Link. Es kontaktiert kein Netzwerk. Darunter zeigt
  **Lokales Wissen**, wie dieses Gerät davon erfahren hat (*Lokal
  erfahren*, *Über Paketimport erfahren* oder *Über Austausch mit Peers
  erfahren*) und wann es **Von diesem Replikat zuerst gesehen** wurde.
- **Snapshot auflösen** (danach **Erneut auflösen**) — prüft beim
  Backend, ob die Bytes jetzt abrufbar sind, ohne sie zu speichern.
- **Snapshot materialisieren** (danach **Erneut materialisieren**) — löst
  auf und speichert die Bytes, wenn das klappt, auf diesem Gerät (siehe
  [Lokaler Snapshot](09-PublicationsAndEvidence.md#lokaler-snapshot)). Sie
  wählen die Platzierung; es versucht nie von selbst eine andere.

| Ergebnis des Materialisierens | Bedeutung |
|---|---|
| **Materialisiert** | Geholt, passend und hier gespeichert. |
| **Bereits verfügbar** | Dieses Gerät hatte bereits passende Bytes. |
| **Derzeit nicht verfügbar** | Das Backend war nicht erreichbar oder hat sie nicht. |
| **Abgelehnt** | Die Bytes passten nicht zum Hash der Platzierung. |
| **Ungültige Platzierung** | Der Datensatz ist fehlerhaft oder wurde nicht echt signiert. |

### Ergebnisse der Auflösung

| Abzeichen | Bedeutung |
|---|---|
| **Inhalt verfügbar** | Das Backend hat Bytes geliefert, die zum Inhalts-Hash passen. |
| **Kein Speicher-Backend konfiguriert** | Dieses Gerät hat kein Backend für diese Speicherart. |
| **Inhalt nicht verfügbar** | Erreicht, aber es hat die Bytes jetzt nicht. |
| **Der abgerufene Inhalt passt nicht zu dieser Platzierung** | Das Backend hat die falschen Bytes geliefert. |
| **Ungültige Platzierung** / **Ungültige Signatur** | Der Datensatz ist fehlerhaft oder wurde nicht echt signiert. |

Ergebnisse bleiben für diesen Besuch auf dieser Seite und werden nicht
geteilt. Zwei Menschen können für dieselbe Platzierung verschiedene
Ergebnisse bekommen (etwa wenn nur einer einen IPFS-Knoten betreibt). Wurde
eine Platzierung früher bei diesem Besuch aufgelöst und ist später nicht
erreichbar, vermerkt sie: „Dieser Snapshot wurde früher erfolgreich
aufgelöst; derzeit ist er nicht verfügbar.“ Eine Abweichung wird nie auf
diese Weise abgemildert.

### Beziehungen der Platzierungen

Bei mehr als einer Platzierung zeigt eine Karte **Beziehungen der
Platzierungen**, wie viele Backends und verschiedene Orte es gibt, zählt
die Platzierungen pro Inhalts-Hash und zeigt **Inhaltsbindung:
ÜBEREINSTIMMUNG** oder **WIDERSPRUCH** (mit einer Warnung). Das beruht nur
auf den Ansprüchen, nicht darauf, ob Sie sie aufgelöst haben, und eine
größere Gruppe gilt nicht als wahrscheinlicher richtig.

## Veröffentlichen auf IPFS

*Experimentell.* Der Abschnitt **Veröffentlichen auf IPFS**, unter den
Snapshot-Platzierungen im Reiter **Platzierungen & IPFS** der Karte, lädt
den Inhalt zu einem Pinning-Dienst Ihrer Wahl hoch. (Wie der Abschnitt
sagt: Ein lokaler Kubo-Knoten kann auflösen und veröffentlichen, ein
entferntes Gateway kann nur auflösen, und entferntes Pinning kann nur
veröffentlichen.) Anders als bei einer Platzierung ist das Ergebnis kein
signierter Anspruch, den andere entdecken können: Es ist ein Nachweis, dass
ein Anbieter diese Bytes angenommen hat. Die angezeigten Ergebnisse werden
beim Neuladen geleert, aber jede erfolgreiche Veröffentlichung und jede
Überprüfung wird auch im
[Beobachtungsarchiv der Veröffentlichungen](12-ArchiveAndLeaderboards.md#das-beobachtungsarchiv-der-veröffentlichungen)
aufbewahrt.

### Einen Anbieter für entferntes Pinning konfigurieren

ForkBuild wird ohne Pinning-Anbieter ausgeliefert. Klicken Sie auf
**Entferntes Veröffentlichen konfigurieren** (später **Entferntes
Veröffentlichen neu konfigurieren**):

| Feld | Bedeutung |
|---|---|
| **Endpunkt** | Die Upload-URL des Dienstes. Erforderlich. |
| **Zugangsdaten** (optional) | Als Bearer-Header `Authorization` gesendet. Nie wieder angezeigt; die Karte sagt nur **konfiguriert** oder **nicht konfiguriert**. |
| **Anfragefeld** (optional) | Das Formularfeld für die Datei. Standard `file`. |
| **Antwortfeld** (optional) | Das Antwortfeld mit der CID. Standard `cid`. |

**Konfiguration speichern** behält sie nur für diesen Besuch; sie wird nie
gespeichert, und ein Neuladen oder **Konfiguration löschen** verwirft sie.
Abbrechen lässt die vorherige Konfiguration stehen. Eine neue
Konfiguration beginnt von vorn, ohne dass unter dem neuen Anbieter etwas
veröffentlicht ist.

### Veröffentlichen

**Auf entferntem IPFS veröffentlichen** (danach **Erneut
veröffentlichen**) prüft die Kopie dieses Geräts gegen den Inhalts-Hash
und lädt sie hoch.

| Abzeichen | Bedeutung |
|---|---|
| **Veröffentlicht** | Angenommen; der Anbieter hat eine CID zurückgegeben. |
| **Veröffentlichen abgelehnt** | Abgelehnt, etwa wegen falscher Zugangsdaten, einer fehlerhaften Anfrage oder eines Kontingents. Ändern Sie die Konfiguration, bevor Sie es erneut versuchen. |
| **Veröffentlichen nicht verfügbar** | Der Anbieter war nicht erreichbar. Versuchen Sie es später erneut. |
| **Veröffentlichen fehlgeschlagen** | Alles andere, einschließlich einer vorher fehlgeschlagenen lokalen Integritätsprüfung. |

Ein veröffentlichtes Ergebnis zeigt Inhalts-Hash, Fundort
(`ipfs://<cid>`), Endpunkt und Zeit. Ein Abzeichen wie **Nostr:
Angekündigt** oder **Steem: Nicht angekündigt**, benannt nach Ihrem
[Anbieter für Ankündigung / Entdeckung](10-NetworkSettings.md#anbieter-für-ankündigung--entdeckung),
sagt, ob die Veröffentlichung auch für die Snapshot-Entdeckung angekündigt
wurde, damit andere sie finden können wie eine Veröffentlichung über einen
lokalen Knoten. **Nicht angekündigt** bedeutet, dass nur die Ankündigung
fehlgeschlagen ist.

### Überprüfen, was veröffentlicht wurde

Nach einer erfolgreichen Veröffentlichung holt **Abruf des Inhalts →
IPFS-Inhalt überprüfen** (danach **Erneut überprüfen**) die Bytes über
Ihre [IPFS-Gateways](10-NetworkSettings.md#ipfs-gateway) und vergleicht
sie mit dem erfassten Hash:

| Abzeichen | Bedeutung |
|---|---|
| **Der abgerufene Inhalt passt zum erfassten Inhalts-Hash** | Er passt. |
| **Der abgerufene Inhalt passt nicht zum erfassten Inhalts-Hash** | Er passt nicht. |
| **Inhaltsabruf nicht verfügbar** | Das Gateway war nicht erreichbar oder hat ihn nicht. Keine Abweichung. |
| **Überprüfung fehlgeschlagen** | Etwas anderes ist schiefgegangen. |

### Veröffentlichungsverlauf

Erneutes Veröffentlichen überschreibt nie frühere Datensätze.
**Veröffentlichungsverlauf zeigen** listet jede Veröffentlichung auf, die
älteste zuerst, mit Fundort und Zeit; **Untersuchen** zeigt ihren Fundort,
Inhalts-Hash, Zeit und Methode (derzeit immer **Anbieter für entferntes
Pinning**). Jeder Eintrag hat seine eigene Schaltfläche **Inhalt
überprüfen** und **Überprüfungsverlauf zeigen**, eine zeitlich geordnete
Liste aller Prüfungen dieses Datensatzes.

## Steem

*Experimentell.* ForkBuild kann über die Steem-Blockchain ankündigen,
speichern und teilen. Ankündigungen (von Veröffentlichungen, Snapshots und
Kommentaren) sind Antworten auf monatliche Entdeckungs-Threads wie
[`@forkbuild/forkbuild-snapshot-2026-09`](https://steemit.com/forkbuild/@forkbuild/forkbuild-snapshot-2026-09).
Zum Lesen ist kein Konto nötig. Was gefunden wird, wird wie eine
Ankündigung von Nostr oder Arweave überprüft; Stimmen, Auszahlungen und
Reputation spielen keine Rolle. Die Einstellungen liegen unter
[Netzwerkeinstellungen → Steem](10-NetworkSettings.md#steem).

### Auf Steem posten

Wählen Sie **Steem** in einem Verteilen-Dialog, auf der Seite
Veröffentlichungen oder neben **Kommentar senden**, oder machen Sie es
unter
[Anbieter für Ankündigung / Entdeckung](10-NetworkSettings.md#anbieter-für-ankündigung--entdeckung)
zu Ihrem Standard. Sie brauchen die Erweiterung Steem Keychain mit dem
**Posting**-Schlüssel Ihres Kontos und Ihren Kontonamen, gespeichert auf
der Steem-Einstellungsseite. ForkBuild sieht den Schlüssel nie. Jeder
Beitrag ist eine Antwort auf den Thread dieses Monats mit abgelehnter
Auszahlung, und Keychain bittet Sie um Bestätigung. Gibt es den Thread
dieses Monats noch nicht, wird nichts gepostet, und Sie erfahren es. Ein
Kommentar wird immer zuerst auf diesem Gerät gespeichert, und sein
Formular warnt Sie, wenn Konto oder Keychain fehlen.

### Auf Steem speichern

Wählen Sie **Steem** als Speicher in einem Verteilen-Dialog oder auf der
Seite Veröffentlichungen. Der Snapshot wird komprimiert und als Antworten
auf den Inhalts-Thread dieses Monats gespeichert (etwa
`@forkbuild/forkbuild-content-2026-10`), ohne Pinning- oder Upload-Gebühr.
Die Daten liegen in den Metadaten jedes Beitrags; der Beitragstext ist ein
einzeiliger Hinweis. Ältere Beiträge mit den Daten im Text lassen sich
weiterhin laden.

- **Größe.** Bis zu etwa 2.500 Steine passen in einen Beitrag. Ein
  größeres Bauwerk ist ein Indexbeitrag plus bis zu 20 Beiträge von etwa
  48 KB, bis zu etwa 30.000 Steine. Alles Größere wird vor dem Posten
  abgelehnt, mit dem Vorschlag, IPFS oder Arweave zu nutzen.
- **Bestätigen.** Keychain fragt bei jedem Beitrag, mindestens 4,5
  Sekunden auseinander, und der Dialog zeigt den Fortschritt („Speichern
  auf Steem: 3 von 9 Beiträgen erstellt“).
- **Resource Credits.** Posten verbraucht die Resource Credits Ihres
  Kontos, die sich über fünf Tage wieder auffüllen. Haben Sie nicht genug,
  wird nichts gepostet, und Sie erfahren, wie viel nötig ist. Der
  Fortschritt zeigt den verbrauchten Anteil.
- **Bricht es mittendrin ab** (Sie lehnen ab, die Credits gehen aus oder
  die Verbindung bricht), erfahren Sie, wie viele Beiträge gespeichert
  sind. Verteilen Sie erneut mit demselben Konto, und nur die fehlenden
  Beiträge werden erstellt. Nichts wird angekündigt, bevor jeder Beitrag
  gespeichert ist.

Auch der Signierte Anspruch kann auf Steem gespeichert werden: ein
weiterer Beitrag (und eine weitere Bestätigung) im selben Thread, nach dem
Snapshot, wenn Sie beides verteilen. Er wird wie einer von Arweave
zurückgelesen und auf seine Signatur geprüft.

### Einen Link teilen

**Auf Steem.** Der Beitrag eines Signierten Anspruchs zeigt ein Bild Ihres
Bauwerks, seinen Titel, Ihren Namen und die Beschreibung sowie einen Link
„See it in 3D“ (in 3D ansehen). Keychain bittet Sie, das Signieren des
Bildes zu bestätigen, das ohne Kosten an Resource Credits zum Bildhoster
von Steemit hochgeladen wird; lehnen Sie ab oder lässt es sich nicht
erstellen, geht der Beitrag ohne Bild hinaus. Erwähnungen, Tags und Links
in Titel oder Beschreibung werden als reiner Text angezeigt und
benachrichtigen daher niemanden. Wer auf den Link klickt, selbst ohne
ForkBuild vorher genutzt zu haben, landet in der Weltansicht bei Ihrem
Bauwerk, nachdem ForkBuild die Signatur der Geteilten Welt geprüft hat und
dass das Bauwerk zu ihrer Ankündigung passt (wenn nicht, sagt die Seite,
warum). Das Bauwerk wird dann in seinem Browser aufbewahrt. Der Link
braucht das Bauwerk angekündigt und gespeichert, was Verteilen erledigt.

**Überall.** Sobald ein Signierter Anspruch auf Steem, Arweave oder IPFS
gespeichert ist, erscheinen darunter **Teilen …** und **Link kopieren**:
im Veröffentlichungsfeld der Weltansicht, im Ergebnis des
Verteilen-Dialogs und auf der Seite Veröffentlichungen. **Teilen …**
öffnet, wo verfügbar, das Teilen-Menü Ihres Geräts; **Link kopieren**
kopiert den Link, der auch zum Kopieren von Hand angezeigt wird. Der Link
öffnet sich auf jedem Gerät, sofern auch der Snapshot verteilt wurde, und zeigt den Bau dort, wo Sie ihn platziert haben: Ihre signierte Platzierung reist mit dem Snapshot, und der Link nimmt sie mit. Die
Adresse `#/world/…` in Ihrer Adressleiste funktioniert nur in Ihrem
eigenen Browser.

- **Arweave:** Direkt nach dem Verteilen kann es einige Minuten dauern,
  bis sich der Link öffnen lässt, während der Upload die Gateways
  erreicht. Die Seite bietet **Erneut versuchen** an.
- **IPFS auf Ihrem eigenen Knoten:** Er öffnet sich nur, solange Ihr
  Knoten online und über öffentliche Gateways erreichbar ist. Ein
  Pinning-Dienst oder Arweave hält ihn verfügbar, wenn Ihr Computer aus
  ist.
- Freunde lesen über die Gateways in ihren eigenen
  Netzwerkeinstellungen. Ein IPFS-Gateway hat bis zu 30 Sekunden Zeit, den
  Anspruch zu finden.

## Blurt

*Experimentell.* Blurt ist eine Blockchain, die aus Steem hervorgegangen
ist, ohne Downvotes. ForkBuild kann darauf ankündigen, speichern und
verankern, und alles geht von **Ihrem eigenen Konto** als gewöhnliche
Blurt-Beiträge hinaus, die ihre Auszahlung behalten: Wenn Leute den Beitrag
Ihres Bauwerks upvoten, verdienen Sie BLURT. Es gibt kein ForkBuild-Konto
und keinen gemeinsamen Thread. Die Einstellungen liegen unter
[Netzwerkeinstellungen → Blurt](10-NetworkSettings.md#blurt).

### Auf Blurt posten

Wählen Sie **Blurt** in einem Verteilen-Dialog, auf der Seite
Veröffentlichungen, neben **Kommentar senden** oder im Benennungsfeld, oder
machen Sie es unter
[Anbieter für Ankündigung / Entdeckung](10-NetworkSettings.md#anbieter-für-ankündigung--entdeckung)
zu Ihrem Standard. Sie brauchen die Erweiterung Blurt Keychain (oder
WhaleVault) mit dem **Posting**-Schlüssel Ihres Kontos und Ihren
Kontonamen, gespeichert auf der Blurt-Einstellungsseite. ForkBuild sieht
den Schlüssel nie, und Keychain bittet Sie, jeden Beitrag zu bestätigen.

- **Ein Beitrag pro Bauwerk.** Verteilen erstellt einen Hauptbeitrag von
  Ihrem Konto, mit den Tags `forkbuild` und `forkbuild-snapshot` oder
  `forkbuild-publication`, mit einem Bild Ihres Bauwerks, seinem Titel,
  Ihrem Namen und der Beschreibung (vollständig, bis 2.000 Zeichen) sowie einem Link „See it in 3D“ (in 3D
  ansehen). Was in der folgenden halben Stunde dazukommt (die Ankündigung
  der Veröffentlichung, ein Kommentar, ein Anker), wird demselben Beitrag
  durch Bearbeiten hinzugefügt, sodass Ihre Follower einen Beitrag sehen,
  nicht mehrere.
- **Das Bild braucht eine eigene Bestätigung.** Bei einem Signierten
  Anspruch bittet Keychain Sie zuerst, das Bild des Bauwerks zu signieren,
  dann, den Beitrag zu bestätigen. Sein zweites Fenster kann sich hinter
  Ihrem Browser öffnen; ForkBuild wartet auf jedes bis zu zwei Minuten. Das
  Bild geht zum Bildhoster von Blurt, über den Rendezvous-Server von
  ForkBuild, wenn der Browser den Hoster nicht direkt erreicht; lässt es
  sich nicht hochladen, geht der Beitrag ohne Bild hinaus.
- **Fünf Minuten zwischen Beiträgen.** Blurt nimmt pro Konto alle fünf
  Minuten einen Hauptbeitrag an. Hat Ihr Konto kürzlich einen gepostet
  (etwa aus einer anderen App), wartet ForkBuild, und der Dialog sagt, wie
  lange.
- **Gebühren.** Jede Blurt-Transaktion kostet eine kleine Gebühr in BLURT,
  festgelegt von den Witnesses von Blurt. Kann Ihr Konto sie nicht zahlen,
  wird nichts gepostet, und Sie erfahren es.
- **Andere finden ihn** über Nexus, den Suchindex von Blurt, der jeden
  Beitrag unter den Tags von ForkBuild auflistet, egal wie alt. Bietet kein
  Blurt-Knoten Nexus an, liest ForkBuild den Tag, der einen Beitrag eine
  Woche lang auflistet, und dann den Verlauf Ihres Kontos: Hat das ForkBuild
  einer Person einmal einen Ihrer Beiträge gesehen, liest es auch Ihre
  späteren und früheren.

### Auf Blurt speichern

Wählen Sie **Blurt** als Speicher in einem Verteilen-Dialog oder auf der
Seite Veröffentlichungen. Das Bauwerk wird so gespeichert wie auf Steem, in
Antworten unter dem Beitrag Ihres Bauwerks: bis zu etwa 2.500 Steine in
einer Antwort oder bis zu 20 weitere Antworten für bis zu etwa 30.000
Steine. Vor dem Posten berechnet ForkBuild die Gebühren und lehnt ab, wenn
Ihr Guthaben nicht reicht („Das Speichern dieses Bauwerks auf Blurt kostet
etwa 0,632 BLURT an Gebühren, und Ihr Konto hat 0,100 BLURT“). Der Dialog
zeigt den Fortschritt und die Gebühren. Bricht es mittendrin ab, verteilen
Sie erneut mit demselben Konto, und nur die fehlenden Antworten werden
erstellt.

Auch der Signierte Anspruch kann auf Blurt gespeichert werden, als eine
weitere Antwort. Sein Link funktioniert wie einer von Steem: Wer auf „See
it in 3D“ klickt, landet in der Weltansicht bei Ihrem Bauwerk, nachdem
ForkBuild es geprüft hat. **Teilen …** und **Link kopieren** erscheinen,
sobald er gespeichert ist.
