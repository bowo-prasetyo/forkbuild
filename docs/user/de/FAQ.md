<!-- translation-of: docs/user/FAQ.md source-hash: 53acfc3595aae824 -->
# Häufige Fragen

<!-- languages -->
[English](../FAQ.md) · **Deutsch** · [Español](../es/FAQ.md) · [Français](../fr/FAQ.md) · [Bahasa Indonesia](../id/FAQ.md) · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · [Português (Brasil)](../pt-BR/FAQ.md)
<!-- /languages -->

Kurze Antworten auf die Fragen, auf die man am häufigsten stößt, jeweils
mit einem Link zur Anleitung, die es ausführlich erklärt.

## Sich zurechtfinden

### Wo sind der Editor, das Repository und Anmelden geblieben?

Sie wurden im Menü umbenannt. **Bauen** öffnet den Editor, **Entdecken**
ist das frühere Repository, und **Namen wählen** (oder Ihr Name, sobald
Sie einen haben) ersetzt Anmelden. **Spazieren** öffnet die Welt am Platz
der Challenge dieser Woche. Siehe
[Sich zurechtfinden](01-GettingStarted.md#sich-zurechtfinden).

### Ich finde Mein Avatar, Peers oder die Netzwerkeinstellungen nicht

Sie stehen in der oberen Leiste unter **Mehr** (auf einem Telefon unter
**Menü**): **Persönlich** enthält Mein Avatar, Meine Identitäten und Ihre
Daten; **Menschen** enthält Peers, Gefolgt und Unterhaltungen;
**Erweitert** enthält Veröffentlichungen und Netzwerkeinstellungen. Ein
Klick auf Ihren Namen oben rechts öffnet ebenfalls Mein Avatar, Meine
Identitäten und Ihre Daten.

## Veröffentlichen und teilen

### Ich habe mein Bauwerk veröffentlicht, aber mein Freund findet es nicht in Entdecken

Sofern Sie nicht **Alle** gewählt haben, als Veröffentlichen
[Wer kann es finden?](04-PublishingAndForking.md#wer-kann-es-finden)
gefragt hat, speichert Veröffentlichen das Bauwerk nur auf Ihrem eigenen
Gerät und führt es in *Ihrem* **Entdecken** auf. So kommt es zu Ihrem
Freund:

- **Schicken Sie den Link.** Veröffentlichen zeigt **Link kopieren** (und
  **Teilen …**, wo Ihr Gerät teilen kann); das Bauwerk reist im Link mit,
  sodass Ihr Freund es auf jedem Gerät öffnen kann. Siehe
  [Einen Link teilen](04-PublishingAndForking.md#einen-link-teilen).
- **Machen Sie es für alle auffindbar.** Klicken Sie in der Meldung nach
  dem Veröffentlichen auf **Für alle auffindbar machen**, und es erscheint
  in **Entdecken** bei allen, in der Challenge und in der Welt.
- **Mit Peers teilen**, unter Ihrem Bauwerk in **Entdecken**, bietet es den
  Menschen an, mit denen Sie verbunden sind. Das Gerät eines Freundes oder
  bekannten Peers fügt es von selbst hinzu; alle anderen sehen es unter
  **Mit Ihnen geteilt** und klicken auf **Abrufen**. Sie müssen
  gleichzeitig verbunden sein, damit es ankommt.
- **Verteilen** lädt es auf Arweave oder IPFS (oder, experimentell,
  Steem oder Blurt) hoch und kündigt es an, sodass andere es finden können, ohne
  mit Ihnen verbunden zu sein.

Siehe [Veröffentlichen & Remixen](04-PublishingAndForking.md#mit-verbundenen-peers-teilen).

### Wie mache ich meine Arbeit für alle zugänglich?

Wählen Sie **Alle**, wenn Veröffentlichen
[Wer kann es finden?](04-PublishingAndForking.md#wer-kann-es-finden)
fragt (oder klicken Sie nach dem Veröffentlichen auf **Für alle auffindbar
machen**). Jedes Bauwerk, das Sie veröffentlichen, wird dann an alle
gesendet und erscheint in **Entdecken**, in der Wochen-Challenge und in der
Welt, ohne dass etwas installiert werden muss.

Um zusätzlich eine Kopie in einem dezentralen Speichernetz zu behalten,
verteilen Sie es: Speichern Sie es auf Arweave oder IPFS (oder,
experimentell, auf Steem oder Blurt) und kündigen Sie es auf Nostr oder
Arweave (oder Steem oder Blurt) an. Dafür brauchen Sie eine signierende
Browsererweiterung für die gewählten Netzwerke, etwa Wander für Arweave
oder nos2x für Nostr. [Ihre Arbeit verteilen](Distribution.md)
listet alles auf, was Sie verteilen können, wohin es gehen kann und was
jedes Netzwerk braucht.

### Warum kann niemand mein Bauwerk remixen?

Ein neues Bauwerk hat keine Lizenz, und ein Bauwerk ohne Lizenz kann
nicht geremixt werden. Öffnen Sie **Bauwerkeigenschaften** (das **✎**
neben dem Bauwerkstitel im Editor), wählen Sie eine Lizenz, die das Remixen
erlaubt (jede CC-Lizenz außer CC BY-ND), und veröffentlichen Sie erneut.
Die Einstellung ist Teil dessen, was veröffentlicht wird, daher behalten
bereits veröffentlichte Bauwerke ihre bisherige Lizenz. Siehe
[Eine Lizenz wählen](04-PublishingAndForking.md#eine-lizenz-wählen).

### Das Veröffentlichen ist fehlgeschlagen. Was bedeuten die Meldungen?

Diese Meldungen zeigt die App nur auf Englisch:

- **a title is required before publishing** (vor dem Veröffentlichen ist
  ein Titel nötig) — geben Sie dem Bauwerk in den
  **Bauwerkeigenschaften** einen Titel.
- **cannot publish an empty world** (eine leere Welt kann nicht
  veröffentlicht werden) — platzieren Sie zuerst mindestens einen Stein.
- **cannot sign, identity is locked** (Signieren nicht möglich, Identität
  gesperrt) — Ihre Identität hat sich selbst gesperrt; klicken Sie in der
  oberen Leiste neben Ihrem Namen auf **Entsperren** und veröffentlichen
  Sie erneut.

### Brauche ich zum Veröffentlichen einen Namen?

Praktisch ja. Veröffentlichen bittet Sie, einen zu wählen; das dauert ein
paar Sekunden und braucht kein Konto. **Unsigniert veröffentlichen** in
diesem Dialog veröffentlicht ohne Namen, aber das Ergebnis hat keinen Autor
und keine Signatur: Es bekommt keinen Link, und Sie können es später weder
mit Peers teilen noch an alle senden. Siehe
[Einen Namen wählen](01-GettingStarted.md#einen-namen-wählen).

### Kann ich eine Veröffentlichung zurückziehen?

Ja: Öffnen Sie die Welt in der Weltansicht und wählen Sie dann unter
**Meine Geteilte Welt** **Mehr ▾ → Veröffentlichung zurückziehen …**. Das
entfernt sie aus Ihrem **Entdecken**. Kopien, die andere bereits erhalten
haben, oder was Sie auf Arweave, IPFS, Nostr, Steem oder Blurt verteilt haben,
lassen sich damit nicht zurückholen. Dieses Gerät merkt sich aber, was Sie
zurückgezogen haben, sodass die Suche von **Entdecken** in den Netzwerken diese
Kopien hier nicht wieder auflistet; andere Geräte und andere Menschen können
sie weiterhin finden.

### Jemand hat mein Bauwerk in seiner Welt platziert. Hat er meines verschoben?

Nein. Eine Platzierung sagt nur, wo *seine* Welt Ihr Bauwerk zeigt; Ihres
bleibt, wo Sie es hingestellt haben, und das Bauwerk behält Ihren Namen
und seinen Verlauf. Wenn Sie das nicht möchten, wählen Sie vor dem
Veröffentlichen unter **Wer es in der Welt platzieren darf** die Option
**Nur ich darf es platzieren**. Siehe
[Warum kann ich die Bauwerke anderer platzieren?](WorldViewAdvancedTools.md#warum-kann-ich-die-bauwerke-anderer-platzieren).

### Kann ich mein Bauwerk jemand anderem geben?

Nicht als sein Urheber. Urheber eines Bauwerks ist die Identität, die es
signiert hat, und niemand kann diese Signatur ändern. Ihr Bauwerk zeigt
also immer Sie als Urheber. Genau das hält die Namensnennung ehrlich, wenn
Bauwerke geremixt werden.

Was jemand anderes tun kann, wenn die Lizenz des Bauwerks Remixe erlaubt:
mit **Eine Kopie bearbeiten** oder **Remixen** eine eigene Kopie machen.
Diese Kopie gehört ihm, um sie zu ändern, zu veröffentlichen und zu
platzieren, und sie zeigt, dass sie von Ihrem stammt (siehe
[Remixen: machen Sie es zu Ihrem eigenen](04-PublishingAndForking.md#remixen-machen-sie-es-zu-ihrem-eigenen)).
Soll lieber seine Kopie die sein, die andere finden, können Sie Ihres aus
Ihrer Welt entfernen und die Veröffentlichung zurückziehen; bereits
verschickte Kopien bleiben aber (siehe
[Kann ich eine Veröffentlichung zurückziehen?](#kann-ich-eine-veröffentlichung-zurückziehen)).

Dasselbe gilt für eine Datei, die Sie exportiert haben: Er kann sie als
eigene Kopie importieren, wenn ihre Lizenz Remixe erlaubt, und Sie können
eine Kopie mit einer offeneren Lizenz exportieren als der, mit der Sie
veröffentlicht haben (siehe
[Speichern, veröffentlichen, neu beginnen](02-TheEditor.md#speichern-veröffentlichen-neu-beginnen)).

**Nachfolger benennen** unter **Meine Identitäten** gibt kein Bauwerk
weiter: Es setzt Ihre ganze Identität zugunsten einer anderen Ihrer eigenen
zur Ruhe.

### Warum stehen zwei Bauwerke an derselben Stelle?

Eine Platzierung beansprucht kein Land, und es gibt keinen zentralen
Server, der sagt, wer zuerst da war; daher können zwei Platzierungen
denselben Punkt nennen. Sie werden gewarnt, bevor Sie eine Ihrer
Platzierungen auf eine belegte Stelle verschieben. Siehe
[Warum können zwei Bauwerke an derselben Stelle stehen?](WorldViewAdvancedTools.md#warum-können-zwei-bauwerke-an-derselben-stelle-stehen).

## Identität und Ihre Daten

### Ich habe meine Passphrase vergessen. Kann sie zurückgesetzt werden?

Nein. Die Passphrase ist der einzige Weg, den Schlüssel dieser Identität
zu entschlüsseln, und kein Server hat eine Kopie. Wenn Sie die Identität
exportiert haben, brauchen Sie trotzdem die Passphrase, die Sie für den
Export gewählt haben. Andernfalls erstellen Sie eine neue Identität. Siehe
[Ihr Name & Ihre Identität](05-IdentityAndLogin.md).

### Warum sperrt sich meine Identität immer wieder?

Eine geschützte Identität sperrt sich **15 Minuten nach dem Entsperren**,
auch wenn Sie die App gerade benutzen, und bei jedem Neuladen der Seite.
Bauen und Speichern funktionieren weiter, während sie gesperrt ist; zum
Veröffentlichen, um auffindbar zu sein und um einer Lobby beizutreten,
müssen Sie sie wieder entsperren.

### Wie bringe ich meine Arbeit auf einen anderen Computer oder Browser?

Nichts synchronisiert sich von selbst. Um alles zu kopieren, klicken Sie
unter **Ihre Daten** bei **Auf ein anderes Gerät kopieren** auf **Code
anzeigen** und scannen den Code mit dem anderen Gerät (oder öffnen dort
seinen Link), während beide online sind. Oder Sie sichern dort alles und
stellen die Datei auf dem anderen Gerät wieder her (siehe
[Ihre Daten](13-YourData.md)). Um nur eine Art von Dingen
mitzunehmen:

- **Bauwerke**: **Exportieren** in der Werkzeugleiste des Editors oder
  **Alle Bauwerke exportieren** ganz unten unter **Zuletzt**, dann
  **Importieren** auf dem anderen Gerät.
- **Ihre eigenen Strukturen**: **Bauplan exportieren** im Menü **⋮** einer
  Karte oder **Alle exportieren** neben **Meine Strukturen**, dann
  **Bauplan importieren**.
- **Identitäten**: **Exportieren** unter **Meine Identitäten**, dann
  **Identität importieren**.

Chatverläufe, Freunde und Einstellungen wandern nur mit einer vollständigen
Sicherung mit.

### Löscht das Löschen meiner Browserdaten meine Arbeit?

Ja. Bauwerke, Identitäten, Freunde und Chatverläufe liegen alle im
Speicher dieses Browsers für diese Website, und ihn zu löschen entfernt sie
endgültig. Sichern Sie sie vorher mit **Ihre Daten → In eine Datei
sichern** und bewahren Sie die Datei und ihre Passphrase sicher auf;
**Wiederherstellen** auf derselben Seite bringt alles zurück. ForkBuild
erinnert Sie, wenn die letzte Sicherung alt ist, und in Chrome oder Edge
auf einem Computer kann es jeden Tag automatisch in einen Ordner sichern,
den Ihr Cloudspeicher synchronisiert. Siehe [Ihre Daten](13-YourData.md)
und [Datenschutz](Privacy.md).

### Kann ich eine Identität umbenennen oder löschen?

Nein. Identitäten sind auf Dauer angelegt. Um eine nicht mehr zu
verwenden, benennen Sie unter **Meine Identitäten** einen Nachfolger oder
widerrufen Sie sie.

### Ich habe meine Identität widerrufen — warum kann ich sie trotzdem benutzen?

Das ist so gewollt. Widerrufen hindert die Identität daran, noch etwas
Neues zu signieren, auch das, was sie braucht, um sich mit anderen Personen
zu verbinden, aber Sie können sie auf diesem Gerät weiterhin wählen. So können
Sie sie weiterhin ansehen oder exportieren. Sie zeigt **Widerrufen** unter
**Meine Identitäten**, und der Widerruf lässt sich nie rückgängig machen.
Erstellen Sie eine neue Identität, um weiterzuarbeiten. Siehe
[Was Widerrufen bewirkt — und was nicht](05-IdentityAndLogin.md#was-widerrufen-bewirkt--und-was-nicht).

### Warum öffnet eine ältere Kopie von ForkBuild mein exportiertes Bauwerk nicht?

Bauwerke werden jetzt in einem neueren, kompakteren Format gespeichert.
ForkBuild 1.0.0 und älter kann es nicht lesen, aktualisieren Sie also
zuerst die andere Kopie. Dateien, die ältere Versionen exportiert haben,
lassen sich hier weiterhin öffnen.

## Weltansicht und Ihr Avatar

### WASD bewegt meinen Avatar nicht

Gehen ist an, wenn die Weltansicht öffnet, mit oder ohne Namen: Wer noch
keinen Namen hat, geht als Gast und ist nur auf dem eigenen Bildschirm zu
sehen. Wenn die Tasten Ihren Avatar nicht bewegen:

1. Prüfen Sie unter **Avatar-Einstellungen** der Weltansicht, ob
   **Meinen Avatar steuern (WASD, Umschalt, Leertaste)** angehakt ist.
2. Klicken Sie in die 3D-Ansicht, damit die Tasten nicht in ein Textfeld
   gehen.

Auf einem Touchscreen tippen Sie stattdessen auf **Gehen** über dem
Joystick. Siehe
[Mit Ihrem Avatar gehen](06-AvatarsAndPresence.md#mit-ihrem-avatar-gehen).

### Wer kann meinen Avatar sehen?

Standardmäßig jeder, mit dem Sie verbunden sind: Sowohl **Sichtbarkeit der
Anwesenheit** als auch **Sichtbarkeit des Profils** beginnen auf
**Öffentlich**. Ändern Sie sie unter **Mein Avatar**; **Verborgen** macht
Sie unsichtbar. Siehe
[Wer Sie sehen kann](06-AvatarsAndPresence.md#wer-sie-sehen-kann-zwei-unabhängige-einstellungen).

### Der Browser-Tab hat sich geschlossen, während ich ein Fahrzeug gefahren bin

**Strg** ist die Bremse und **W** beschleunigt, und unter Windows und Linux
schließen die meisten Browser den Tab bei **Strg+W**. Lassen Sie **W** los,
bevor Sie bremsen.

### Kann ich in der Weltansicht etwas ändern?

Nur Anmerkungen: Wahrzeichen, Regionsnamen und Tierschmuck. Gebaut wird im
Editor; nutzen Sie **Eine Kopie bearbeiten**, um das, was Sie ansehen,
dorthin mitzunehmen. Siehe
[Weltansicht](03-WorldView.md#eine-kopie-bearbeiten--etwas-in-den-editor-übernehmen).

## Peers, Freunde und Chat

### Ich betreibe ForkBuild selbst und finde niemanden

Der Standard-Rendezvous-Server antwortet nur der gehosteten Website, daher
kann eine Kopie, die von Ihrer eigenen Adresse ausgeliefert wird
(einschließlich `localhost`), ihn nicht nutzen. Verbinden Sie sich mit
einer Einladung (**Peers → Mit jemand Neuem verbinden → Einladen**) oder
fügen Sie unter **Netzwerkeinstellungen → Rendezvous-Server** einen eigenen
Rendezvous-Server hinzu. Siehe
[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md).

### Mein Freund verbindet sich nicht automatisch wieder

Automatisches Neuverbinden gilt nur für Menschen, die Sie sich **gemerkt**
haben (bekannte Peers), und findet sie nur, solange sie **Auffindbar sein**
eingeschaltet haben. Ein Freund, den Sie sich nicht gemerkt haben, zeigt
stattdessen eine Schaltfläche **Neu verbinden**. Wählen Sie in seinem Menü
**⋯** die Option **Merken**, und klicken Sie beide auf **Auffindbar sein**.

### Meine Nachricht zeigt immer noch „Vorgemerkt“

Nachrichten warten auf Ihrem Gerät, nicht auf einem Server, und werden
daher nur zugestellt, solange ForkBuild auf beiden Seiten geöffnet ist und
Sie verbunden sind. Eine Nachricht, die nicht innerhalb von 7 Tagen
zugestellt wird, wird verworfen und als **Nicht zugestellt — abgelaufen**
markiert. Siehe
[Chat & Unterhaltungen](08-ChatAndConversations.md#senden-während-jemand-offline-ist).

### Warum kann ich mit jemandem, mit dem ich verbunden bin, nicht chatten?

Chat und Sprachanrufe sind nur für Freunde. Klicken Sie in seiner Zeile
unter **Peers** auf **Als Freund hinzufügen**; sobald er annimmt,
erscheint eine Schaltfläche **Chat**.

### Ich habe eine Netzwerkeinstellung geändert, aber nichts ist anders

Netzwerkeinstellungen (Server, Relays, Gateways) werden beim Start der App
gelesen. Laden Sie die Seite nach dem Speichern neu. Siehe
[Netzwerkeinstellungen](10-NetworkSettings.md).

## Geräte und Browser

### Funktioniert ForkBuild auf einem Telefon oder Tablet?

Ja. Beide Ansichten haben eine Touch-Steuerung, und auf einem schmalen
Bildschirm klappen das Menü und die Seitenfelder weg. Siehe
[Touchscreens](ControlsReference.md#touchscreens).

### Funktioniert ForkBuild offline? Kann ich es installieren?

Ja, auf der gehosteten Seite. Nach dem ersten Besuch öffnet ForkBuild auch
ohne Verbindung, und **ForkBuild installieren** auf dem Startbildschirm fügt
es Ihrem Gerät als App hinzu. Bauen, Speichern sowie Ihre gespeicherten und
die fertigen Bauwerke funktionieren offline; Bauwerke und Personen finden,
Verteilen und Chat brauchen eine Verbindung. Siehe
[ForkBuild installieren](01-GettingStarted.md#forkbuild-installieren).

### Kann ich mein Bauwerk 3D-drucken oder in Blender öffnen?

Ja. **Datei → 3D-Modell** in der Werkzeugleiste des Editors lädt es als STL für den
3D-Druck (in Millimetern, auf dem Druckbett stehend) oder als farbiges glTF
oder OBJ für Blender und andere Programme herunter. Siehe
[Ein 3D-Modell herunterladen](02-TheEditor.md#ein-3d-modell-herunterladen).

### Brauche ich eine Krypto-Wallet?

Nein. Bauen, Speichern, Veröffentlichen, einen Link teilen, ein Bauwerk
an alle senden, Remixen, Peers und Chat brauchen keine. Eine Wallet oder
Signiererweiterung brauchen Sie nur, wenn Sie ein Bauwerk selbst in ein
Speichernetz verteilen wollen (Arweave braucht eine Arweave-Wallet wie
Wander, Nostr eine Signiererweiterung wie nos2x), und für die
experimentellen Funktionen zum Verankern in
[Nachweise & Speicher](11-EvidenceAndStorage.md).

### Kann ich mein Bauwerk verkaufen oder daraus ein NFT machen?

ForkBuild hat keinen Shop, keine Preise und keine NFTs. Es hilft nicht beim
Verkaufen von Bauwerken und empfiehlt keinen Ort dafür, weder im Spiel noch
außerhalb. Was außerhalb von ForkBuild vereinbart wird, ist eine Sache
zwischen Ihnen und der anderen Person, und das Spiel weiß nichts davon: Es
ändert nicht, wer das Bauwerk gemacht hat, wer es kopieren oder wer es
platzieren darf.

Ihr Bauwerk können Sie immer mitnehmen: Sie können es als Datei
exportieren oder als 3D-Modell herunterladen (siehe
[Speichern, veröffentlichen, neu beginnen](02-TheEditor.md#speichern-veröffentlichen-neu-beginnen)
und [Ein 3D-Modell herunterladen](02-TheEditor.md#ein-3d-modell-herunterladen)).

In ForkBuild bestimmen die Lizenz (siehe
[Eine Lizenz wählen](04-PublishingAndForking.md#eine-lizenz-wählen)) und
**Wer es in der Welt platzieren darf** (siehe
[Wählen, wer es platzieren darf](04-PublishingAndForking.md#wählen-wer-es-platzieren-darf)),
was andere mit einem veröffentlichten Bauwerk tun dürfen. Jede Kopie von
ForkBuild hält sich daran, aber keines von beiden ist ein Schloss, und
bereits verschickte Kopien lassen sich nicht zurückholen (siehe
[Kann ich eine Veröffentlichung zurückziehen?](#kann-ich-eine-veröffentlichung-zurückziehen)).

Ist Ihr Bauwerk ein Remix, trägt es die Lizenz seines Originals, deren
Bedingungen also weiter gelten: Ein Bauwerk unter CC BY-NC darf zum
Beispiel nicht kommerziell genutzt werden.
