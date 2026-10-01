<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 6f86f5609d7f2b27 -->
# 12 — Archiv & Bestenlisten

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · **Deutsch** · [Español](../es/12-ArchiveAndLeaderboards.md) · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](../pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Experimentell.** Alles hier kann sich in einer späteren Version ändern
> oder entfernt werden, und was es erzeugt, wird möglicherweise nicht
> übernommen. Auf der Seite Veröffentlichungen ist der Bereich **Wallet,
> Archiv & Herausgeberwerkzeuge** mit einem Abzeichen **Experimentell**
> gekennzeichnet; die Bestenlisten-Seiten zeigen ein Banner
> **Experimentell**.

Die Werkzeuge für Bitcoin, Base und IPFS unter
[Nachweise & Speicher](11-EvidenceAndStorage.md) halten fest, was sie
beobachten, in einem dauerhaften Archiv auf diesem Gerät. Diese Anleitung
behandelt dieses Archiv und was darauf aufbaut: Verweise zwischen
Veröffentlichungen, Erfolge, Herausgeberkennungen und die
Bestenlisten-Seiten.

Die meisten dieser Karten liegen auf der Seite Veröffentlichungen unter
**Wallet, Archiv & Herausgeberwerkzeuge**, in deren Reitern
**Archivwerkzeuge** und **Verweise & Erfolge**. Jede zeigt **Lokal
gespeichert**, wenn ihr Inhalt ein Neuladen übersteht.

Ein Begriff, der überall vorkommt: Eine **Veröffentlichungsidentität** ist
ein Datensatz einer Bitcoin- oder Base-Ankerveröffentlichung (siehe
[Bitcoin-Ankerveröffentlichungen](11-EvidenceAndStorage.md#bitcoin-ankerveröffentlichungen)).
Sie ist ein Datensatz auf einer Chain, keine Person.

## Das Beobachtungsarchiv der Veröffentlichungen

Ein dauerhafter Datensatz auf diesem Gerät mit den Tatsachen, die die
Werkzeuge für IPFS, Bitcoin und Base beobachten. Er enthält nur
Veröffentlichungsidentitäten und Beobachtungen: nie eine
Wallet-Verbindung, einen Schlüssel oder Zugangsdaten zum Pinning.

### Beobachtungsarchiv

Die Karte **Beobachtungsarchiv** zeigt, wie viele **Veröffentlichungen**
und **Beobachtungen** es enthält.

- **Archiv zeigen** öffnet die **Archivierte Beobachtungszeitleiste**:
  jede IPFS-Veröffentlichung und -Überprüfung, jedes Bitcoin-Senden, jede
  Bestätigung und jeden Inhaltsnachweis sowie jede Beobachtung einer
  Base-Aufnahme, in zeitlicher Reihenfolge, jeweils mit Domäne, Zustand
  und (wo zutreffend) Fundort, txid oder Blockhöhe. Das Öffnen kontaktiert
  kein Netzwerk.
- **Archiv leeren** ist der einzige Weg, etwas aus dem Archiv zu
  entfernen; alles andere fügt nur hinzu. Bei leerem Archiv ist es
  deaktiviert.

### Historische Nachweise zu Bitcoin-Ankern

Dieselben Bitcoin-Tatsachen, nach Anker-ID gruppiert, auf einer Karte im
Reiter **Blockchain-Verankerung**. **Historische Anker zeigen** und dann
eine Anker-ID zeigt deren **Sendeverlauf**, **Bestätigungsverlauf**,
**Verlauf der Inhaltsnachweise**, **Vergleiche der Platzierung in der
Chain** und **Konsistenz der Beobachtungen**, mit einer Zusammenfassung
**Kombinierte Nachweise** der fünf Zahlen. Die Zahlen sagen, wie viel
erfasst wurde, nicht, wie vertrauenswürdig es ist.

### Das Archiv exportieren, importieren und untersuchen

Die Karte **Veröffentlichungsarchiv** macht aus dem Archiv eine
JSON-Datei:

- **Archiv exportieren** zeigt das JSON und einen Link **Archivexport
  herunterladen**.
- **Archiv importieren** nimmt eine Datei oder eingefügtes JSON und zeigt
  vorab, wie viele Veröffentlichungen und Beobachtungen sie im Vergleich
  zum aktuellen Archiv enthält. Erst **Aktuelles Archiv ersetzen** wendet
  es an. Der Import **ersetzt** das aktuelle Archiv (er führt nicht
  zusammen) und kann nicht rückgängig gemacht werden. Eine ungültige Datei
  wird abgelehnt, ohne dass sich etwas ändert.

**Externes Archiv untersuchen** sieht in einen Export hinein, ohne ihn zu
importieren. Es zeigt die Schemaversion der Datei, die Zahl der Tatsachen
pro Domäne (IPFS-Veröffentlichung und -Überprüfung; Bitcoin-Senden,
-Bestätigung, -Inhaltsnachweis und -Veröffentlichungsidentität;
Base-Aufnahme und -Veröffentlichungsidentität), die Zahl lokaler und
importierter Tatsachen, Importvorgänge, ihren Fingerabdruck sowie die
Bitcoin-Anker-IDs, IPFS-Datensatzindizes und Base-Transaktions-Hashes, die
sie enthält. Von dort aus:

- **Mit aktuellem Archiv vergleichen** listet pro Domäne auf, was
  **Gleich**, **Geändert**, **Nur im aktuellen**, **Nur im externen** ist
  oder eine **Andere Herkunft** hat.
- **Ersetzung prüfen** (nach einem Vergleich) zeigt vorab, was das
  Ersetzen ändern würde, mit den Zahlen und Fingerabdrücken beider
  Archive. Seine Schaltfläche **Aktuelles Archiv ersetzen** ist derselbe
  Import wie oben. Das Ersetzen kennzeichnet jede Tatsache als neu
  importiert, sodass sich der resultierende Fingerabdruck von dem der
  Datei unterscheidet.

### Herkunft des Archivs

Zeigt, woher die Tatsachen stammen: **Lokale Tatsachen** (auf diesem Gerät
beobachtet) und **Importierte Tatsachen** (aus einem **Aktuelles Archiv
ersetzen**). Haben Sie je importiert, listet **Archivimporte** Zeit,
Tatsachenzahl und Schemaversion jedes Imports auf. Keine der beiden Arten
gilt als vertrauenswürdiger.

### Archiv-Fingerabdruck

Ein SHA-256-Digest aller Tatsachen und Herkunftsangaben im Archiv.
**Fingerabdruck kopieren** kopiert ihn. Um ihn mit einem Fingerabdruck von
anderswo (etwa von einem Peer) zu vergleichen, fügen Sie diesen unter
**Mit einem anderen Fingerabdruck vergleichen** ein und klicken Sie auf
**Vergleichen**:

| Ergebnis | Bedeutung |
|---|---|
| **ÜBEREINSTIMMUNG** | Die beiden Archive enthalten identische Inhalte. |
| **VERSCHIEDEN** | Das tun sie nicht. |
| **INVALID_FINGERPRINT** (ungültiger Fingerabdruck) | Was Sie eingefügt haben, ist kein 64-stelliger SHA-256-Fingerabdruck. |

Eine Übereinstimmung bedeutet nur, dass die Inhalte identisch sind, nicht,
dass sie richtig sind, und nichts hier sagt, welches Archiv neuer ist.

## Veröffentlichungsverweise

Halten Sie fest, dass eine Veröffentlichungsidentität auf eine andere
verweist.

**Veröffentlichungsverweise → Verweise zeigen** öffnet ein Formular:
Wählen Sie aus Ihren bekannten Bitcoin- und Base-Veröffentlichungsidentitäten
die **Quellveröffentlichung (die verweisende)** und die **Referenzierte
Veröffentlichung (die, auf die verwiesen wird)** (zum Beispiel „Bitcoin —
a1b2…c3d4 — Inhalt 9f8e…“) und klicken Sie dann auf **Verweis erfassen**.
Eine Veröffentlichung kann nicht auf sich selbst verweisen. Verweise
erstellen immer nur Sie; nichts erstellt einen automatisch, auch das
Forken an anderer Stelle der App nicht.

Ein Verweis heißt absichtlich nicht Fork: Er hält fest, dass der Verweis
existiert, nicht, was er bedeutet (ein Fork, ein Zitat, eine Antwort).

Erfasste Verweise werden der älteste zuerst aufgelistet, mit Chain,
kurzer Identität und Inhalts-Hash beider Seiten und dem Zeitpunkt der
Erfassung. Duplikate bleiben als getrennte Verweise erhalten.

**Verweisgraph der Veröffentlichungen** gruppiert dieselben Verweise nach
Veröffentlichung: Summen für **Kanten**, **Veröffentlichungen**,
**Verschiedene Quellen** und **Verschiedene referenzierte** und für jede
Veröffentlichung ihre **Ausgehenden Verweise** und **Eingehenden
Verweise**, die sich zu den einzelnen Verweisen aufklappen lassen. Die
Zahlen sind keine Rangfolge.

## Erfolge

Eine Veröffentlichungsidentität erzielt ein Abzeichen in dem Moment, in
dem sie eine Schwelle überschreitet; es gibt nichts zu beanspruchen.

**Erfolge → Erfolge zeigen** listet die bisher erzielten Abzeichen auf
(ihre Namen zeigt die App nur auf Englisch):

| Abzeichen | Symbol | Erzielt, wenn |
|---|---|---|
| First publication (erste Veröffentlichung) | 🏆 | Ihr erster Datensatz einer Bitcoin- oder Base-Ankerveröffentlichung. |
| Bitcoin publisher (Bitcoin-Herausgeber) | ₿ | Ihr erster auf Bitcoin. |
| Base publisher (Base-Herausgeber) | 🔵 | Ihr erster auf Base. |
| Multi-chain publisher (Herausgeber auf mehreren Chains) | 🌐 | Datensätze auf mehr als einer Chain. |
| Ten publications (zehn Veröffentlichungen) | 🔟 | Ihr zehnter, Bitcoin und Base zusammen. |
| One hundred publications (hundert Veröffentlichungen) | 💯 | Ihr hundertster. |

Klicken Sie auf ein Abzeichen, um seine **Quellveröffentlichung** zu sehen
(Chain, Inhalts-Hash, Chain-Verweis, Erstellungszeit) und, wenn verfügbar,
**Lebenszyklus der Veröffentlichung oben ansehen**, was zum Lebenszyklus
dieses Datensatzes springt.

Fünf weitere Erfolge stammen aus Verweisen und haben noch kein Abzeichen:
**First reference created** (erster Verweis erstellt), **First reference
received** (erster Verweis erhalten), **Referenced by 10 publications**
(von 10 Veröffentlichungen referenziert), **Referenced by 100
publications** (von 100 Veröffentlichungen referenziert) und **First
cross-chain reference** (erster chainübergreifender Verweis, zwischen einer
Bitcoin- und einer Base-Veröffentlichung). Sie stehen mit Namen im
**Erfolgsprofil**, wo Sie eine Veröffentlichungsidentität wählen und ihre
Zahl der Erfolge und die vollständige Liste sehen, jeweils mit dem
Zeitpunkt, an dem er erzielt wurde.

Erfolge gehören Veröffentlichungsidentitäten, nicht Menschen: Nichts hier
verknüpft eine Veröffentlichung mit einer Person.

## Herausgeberidentität

Mit **Herausgeberzuordnungen** versehen Sie Veröffentlichungen auf Ihr
eigenes Wort hin mit einem Herausgebernamen, für die Herausgeberkarten und
die Bestenliste unten.

Eine Herausgeberkennung ist ein schlichtes, selbst erklärtes Etikett,
keine überprüfte Identität und keine Anmeldung. Der Abgleich ist exakt:
`Alice`, `alice` und `ALICE` sind drei Herausgeber. Nichts wird aus
Wallets, Inhalten oder Namen abgeleitet.

**Herausgeberzuordnungen zeigen**, dann:

1. **Herausgeberkennung** — geben Sie ein Etikett ein oder wählen Sie
   eines, das Sie schon benutzt haben.
2. **Veröffentlichung** — wählen Sie eine Ihrer Bitcoin- oder
   Base-Veröffentlichungsidentitäten.
3. **Veröffentlichung hinzufügen** — erfasst die Zuordnung.

**Erfasste Zuordnungen** listet sie auf, die älteste zuerst.
**Zugeordnete Veröffentlichungen eines Herausgebers** zeigt jede
Veröffentlichung eines gewählten Herausgebers, mit Inhalts-Hash und dem
Zeitpunkt der Zuordnung.

Drei Karten auf der Seite [Bestenliste](#übersicht-der-bestenliste) bauen
auf diesen Zuordnungen auf, jede mit ihrem eigenen Auswahlmenü **Einen
Herausgeber wählen**:

| Karte | Zeigt |
|---|---|
| **Erfolgsprofil des Herausgebers** | Jeden Erfolg, den eine vom Herausgeber beanspruchte Veröffentlichung erzielt hat, und welche Veröffentlichung ihn erzielt hat. |
| **Erfolgsabzeichen des Herausgebers** | Dasselbe, beschränkt auf Erfolge mit Abzeichen, jeweils mit Link zurück zu seinem Lebenszyklus auf der Seite Veröffentlichungen. |
| **Erfolgsstatistik des Herausgebers** | Zahlen zugeordneter Veröffentlichungen, Erfolge, Erfolgsarten, Abzeichen und Abzeichenarten, Veröffentlichungen pro Chain und Erfolge pro Art. |

Gibt es noch keine Zuordnungen, sagt das jede Karte und verweist auf
Herausgeberzuordnungen. Sie melden, was ein Herausgeber *beansprucht*,
nicht, wer eine Veröffentlichung kontrolliert, und keine reiht jemanden.

## Übersicht der Bestenliste

Die Seite **Bestenliste** (`/leaderboard`) verlinkt die Seiten unten sowie
die drei Herausgeberkarten oben. Sie steht nicht in der oberen Leiste:
Öffnen Sie sie über den Link **Bestenliste** unter der Karte
**Veröffentlichungsarchiv** auf der Seite Veröffentlichungen.

### Bestenliste der Herausgeberleistung

`/publisher-leaderboard` reiht Herausgeber nach dem, was dieses Gerät
erfasst hat: **Rang**, **Herausgeber**, **Erfolge**, **Erfolgsarten** und
**Veröffentlichungen**, bei jedem Öffnen der Seite neu berechnet und nie
gespeichert. Ein Herausgeber erscheint, sobald Sie ihm eine
Veröffentlichung zugeordnet haben. Namen sind Ihre eigenen Etiketten, keine
überprüften Identitäten.

### Snapshot-Anspruch des Herausgebers

`/publisher-snapshot-claim` signiert einen Anspruch über Ihren aktuellen
Bestenlisten-Snapshot, damit ein Peer dagegen vergleichen kann. Sie müssen
angemeldet sein.

1. **Anspruch erzeugen & signieren** — berechnet Ihren Snapshot und
   signiert einen Anspruch darüber. Zeigt den Unterzeichner und die
   Fingerabdrücke von Nachweisen, Richtlinie und Snapshot. **Neu
   beginnen** verwirft ihn.
2. **Anspruch exportieren** — zeigt den Anspruch als JSON mit einem Link
   **Anspruch herunterladen**, zum Einfügen in den
   [Abgleichsarbeitsbereich](#abgleichsarbeitsbereich) eines Peers oder zum
   Versenden als Datei.

### Abgleichsarbeitsbereich

`/reconciliation-workspace`: Fügen Sie den exportierten Anspruch eines
Peers in **JSON des Peer-Nachweises** ein und klicken Sie auf
**Abgleichen**. Es vergleicht den Anspruch mit Ihrem Archiv und erfasst,
wenn dabei ein Abgleichskandidat herauskommt, eine Entscheidung und eine
Neuprüfungsbeobachtung in Ihrem Archiv und bietet **In der Bestenliste
ansehen** an. Gibt es nichts abzugleichen, sagt es, warum. **Ergebnis
löschen** blendet das Ergebnis aus.

### Bestenliste der Abgleichskandidaten

`/reconciliation-leaderboard` ist schreibgeschützt. Sie zeigt für jeden
Abgleichskandidaten die Nachweise, die Ihr Archiv enthält, wahlweise
verglichen mit dem Archiv eines Peers.

Ein **Kandidat** ist eine Stelle, an der ein Anspruch auf externe
Nachweise und ein Datensatz eines lokalen Snapshots für denselben Inhalt
verglichen wurden:

| Bezeichnung des Kandidaten | Bedeutung |
|---|---|
| **Anspruch *X* ↔ Snapshot Nr. *N*** | Ein Anspruch und ein Snapshot, die verglichen wurden und auseinandergehen. |
| **Anspruch *X* (kein zugehöriger Snapshot)** | Ein Anspruch ohne Snapshot zum Vergleichen. |
| **Snapshot Nr. *N* (kein zugehöriger Anspruch)** | Ein Snapshot ohne Anspruch zum Vergleichen. |

Kandidaten stammen aus dem Abgleichsarbeitsbereich. Bis Sie dort einen
Anspruch eines Peers abgeglichen haben, zeigt die Seite „Keine
Abgleichskandidaten anzuzeigen.“

**Spalten.** **Entscheidungsnachweise** (eine erfasste Wahl, welcher Seite
vertraut wurde) und **Beobachtungsnachweise** (eine spätere Neuprüfung
dieser Entscheidung) haben jeweils drei Zahlen: **Gemeinsam** (beide
Archive haben es), **Nur Quelle** (nur Ihres) und **Nur Ziel** (nur das
des Peers). Zeilen erscheinen in der Reihenfolge, in der sie gefunden
wurden, nicht danach, wie viele Nachweise sie haben; das ist keine
Rangfolge.

**Mit einem Peer vergleichen.** Fügen Sie den Archivexport eines Peers in
**Peer-Archiv** ein und klicken Sie auf **Als Peer-Archiv verwenden**.
Eine ungültige Eingabe wird abgelehnt. Ohne Peer-Archiv zählt alles als
Nur Quelle. Eine Zeile über der Tabelle sagt, welcher Fall vorliegt:

| Banner | Bedeutung |
|---|---|
| *Kein Peer-Archiv angegeben — jede Zahl unten bezieht sich nur auf dieses Replikat.* | Noch kein Peer-Archiv. |
| *Ein Peer-Archiv wurde angegeben, enthält aber keine erfassten Nachweise — jede Zahl unten bezieht sich weiterhin nur auf dieses Replikat.* | Ein echtes Archiv, aber leer. |
| *Vergleich mit einem angegebenen Peer-Archiv.* | Ein echter Vergleich. |

**Nachweise untersuchen** (danach **Nachweise ausblenden**) bei einer
Zeile listet die Entscheidungs- und Beobachtungsdatensätze hinter ihren
Zahlen auf, aufgeteilt in Gemeinsam, Nur Quelle und Nur Ziel. Jede
Beobachtung zeigt den Fingerabdruck des Plans, gegen den sie geprüft
wurde (etwa `Plan abcdef012345…`), und ob der Kandidat **vorhanden** war
und **zum Plan passt**, wie erfasst. Ähnlich aussehende Datensätze bleiben
getrennt.

**Nachweisfilter.** Zwei Auswahlmenüs grenzen ein, was angezeigt wird:
**Nachweisart** (**Alle**, **Entscheidungen**, **Beobachtungen**) und
**Beziehung der Replikate** (**Alle**, **Gemeinsam**, **Nur Quelle**,
**Nur Ziel**). Eine Zeile bleibt, wenn sie Nachweise dieser Art in dieser
Beziehung hat. Steht **Beziehung der Replikate** auf **Alle**, wird nichts
gefiltert; steht **Nachweisart** auf **Alle**, passt eine Zeile, wenn
eine der beiden Arten die gewählte Beziehung hat. Der Filter grenzt auch
die Liste unter Nachweise untersuchen jeder Zeile ein. Er blendet nur
Zeilen und Datensätze aus; die Zahlen einer Zeile ändern sich nie.

**Nachweisexport.** **Nachweise exportieren** erzeugt ein JSON-Dokument
von genau dem, was der Filter zeigt, mit dem verwendeten
Vergleichszustand und Filter, und einem Link **Nachweisexport
herunterladen**
(`reconciliation-candidate-leaderboard-evidence-export.json`). Nichts wird
hochgeladen. **Exportierte Nachweise vergleichen** öffnet
[Vergleich von Nachweisexporten](#vergleich-von-nachweisexporten).

**Nachweisexport importieren.** Fügen Sie einen Export ein (Ihren oder den
eines Peers) und klicken Sie auf **Nachweise importieren**, um seinen
Vergleichszustand und die Zahlen von Kandidaten, Entscheidungen und
Beobachtungen zu sehen. Eine ungültige Eingabe wird abgelehnt und die
vorherige Zusammenfassung behalten. **Importierte Nachweise löschen**
blendet sie aus. Die Tabelle oben bleibt davon unberührt.

Die Seite liest Ihr Archiv einmal beim Öffnen; öffnen Sie sie erneut, um
neue Datensätze zu sehen. Peer-Archiv, Filter, geöffnete Zeilen und die
importierte Zusammenfassung werden nicht gespeichert.

## Vergleich von Nachweisexporten

`/evidence-export-comparison` vergleicht zwei Nachweisexporte
miteinander — etwa den der letzten Woche mit dem von heute oder Ihren mit
dem eines Peers. Es liest Ihr Archiv nicht und beeinflusst die Bestenliste
nicht.

Fügen Sie die beiden Dokumente in **Quell-Nachweisexport** und
**Ziel-Nachweisexport** ein und klicken Sie auf **Nachweise
vergleichen**. Eine ungültige Seite wird für sich abgelehnt; die andere
bleibt erhalten. **Vergleich löschen** leert die Seite.

- **Vergleichsstatus und Filter** zeigen den erfassten Vergleichszustand
  und Filter jedes Dokuments und ob sie gleich sind.
- Drei Tabellen — **Vorkommen der Kandidaten**,
  **Entscheidungsnachweise** und **Beobachtungsnachweise** — zählen
  jeweils Nur Quelle, Gemeinsam und Nur Ziel und werden nie
  zusammengefasst.
- **Datensätze untersuchen** (danach **Datensätze ausblenden**) listet
  die Datensätze hinter den Zahlen einer Tabelle auf. Bei einem
  Entscheidungs- oder Beobachtungsdatensatz zeigt **Identität
  untersuchen** die Felder, die ihn identifizieren:

| Datensatz | Identitätsfelder |
|---|---|
| Entscheidung | `decided`, `candidate`, `decision`, `decidedAt` |
| Beobachtung | `candidate`, `decision`, `planIdentity`, `candidatePresent`, `candidateType`, `candidateMatchesPlan`, `observedAt` |

**Explizite Datensatzpaarung.** Um zwei bestimmte Datensätze zu
vergleichen, wählen Sie einen Quell- und einen Zieldatensatz (aus einer
beliebigen Partition) für Entscheidungen oder Beobachtungen und klicken
Sie auf **Paar hinzufügen**; **Entfernen** nimmt ein Paar heraus. Nichts
wird automatisch gepaart, und dasselbe Paar kann zweimal hinzugefügt
werden. Unter **Unterschiede gepaarter Datensätze** zeigt jedes
**Entscheidungspaar *N*** oder **Beobachtungspaar *N***, wie viele
Identitätsfelder sich unterscheiden (oder **Keine Unterschiede**);
**Unterschiede untersuchen** nennt sie oder sagt **In jedem benannten Feld
identisch.** Es sagt nie, welche Seite recht hat.

Nichts auf dieser Seite wird gespeichert oder irgendwohin gesendet; ein
Neuladen leert sie.
