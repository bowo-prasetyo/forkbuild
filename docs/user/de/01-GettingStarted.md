<!-- translation-of: docs/user/01-GettingStarted.md source-hash: 0c8735655a65c0e1 -->
# 01 — Erste Schritte

<!-- languages -->
[English](../01-GettingStarted.md) · **Deutsch** · [Español](../es/01-GettingStarted.md) · [Français](../fr/01-GettingStarted.md) · [Bahasa Indonesia](../id/01-GettingStarted.md) · [日本語](../ja/01-GettingStarted.md) · [한국어](../ko/01-GettingStarted.md) · [Português (Brasil)](../pt-BR/01-GettingStarted.md)
<!-- /languages -->

Willkommen! Diese Anleitung bringt Sie in etwa fünf Minuten von „gerade die
App geöffnet“ zu „ich habe etwas gebaut“.

## ForkBuild öffnen

ForkBuild läuft in jedem aktuellen Webbrowser. Öffnen Sie die gehostete URL,
und Sie landen auf der Seite **Start**. Um eine eigene Kopie zu betreiben,
liefern Sie den Ordner über HTTP aus (zum Beispiel mit
`python3 -m http.server 8000` und dann <http://localhost:8000/> öffnen):
`index.html` direkt von der Festplatte zu öffnen funktioniert nicht, weil
Browser die Module einer `file://`-Seite nicht laden. Der Standard-
Rendezvous-Server bedient nur die gehostete Website, daher kann eine eigene
Kopie ihn nicht nutzen, um Menschen zu finden; verbinden Sie sich
stattdessen mit Einladungen oder richten Sie einen eigenen
Rendezvous-Server ein (siehe
[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)).

Die Seite **Start** zeigt ein kleines Dorf, das sich in 3D dreht, und
bietet drei Einstiege: **Jetzt ausprobieren: mit einem Haus beginnen**
öffnet ein fertiges Haus im Editor als Ihre eigene Kopie, bereit zum
Ändern; **Bei null anfangen** öffnet den Editor auf einem leeren Grundstück;
und **Bauwerke entdecken** öffnet das Repository. Unter **Mit einem fertigen
Bauwerk beginnen** öffnet jede Karte (eine Burg, eine Hafeninsel, ein
Dorfplatz, ein Haus, eine Mühle und eine Brücke) auf dieselbe Weise Ihre
eigene Kopie dieses Bauwerks; das Repository, Meine Welten und **Neu** im
Editor bieten dieselben Bauwerke an. Nichts wird veröffentlicht oder
irgendwohin gesendet, solange Sie es nicht selbst tun.
Start zeigt außerdem die **Bau-Challenge der Woche**: ein Thema zum
Bauen, mit **Mitmachen** (siehe
[Die wöchentliche Bau-Challenge](04-PublishingAndForking.md#die-wöchentliche-bau-challenge)).

Sobald Sie Bauten veröffentlicht haben, zeigt die Seite **Start** auch
**Ihre Stempel**: Tatsachen über Ihre eigenen Bauten, etwa **Geremixt**, wenn
jemand einen davon geremixt hat, **Herausforderer**, wenn Sie an einer
Wochen-Challenge teilgenommen haben, oder **Großbaumeister** für einen Bau
mit hundert Steinen oder mehr. Sie werden auf diesem Gerät aus seinen eigenen
Aufzeichnungen ermittelt und nur Ihnen gezeigt: Anerkennung, nie Punkte oder
eine Rangliste.

Die Leiste oben ist immer sichtbar:

`ForkBuild Start Editor Repository Challenge Meine Welten Mehr ▾ 🔔 [Anmelden]`

- **Start** — die Startseite
- **Editor** — hier bauen Sie
- **Repository** — die veröffentlichten Kreationen aller durchstöbern
- **Challenge** — die Bau-Challenge dieser Woche und ihre Beiträge, siehe
  [Die wöchentliche Bau-Challenge](04-PublishingAndForking.md#die-wöchentliche-bau-challenge)
- **Meine Welten** — Welten, die Sie auf diesem Gerät tatsächlich besucht
  haben, siehe
  [Meine Welten](03-WorldView.md#meine-welten--welten-in-denen-sie-wirklich-waren)

**Mehr** öffnet den Rest, in vier Gruppen: **Persönlich** (Mein Avatar, Meine Identitäten,
Ihre Daten), **Menschen** (Peers, Gefolgt, Unterhaltungen), **Erweitert**
(Veröffentlichungen, Netzwerkeinstellungen) und **App** (Sprache, Über und **ForkBuild installieren**, wo der Browser es installieren kann). Auf einem Telefon zeigt
**Menü** alle auf einmal.

- **Mein Avatar** — wie andere Sie in der Weltansicht sehen, siehe
  [Avatare & Anwesenheit](06-AvatarsAndPresence.md)
- **Meine Identitäten** — die auf diesem Gerät gespeicherten
  kryptografischen Identitäten, siehe
  [Identität & Anmeldung](05-IdentityAndLogin.md)
- **Peers** — die Menschen, mit denen Sie verbunden sind, die Sie kennen
  oder mit denen Sie befreundet sind, siehe
  [Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)
- **Unterhaltungen** — Ihre Direktnachrichten, siehe
  [Chat & Unterhaltungen](08-ChatAndConversations.md)
- **Veröffentlichungen** — signierte Urheberschafts- und
  Ortsnamensansprüche, wo sie gespeichert und angekündigt werden, und
  (*experimentell*) ihre externen Nachweise, siehe
  [Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md)
- **Netzwerkeinstellungen** — Gateways, Relays, Anbieter und Server für
  Peer-Verbindungen, siehe
  [Netzwerkeinstellungen](10-NetworkSettings.md)
- **Sprache** — die Sprache, in der ForkBuild auf diesem Gerät angezeigt
  wird. Sie folgt den Sprachen Ihres Browsers, bis Sie eine wählen; das
  Speichern lädt die Seite neu, speichern Sie also vorher Ihre Arbeit.
  ForkBuild gibt es auf Englisch, Deutsch, Spanisch, Französisch, Indonesisch (Bahasa Indonesia),
  Japanisch, Koreanisch und brasilianischem Portugiesisch (siehe [Translating ForkBuild](../../Translating.md)
  (Englisch)).
- **Über** — Versionsinformationen

## ForkBuild installieren

ForkBuild lässt sich als App installieren: Es öffnet sich dann vom
Home-Bildschirm, Dock oder der App-Liste in einem eigenen Fenster und
funktioniert ohne Verbindung. Klicken Sie auf dem Startbildschirm (oder
unter **Mehr**) auf **ForkBuild installieren** und bestätigen Sie im Dialog
des Browsers. In Safari auf einem iPhone oder iPad sagt die Schaltfläche
stattdessen, wie es geht: Tippen Sie auf **Teilen**, dann auf **Zum
Home-Bildschirm**. Wo der Browser keine Apps installieren kann oder
ForkBuild schon installiert ist, wird die Schaltfläche nicht gezeigt.

- **Offline.** Beim ersten Öffnen behält Ihr Browser die Dateien von
  ForkBuild, sodass es danach auch ohne Verbindung öffnet, installiert oder
  nicht: Start, der Editor, Ihre gespeicherten und die fertigen Bauwerke
  funktionieren. Was das Netz braucht (Bauwerke und Personen finden,
  Verteilen, Chat und Anrufe), wartet, bis Sie wieder online sind.
- **Updates.** Ist eine neue Version da, sagt eine Zeile oben **Eine neue
  Version von ForkBuild ist bereit**; **Neu laden** startet sie, sonst
  startet sie beim nächsten Öffnen von ForkBuild von selbst.
- **Benachrichtigungen.** Ein installiertes ForkBuild (oder eines in einem
  Hintergrund-Tab) kann Ihre Benachrichtigungen über Ihr Gerät anzeigen;
  siehe [Benachrichtigungen auf diesem Gerät](03-WorldView.md#benachrichtigungen-auf-diesem-gerät).

Das gilt für die gehostete Seite. Eine Kopie, die Sie direkt aus dem
Ordner betreiben (wie oben), lässt sich nicht installieren und funktioniert
nicht offline; eine mit `node scripts/build.mjs` gebaute schon (siehe
[Deployment](../../Deployment.md)).

## Anmelden

Um mit dem Bauen anzufangen, müssen Sie sich nicht anmelden. Wenn Sie zum
ersten Mal auf **Veröffentlichen** klicken, bittet ForkBuild Sie, sich
anzumelden oder gleich dort eine Identität zu erstellen, denn
Veröffentlichen signiert Ihre Kreation. Sie können sich auch jederzeit
anmelden:
Klicken Sie oben rechts auf **Anmelden**. ForkBuild verwendet keine
Passwörter und keine zentralen Konten — stattdessen ist **Ihre Identität
ein kryptografisches Schlüsselpaar, das auf diesem Gerät gespeichert ist**.
Der Anmeldedialog listet jede Identität auf, die dieser Browser bereits
besitzt; klicken Sie auf eine, um sie zu verwenden, oder erstellen Sie eine
neue:

1. Geben Sie einen **Anzeigenamen** ein — das sehen andere Menschen.
2. Geben Sie zweimal eine **Passphrase** mit mindestens 8 Zeichen ein. Sie
   verschlüsselt Ihren Schlüssel auf diesem Gerät, und es gibt kein
   Zurücksetzen; wählen Sie also eine, die Sie behalten. (Um sie zu
   überspringen, setzen Sie das Häkchen bei **Ohne Passphrase erstellen**;
   der Schlüssel wird dann unverschlüsselt in diesem Browser gespeichert.)
3. Klicken Sie auf **Erstellen & anmelden**.

Das war's — Sie sind jetzt angemeldet, und alles, was Sie bauen,
veröffentlichen oder senden, wird mit dieser Identität signiert.

Was eine Passphrase schützt, Sperren und Entsperren sowie das Sichern Ihrer
Identität werden in [Identität & Anmeldung](05-IdentityAndLogin.md)
behandelt.

## Ein Rundgang

ForkBuild hat mehrere Hauptbereiche:

| Bereich | Wofür er da ist |
|---|---|
| **Editor** | Eigene Kreationen bauen und bearbeiten |
| **Repository** | Veröffentlichte Kreationen suchen, durchstöbern, öffnen, forken und erkunden |
| **Autorenansicht** | Alles sehen, was eine Person gemacht hat (öffnet sich durch Klick auf den Namen eines Autors) |
| **Weltansicht** | Durch die geteilte Welt fliegen, in der alle Kreationen im 3D-Raum leben, und suchen oder erkunden, um Dinge zu finden |
| **Mein Avatar / Peers / Unterhaltungen** | Wie andere Sie sehen, mit wem Sie verbunden sind, und Ihre Direktnachrichten — siehe die oben verlinkten Anleitungen |

## Ihren ersten Stein platzieren

Wenn Sie den Editor zum ersten Mal öffnen, führt Sie eine Karte **Ihr
erstes Bauwerk** in der Ecke der 3D-Ansicht durch fünf Schritte und hakt
jeden ab, sobald Sie ihn erledigt haben; siehe
[Ihr erstes Bauwerk](02-TheEditor.md#ihr-erstes-bauwerk).

1. Klicken Sie in der oberen Leiste auf **Editor**.
2. Stellen Sie in der linken Seitenleiste sicher, dass das Werkzeug
   **Platzieren** aktiv ist (drücken Sie `2`).
3. Öffnen Sie darunter in der **Baubibliothek** den Reiter **Steine** und
   klicken Sie auf einen Stein — zum Beispiel **Würfel** unter
   **Grundformen**.
4. Bewegen Sie die Maus in das 3D-Ansichtsfenster. Ein durchscheinender
   **Geist** des Steins folgt dem Raster.
5. **Klicken** Sie, um ihn zu platzieren.

Glückwunsch — Sie haben Ihren ersten Stein gebaut! 🎉

### Steine stapeln

Sie müssen nicht auf dem Boden bauen. Fahren Sie über eine **Fläche** eines
vorhandenen Steins, und der Geist rastet daran ein — klicken Sie, um oben
aufzustapeln oder seitlich anzusetzen. So bauen Sie Wände, Türme und
Dächer.

## Ihre Arbeit speichern

Drücken Sie **Strg+S** (oder klicken Sie in der Werkzeugleiste auf
**Speichern**). Die Anzeige **● Ungespeicherte Änderungen** wird zu
**Gespeichert**.

Ihre Kreation wird in Ihrem Browser gespeichert und ist daher noch da, wenn
Sie zurückkommen. Während Sie bearbeiten, hält ForkBuild außerdem eine
Kopie ungespeicherter Änderungen zur Absturzwiederherstellung bereit und
bietet an, sie wiederherzustellen, wenn die Seite vor dem Speichern
geschlossen wird.

Browser begrenzen, wie viel jede Website speichern darf, meist auf einen
Anteil der Festplatte. Wenn der Anteil von ForkBuild voll ist, stoppen
Speichern und Absturzwiederherstellung mit einer entsprechenden Meldung;
nichts, was Sie geöffnet haben, geht verloren. Nutzen Sie **Exportieren**
in der Werkzeugleiste, um eine Kopie des Dokuments als Datei zu behalten.
Beim ersten Speichern fragen manche Browser, ob ForkBuild seine Daten
dauerhaft behalten darf; wenn Sie es erlauben, löscht der Browser sie nicht,
wenn der Speicherplatz knapp wird.

Zum Bauen müssen Sie nicht angemeldet sein. Die Anmeldung zählt, sobald Sie
veröffentlichen oder mit anderen arbeiten: Eine Kreation, die Sie
abgemeldet veröffentlichen, hat keinen Autor und keine Signatur und kann
daher später weder mit Peers geteilt noch verteilt werden, und sie bekommt
keinen Link. Veröffentlichen bittet Sie, sich zuerst anzumelden.

## Wie geht es weiter?

- Lernen Sie den vollständigen Baukasten in **[Der Editor](02-TheEditor.md)**
  kennen.
- Bereit zum Teilen? Springen Sie zu
  **[Veröffentlichen & Forken](04-PublishingAndForking.md)**.
- Richten Sie Ihre Identität, Ihren Avatar und Ihre Verbindungen ein, in
  **[Identität & Anmeldung](05-IdentityAndLogin.md)**,
  **[Avatare & Anwesenheit](06-AvatarsAndPresence.md)** und
  **[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)**.
