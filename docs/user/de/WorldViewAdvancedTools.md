<!-- translation-of: docs/user/WorldViewAdvancedTools.md source-hash: d67f6b7ce2344c01 -->
# Weltansicht: Erweiterte Werkzeuge

<!-- languages -->
[English](../WorldViewAdvancedTools.md) · **Deutsch** · [Español](../es/WorldViewAdvancedTools.md) · [Français](../fr/WorldViewAdvancedTools.md) · [Bahasa Indonesia](../id/WorldViewAdvancedTools.md) · [日本語](../ja/WorldViewAdvancedTools.md) · [한국어](../ko/WorldViewAdvancedTools.md) · [Português (Brasil)](../pt-BR/WorldViewAdvancedTools.md)
<!-- /languages -->

Diese Seite beschreibt die Teile der [Weltansicht](03-WorldView.md), die
nur erscheinen, wenn Sie unten im Seitenfeld das Häkchen bei **Erweiterte
Werkzeuge zeigen** setzen. Sie sind für die Netzwerke hinter der Welt: wo
ein Bauwerk platziert ist, wo es gespeichert ist und was andere in der Nähe
angekündigt haben.

Keines davon brauchen Sie, um zu gehen, zu bauen, zu remixen oder einen
Link zu teilen. Das Häkchen wird auf diesem Gerät gespeichert und ändert
für niemanden sonst etwas.

**Mit erweiterten Werkzeugen bekommen Sie:**

