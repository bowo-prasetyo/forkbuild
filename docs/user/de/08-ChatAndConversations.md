<!-- translation-of: docs/user/08-ChatAndConversations.md source-hash: 406b0d8076916c27 -->
# 08 — Chat & Unterhaltungen

<!-- languages -->
[English](../08-ChatAndConversations.md) · **Deutsch** · [Bahasa Indonesia](../id/08-ChatAndConversations.md) · [日本語](../ja/08-ChatAndConversations.md)
<!-- /languages -->

Direktnachrichten in ForkBuild laufen Peer-to-Peer und **nur unter
Freunden** — wie Sie sich zuerst mit jemandem befreunden, steht unter
[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md).

## Eine Unterhaltung beginnen

Den Chat erreichen Sie über die Schaltfläche **Chat** eines Freundes auf
der Seite **Peers** oder über die Seite **Unterhaltungen** in der oberen
Leiste — aus der Weltansicht oder von einem Avatar aus gibt es keinen
Zugang zum Chat. Öffnen Sie den Chat mit jemandem, der gerade kein Freund
ist (oder blockiert ist), erscheint statt eines Eingabefelds eine
Erklärung: Die Freundschaft, nicht das Online-Sein, schaltet den Chat
frei.

## Die Seite Unterhaltungen

Listet alle auf, die es wert sind, gezeigt zu werden — jeden, zu dem Sie
eine gemerkte Beziehung, eine Freundschaft (einschließlich einer
ausstehenden Anfrage) oder einen Nachrichtenverlauf haben, sortiert nach
der jüngsten Aktivität. Jede Zeile zeigt:

- den Anzeigenamen und ein Abzeichen **Online / Offline**
- die Beziehung — Freund, Freundschaftsanfrage ausstehend, Bekannter Peer
  oder Noch nie verbunden
- die Zahl ungelesener Nachrichten und „N Nachrichten warten auf
  Versand“, falls welche vorgemerkt sind
- die Zeit der letzten Aktivität

Nur aktuelle Freunde, die Sie nicht blockiert haben, bekommen eine
Schaltfläche **Chat öffnen**; bei allen anderen verweist die Zeile Sie
stattdessen zurück zu Peers. Ein Freund, den Sie blockiert haben, zeigt
statt der Schaltfläche „⛔ Blockiert — heben Sie die Blockierung unter
Peers auf, um wieder zu chatten.“, und die Zeile aktualisiert sich,
sobald Sie ihn blockieren oder die Blockierung aufheben.

## Die Chatansicht

Ein einzelner scrollbarer Verlauf zwischen Ihnen und einem Freund:
Sprechblasen mit „Sie“ oder seinem Namen, jede mit Zeitstempel, und
darunter ein Eingabefeld (bis zu 4.000 Zeichen). Klicken Sie auf **Details
zeigen** für ein kleines Feld mit seiner Identität, Beziehung,
Freundschaft, dem aktuellen Verbindungszustand und der Zahl der
Nachrichten bzw. wartenden Nachrichten. Es gibt keine Tippanzeige, kein
Bearbeiten, Löschen, keine Reaktionen, Anhänge oder Gruppenchats — es sind
bewusst nur Nachrichten.

## Sprachanrufe

Eine Schaltfläche **📞 Anrufen** sitzt neben dem Eingabefeld, sobald
mindestens eines der derzeit erreichbaren Geräte dieses Freundes Sprache
unterstützt — Sie müssen nicht wissen, welches seiner Geräte tatsächlich
abnimmt; ein Anruf erreicht seine Identität, nicht eine bestimmte
Verbindung.

- Klicken Sie auf **Anrufen**, um anzurufen — Sie sehen **Ruft an …**, bis
  er antwortet.
- Auf der Empfängerseite zeigt ein eingehender Anruf **Annehmen** /
  **Ablehnen**.
- Sobald verbunden, zeigt die Leiste **Im Gespräch** sowie
  **Stummschalten** / **Stummschaltung aufheben** und — sobald Ihr Mikrofon
  tatsächlich angeschlossen ist — Auswahlfelder, welches **Mikrofon** und
  (wenn Ihr Browser es unterstützt) welchen **Lautsprecher** Sie nutzen.
