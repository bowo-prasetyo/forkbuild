<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 2831381c24cb53fe -->
# 12 — Archiv & Erfolge

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · **Deutsch** · [Español](../es/12-ArchiveAndLeaderboards.md) · [Français](../fr/12-ArchiveAndLeaderboards.md) · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [한국어](../ko/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](../pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Experimentell.** Alles hier kann sich in einer späteren Version ändern
> oder entfernt werden, und was es erzeugt, wird möglicherweise nicht
> übernommen. Auf der Seite Veröffentlichungen ist der Bereich **Wallet,
> Archiv & Herausgeberwerkzeuge** mit einem Abzeichen **Experimentell**
> gekennzeichnet.

Die Werkzeuge für Bitcoin, Base und IPFS unter
[Nachweise & Speicher](11-EvidenceAndStorage.md) halten fest, was sie
beobachten, in einem dauerhaften Archiv auf diesem Gerät. Diese Anleitung
behandelt dieses Archiv und was darauf aufbaut: Verweise zwischen
Veröffentlichungen, Erfolge und Herausgeberkennungen.

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
eigenes Wort hin mit einem Herausgebernamen.

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

## Eingestellt: Bestenlisten und Abgleich

Frühere Versionen hatten Bestenlisten-Seiten: eine Bestenliste der
Herausgeber, signierte Snapshot-Ansprüche von Herausgebern, einen
Abgleichsarbeitsbereich mit eigener Bestenliste und einen Vergleich von
Nachweisexporten. ForkBuild reiht keine Menschen und führt keine Punktestände
([Säulen](../../Pillars.md#what-we-are-not-making)), deshalb wurden sie entfernt. Ein alter Link auf eine dieser
Seiten öffnet die Startseite. Ein Archiv, das gespeichert wurde, als es sie
noch gab, lässt sich weiter laden und importieren, mit all seinen übrigen
Datensätzen; die Bestenlisten-Ansprüche und Abgleichsentscheidungen darin
werden verworfen.
