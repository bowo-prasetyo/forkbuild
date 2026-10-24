<!-- translation-of: docs/user/README.md source-hash: 8832d9dd4363463e -->
# ForkBuild-Benutzerdokumentation

<!-- languages -->
[English](../README.md) · **Deutsch** · [Español](../es/README.md) · [Français](../fr/README.md) · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Anleitungen zur Nutzung von ForkBuild im Browser. Neu hier? Beginnen Sie
mit **[Erste Schritte](01-GettingStarted.md)**: fünf Minuten vom Öffnen der
App bis zum Spaziergang durch Ihr erstes Bauwerk.

## Ich möchte …

| Ich möchte … | Lesen Sie |
|---|---|
| Mein erstes Bauwerk bauen | [Erste Schritte](01-GettingStarted.md#ihren-ersten-stein-platzieren) |
| Die Bauwerkzeuge lernen | [Der Editor](02-TheEditor.md) |
| Ein Bauwerk mit einem Freund teilen | [Einen Link teilen](04-PublishingAndForking.md#einen-link-teilen) |
| Mein Bauwerk für alle auffindbar machen | [Wer kann es finden?](04-PublishingAndForking.md#wer-kann-es-finden) |
| Das Bauwerk eines anderen remixen | [Remixen: machen Sie es zu Ihrem eigenen](04-PublishingAndForking.md#remixen-machen-sie-es-zu-ihrem-eigenen) |
| Live mit einem Freund zusammen bauen | [Mit mir bauen](02-TheEditor.md#mit-mir-bauen-gemeinsam-bauen-live) |
| Mit Freunden spazieren gehen | [Mit mir hier spazieren](03-WorldView.md#mit-mir-hier-spazieren--freunde-in-diese-welt-holen) |
| Das Aussehen meines Avatars ändern | [Avatare & Anwesenheit](06-AvatarsAndPresence.md#ihren-avatar-anpassen) |
| Meine Arbeit sichern oder auf ein anderes Gerät bringen | [Ihre Daten](13-YourData.md) |
| Eine Taste oder Maussteuerung nachschlagen | [Steuerungsreferenz](ControlsReference.md) |
| Etwas reparieren, das nicht funktioniert | [FAQ](FAQ.md) |

Alles hier beschreibt das Produkt so, wie es heute funktioniert; die
Interna der Engine stehen in [docs/Architecture.md](../../Architecture.md)
und im übrigen [docs/](../..)-Ordner auf oberster Ebene (nur auf Englisch).

## Spielen (der Reihe nach lesen)

Alles, was Sie brauchen, um zu bauen, zu teilen, zu remixen und mit
Freunden herumzulaufen.

1. **[Erste Schritte](01-GettingStarted.md)** — die App öffnen, sich im
   Menü zurechtfinden, den ersten Stein platzieren und einen Namen erst
   zum Veröffentlichen wählen.
2. **[Der Editor](02-TheEditor.md)** — das Baukastenwerkzeug: Werkzeuge,
   Auswahl, Transformationen, Steinfarben, Gruppen, die Strukturen der
   Baubibliothek und Ihre eigenen Baupläne, Strukturinstanzen sowie Titel,
   Beschreibung und Lizenz eines Bauwerks.
3. **[Weltansicht](03-WorldView.md)** — die geteilte 3D-Welt, in der
   jedes veröffentlichte Bauwerk steht: herumlaufen und -fliegen, Dinge
   finden und ansehen, **Hier bauen**, **Mit mir hier spazieren**,
   Bewohner und **Eine Kopie bearbeiten**, um etwas in den Editor zu
   holen. Ihre Netzwerkwerkzeuge haben eine eigene Seite, unten unter
   Erweitert.
4. **[Veröffentlichen & Remixen](04-PublishingAndForking.md)** —
   veröffentlichen und einen Link teilen, wählen, wohin Ihre Bauwerke
   gehen, Lizenzen, remixen, **Entdecken** und seine fertigen Bauwerke,
   die wöchentliche Challenge und ihr Platz und Stammbäume. Alles, wohin
   ein Bauwerk gehen kann, steht unter [Ihre Arbeit
   verteilen](Distribution.md).
5. **[Avatare & Anwesenheit](06-AvatarsAndPresence.md)** — Ihren Avatar
   anpassen, wer Sie sehen kann, Gehen, Kameraperspektiven, Fahrzeuge,
   Tiere und Ihr Inventar.
6. **[Ihre Daten](13-YourData.md)** — alles, was dieser Browser enthält,
   in eine verschlüsselte Datei sichern und wiederherstellen, die
   kleineren Exporte und wo dieses Gerät das Verteilen Ihrer
   Einträge festgehalten hat.

## Erweitert

Die Technik darunter: Ihre Identität im Detail, direkte Verbindungen zu
anderen Menschen, die Netzwerke, an die ein Bauwerk gehen kann, und die
experimentellen Werkzeuge. Zum Spielen brauchen Sie nichts davon.

- **[Weltansicht: Erweiterte Werkzeuge](WorldViewAdvancedTools.md)** —
  was **Erweiterte Werkzeuge zeigen** hinzufügt: Steine untersuchen,
  Platzierungen und warum sich jedes Bauwerk platzieren lässt, Begegnungen
  in der Welt, entdeckte Ortsnamen, beanspruchte Bauwerke und das Verteilen
  Ihres eigenen Bauwerks aus **Meine Geteilte Welt**.
- **[Ihr Name & Ihre Identität](05-IdentityAndLogin.md)** — Ihr Name
  und die kryptografische Identität dahinter, der Tresor (Sperren/Entsperren), das Sichern
  per Export/Import und das Verwalten von Identitäten unter **Meine
  Identitäten**.
- **[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)** —
  sich direkt mit anderen Menschen verbinden, sie sich merken, sich
  befreunden, folgen, blockieren, automatisches Neuverbinden und Ihr
  eigenes TURN-Relay.
- **[Chat & Unterhaltungen](08-ChatAndConversations.md)** — direkte
  Nachrichten nur unter Freunden, Zustellung im Offline-Zustand,
  Lesebestätigungen und Sprachanrufe.
- **[Signierte Einträge & externe Nachweise](09-PublicationsAndEvidence.md)** —
  die technische, optionale Ebene: signierte Urheberschafts- und
  Ortsnamensansprüche, die Seite Signierte Einträge, Kommentare und was
  Ihr Gerät besitzt (lokaler Snapshot). Teile der Seite sind
  *experimentell* und so gekennzeichnet.
- **[Netzwerkeinstellungen](10-NetworkSettings.md)** — Gateways, Relays,
  Speicher- und Ankündigungsanbieter sowie Server für Peer-Verbindungen.
  Was jedes Netzwerk braucht, fasst
  [Ihre Arbeit verteilen](Distribution.md#was-jedes-netzwerk-braucht)
  zusammen.
- **[Nachweise & Speicher](11-EvidenceAndStorage.md)** — Inhalte auf IPFS
  oder Arweave speichern, Snapshot-Platzierungen, auf Arweave verankern
  und, *experimentell*, andere externe Nachweise, die Wallet-Abläufe für
  Bitcoin und Base, entferntes IPFS-Pinning, Steem und Blurt.
  [Ihre Arbeit verteilen](Distribution.md) zeigt, wie das zusammenpasst.
- **[Archiv & Erfolge](12-ArchiveAndAchievements.md)** —
  *experimentell*. Das Beobachtungsarchiv, Eintragsverweise
  und Erfolge.

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

- **Editor** (**Bauen** im Menü) — Ihr privater Arbeitsbereich.
  Platzieren Sie Steine aus der Baubibliothek, wählen Sie sie aus und
  bewegen oder drehen Sie sie mit der Tastatur oder dem Gizmo. Speichern,
  öffnen und veröffentlichen Sie Bauwerke über die Werkzeugleiste.
- **Weltansicht** (**Spazieren** im Menü, oder **Erkunden** bei einem
  beliebigen Bauwerk) — die geteilte Welt. Gehen oder fliegen Sie zwischen
  veröffentlichten Bauwerken hin und her, suchen und erkunden Sie, was um
  Sie herum ist, gehen Sie mit Ihrem Avatar über Gebäude und Gelände und
  nutzen Sie **Eine Kopie bearbeiten**, um das Gefundene im Editor zu
  öffnen und darauf aufzubauen.

Was Sie im Editor auch tun: Jede Änderung ist ein rückgängig machbarer
Schritt, und `Strg/Cmd+Z` nimmt sie zurück.

## Zusammenarbeit und Erkundung

ForkBuild bietet verkörperte Zusammenarbeit und das Entdecken der Welt:

- **Gehen und navigieren** — gehen Sie mit den Tasten WASD mit Ihrem
  Avatar über Gebäude und Gelände, springen, klettern und erkunden Sie
  Räume in der Höhe.
- **Gemeinsam bauen** — **Mit mir bauen** im Editor erstellt einen Link, der
  Ihr Bauwerk im Editor eines Freundes öffnet, sodass Sie es gemeinsam
  bauen, live, und jeder die Steine des anderen erscheinen sieht und wohin
  er zeigt (siehe [Der
  Editor](02-TheEditor.md#mit-mir-bauen-gemeinsam-bauen-live)). Sehen Sie in
  der Weltansicht die Avatare anderer Baumeister und woran sie arbeiten, und
  nutzen Sie dann **Eine Kopie bearbeiten**, um etwas Gefundenes in den
  Editor zu übernehmen und selbst weiterzubauen.
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
mit ganzen Strukturen auf einmal bauen — zweiundzwanzig fertigen in fünf
Kategorien sowie allem, was Sie selbst speichern:

- **Platzieren** Sie eine Struktur direkt in das, was Sie gerade bauen,
  oder **remixen** Sie sie in ein ganz neues eigenes Bauwerk.
- **Speichern** Sie eigene Bauten als wiederverwendbare Strukturen in
  **Meine Strukturen**, Ihrer persönlichen Bauplanbibliothek.
- **Exportieren und importieren** Sie einen Bauplan als portable Datei,
  um ihn mit jemand anderem zu teilen oder auf ein anderes Gerät
  mitzunehmen.

Die vollständige Anleitung finden Sie unter
[Der Editor](02-TheEditor.md#strukturen-zusammensetzen-remixen-und-ihre-persönliche-bibliothek).
