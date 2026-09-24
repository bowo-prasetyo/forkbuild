# 05 — Identity & Login

ForkBuild has no passwords and no central account server. **Your identity is
a cryptographic key pair stored in this browser** — the same key that signs
everything you build, publish, message, or move. This guide covers creating,
protecting, and backing up that identity.

## Creating an identity

Click **Login** in the top bar. The dialog lists every identity this device
already holds — click one to use it — or create a new one:

1. Type a **display name**. This is what other people see; you can have
   several identities with different names.
2. Type a **passphrase** (at least 8 characters), then type it again to
   confirm it.
3. Click **Create & Log In**.

This creates a **protected** identity (shown with a 🔒): the key is encrypted
at rest and only decrypted, in memory, after you enter the passphrase.

You can leave the passphrase blank, but only by ticking **Create without a
passphrase**. That creates an **unprotected** identity: the key is stored
unencrypted in this browser, ready to use without ever asking you for
anything, and anything that can read this site's storage can sign as you.
You can protect it later from **My Identities**.

> There is no password reset. For a protected identity, the passphrase *is*
> the only way to decrypt the key — if you lose it, that identity is gone,
> even to ForkBuild itself. Choose one you can keep.

## The vault: locked vs. logged out

A protected identity's decrypted key lives in something called its **vault**.
The vault can be **locked** or **unlocked**, and that's a genuinely different
question from whether you're logged in:

- **Logged in, unlocked** — everything works normally.
- **Logged in, locked** (🔒 next to your name in the top-right) — you're
  still yourself, you can still browse and look around, but anything that
  needs a fresh signature (saving, publishing, sending a message) will ask
  for your passphrase first. Click **Unlock** to re-enter it.
- **Logged out** — you're no one; open **Login** to pick or unlock an
  identity again.

A vault locks automatically after **15 minutes** of inactivity since you last
unlocked it, or whenever you click **Lock** yourself. Reloading the page
always leaves protected identities locked — the decrypted key is never
written to disk, only ever held in memory — even though the app still
remembers who you were logged in as.

## Managing identities — the My Identities page

Open **My Identities** in the top bar to see every identity this device
holds, with its own lock state, independent of which one you're currently
logged in as. From here you can:

- **Create** a new identity (same as the login dialog).
- **Protect with Passphrase** — shown on an unprotected identity (marked
  ⚠ Unprotected). It encrypts the existing key; the identity itself doesn't
  change, and it's locked until you unlock it.
- **Lock / Unlock** any identity individually.
- **Change passphrase** — replaces the passphrase of a protected identity
  (only protected identities offer it). The identity itself — its ID,
  public key, and every signature it has made — never changes.
- **Export** — back it up.
- **Import** — restore or copy one from a backup file.
- **Declare a successor / Revoke** — mark an identity as retired in favor of
  another (paste the successor's `did:key:z…` ID), or revoke it outright,
  permanently. Declaring a successor doesn't revoke anything by itself —
  revoke separately when the switch should take effect. For a locked,
  protected identity both ask for its passphrase, and signing with it
  unlocks it, exactly as unlocking it yourself would.

Only one of these forms (Unlock, Export, Change Passphrase, Declare
Successor, Revoke) is open at a time, on one identity card. Opening
another, pressing **Cancel**, or finishing the action closes it and clears
every field in it, so a passphrase you typed never lingers on the page.
Browser password managers are told not to autofill this page's fields.

There's no rename or delete — identities are meant to persist; if you want
to stop using one, revoke it instead.

## Backing up an identity (export & import)

Your identity only exists on this device unless you back it up. **Export**
produces a downloadable file containing your encrypted private key:

- Exporting always asks for the identity's passphrase, even if it's
  currently unlocked.
- If the identity is unprotected, export asks you to choose a passphrase (at
  least 8 characters) on the spot, just to protect the copy in the file.

**Import** brings an exported identity onto a different device or browser:

1. Click **Import Identity**, then choose the exported file (or paste its
   JSON into the box below). ForkBuild shows a safe preview first — name,
   ID, algorithm, and whether you already have it — without decrypting
   anything.
2. Enter the export's passphrase to actually import it.

An imported identity always lands **locked**, and you are not automatically
logged in as it — unlock it from My Identities or the login dialog like any
other protected identity.

Files exported by earlier versions of ForkBuild still import. Files exported
now use a newer format that earlier versions can't read, so update ForkBuild
on the other device first.

## Keys from earlier versions

Protected identities created before this version used a weaker encryption
format. They still unlock with the same passphrase, and the first time you
unlock one (or export it), ForkBuild re-encrypts it in the current format.
Nothing about the identity itself changes.

> Keep both the exported file *and* its passphrase safe. Either one alone is
> useless — and losing both means that identity, and everything only it
> could sign, is unrecoverable.

## Wrong passphrase

Five wrong attempts (unlocking, exporting, or changing a passphrase — they
share one count per identity) trigger a 30-second cooldown; the error message
counts down remaining attempts, then remaining lockout time. The count resets
on reload.

## What's next?

Now that you're signed in, set up how you appear to others in
**[Avatars & Presence](06-AvatarsAndPresence.md)**, or find people to build
with in **[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)**.
