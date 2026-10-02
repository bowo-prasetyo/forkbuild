<!-- translation-of: docs/user/13-YourData.md source-hash: 5f33407334bd55c8 -->
# 13 — Ihre Daten

<!-- languages -->
[English](../13-YourData.md) · **Deutsch** · [Español](../es/13-YourData.md) · [Français](../fr/13-YourData.md) · [Bahasa Indonesia](../id/13-YourData.md) · [日本語](../ja/13-YourData.md) · [한국어](../ko/13-YourData.md) · [Português (Brasil)](../pt-BR/13-YourData.md)
<!-- /languages -->

ForkBuild hat keine Konten und keinen Server, der Ihre Arbeit aufbewahrt.
Alles, was es speichert, liegt in diesem Browser auf diesem Gerät: Ihre
Dokumente, Identitäten und deren private Schlüssel, Strukturen,
Veröffentlichungen, Peers und Freunde, Chatverläufe und Einstellungen.
**Das Löschen der Daten dieser Website im Browser löscht all das
endgültig**, ebenso das Deinstallieren des Browsers oder der Verlust des
Geräts.

Auf der Seite **Ihre Daten** (**Ihre Daten** im oberen Menü) behalten Sie
eine Kopie.

## Auf diesem Gerät

Der erste Abschnitt listet auf, was gespeichert ist, nach Art, und wie viel
Platz es belegt. Die Zahlen sind Speichereinträge, keine Dokumente: Ein
gespeichertes Dokument und die Liste der Dokumente sind zum Beispiel zwei
Einträge.

Steht dort **Der Browser kann diese Daten bei knappem Speicherplatz
entfernen.**, klicken Sie auf **Den Browser bitten, sie zu behalten**.
Browser stimmen meist zu, sobald Sie die Website als Lesezeichen gespeichert
oder installiert haben oder sie häufig nutzen. Das schützt nur davor, dass
der Browser von selbst aufräumt: Das Löschen der Websitedaten löscht
trotzdem alles.

## Sichern

1. Wählen Sie eine **Passphrase der Sicherung** (mindestens 8 Zeichen) und
   geben Sie sie zweimal ein.
2. Lassen Sie **Von anderen Personen heruntergeladene Bauwerke
   einschließen** ohne Häkchen, es sei denn, Sie möchten sie: Sie können
   groß sein und lassen sich meist erneut abrufen. Ihre eigenen
   Veröffentlichungen sind immer enthalten.
3. Klicken Sie auf **In eine Datei sichern**. Der Browser lädt eine Datei
   `forkbuild-backup-<Datum>.forkbuild-backup` herunter.

Die Datei enthält alles, was die Seite aufgelistet hat, verschlüsselt mit
Ihrer Passphrase der Sicherung. Sie kann sicher in einem Cloudspeicher oder
auf einem USB-Stick liegen, aber **ohne diese Passphrase lässt sie sich auf
keinem Weg öffnen**; bewahren Sie beides also so auf, dass Sie es nicht
verlieren. Die Passphrase der Sicherung ist unabhängig von den Passphrasen
Ihrer Identitäten: Jede Identität darin bleibt durch ihre eigene geschützt.

Die Sicherung enthält nicht, welche Identität angemeldet ist. Nach einer
Wiederherstellung melden Sie sich erneut an.

Neben **In eine Datei sichern** kann derselbe Abschnitt:

- **Sicherung teilen …** (Telefone, Tablets und manche Computer): öffnet
  das Teilen-Menü Ihres Geräts, sodass Sie die Datei in einem Cloudspeicher
  ablegen, per E-Mail senden oder auf ein anderes Gerät bringen können.
  Öffnet sich das Teilen-Menü beim ersten Tippen nicht (das Verschlüsseln
  hat länger gedauert, als der Browser erlaubt), tippen Sie erneut auf
  **Sicherung teilen**: Die Sicherung ist fertig und geht sofort raus.
- **In „Ordner“ sichern**: sobald Sie einen Sicherungsordner gewählt haben
  (unten).

