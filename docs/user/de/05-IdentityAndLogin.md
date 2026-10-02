<!-- translation-of: docs/user/05-IdentityAndLogin.md source-hash: b7e773ae656ae805 -->
# 05 — Identität & Anmeldung

<!-- languages -->
[English](../05-IdentityAndLogin.md) · **Deutsch** · [Español](../es/05-IdentityAndLogin.md) · [Français](../fr/05-IdentityAndLogin.md) · [Bahasa Indonesia](../id/05-IdentityAndLogin.md) · [日本語](../ja/05-IdentityAndLogin.md) · [한국어](../ko/05-IdentityAndLogin.md) · [Português (Brasil)](../pt-BR/05-IdentityAndLogin.md)
<!-- /languages -->

ForkBuild hat keine Passwörter und keinen zentralen Kontoserver. **Ihre
Identität ist ein kryptografisches Schlüsselpaar, das in diesem Browser
gespeichert ist** — derselbe Schlüssel, der alles signiert, was Sie bauen,
veröffentlichen, senden oder bewegen. Diese Anleitung behandelt das
Erstellen, Schützen und Sichern dieser Identität.

## Eine Identität erstellen

Klicken Sie in der oberen Leiste auf **Anmelden**. Der Dialog listet jede
Identität auf, die dieses Gerät bereits besitzt — klicken Sie auf eine, um
sie zu verwenden —, oder erstellen Sie eine neue:

1. Geben Sie einen **Anzeigenamen** ein. Das sehen andere; Sie können
   mehrere Identitäten mit verschiedenen Namen haben.
2. Geben Sie eine **Passphrase** ein (mindestens 8 Zeichen) und dann zur
   Bestätigung noch einmal.
3. Klicken Sie auf **Erstellen & anmelden**.

Das erstellt eine **geschützte** Identität (mit 🔒 angezeigt): Der
Schlüssel wird verschlüsselt gespeichert und erst nach Eingabe der
Passphrase im Arbeitsspeicher entschlüsselt.

Sie können die Passphrase leer lassen, aber nur, indem Sie das Häkchen bei
**Ohne Passphrase erstellen** setzen. Das erstellt eine **ungeschützte**
Identität: Der Schlüssel wird unverschlüsselt in diesem Browser
gespeichert, ist ohne jede Nachfrage einsatzbereit, und alles, was den
Speicher dieser Website lesen kann, kann als Sie signieren. Unter **Meine
Identitäten** können Sie sie später schützen.

> Es gibt kein Zurücksetzen des Passworts. Bei einer geschützten Identität
> *ist* die Passphrase der einzige Weg, den Schlüssel zu entschlüsseln —
> verlieren Sie sie, ist diese Identität verloren, selbst für ForkBuild.
> Wählen Sie eine, die Sie behalten können.

## Der Tresor: gesperrt oder abgemeldet

Der entschlüsselte Schlüssel einer geschützten Identität liegt in ihrem
sogenannten **Tresor**. Der Tresor kann **gesperrt** oder **entsperrt**
sein, und das ist eine wirklich andere Frage als die, ob Sie angemeldet
sind:

- **Angemeldet, entsperrt** — alles funktioniert normal.
- **Angemeldet, gesperrt** (🔒 neben Ihrem Namen oben rechts) — Sie sind
  weiterhin Sie selbst und können weiter stöbern, bauen und speichern, aber
  alles, was eine frische Signatur braucht (Veröffentlichen, Auffindbar
  sein, einer Lobby beitreten), schlägt mit einer Meldung „identity is
  locked“ (Identität gesperrt) fehl, bis Sie entsperren. Klicken Sie neben
  Ihrem Namen auf **Entsperren**, geben Sie Ihre Passphrase ein und
  versuchen Sie es dann erneut.
- **Abgemeldet** — Sie sind niemand; öffnen Sie **Anmelden**, um wieder
  eine Identität zu wählen oder zu entsperren.

Ein Tresor sperrt sich automatisch **15 Minuten nach dem Entsperren**, ob
Sie die App noch benutzen oder nicht (es ist kein Inaktivitäts-Timer), oder
wann immer Sie unter **Meine Identitäten** selbst auf **Sperren** klicken.
Ein Neuladen der Seite lässt geschützte Identitäten immer gesperrt — der
entschlüsselte Schlüssel wird nie auf die Festplatte geschrieben, sondern
nur im Arbeitsspeicher gehalten —, auch wenn die App sich noch merkt, als
wer Sie angemeldet waren.

## Identitäten verwalten — die Seite Meine Identitäten

Öffnen Sie in der oberen Leiste **Meine Identitäten**, um jede Identität
dieses Geräts zu sehen, jeweils mit ihrem eigenen Sperrzustand, unabhängig
davon, mit welcher Sie gerade angemeldet sind. Von hier aus können Sie:

- **Erstellen** — eine neue Identität (wie im Anmeldedialog).
- **Mit Passphrase schützen** — erscheint bei einer ungeschützten
  Identität (markiert mit ⚠ Ungeschützt). Es verschlüsselt den vorhandenen
  Schlüssel; die Identität selbst ändert sich nicht und bleibt gesperrt,
  bis Sie sie entsperren.
- **Sperren / Entsperren** — jede Identität einzeln.
- **Passphrase ändern** — ersetzt die Passphrase einer geschützten
  Identität (nur geschützte Identitäten bieten das an). Die Identität
  selbst — ihre ID, ihr öffentlicher Schlüssel und jede Signatur, die sie
  erzeugt hat — ändert sich nie.