- Die Beenden-Schaltfläche heißt **Abbrechen**, solange Sie noch darauf
  warten, dass er abnimmt, und **Auflegen**, sobald Sie tatsächlich
  sprechen.

Auf diesem ganzen Gerät ist nur ein Anruf gleichzeitig möglich — die
Schaltfläche Anrufen ist für alle anderen deaktiviert, solange Sie in
einem Anruf sind. Verschwindet Ihr Mikrofon während des Anrufs
(ausgesteckt, Berechtigung entzogen), sagt das ein kleines Banner; der
Anruf selbst läuft weiter, falls es zurückkommt.

Ein Anruf, der endet, bevor Sie verbunden sind, erklärt kurz, warum:

| Meldung | Bedeutung |
|---|---|
| **Anruf abgelehnt.** | Er hat auf Ablehnen geklickt. |
| **Die Person ist bereits in einem anderen Anruf.** | Er ist anderweitig beschäftigt. |
| **Keine Antwort.** | Niemand hat rechtzeitig abgenommen. |
| **Auf Ihr Mikrofon konnte nicht zugegriffen werden.** | Ihr Browser hat den Mikrofonzugriff verweigert oder hat keinen. |
| **Der Anruf konnte nicht verbunden werden.** | Ein Fehler auf Verbindungsebene — ein neuer Versuch lohnt sich. |

Ein gewöhnliches Auflegen (Ihres oder seines) zeigt gar keine Meldung —
dass die Anrufleiste einfach verschwindet, sagt alles.

## Senden, während jemand offline ist

Sie können einem Freund, der offline ist, eine Nachricht senden — er muss
nicht gerade verbunden sein. Sie wird lokal vorgemerkt und automatisch
zugestellt, wenn Sie beide das nächste Mal verbunden sind; Sie müssen sie
nicht selbst erneut senden. Es gibt keinen Server, der sie dazwischen
aufbewahrt, sie wartet also auf *Ihrem* Gerät: ForkBuild muss auf beiden
Seiten gleichzeitig geöffnet sein, damit sie durchgeht. Eine Nachricht,
die nach 7 Tagen noch nicht zugestellt ist, wird verworfen und als **Nicht
zugestellt — abgelaufen** markiert. Jede ausgehende Nachricht zeigt ihren
eigenen Status unter der Sprechblase:

| Status | Bedeutung |
|---|---|
| **Vorgemerkt — wird gesendet, sobald die Person wieder verbunden ist** | Wartet darauf, dass er online kommt |
| **Gesendet** | An das Netzwerk übergeben — Ankunft noch nicht bestätigt |
| **Zugestellt** | Ankunft auf seinem Gerät bestätigt |
| **Nicht zugestellt — abgelaufen** | Nicht rechtzeitig zugestellt und verworfen |
| **Gesehen** | Er hat die Unterhaltung geöffnet und bis zu dieser Nachricht gelesen |

**Gesehen** ist vollautomatisch — es gibt keine Schaltfläche „als gelesen
markieren“. Allein das Öffnen oder Aktualisieren einer Unterhaltung teilt
dem Absender mit, dass Sie sie gelesen haben.

## Ihr Verlauf

Unterhaltungen werden lokal auf diesem Gerät gespeichert und machen nach
einem Neuladen genau dort weiter, wo Sie aufgehört haben — Nachrichten,
Zustellstatus und alles andere. Dieser Verlauf ist **nur lokal auf diesem
Gerät**: Er folgt Ihnen nicht in einen anderen Browser oder auf einen
anderen Computer, und es gibt keine Kopie auf einem Server. Jede
Unterhaltung behält ihre neuesten 500 Nachrichten; ältere fallen still
weg, damit der Speicher im Rahmen bleibt.

Eine Freundschaft zu beenden oder jemanden zu blockieren stoppt den Chat
sofort, auch wenn die zugrunde liegende Verbindung technisch noch aktiv
ist — Sie brauchen keinen eigenen Schritt „Trennen“.

## Wie geht es weiter?

Kehren Sie zu
**[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)** zurück,
um weitere Menschen zum Bauen und Chatten zu finden, oder besuchen Sie
erneut die **[Weltansicht](03-WorldView.md)**, um zu sehen, wo die
Kreationen aller leben.