**Den Sicherungsschlüssel auf diesem Gerät merken** erscheint, sobald Sie
eine Passphrase eingeben. Setzen Sie das Häkchen, um spätere Sicherungen
ohne Eingabe der Passphrase zu erstellen: Die Schaltflächen mit einem Klick
und die automatischen Sicherungen unten nutzen ihn. ForkBuild speichert
nicht die Passphrase selbst, sondern nur einen daraus abgeleiteten
Schlüssel, den der Browser ForkBuild zum Erstellen von Sicherungen nutzen
lässt und nie jemandem zeigt und der keine Sicherung öffnen kann. Damit
erstellte Sicherungen lassen sich weiterhin mit Ihrer Passphrase öffnen.
**Sicherungsschlüssel vergessen** entfernt ihn.

## Erinnerungen

Wurde dieses Gerät länger nicht gesichert, sagt das eine Leiste unter dem
Menü auf jeder Seite, mit **Jetzt sichern** und **In einer Woche
erinnern**:

- Sie erscheint zum ersten Mal eine Woche, nachdem dieser Browser begonnen
  hat, Ihre Arbeit zu halten (Dokumente, Identitäten, Strukturen, Peers
  oder Chat), falls Sie nie gesichert haben.
- Danach erscheint sie, wenn die letzte Sicherung älter ist als unter
  **Erinnerungen und automatische Sicherungen → Mich ans Sichern
  erinnern** gewählt: jede Woche, alle 2 Wochen, jeden Monat (Standard),
  alle 3 Monate oder nie.
- **Jetzt sichern** sichert mit einem Klick in Ihren Sicherungsordner, wenn
  Sie einen mit gemerktem Schlüssel eingerichtet haben; sonst öffnet es
  diese Seite.

Derselbe Abschnitt zeigt, wann und wohin zuletzt gesichert wurde.

## In einen Ordner sichern

In Chrome und Edge auf einem Computer können Sie mit **Ordner wählen …**
einen Ordner für Sicherungen auswählen. Wählen Sie einen, den Ihr
Cloudspeicher synchronisiert (Dropbox, OneDrive, iCloud Drive, Google
Drive), oder einen USB-Stick, und jede Sicherung verlässt dieses Gerät,
ohne dass Sie Dateien verschieben. Die Sicherung jedes Tages ist eine
Datei, `forkbuild-backup-<Datum>.forkbuild-backup`; eine zweite Sicherung
am selben Tag ersetzt die Datei dieses Tages, und ForkBuild behält dort die
neuesten zehn eigenen Sicherungen, ohne je etwas anderes im Ordner
anzurühren.

Der Browser fragt beim ersten Mal, ob ForkBuild in den Ordner speichern
darf, und fragt bei einem späteren Besuch möglicherweise erneut. **Diesen
Ordner nicht mehr verwenden** vergisst ihn; die Sicherungen darin bleiben.

**Einmal täglich automatisch in den Ordner sichern, während ForkBuild
geöffnet ist** braucht einen Ordner und einen gemerkten Schlüssel.
ForkBuild prüft dann eine Minute nach dem Öffnen und danach stündlich und
sichert, wenn die letzte Sicherung einen Tag alt ist. Es fragt nie von
selbst nach einer Berechtigung: Will der Browser erneut fragen, warten
automatische Sicherungen, bis Sie selbst einmal in den Ordner sichern. Eine
fehlgeschlagene automatische Sicherung wird auf dieser Seite angezeigt.

Andere Browser können nicht in einen Ordner speichern. Nutzen Sie dort
**Sicherung teilen …** oder laden Sie die Datei herunter und verschieben
Sie sie selbst.

## Wiederherstellen

Schließen Sie ForkBuild zuerst in allen anderen Tabs: Ein offen gelassener
Tab kann seine älteren Daten zurückschreiben.

1. Wählen Sie unter **Wiederherstellen** die Sicherungsdatei, geben Sie
   ihre Passphrase ein und klicken Sie auf **Sicherung öffnen**. Eine
   falsche Passphrase wird abgelehnt, und nichts ändert sich. ForkBuild
   zeigt, wann die Sicherung erstellt wurde und was sie enthält.