- **Exportieren** — sie sichern.
- **Importieren** — eine aus einer Sicherungsdatei wiederherstellen oder
  kopieren.
- **Nachfolger benennen / Widerrufen** — eine Identität zugunsten einer
  anderen als ausgemustert kennzeichnen (fügen Sie die ID `did:key:z…` des
  Nachfolgers ein) oder sie endgültig widerrufen. Das Benennen eines
  Nachfolgers widerruft selbst nichts — widerrufen Sie separat, wenn der
  Wechsel wirksam werden soll. Bei einer gesperrten, geschützten Identität
  fragen beide nach ihrer Passphrase, und das Signieren damit entsperrt
  sie, genau wie Sie sie selbst entsperren würden.

Immer nur eines dieser Formulare (Entsperren, Exportieren, Passphrase
ändern, Nachfolger benennen, Widerrufen) ist auf einmal geöffnet, auf einer
Identitätskarte. Ein anderes zu öffnen, **Abbrechen** zu drücken oder die
Aktion abzuschließen, schließt es und leert jedes Feld darin, sodass eine
eingegebene Passphrase nie auf der Seite liegen bleibt.
Passwortmanagern des Browsers wird mitgeteilt, die Felder dieser Seite
nicht automatisch auszufüllen.

Es gibt kein Umbenennen oder Löschen — Identitäten sind auf Dauer
angelegt; wenn Sie eine nicht mehr verwenden möchten, widerrufen Sie sie
stattdessen.

## Eine Identität sichern (Export & Import)

Ihre Identität existiert nur auf diesem Gerät, es sei denn, Sie sichern
sie. **Exportieren** erzeugt eine herunterladbare Datei mit Ihrem
verschlüsselten privaten Schlüssel:

- Der Export fragt immer nach der Passphrase der Identität, auch wenn sie
  gerade entsperrt ist.
- Ist die Identität ungeschützt, bittet der Export Sie, an Ort und Stelle
  eine Passphrase (mindestens 8 Zeichen) zu wählen, nur um die Kopie in
  der Datei zu schützen.

**Importieren** bringt eine exportierte Identität auf ein anderes Gerät
oder in einen anderen Browser:

1. Klicken Sie auf **Identität importieren** und wählen Sie dann die
   exportierte Datei (oder fügen Sie ihr JSON in das Feld darunter ein).
   ForkBuild zeigt zuerst eine sichere Vorschau — Name, ID, Algorithmus und
   ob Sie sie schon haben —, ohne etwas zu entschlüsseln.
2. Geben Sie die Passphrase des Exports ein, um sie tatsächlich zu
   importieren.

Eine importierte Identität landet immer **gesperrt**, und Sie werden nicht
automatisch mit ihr angemeldet — entsperren Sie sie unter Meine Identitäten
oder im Anmeldedialog wie jede andere geschützte Identität.

Die Datei trägt außerdem die signierten Lebenszyklus-Nachweise der
Identität: ihren Widerruf, den benannten Nachfolger und die Geräte, die
sie berechtigt oder nicht mehr berechtigt hat. Der Import stellt sie
wieder her, sodass eine widerrufene Identität widerrufen zurückkommt statt
aktiv. Der Import einer neueren Datei für eine Identität, die Sie schon
haben, fügt jeden dieser Nachweise hinzu, der dem Gerät fehlt, und ändert
sonst nichts.

Um jede Identität auf einmal zu sichern, zusammen mit allem anderen,
nutzen Sie [Ihre Daten](13-YourData.md).

Dateien, die frühere Versionen von ForkBuild exportiert haben, lassen sich
weiterhin importieren. Jetzt exportierte Dateien nutzen ein neueres Format,
das frühere Versionen nicht lesen können; aktualisieren Sie also zuerst
ForkBuild auf dem anderen Gerät.

## Schlüssel aus früheren Versionen

Geschützte Identitäten, die vor dieser Version erstellt wurden, nutzten ein
schwächeres Verschlüsselungsformat. Sie lassen sich weiterhin mit derselben
Passphrase entsperren, und beim ersten Entsperren (oder Exportieren)
verschlüsselt ForkBuild sie im aktuellen Format neu. An der Identität selbst
ändert sich nichts.

> Bewahren Sie sowohl die exportierte Datei *als auch* ihre Passphrase
> sicher auf. Eines allein ist nutzlos — und wenn Sie beides verlieren,
> sind diese Identität und alles, was nur sie signieren konnte,
> unwiederbringlich.

## Falsche Passphrase

Fünf falsche Versuche (beim Entsperren, Exportieren oder Ändern einer
Passphrase — sie teilen sich eine Zählung pro Identität) lösen eine
Wartezeit von 30 Sekunden aus; die Fehlermeldung zählt die verbleibenden
Versuche und danach die verbleibende Sperrzeit herunter. Die Zählung wird
beim Neuladen zurückgesetzt.

## Wie geht es weiter?

Jetzt, da Sie angemeldet sind, legen Sie in
**[Avatare & Anwesenheit](06-AvatarsAndPresence.md)** fest, wie andere Sie
sehen, oder finden Sie in
**[Peer-Verbindungen & Freunde](07-PeerConnectionsAndFriends.md)** Menschen,
mit denen Sie bauen.
