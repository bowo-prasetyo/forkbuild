<!-- translation-of: docs/user/README.md source-hash: 26ea018db8723ef6 -->
# ForkBuild-Benutzerdokumentation

<!-- languages -->
[English](../README.md) · **Deutsch** · [Español](../es/README.md) · [Français](../fr/README.md) · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Anleitungen zur Nutzung von ForkBuild im Browser. Alles hier beschreibt
das Produkt so, wie es heute funktioniert; die Interna der Engine stehen
in [docs/Architecture.md](../../Architecture.md) und im übrigen
[docs/](../..)-Ordner auf oberster Ebene (nur auf Englisch).

## Hier anfangen (der Reihe nach lesen)

1. **[Erste Schritte](01-GettingStarted.md)** — die App öffnen, sich
   anmelden und den ersten Stein platzieren.
2. **[Der Editor](02-TheEditor.md)** — das Baukastenwerkzeug: Werkzeuge,
   Auswahl, Transformationen, Steinfarben, Gruppen, die Strukturen der
   Baubibliothek und Ihre eigenen Baupläne, Strukturinstanzen sowie Titel,
   Beschreibung und Lizenz einer Kreation.
3. **[Weltansicht](03-WorldView.md)** — der geteilte, schreibgeschützte
   3D-Raum, in dem jede veröffentlichte Kreation lebt: herumfliegen, Dinge
   finden und untersuchen, **Eine Kopie bearbeiten**, um etwas in den
   Editor zu übernehmen, Begegnungen in der Welt, die Ihre Peers teilen,
   das Verteilen Ihrer eigenen Veröffentlichung über **Meine Geteilte
   Welt**, Kommentare und Benachrichtigungen.
4. **[Veröffentlichen & Forken](04-PublishingAndForking.md)** —
   Veröffentlichen, Lizenzen, Forken, der Katalog im Repository und das
   Verteilen einer Veröffentlichung direkt aus dem Editor.
   Alles, was Sie verteilen können, und wohin es gehen kann, steht in
   [Ihre Arbeit verteilen](Distribution.md).
5. **[Identität & Anmeldung](05-IdentityAndLogin.md)** — Ihre
   kryptografische Identität, der Tresor (Sperren/Entsperren), das Sichern
   per Export/Import und das Verwalten von Identitäten unter **Meine
   Identitäten**.
6. **[Avatare & Anwesenheit](06-AvatarsAndPresence.md)** — Ihren Avatar
   anpassen, wer Sie sehen kann, Gehen, Kameraperspektiven, Fahrzeuge,
   Tiere und Ihr Inventar.
7. **[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)** —
   sich direkt mit anderen Menschen verbinden, sie sich merken, sich
   befreunden, folgen, blockieren, automatisches Neuverbinden und Ihr
   eigenes TURN-Relay.
8. **[Chat & Unterhaltungen](08-ChatAndConversations.md)** — direkte
   Nachrichten nur unter Freunden, Zustellung im Offline-Zustand,
   Lesebestätigungen und Sprachanrufe.
9. **[Veröffentlichungen & externe Nachweise](09-PublicationsAndEvidence.md)** —
   die technische, optionale Ebene: signierte Urheberschafts- und
   Ortsnamensansprüche, die Seite Veröffentlichungen, Kommentare und was
   Ihr Gerät besitzt (lokaler Snapshot). Teile der Seite sind
   *experimentell* und so gekennzeichnet.