2. Wählen Sie, wie wiederhergestellt wird:
   - **Hinzufügen, was dieses Gerät nicht hat** (Standard): Alles in der
     Sicherung, was nicht auf diesem Gerät ist, wird hinzugefügt. Wo beide
     etwas haben, etwa dasselbe Dokument oder eine Einstellung, wird die
     Version dieses Geräts behalten.
   - **Alles auf diesem Gerät durch die Sicherung ersetzen**: löscht
     zuerst, was ForkBuild hier gespeichert hat, und stellt dann die
     Sicherung genau wieder her. Setzen Sie das Häkchen zur Bestätigung,
     um es zu aktivieren.
3. Klicken Sie auf **Wiederherstellen**. Die Seite wird neu geladen, wenn
   es fertig ist. Ein wiederhergestelltes Gerät gilt als gesichert am
   Datum, an dem die Sicherung erstellt wurde.

Eine Sicherung, die eine neuere Version von ForkBuild erstellt hat, kann
eine ältere nicht öffnen; aktualisieren Sie zuerst diese Kopie. Alles in
einer Sicherung, was diese Version nicht kennt, wird übersprungen, und das
Ergebnis sagt, wie viel.

## Kleinere Exporte

Um nur eine Art von Dingen mitzunehmen oder zu teilen, nutzen Sie den
Export auf ihrer eigenen Seite:

| Was | Export | Import |
|---|---|---|
| Ein Dokument | **Exportieren** in der Werkzeugleiste des Editors | **Importieren** in der Werkzeugleiste des Editors |
| Alle gespeicherten Dokumente | **Alle Dokumente exportieren** ganz unten im Menü **Zuletzt** des Editors | **Importieren** in der Werkzeugleiste des Editors |
| Eine Struktur | **Bauplan exportieren** im Menü **⋮** ihrer Karte | **Bauplan importieren** neben **Meine Strukturen** |
| Alle Strukturen | **Alle exportieren** neben **Meine Strukturen** | **Bauplan importieren** neben **Meine Strukturen** |
| Eine Identität | **Exportieren** unter **Meine Identitäten** | **Identität importieren** unter **Meine Identitäten** |

Der Import aller Dokumente stellt die zurück, die dieses Gerät nicht hat,
lässt die, die es schon hat, unverändert und speichert eine Kopie neben
jedem, das es in einer anderen Version hat. Der Import aller Strukturen
überspringt Designs, die schon in Meine Strukturen sind. Eine exportierte
Identität trägt auch ihren Widerruf, ihren Nachfolger und ihre
Geräteberechtigungen, sodass eine widerrufene Identität widerrufen
zurückkommt.

Chatverläufe, Freunde, gefolgte Personen und Einstellungen wandern nur mit
einer vollständigen Sicherung mit.

## Ihre Veröffentlichungen

Eine Kreation, die Sie **veröffentlichen**, wird nur auf diesem Gerät
gespeichert, bis Sie sie verteilen (siehe
[Veröffentlichen & Forken](04-PublishingAndForking.md)). Ihre Karte im
Repository sagt, wo dieses Gerät das Verteilen festgehalten hat, zum
Beispiel **Gespeichert auf IPFS · Angekündigt auf Nostr**: wohin das
Bauwerk oder sein Signierter Anspruch hochgeladen wurde (IPFS, Arweave oder
Steem) und wo es angekündigt wurde (Nostr, Arweave oder Steem). Halten Sie
den Zeiger über einen Namen, um seine Adresse oder Ankündigungs-ID zu
sehen.

Die Zeile sagt nur, wovon dieses Gerät einen Nachweis hat. Sie prüft
nicht, ob ein Upload noch verfügbar ist (eine IPFS-Kopie hält nur, solange
jemand sie gepinnt lässt), und ein Verteilen von einem anderen Gerät ist
hier nicht bekannt. Ohne Nachweis sagt die Karte **Auf diesem Gerät ist
keine Verteilung verzeichnet.**: Sichern Sie es, oder öffnen Sie es mit
**Erkunden** in der Weltansicht und nutzen Sie **Verteilen** unter **Meine
Geteilte Welt**. Das Teilen mit verbundenen Peers wird nicht als Verteilen
festgehalten: Sie behalten eine Kopie nur so lange, wie sie möchten.
