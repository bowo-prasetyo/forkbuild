<!-- translation-of: docs/user/FAQ.md source-hash: e15721b99cda6db7 -->
# Häufige Fragen

<!-- languages -->
[English](../FAQ.md) · **Deutsch** · [Español](../es/FAQ.md) · [Français](../fr/FAQ.md) · [Bahasa Indonesia](../id/FAQ.md) · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · [Português (Brasil)](../pt-BR/FAQ.md)
<!-- /languages -->

Kurze Antworten auf die Fragen, auf die man am häufigsten stößt, jeweils
mit einem Link zur Anleitung, die es ausführlich erklärt.

## Veröffentlichen und teilen

### Ich habe meine Kreation veröffentlicht, aber mein Freund findet sie nicht in seinem Repository

Veröffentlichen speichert die Kreation nur auf Ihrem eigenen Gerät und
führt sie in *Ihrem* Repository auf. Nichts wird irgendwohin gesendet,
bis Sie es so entscheiden:

- **Mit Peers teilen**, unter Ihrer Kreation im Repository, bietet sie den
  Menschen an, mit denen Sie verbunden sind. Das Gerät eines Freundes oder
  bekannten Peers fügt sie von selbst hinzu; alle anderen sehen sie unter
  **Mit Ihnen geteilt** und klicken auf **Abrufen**. Sie müssen
  gleichzeitig verbunden sein, damit sie ankommt.
- **Verteilen** lädt sie auf Arweave oder IPFS (oder, experimentell,
  Steem oder Blurt) hoch und kündigt sie an, sodass andere sie finden können, ohne
  mit Ihnen verbunden zu sein.

