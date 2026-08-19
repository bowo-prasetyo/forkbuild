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
2. Optionally, type a **passphrase**.
3. Click **Create & Log In**.

Leaving the passphrase blank creates an **unprotected** identity: the key
sits ready to use on this device and never asks you for anything again.
Typing a passphrase creates a **protected** identity (shown with a 🔒): the
key is encrypted at rest and only decrypted, in memory, after you enter the
passphrase.

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
- **Lock / Unlock** any identity individually.
- **Change passphrase** — turns an unprotected identity into a protected
  one, or replaces an existing passphrase.
- **Export** — back it up.
- **Import** — restore or copy one from a backup file.
- **Declare a successor / Revoke** — mark an identity as retired in favor of
  another, or revoke it outright.

There's no rename or delete — identities are meant to persist; if you want
to stop using one, revoke it instead.

## Backing up an identity (export & import)

Your identity only exists on this device unless you back it up. **Export**
produces a downloadable file containing your encrypted private key:

- Exporting always asks for the identity's passphrase, even if it's
  currently unlocked.
- If the identity is unprotected, export asks you to choose a passphrase on
  the spot, just to protect the copy in the file.

**Import** brings an exported identity onto a different device or browser:

1. Choose the exported file. ForkBuild shows a safe preview first — name, ID,
   and whether you already have it — without decrypting anything.
2. Enter the export's passphrase to actually import it.

An imported identity always lands **locked**, and you are not automatically
logged in as it — unlock it from My Identities or the login dialog like any
other protected identity.

> Keep both the exported file *and* its passphrase safe. Either one alone is
> useless — and losing both means that identity, and everything only it
> could sign, is unrecoverable.

## Wrong passphrase

Five wrong attempts (unlocking or changing a passphrase) trigger a 30-second
cooldown; the error message counts down remaining attempts, then remaining
lockout time. The count resets on reload. Exporting is not rate-limited.

## What's next?

Now that you're signed in, set up how you appear to others in
**[Avatars & Presence](06-AvatarsAndPresence.md)**, or find people to build
with in **[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)**.