10. **[Netzwerkeinstellungen](10-NetworkSettings.md)** — Gateways, Relays,
    Speicher- und Ankündigungsanbieter sowie Server für Peer-Verbindungen.
    Was jedes Netzwerk braucht, fasst
    [Ihre Arbeit verteilen](Distribution.md#was-jedes-netzwerk-braucht)
    zusammen.
11. **[Nachweise & Speicher](11-EvidenceAndStorage.md)** — Inhalte auf IPFS
    oder Arweave speichern und, *experimentell*, externe Nachweise, die
    Wallet-Abläufe für Bitcoin und Base, Snapshot-Platzierungen, entferntes
    IPFS-Pinning und Steem.
    [Ihre Arbeit verteilen](Distribution.md) zeigt, wie
    das zusammenpasst.
12. **[Archiv & Bestenlisten](12-ArchiveAndLeaderboards.md)** —
    *experimentell*. Das Beobachtungsarchiv, Veröffentlichungsverweise,
    Erfolge, Herausgeberkennungen und die Bestenlisten-Seiten.
13. **[Ihre Daten](13-YourData.md)** — alles, was dieser Browser enthält,
    in eine verschlüsselte Datei sichern und wiederherstellen, die
    kleineren Exporte und wo dieses Gerät das Verteilen Ihrer
    Veröffentlichungen festgehalten hat.

## Nachschlagen

- **[Ihre Arbeit verteilen](Distribution.md)** — alles,
  was Sie in dezentralen Netzwerken ablegen können (Ihre Welten,
  Urheberschafts- und Ortsnamensansprüche, Kommentare, Anker), die drei
  Rollen, die ein Netzwerk spielt (Inhalt, Ankündigung / Entdeckung,
  Nachweis / Verankerung), was jedes Netzwerk braucht, und Links zu den
  Anleitungen mit den Einzelheiten.
- **[FAQ](FAQ.md)** — kurze Antworten auf die Fragen, auf die man am
  häufigsten stößt: Teilen, Lizenzen, vergessene Passphrasen, Umzug auf
  ein anderes Gerät, mit dem Avatar gehen und sich wieder mit Freunden
  verbinden.
- **[Steuerungsreferenz](ControlsReference.md)** — jede Maus- und
  Tastaturbedienung im Editor und in der Weltansicht in einer
  Nachschlagetabelle. Wenn diese Seite und die Befehlspalette in der App
  (`Strg/Cmd+K`) je voneinander abweichen, hat die Palette recht und diese
  Seite einen Fehler — bitte melden Sie ihn.
- **[Interaktives Transformations-Gizmo](InteractiveTransformGizmo.md)** —
  wie Sie Ihre Auswahl durch direktes Ziehen im Ansichtsfenster
  verschieben und drehen: Griffe, der Drehpunkt, Einrasten, Bestätigen,
  Abbrechen, Rückgängig und wie sich Gruppen verhalten.

## Wo Sie bauen, wo Sie erkunden

Der Editor ist der einzige Ort, an dem in ForkBuild gebaut wird; die
Weltansicht ist eine schreibgeschützte Fläche zum Erkunden:

- **Editor** (`/editor`) — Ihr privater Arbeitsbereich. Platzieren Sie
  Steine aus der Palette, wählen Sie sie aus und transformieren Sie sie
  mit der Tastatur oder dem Gizmo. Speichern, laden und veröffentlichen
  Sie Dokumente über die Werkzeugleiste.
- **Weltansicht** (`/world/:id`) — die geteilte räumliche Welt. Fliegen
  Sie zwischen veröffentlichten Welten hin und her, suchen und erkunden
  Sie, was um Sie herum ist, untersuchen Sie Steine und platzierte
  Strukturen, gehen Sie mit Ihrem Avatar über Strukturen und Gelände und
  nutzen Sie **Eine Kopie bearbeiten**, um das Gefundene im Editor zu
  öffnen und darauf aufzubauen.

Was Sie im Editor auch tun: Jede Änderung ist ein rückgängig machbarer
Schritt, und `Strg/Cmd+Z` nimmt sie zurück.

## Zusammenarbeit und Erkundung

ForkBuild bietet verkörperte Zusammenarbeit und das Entdecken der Welt:

- **Gehen und navigieren** — gehen Sie mit den Tasten WASD mit Ihrem
  Avatar über Gebäude und Gelände, springen, klettern und erkunden Sie
  Räume in der Höhe.
- **Gemeinsam bauen** — sehen Sie die Avatare anderer Baumeister,
  erkennen Sie räumlich, woran sie arbeiten, und nutzen Sie dann **Eine
  Kopie bearbeiten**, um etwas Gefundenes in den Editor zu übernehmen und
  selbst weiterzubauen.
- **Die Welt entdecken** — nutzen Sie den Kompass mit Ortsmarkierungen,
  um Strukturen in der Nähe und Geländemerkmale wie Wälder, Flüsse und
  Grasland zu finden.
- **Mitwirkenden folgen** — koppeln Sie Ihre Kamera an den Avatar einer
  Person, während sie sich durch die Welt bewegt.

Alles, was Sie sehen, wird aus dem deterministischen Seed der Welt
abgeleitet — Gelände, Ökologie und Gewässer werden für alle identisch
berechnet und ergeben so einen stimmigen gemeinsamen Ort, ohne dass
zusätzliche Daten gespeichert werden.

## Wiederverwendbare Strukturen und Baupläne

Über einzelne Steine hinaus können Sie mit der Baubibliothek des Editors
mit ganzen Strukturen auf einmal bauen — zwanzig fertigen in fünf
Kategorien sowie allem, was Sie selbst speichern:

- **Platzieren** Sie eine Struktur direkt in das, was Sie gerade bauen,
  oder **forken** Sie sie in ein ganz neues eigenes Dokument.
- **Speichern** Sie eigene Bauten als wiederverwendbare Strukturen in
  **Meine Strukturen**, Ihrer persönlichen Bauplanbibliothek.
- **Exportieren und importieren** Sie einen Bauplan als portable Datei,
  um ihn mit jemand anderem zu teilen oder auf ein anderes Gerät
  mitzunehmen.

Die vollständige Anleitung finden Sie unter
[Der Editor](02-TheEditor.md#strukturen-zusammensetzen-forken-und-ihre-persönliche-bibliothek).