Siehe [Veröffentlichen & Forken](04-PublishingAndForking.md#mit-verbundenen-peers-teilen).

### Wie mache ich meine Arbeit für alle zugänglich?

Verteilen Sie sie: Speichern Sie sie auf Arweave oder IPFS (oder,
experimentell, auf Steem oder Blurt) und kündigen Sie sie auf Nostr oder Arweave (oder
Steem oder Blurt) an, sodass jeder sie finden und prüfen kann, ohne mit Ihnen verbunden
zu sein. Klicken Sie direkt nach dem Veröffentlichen auf **Verteilen** oder
in der Weltansicht unter **Meine Geteilte Welt**. Für die gewählten
Netzwerke brauchen Sie eine signierende Browsererweiterung, etwa Wander für
Arweave oder nos2x für Nostr. [Ihre Arbeit verteilen](Distribution.md)
listet alles auf, was Sie verteilen können, wohin es gehen kann und was
jedes Netzwerk braucht.

### Warum kann niemand meine Kreation forken?

Ein neues Dokument hat keine Lizenz, und eine Kreation ohne Lizenz kann
nicht geforkt werden. Öffnen Sie **Dokumenteigenschaften** (das **✎**
neben dem Dokumenttitel im Editor), wählen Sie eine Lizenz, die das Forken
erlaubt (jede CC-Lizenz außer CC BY-ND), und veröffentlichen Sie erneut.
Die Einstellung ist Teil dessen, was veröffentlicht wird, daher behalten
bereits veröffentlichte Kreationen ihre bisherige Lizenz. Siehe
[Eine Lizenz wählen](04-PublishingAndForking.md#eine-lizenz-wählen).

### Das Veröffentlichen ist fehlgeschlagen. Was bedeuten die Meldungen?

Diese Meldungen zeigt die App nur auf Englisch:

- **a title is required before publishing** (vor dem Veröffentlichen ist
  ein Titel nötig) — geben Sie der Kreation in den
  **Dokumenteigenschaften** einen Titel.
- **cannot publish an empty world** (eine leere Welt kann nicht
  veröffentlicht werden) — platzieren Sie zuerst mindestens einen Stein.
- **cannot sign, identity is locked** (Signieren nicht möglich, Identität
  gesperrt) — Ihre Identität hat sich selbst gesperrt; klicken Sie in der
  oberen Leiste neben Ihrem Namen auf **Entsperren** und veröffentlichen
  Sie erneut.

### Muss ich zum Veröffentlichen angemeldet sein?

Veröffentlichen funktioniert auch abgemeldet, aber das Ergebnis hat
keinen Autor und keine Signatur, sodass Sie es später weder mit Peers
teilen noch verteilen können. Melden Sie sich vor dem Veröffentlichen an.

### Kann ich eine Veröffentlichung zurückziehen?

Ja: Öffnen Sie die Welt in der Weltansicht und wählen Sie dann unter
**Meine Geteilte Welt** **Mehr ▾ → Veröffentlichung zurückziehen …**. Das
entfernt sie aus Ihrem Repository. Kopien, die andere bereits erhalten
haben, oder was Sie auf Arweave, IPFS, Nostr, Steem oder Blurt verteilt haben,
lassen sich damit nicht zurückholen. Dieses Gerät merkt sich aber, was Sie
zurückgezogen haben, sodass die Suche des Repository in den Netzwerken diese
Kopien hier nicht wieder auflistet; andere Geräte und andere Menschen können
sie weiterhin finden.

### Jemand hat mein Bauwerk in seiner Welt platziert. Hat er meines verschoben?

Nein. Eine Platzierung sagt nur, wo *seine* Welt Ihr Bauwerk zeigt; Ihres
bleibt, wo Sie es hingestellt haben, und das Bauwerk behält Ihren Namen
und seinen Verlauf. Wenn Sie das nicht möchten, wählen Sie vor dem
Veröffentlichen unter **Wer es in der Welt platzieren darf** die Option
**Nur ich darf es platzieren**. Siehe
[Warum kann ich die Bauwerke anderer platzieren?](03-WorldView.md#warum-kann-ich-die-bauwerke-anderer-platzieren).

### Warum stehen zwei Bauwerke an derselben Stelle?

Eine Platzierung beansprucht kein Land, und es gibt keinen zentralen
Server, der sagt, wer zuerst da war; daher können zwei Platzierungen
denselben Punkt nennen. Sie werden gewarnt, bevor Sie eine Ihrer
Platzierungen auf eine belegte Stelle verschieben. Siehe
[Warum können zwei Bauwerke an derselben Stelle stehen?](03-WorldView.md#warum-können-zwei-bauwerke-an-derselben-stelle-stehen).

## Identität und Ihre Daten

### Ich habe meine Passphrase vergessen. Kann sie zurückgesetzt werden?

Nein. Die Passphrase ist der einzige Weg, den Schlüssel dieser Identität
zu entschlüsseln, und kein Server hat eine Kopie. Wenn Sie die Identität
exportiert haben, brauchen Sie trotzdem die Passphrase, die Sie für den
Export gewählt haben. Andernfalls erstellen Sie eine neue Identität. Siehe
[Identität & Anmeldung](05-IdentityAndLogin.md).

### Warum sperrt sich meine Identität immer wieder?

Eine geschützte Identität sperrt sich **15 Minuten nach dem Entsperren**,
auch wenn Sie die App gerade benutzen, und bei jedem Neuladen der Seite.
Bauen und Speichern funktionieren weiter, während sie gesperrt ist; zum
Veröffentlichen, um auffindbar zu sein und um einer Lobby beizutreten,
müssen Sie sie wieder entsperren.

### Wie bringe ich meine Arbeit auf einen anderen Computer oder Browser?

Nichts synchronisiert sich von selbst. Um alles mitzunehmen, sichern Sie es
unter **Ihre Daten** und stellen die Datei auf dem anderen Gerät wieder her
(siehe [Ihre Daten](13-YourData.md)). Um nur eine Art von Dingen
mitzunehmen:

- **Dokumente**: **Exportieren** in der Werkzeugleiste des Editors oder
  **Alle Dokumente exportieren** ganz unten unter **Zuletzt**, dann
  **Importieren** auf dem anderen Gerät.
- **Ihre eigenen Strukturen**: **Bauplan exportieren** im Menü **⋮** einer
  Karte oder **Alle exportieren** neben **Meine Strukturen**, dann
  **Bauplan importieren**.
- **Identitäten**: **Exportieren** unter **Meine Identitäten**, dann
  **Identität importieren**.

Chatverläufe, Freunde und Einstellungen wandern nur mit einer vollständigen
Sicherung mit.

### Löscht das Löschen meiner Browserdaten meine Arbeit?

Ja. Dokumente, Identitäten, Freunde und Chatverläufe liegen alle im
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

### Warum öffnet eine ältere Kopie von ForkBuild mein exportiertes Dokument nicht?

Dokumente werden jetzt in einem neueren, kompakteren Format gespeichert.
ForkBuild 1.0.0 und älter kann es nicht lesen, aktualisieren Sie also
zuerst die andere Kopie. Dateien, die ältere Versionen exportiert haben,
lassen sich hier weiterhin öffnen.

## Weltansicht und Ihr Avatar

### WASD bewegt meinen Avatar nicht

Gehen ist aus, bis Sie es einschalten:

1. Melden Sie sich an und speichern Sie unter **Mein Avatar** einen Avatar.
2. Setzen Sie im Abschnitt **Avatar** der Weltansicht das Häkchen bei
   **Meinen Avatar steuern (WASD, Umschalt, Leertaste)**.
3. Klicken Sie in die 3D-Ansicht, damit die Tasten nicht in ein Textfeld
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

Ja. **3D-Modell** in der Werkzeugleiste des Editors lädt es als STL für den
3D-Druck (in Millimetern, auf dem Druckbett stehend) oder als farbiges glTF
oder OBJ für Blender und andere Programme herunter. Siehe
[Ein 3D-Modell herunterladen](02-TheEditor.md#ein-3d-modell-herunterladen).

### Brauche ich eine Krypto-Wallet?

Nein. Bauen, Speichern, Veröffentlichen, Forken, Peers und Chat brauchen
keine. Eine Wallet oder Signiererweiterung ist nur für die experimentellen
Funktionen zum Verteilen und Verankern in
[Nachweise & Speicher](11-EvidenceAndStorage.md) nötig.