| Werkzeug | Wo es ist | Wofür es ist |
|---|---|---|
| [Untersuchen](#einen-stein-untersuchen--oder-eine-platzierte-struktur) | Klick auf einen Stein oder eine platzierte Struktur | Sehen, was es ist und woher es stammt |
| [Kamera und Bearbeitung](#kamera-und-bearbeitung) | Eine Zeile im Kopfbereich des Feldes | Sehen, für welches Bauwerk Ihre nächste Änderung gilt |
| [Über dieses Bauwerk, und Platzierung](#bauwerkinformationen-und-platzierung) | Unter dem Kopfbereich | Die Angaben eines Bauwerks und wo es steht |
| Koordinaten und Suche nach **Ort** | Über der Ansicht und in der **Suche** | Dinge über ihre X/Y/Z-Position finden |
| [Begegnungen in der Welt](#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen) | **In der Nähe** unter Erkunden | Was verbundene Menschen teilen |
| [Ortsnamen](#ortsnamen-in-der-nähe--ansprüche-von-jedem-entdecken) | **In der Nähe** unter Erkunden | Namen, die andere den Orten um Sie gegeben haben |
| [Beanspruchte Bauwerke](#beanspruchte-bauwerke--die-bauwerke-anderer-dort-wo-ihre-herausgeber-sie-hinstellen) | **In der Nähe** unter Erkunden | Bauwerke, die in Ihrer Nähe angekündigt wurden, als Geister |
| [Meine Geteilte Welt](#meine-geteilte-welt--ihren-eigenen-snapshot-verteilen-ohne-peers) | Weiter unten im Feld | Die Platzierungen Ihres eigenen Bauwerks, sein Verteilen und seine Kommentare |

Erweiterte Werkzeuge fügen außerdem die Liste der Welten hinzu, die nicht
geladen werden konnten, und unter **Avatar-Einstellungen** die
Avatar-Diagnose.

## Einen Stein untersuchen — oder eine platzierte Struktur

Klicken Sie auf einen Stein, um das Feld **Untersuchung** zu öffnen. (Ohne
erweiterte Werkzeuge wählt ein Klick nur einen anderen Avatar.) Es zeigt:

- welche Art Stein es ist;
- seine Position und Drehung;
- zu welcher Welt und welchem Bauwerk er gehört;
- wer diese Welt gemacht hat.

**Stein fokussieren** zoomt auf den Stein. **Welt fokussieren** bringt Sie
zur Ausgangsposition der Welt. **Eine Kopie bearbeiten** macht Ihre eigene
Kopie der Welt und öffnet sie im Editor; das Original bleibt, wie es ist.

Ein Klick auf freien Boden in einer Welt öffnet dasselbe Feld, mit Position
und Welt, aber ohne Angaben zu einem Stein. Es hat ebenfalls **Eine Kopie
bearbeiten**, sodass Sie eine Welt durch einen Klick irgendwo darin
kopieren können.

Eine **platzierte Struktur** ist ein ganzes Bauwerk, das im Editor in eine
Welt gesetzt wurde (siehe
[Strukturinstanzen](02-TheEditor.md#strukturinstanzen-eine-lebendige-referenz)).
Klicken Sie darauf, zeigt das Feld das Bauwerk, auf das sie verweist: Titel,
Position und Drehung, Bodenhöhe und die Welt, in der sie steht. Verschieben
können Sie sie hier nicht. Sie hat zwei Schaltflächen:

- **Quelle öffnen** öffnet das Bauwerk, auf das sie verweist, im Editor.
  Jede Kopie dieser Struktur, wo immer sie platziert ist, zeigt, was Sie
  dort ändern.
- **Eine Kopie bearbeiten** macht stattdessen Ihre eigene Kopie dieses
  Bauwerks und lässt das Original und jede platzierte Kopie unverändert.

Jedes **Eine Kopie bearbeiten** in der Weltansicht tut dasselbe; siehe
[Eine Kopie bearbeiten](03-WorldView.md#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen).

## Kamera und Bearbeitung

Der Kopfbereich zeigt eine Zeile wie diese:

```
Kamera: Alices Burg · Bearbeitung: Bobs Burg
```

- **Kamera** ist, was Sie ansehen. Zu einer Welt fliegen oder auf
  **Fokussieren** oder **Hin** klicken ändert sie.
- **Bearbeitung** ist das Bauwerk, für das Ihre nächste Änderung gilt: ein
  Wahrzeichen, eine Region, seine Angaben oder das Veröffentlichen. Ein
  Klick auf einen Stein oder eine Platzierung, oder **Auswählen** in einem
  Suchergebnis, ändert sie, ohne die Kamera zu bewegen.

Meist ist beides dasselbe, denn **Fokussieren** ändert beides. Es
unterscheidet sich, wenn Sie ein Bauwerk ausgewählt haben und ein anderes
ansehen, oder wenn zwei Bauwerke genau auf derselben Stelle stehen: Das
zweite zu fokussieren bewegt die Kamera nicht, aber die Zeile zeigt, dass
Sie jetzt das andere bearbeiten. Herumsehen ändert nie, was Sie bearbeiten;
nur Auswählen tut das.

**Hin** und **Fokussieren** sind dasselbe unter zwei Namen: Beide bewegen
die Kamera. Ob sie auch ändern, was Sie bearbeiten, hängt vom Feld ab (in
der [Suche](03-WorldView.md#suche--welche-veröffentlichungen-passen-dazu)
tut Fokussieren es).

## Bauwerkinformationen und Platzierung

**Über dieses Bauwerk** zeigt das Bauwerk, das Sie bearbeiten, sobald Sie
dort ankommen, noch bevor Sie etwas anklicken.

Klicken Sie auf einen Stein, freien Boden oder eine platzierte Struktur,
öffnen sich unter dem Kopfbereich zwei Felder für das angeklickte Bauwerk:

- **Über dieses Bauwerk**: Titel, Beschreibung, Schlagwörter, Lizenz,
  Status, Autor und wovon es geremixt ist. **Metadaten bearbeiten** ändert
  Titel, Beschreibung, Lizenz und wer es platzieren darf.
  Von einer langen Beschreibung steht hier der Anfang; **Weiterlesen**
  öffnet sie ganz in einem breiteren Feld daneben (auf dem Handy von
  unten), die Welt bleibt dabei sichtbar. **Esc** oder **✕** schließt es.
  Ein veröffentlichtes Bauwerk zeigt auch **💬 Kommentare**: Sie öffnen sich
  im selben Feld unter der Beschreibung, wo Sie sie lesen und eigene
  schreiben, wie auf seiner Karte unter **Entdecken**.
  Ein veröffentlichtes Bauwerk zeigt auch seine Herzen (**♡**, und wem es
  gefällt); siehe [Herzen](04-PublishingAndForking.md#herzen).
  Ähneln ihm Bauwerke anderer, die vor ihm veröffentlicht wurden, sehr,
  listet ein Feld darunter sie auf, wie die Seite des Bauwerks; siehe
  [Ähnliche Bauwerke, die früher veröffentlicht wurden](04-PublishingAndForking.md#ähnliche-bauwerke-die-früher-veröffentlicht-wurden).
- **Platzierung**: wo das Bauwerk in der Welt steht, in **Welteinheiten**.
  Das sind ForkBuilds eigene Koordinaten, kein GPS; eine Welteinheit ist
  ein Meter. **Fokussieren** bringt Sie hin. **Verschieben** öffnet
  **Platzierung verschieben**, wo Sie neue X-, Y- und Z-Werte eingeben oder
  das Bauwerk um 1, 10 oder 100 Einheiten anstoßen. **Auf seinen
  Rasterplatz** trägt den eigenen Platz des Bauwerks im Raster der Welt
  ein, wo Bauwerke beim Veröffentlichen platziert werden; klicken Sie auf
  **Verschieben**, um dorthin zu gehen. **Aus der Welt entfernen** nimmt
  diese Platzierung heraus.

Es sind zwei Felder, weil *was* ein Bauwerk ist und *wo* es steht, getrennt
sind. Eine Platzierung zu verschieben ändert nie das Bauwerk, und das
Bauwerk zu ändern verschiebt es nie.

### Position in der Welt

Um ein Bauwerk zurück auf seinen eigenen Platz im Raster der Welt zu
bringen (eines, das vom 12. bis 17. Oktober 2026 veröffentlicht wurde, kam
stattdessen rund um den Challenge-Platz), öffnen Sie **Platzierung
verschieben**, klicken auf **Auf seinen Rasterplatz** und dann auf
**Verschieben**. Senden Sie es danach mit **Verteilen** in **Meine Geteilte
Welt** erneut aus, damit andere Geräte es ebenfalls verschieben.

Steht schon ein anderes Bauwerk genau dort, wohin Sie verschieben, warnt
**Platzierung verschieben** Sie und listet, was dort ist, bevor Sie
bestätigen. Eine Stelle zu teilen ist erlaubt: Eine Hofszene und das
Gebäude darum herum können am selben Ort stehen. ForkBuild sorgt nur
dafür, dass Sie es wissen.

### Platzierungen, die Ihnen nicht gehören

Hat jemand anderes ein Bauwerk platziert, sagt das Feld Platzierung
**🔒 Platziert von &lt;Name&gt; — Sie können diese Platzierung ansehen, aber
nicht verschieben**, und **Verschieben** ist ausgegraut. Sie können es
trotzdem fokussieren, untersuchen und mit **Eine Kopie bearbeiten** darauf
aufbauen. Nur wo es steht, dürfen allein sie ändern.

### Bauwerke hier

Sagt das Feld Platzierung, dass andere Bauwerke diese Stelle teilen,
klicken Sie auf **Ansehen**, um **Bauwerke hier** zu öffnen: eine Liste
jedes Bauwerks an dieser Stelle, jedes mit einer Schaltfläche
**Fokussieren**. Bauwerke, deren Veröffentlichung zurückgezogen wurde,
fehlen.

### Warum kann ich die Bauwerke anderer platzieren?

Ein echtes Gebäude lässt sich nicht hochheben und versetzen, darum mag es
seltsam wirken, dass Sie jedes veröffentlichte Bauwerk platzieren können,
wo Sie möchten. Aber ein veröffentlichtes Bauwerk ist kein einzelner
Gegenstand. Es ist fester Inhalt, erkannt an seinem Inhalts-Hash, wie eine
Datei. Eine **Platzierung** ist eine eigene, signierte Notiz, die sagt:
„Zeige dieses Bauwerk hier.“ Sie verweist auf das Bauwerk; sie kopiert es
nicht. Ein Bauwerk kann viele Platzierungen haben, und jede zeigt genau
denselben Inhalt.

Das Bauwerk eines anderen zu platzieren verschiebt oder ändert also nie
seines:

- **Ihre Platzierung bleibt, wo sie sie hingestellt haben.** Nur sie
  können sie verschieben (siehe
  [Platzierungen, die Ihnen nicht gehören](#platzierungen-die-ihnen-nicht-gehören)).
- **Ihre eigene Platzierung ist von Ihnen signiert.** Sie sagt nur, wo
  *Sie* ihr Bauwerk zeigen.
- **Das Bauwerk behält seinen Autor und seine Geschichte.** Es ist immer
  noch genau das, was veröffentlicht wurde, und jeder kann das anhand
  seines Hashs und seiner Signatur prüfen.

Es gibt keine zentrale Karte, die sagt, wem welches Grundstück gehört.
Jede Welt zeigt die Platzierungen, die sie angenommen hat. Darum erscheint
ein Bauwerk, das jemand in Ihrer Nähe ankündigt, nur als Geist, bis Sie
**Position annehmen** wählen (siehe
[Beanspruchte Bauwerke](#beanspruchte-bauwerke--die-bauwerke-anderer-dort-wo-ihre-herausgeber-sie-hinstellen)).
Niemand kann ohne Ihr Einverständnis ein Bauwerk in Ihre Welt stellen.

Einige Gründe, ein Bauwerk zu platzieren, das Sie nicht gemacht haben:

- **Kuratieren**, etwa eine Galerie-Welt mit Bauwerken, die Sie mögen.
- **Eine Szene gestalten**, etwa die Burg eines Freundes neben Ihr Dorf
  stellen.
- **Es so verwenden, wie es ist.** Platzieren Sie es, wenn Sie es
  unverändert möchten, und nehmen Sie
  [Eine Kopie bearbeiten](03-WorldView.md#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen),
  wenn Sie es ändern möchten.

Wer das nicht möchte, kann beim Veröffentlichen **Nur ich darf es
platzieren** wählen (siehe
[Wählen, wer es platzieren darf](04-PublishingAndForking.md#wählen-wer-es-platzieren-darf)).
Sie können das Bauwerk trotzdem finden und ansehen, und remixen, wenn die
Lizenz es erlaubt, aber nicht platzieren.

### Warum können zwei Bauwerke an derselben Stelle stehen?

Zwei echte Gebäude können nicht am selben Ort stehen. In ForkBuild können
sie es, weil eine Platzierung kein Land belegt. Sie ist nur eine signierte
Notiz: „Zeige dieses Bauwerk hier“, und zwei Notizen können dieselbe Stelle
nennen.

ForkBuild erlaubt das mit Absicht:

- **Niemand verteilt Land.** Kein zentraler Server entscheidet, wer zuerst
  an einer Stelle war, und ForkBuild kürt nie einen Gewinner zwischen zwei
  signierten Platzierungen. Beide bleiben gültig.
- **Jedes Gerät kennt andere Platzierungen.** Eine Stelle, die auf dem
  Gerät Ihres Freundes belegt ist, kann auf Ihrem noch frei sein, bis seine
  Platzierungen bei Ihnen ankommen. Eine strenge Regel „ein Bauwerk pro
  Stelle“ gäbe auf verschiedenen Geräten verschiedene Antworten, also tut
  ForkBuild nicht so, als gäbe es eine.
- **Manchmal wollen Sie es.** Eine Hofszene in einem Gebäude oder eine
  ältere Fassung anstelle der neuen gehören an dieselbe Stelle.

Das heißt nicht, dass jeder Ihre Bauwerke bedrängen kann:

- **Sie werden vorher gewarnt.** **Platzierung verschieben** listet, was
  schon an einer Stelle ist, bevor Sie bestätigen, und verschiebt Ihr
  Bauwerk nie heimlich woandershin (siehe
  [Position in der Welt](#position-in-der-welt)).
- **Keine versehentlichen Doppel.** **Hier eine Platzierung hinzufügen**
  verweigert, wenn genau dort, wo Sie sind, schon eine Platzierung steht.
- **Der Anspruch eines anderen ist nur ein Geist.** Eine Position, die
  jemand anderes als der Herausgeber des Bauwerks ankündigt, erscheint nur
  als durchscheinender Geist, und nie an einer Stelle, an der dieses Gerät
  schon eine echte Platzierung kennt (siehe
  [Beanspruchte Bauwerke](#beanspruchte-bauwerke--die-bauwerke-anderer-dort-wo-ihre-herausgeber-sie-hinstellen)).
- **Nur der Eigentümer kann eine Platzierung verschieben oder entfernen**
  (siehe [Platzierungen, die Ihnen nicht gehören](#platzierungen-die-ihnen-nicht-gehören)).

ForkBuild prüft nur auf Bauwerke an genau demselben Punkt. Zwei Bauwerke
etwas auseinander, deren Steine sich zufällig berühren, werden nicht
gemeldet. Die Gründe für diese Entscheidung stehen in
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(Englisch) und den Regeln danach.

### Platzieren oder remixen

Beides bringt das Bauwerk eines anderen in eine Welt von Ihnen, aber es ist
nicht dasselbe:

| | Platzieren | Remixen (oder Eine Kopie bearbeiten) |
|---|---|---|
| Was entsteht | Eine Platzierung: eine kleine signierte Notiz, wo das Bauwerk gezeigt wird | Ein neues Bauwerk mit neuen IDs, das Ihnen gehört |
| Das Bauwerk | Dieselbe Geteilte Welt, wie veröffentlicht | Ihre eigene Kopie, mit einem Verweis auf das Original |
| Können Sie die Steine ändern? | Nein | Ja, im Editor |
| Wer ist der Autor | Der ursprüngliche Herausgeber | Sie, mit dem Original als Elternteil |
| Gesteuert durch | Die Einstellung **Wer es platzieren darf** des Herausgebers | Die Lizenz |
| Veröffentlichen | Nichts Neues wird veröffentlicht | Erstellt eine neue Geteilte Welt unter Ihrem Namen |

Platzieren ist wie ein Link auf eine Datei; Remixen ist wie eine eigene
Kopie davon, um sie zu ändern. Wer **Nur ich darf es platzieren** gewählt
hat, kann Remixe trotzdem über die Lizenz erlauben, und ein Remix gehört
Ihnen, um ihn zu platzieren, wo Sie möchten.

## Begegnungen in der Welt — Veröffentlichungen und Avatare, die Ihre Peers teilen

**Begegnungen in der Welt** ist eine Gruppe in **In der Nähe** unter
Erkunden. Sie ist eine eigene kleine Karte (nicht die Weltkarte) und zeigt,
wovon Ihnen Ihre
[verbundenen Peers](07-PeerConnectionsAndFriends.md) erzählt haben:

- **Veröffentlichungen**, die in der Nähe platziert sind (siehe
  [Signierte Einträge & externe Nachweise](09-PublicationsAndEvidence.md));
- die **Avatare** anderer Menschen;
- eine Markierung für Sie.

Bis ein verbundener Peer etwas geteilt hat, steht in der Gruppe
**Hier gibt es noch nichts zu entdecken.**.

Klicken Sie auf eine Markierung, um sie zu untersuchen:

- Eine **Veröffentlichung** zeigt Titel, Herausgeber, ob sie signiert ist,
  ihre Position und wie viele Anker und Snapshot-Platzierungen sie hat.
- Ein **Avatar** zeigt Namen, Eigentümer und Position.

Bietet mehr als ein Peer dasselbe an, lässt **Quelle wählen** Sie
bestimmen, wessen Kopie Sie ansehen. Nichts hier bewegt Ihre Kamera oder
ändert etwas.

### Material und Überprüfung

Eine ausgewählte Veröffentlichung zeigt zwei weitere Zeilen:

- **Material**: Lässt sich ihr Inhalt laden? **Available** (verfügbar)
  oder **Unavailable** (nicht verfügbar).
- **Überprüfung**: Passt der Inhalt zu dem, was für ihn beansprucht wurde?
  **Verified** (überprüft) oder **Unverifiable** (nicht überprüfbar).

Inhalt, der schon auf diesem Gerät ist, lädt und wird sofort geprüft. Was
Ihnen ein Peer nur gezeigt hat, steht meist auf **Unavailable** /
**Unverifiable**, bis Sie es mit
[Geteilte Welt entdecken](#geteilte-welt-entdecken--dezentrale-netzwerke-direkt-durchsuchen)
nachschlagen. Findet das es auf Arweave oder Nostr, wird es auch hier
verwendet. Findet es mehr als einen Ort, lässt **Ort wählen** Sie einen
aussuchen; bis dahin wird nichts geladen, und die Wahl gilt nur für diese
Veröffentlichung.

Eine Zeile **Quelle** sagt, woher der Inhalt kam: **Local** (lokal, dieses
Gerät) oder **Decentralized** (dezentral, Arweave oder Nostr). Das ist eine
schlichte Tatsache, keine Vertrauensbewertung.

Sobald die Veröffentlichung eines Peers **Available** zeigt, kommt sie zu
Entdecken und zur Seite ihres Autors hinzu, als hätten Sie sie dort
gefunden, und bleibt auch nach einem Neuladen. Nichts kennzeichnet sie als
über einen Peer gefunden: Ihr eigenes Gerät hat den Inhalt geprüft, also
ist sie wie jede andere.

### Der Dialog Verteilen

Sobald dieses Gerät den Inhalt einer Veröffentlichung hat, öffnet eine
Schaltfläche **Verteilen** den Dialog **Verteilen**. Derselbe Dialog öffnet
sich unter
[Meine Geteilte Welt](#meine-geteilte-welt--ihren-eigenen-snapshot-verteilen-ohne-peers)
für Ihr eigenes Bauwerk. Was jedes Netzwerk tut, steht unter
[Ihre Arbeit verteilen](Distribution.md).

Oben stehen zwei Einstellungen, die für alles im Dialog gelten. Beide
beginnen mit Ihren gespeicherten Vorlieben:

- **Speicher**: wohin der Inhalt geht. **Arweave**, **IPFS (lokales
  Kubo)**, **IPFS (entferntes Pinning)** oder, experimentell, **Steem** oder
  **Blurt** (siehe [Steem](11-EvidenceAndStorage.md#steem) und
  [Blurt](11-EvidenceAndStorage.md#blurt)). Entferntes Pinning fragt jedes
  Mal nach Endpunkt und Zugangsdaten und speichert sie nie. Aufgeführt wird
  nur Speicher, den dieses Gerät tatsächlich nutzen kann.
- **Substrat für Ankündigung / Entdeckung**: wo es angekündigt wird, damit
  andere es finden. **Arweave**, **Blurt**, **Nostr** oder **Steem**.

Der Dialog kann zweierlei senden:

- den **Signierten Anspruch**, der sagt, dass Sie das veröffentlicht haben,
  und
- den **Snapshot**, eine Kopie des Bauwerks selbst (siehe
  [Lokaler Snapshot](09-PublicationsAndEvidence.md#lokaler-snapshot)).

Lässt sich beides senden, schickt die Hauptschaltfläche **Verteilen** sie
nacheinander, weil beide dieselbe Wallet-Erweiterung um eine Signatur
bitten können. Jedes hat seinen eigenen Abschnitt mit eigenem Ergebnis, und
ein Fehlschlag verdeckt oder stoppt nie das andere. **Nur Signierten
Anspruch verteilen** und **Nur Snapshot verteilen** senden nur eines, etwa
um eine fehlgeschlagene Hälfte zu wiederholen. Lässt sich nur eines senden,
heißt seine Schaltfläche einfach **Signierten Anspruch verteilen** oder
**Snapshot verteilen**.

Zum Signieren brauchen Sie eine Browsererweiterung: eine Arweave-Wallet
(etwa Wander) für Arweave und einen Nostr-Signierer (etwa nos2x) für Nostr.
Ohne sie sagt der Abschnitt „Das Verteilen konnte nicht abgeschlossen
werden.“ und warum.

- Der Abschnitt **Signierter Anspruch** zeigt für **Material** und
  **Entdeckung** **Absent** (fehlt), bis er gesendet wurde. Danach zeigt er
  die ID der Veröffentlichung, wo ihr Material liegt, und die ID der
  Ankündigung, mit einer Zeile pro
  [Nostr-Relay](10-NetworkSettings.md#nostr-relays).
- Der Abschnitt **Snapshot** zeigt einen **Inhalts-Hash**, einen
  **Fundort** und eine **Ankündigungs**-ID. „Keine Ankündigung“ heißt, die
  Kopie wurde gespeichert, aber nicht angekündigt; das ist ein
  Teilergebnis, kein Fehler. Ein echter Fehlschlag sagt „Das Verteilen des
  Snapshots konnte nicht abgeschlossen werden.“

Den Dialog zu schließen verliert nichts: Öffnen Sie ihn wieder, sind die
Ergebnisse noch da. Sie werden vergessen, wenn Sie eine andere
Veröffentlichung auswählen oder die Seite verlassen.

## Geteilte Welt entdecken — dezentrale Netzwerke direkt durchsuchen

In Begegnungen in der Welt öffnet **Entdeckung Geteilter Welten** das Feld
**Geteilte Welt entdecken**. Es braucht keinen Peer und keine Markierung.
Geben Sie eine **ID der Geteilten Welt** ein, lassen Sie das
**Entdeckungs-Tag** stehen (es beginnt mit ForkBuilds eigenem Tag, das fast
immer stimmt), und klicken Sie auf **Geteilte Welt entdecken**. ForkBuild
fragt Arweave und Nostr direkt.

Die Zeile **Entdeckung** zeigt dann **Unavailable** (nicht verfügbar),
**Resolved** (aufgelöst) oder **Ambiguous** (mehrdeutig: mehr als eine
Spur für denselben Ort). Ist sie aufgelöst, zeigt sie dieselben Zeilen
Material, Quelle und Überprüfung wie oben.

Heute löst sie nur Ihre eigenen Veröffentlichungen auf: solche, die Sie
signiert haben und noch auf diesem Gerät haben. Verstehen Sie es als „Ist
mein Bauwerk wirklich da draußen, und unversehrt?“, nicht als Suche durch
die Arbeit aller.

Zeigt ein Ergebnis **Verified**, markiert **Geteilte Welt auswählen** es
als die, mit der Sie arbeiten, in einem Hinweis darunter. Mehr tut es
nicht: Es sendet oder prüft nichts erneut. Es bleibt, bis Sie eine andere
auswählen oder die Seite verlassen. Das Feld zu schließen behält, was Sie
eingegeben und gefunden haben.

## Ortsnamen in der Nähe — Ansprüche von jedem entdecken

**Ortsnamen**, eine Gruppe in **In der Nähe** unter Erkunden, zeigt die
Namen, die Menschen für die Regionen um Sie herum veröffentlicht haben. Sie
schlägt sie auf Nostr nach und braucht daher keinen verbundenen Peer. Sie
beginnt eingeklappt, weil diese Namen noch nicht geprüft sind.

Jede Zeile zeigt den Namen, ungefähr wo er liegt, wer ihn vergeben hat und
wann:

- **Navigieren** bewegt Ihre Kamera zu dieser Region, wie **Hin**. Es
  benennt nichts um und nimmt nichts an.
- **Übernehmen** speichert den Namen auf diesem Gerät, nach derselben
  Signaturprüfung wie bei einem Namen von einem verbundenen Peer (siehe
  [Eine von einem Peer empfangen](09-PublicationsAndEvidence.md#eine-von-einem-peer-empfangen)).
  Die Schaltfläche zeigt dann **✓ Bereits gespeichert**.

Haben zwei Menschen dasselbe Gelände benannt, erscheinen beide Namen.
ForkBuild kürt nie einen Gewinner, und einen zu übernehmen heißt nicht,
dass er richtiger ist. Schlägt die Suche fehl, sagt ein Hinweis es, und die
Namen, die Sie schon gesehen haben, bleiben. Wie Sie selbst einen Namen
veröffentlichen, steht unter
[Einen Ort benennen](09-PublicationsAndEvidence.md#einen-ort-benennen).

## Beanspruchte Bauwerke — die Bauwerke anderer, dort, wo ihre Herausgeber sie hinstellen

Während Sie gehen, lädt ForkBuild Snapshots herunter, die in Ihrer Nähe
angekündigt wurden (siehe
[Meine Geteilte Welt](#meine-geteilte-welt--ihren-eigenen-snapshot-verteilen-ohne-peers)).
Eine Ankündigung kann sagen, wo das Bauwerk steht, aber das ist nur ein
**Anspruch**: Ihm blind zu trauen ließe jeden ein Bauwerk auf Ihres
stellen. Darum erscheint ein beanspruchtes Bauwerk als **Geist**, seine
Steine durchscheinend an der beanspruchten Stelle, und wird nie von selbst
zu einer echten Platzierung.

**Eine Ausnahme braucht keinen Klick.** Verteilen Herausgeber ihren eigenen
Snapshot, trägt die Ankündigung ihre **signierte Platzierung**. Sobald
dieses Gerät die Geteilte Welt dieses Bauwerks kennt (sie ist unter
Entdecken, oder Sie klicken auf **Überprüfen**), prüft ForkBuild, dass die
Platzierung mit dem Schlüssel dieser Geteilten Welt signiert ist. Ist sie
es, steht das Bauwerk fest da, genau wo sie es hingestellt haben. Es bleibt
ihre Platzierung, also können Sie sie nicht verschieben oder entfernen, und
verschieben sie sie und verteilen erneut, verschiebt sie sich auch bei
Ihnen. Eine Position, die jemand anderes signiert hat, bleibt ein Geist.

Ein Geist wird nur gezeichnet, wenn:

- er in Ihrer Nähe ist (Ihre Kartenzelle oder die daneben, etwa 1.000
  Einheiten in jede Richtung), und er verschwindet wieder, wenn Sie
  weggehen;
- sein Inhalt heruntergeladen wurde und zu seinem Inhalts-Hash passt;
- dieses Gerät noch keine Platzierung dieses Bauwerks hat (sobald es eine
  hat, wird stattdessen das echte Bauwerk gezeigt);
- nichts, was dieses Gerät kennt, schon genau an dieser Stelle steht.

Einen Geist können Sie nicht auswählen, untersuchen, bearbeiten oder
kopieren. Sehr große Bauwerke werden nur teilweise gezeichnet (die ersten
paar tausend Steine).

Jeder Geist hat eine Zeile in **Beanspruchte Bauwerke**, das nächste
zuerst: Titel, Entfernung, Position und „beansprucht von …“. Titel und
Autor stammen aus dem Bauwerk selbst und sind genauso ungeprüft wie seine
Position. Jede Zeile hat:

- **Navigieren**: bewegt die Kamera zur beanspruchten Stelle. Sonst ändert
  sich nichts.
- **Überprüfen**: erscheint, solange dieses Gerät die signierte Geteilte
  Welt des Bauwerks nicht hat. Es schlägt sie auf Nostr und Arweave nach und
  prüft, dass sie gültig signiert ist, dass sie die Geteilte Welt dieses
  Bauwerks ist und dass sie genau den Inhalt nennt, den der Geist zeigt.
  Stimmt alles, kommt sie zu Entdecken, und die Zeile sagt „signiert von
  *Name* (Schlüssel did:key:…)“. Wenn nicht, sagt die Zeile, warum: Nichts
  wurde angekündigt (der Herausgeber hat vielleicht nur den Snapshot
  verteilt), keine Kopie war gültig signiert, oder sie nennt anderen
  Inhalt. Überprüfen nimmt die Position nicht an, aber kam die eigene
  signierte Platzierung des Herausgebers mit, steht das Bauwerk jetzt fest
  dort, wo er es hingestellt hat.
- **Position annehmen**: der einzige Weg, einem Anspruch zu trauen. Es
  platziert das Bauwerk an der beanspruchten Stelle mit einer *eigenen*,
  von Ihnen signierten Platzierung, und danach ist es ein normales Bauwerk
  in Ihrer Welt. Es geht erst, wenn dieses Gerät die signierte, geprüfte
  Geteilte Welt des Herausgebers hat, und nur wenn sie genau den Inhalt
  nennt, den der Geist zeigt. Sie bekommen sie über **Überprüfen**, wenn
  [man die Welt mit Ihnen teilt](04-PublishingAndForking.md#mit-verbundenen-peers-teilen),
  oder wenn die
  [Begegnung](#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen)
  eines Peers dafür **Available** zeigt. Es bleibt auch aus, wenn der
  Herausgeber **Nur ich darf es platzieren** gewählt hat (siehe
  [Wählen, wer es platzieren darf](04-PublishingAndForking.md#wählen-wer-es-platzieren-darf)).
  Ist es aus, sagt die Zeile, warum.

  **Was „überprüft“ heißt.** Das Bauwerk ist genau der Inhalt einer
  Geteilten Welt, die mit dem gezeigten Schlüssel signiert ist. Es beweist
  nicht, wer diesen Schlüssel hat (jeder kann einen erzeugen und sich
  „bob“ nennen), und es beweist nicht die Position, die immer noch nur
  beansprucht ist. Position annehmen geht auch bei Schlüsseln, die Sie
  nicht kennen; ob Sie einem trauen, entscheiden Sie.
- **Ausblenden**: entfernt diesen Geist und seine Zeile, bis Sie die
  Weltansicht verlassen. Nichts wird gemeldet oder gelöscht.

## Meine Geteilte Welt — Ihren eigenen Snapshot verteilen, ohne Peers

**Meine Geteilte Welt**, weiter unten im Feld unter Suche und Avatar,
betrifft das Bauwerk, das Sie geöffnet haben. Es zeigt Titel und Autor,
sobald es veröffentlicht ist, und funktioniert, ob jemand anderes da ist
oder nicht.

Vorn stehen **Verteilen** und der Link zum Teilen. **Verteilen** öffnet
denselben [Dialog Verteilen](#der-dialog-verteilen) wie in Begegnungen in
der Welt, aber für Ihr eigenes Bauwerk. Bis das Bauwerk veröffentlicht ist,
ist die Schaltfläche ausgegraut, mit dem Hinweis, dass es noch nichts zu
senden gibt. Entferntes IPFS-Pinning und Verankerung mit Bitcoin oder Base
sind nicht hier: Sie brauchen zuerst ein Konto oder eine Wallet, darum
liegen sie auf der Seite Signierte Einträge (siehe
[Veröffentlichen auf IPFS](11-EvidenceAndStorage.md#veröffentlichen-auf-ipfs)
und
[Der Ablauf für Bitcoin-Anker](11-EvidenceAndStorage.md#der-ablauf-für-bitcoin-anker)).

**Mehr ▾** enthält die selteneren Aktionen:

- **Snapshot exportieren** und **Snapshot-Übereinstimmung prüfen**. Ihre
  Ergebnisse bleiben im Feld, nachdem sich das Menü schließt.
- **Diagnosewerkzeuge** (siehe [unten](#diagnosewerkzeuge)).
- **Veröffentlichung zurückziehen …** fragt einmal und nimmt dann die Welt
  aus dem Katalog. Ihre Platzierungen, das Bauwerk und alle Kopien, die Sie
  schon gesendet haben, bleiben; gesendete Kopien lassen sich nicht
  zurückholen, aber dieses Gerät merkt sich, was Sie zurückgezogen haben,
  sodass Entdecken sie nicht wieder listet. **Abbrechen** bricht ab.

Wurde die Welt, die Sie geöffnet haben, von jemand anderem veröffentlicht
(ein Peer hat sie mit Ihnen geteilt, etwa), heißt das Feld **Geteilte
Welt** und hat kein **Zurückziehen** und kein **Verteilen**: Das kann nur
der Herausgeber einer Welt. Alles andere bleibt, auch die Kommentare.

**▸ Kommentare (N)** öffnet die Kommentare des Bauwerks; die Zahl bleibt
aktuell, solange es eingeklappt ist. Schreiben können Sie, sobald das
Bauwerk veröffentlicht ist. Wer kommentieren darf, steht unter
[Kommentare](09-PublicationsAndEvidence.md#kommentare).

### Platzierungen

**Platzierungen (N)** listet jede Stelle, an der diese Geteilte Welt steht:
Position, Revision und, wenn bekannt, Eigentümer. Ein Bauwerk kann an mehr
als einer Stelle stehen, und jede Platzierung, die dieses Gerät kennt, wird
gelistet.

- **Verschieben …** öffnet **Platzierung verschieben** für diese
  Platzierung, mit der Warnung vor Bauwerken an der neuen Stelle.
- **Entfernen …** fragt einmal und nimmt dann diese Platzierung aus der
  Welt. Das Bauwerk und seine anderen Platzierungen bleiben. Ohne
  Platzierung wird das Bauwerk einfach nirgends gezeigt, bis Sie es wieder
  platzieren.

Beide sind bei einer Platzierung ausgegraut, die jemand anderes gemacht
hat.

**Hier eine Platzierung hinzufügen**, unter der Liste, platziert dasselbe
Bauwerk *noch einmal* dort, wo Ihr Avatar steht (oder unter der Kamera,
ohne Avatar). Es verschiebt keine bestehende Platzierung und macht keine
Kopie: Es bleibt eine Geteilte Welt (siehe
[Platzieren oder remixen](#platzieren-oder-remixen)). Es sagt, wo es das
Bauwerk platziert hat und wie viele Platzierungen es jetzt hat. Steht genau
dort, wo Sie sind, schon eine Platzierung, bittet es Sie, sich zuerst zu
bewegen, sodass zweimal Klicken keine zwei auf eine Stelle stapelt.

### Diagnosewerkzeuge

ForkBuild findet Snapshots von selbst, während Sie gehen (siehe unten).
**Diagnosewerkzeuge**, unter **Mehr**, macht dieselben Schritte von Hand,
für den Fall, dass dabei nicht herauskommt, was Sie erwarten. Jeder Schritt
ist ein eigener Klick, und nichts läuft von selbst:

1. **Snapshots entdecken** listet alles, was unter ForkBuilds gemeinsamem
   Tag angekündigt wurde. Es geht ohne Peers und ohne eigenes
   veröffentlichtes Bauwerk.
2. **Ausgewählten Snapshot auflösen** prüft, ob sich der gewählte abrufen
   lässt.
3. **Ausgewählten Snapshot zuordnen** prüft, ob er zum Inhalts-Hash dieser
   Geteilten Welt passt. **Ausgewählten Snapshot materialisieren**
   speichert ihn auf diesem Gerät. Sie können beides tun, in beliebiger
   Reihenfolge.
4. **Materialisierten Snapshot platzieren**, dann **Platzierten Snapshot
   registrieren** fügen ihn der Welt hinzu, in der Sie sind, ohne
   Neuladen.

**Beanspruchte Position verwenden** übernimmt, jederzeit nach der Auswahl,
die Position, die der Snapshot selbst beansprucht, wenn er eine hat.

**Was von selbst geschieht.** Während Sie gehen, sucht ForkBuild ab und zu
nach Snapshots, so wie **Snapshots entdecken**. Es schaut, was dieses Gerät
hat, was verbundene Peers schon dadurch teilen, dass sie verbunden sind,
und was Nostr meldet. Einer, der die Prüfung besteht, durchläuft dieselben
Schritte von selbst und erscheint als Markierung unter
[Begegnungen in der Welt](#begegnungen-in-der-welt--veröffentlichungen-und-avatare-die-ihre-peers-teilen);
eine eigene Liste oder Benachrichtigung gibt es nicht.

Es lädt nur Snapshots in Ihrer Nähe herunter: solche, die in Ihrer
Kartenzelle oder den Zellen daneben platziert sind oder sein sollen (etwa
1.000 Einheiten in jede Richtung), dazu die 20 neuesten, die nicht sagen,
wohin sie gehören. Weiter entfernte laden, wenn Sie in ihre Nähe kommen.
Höchstens vier laden gleichzeitig. Einen, den dieses Gerät schon hat, liest
es nach derselben Inhaltsprüfung aus seinem eigenen Speicher.

## Wie geht es weiter?

Zurück zur **[Weltansicht](03-WorldView.md)**, oder weiter zu
**[Ihre Arbeit verteilen](Distribution.md)**, für alles, wohin ein Bauwerk
gesendet werden kann.
