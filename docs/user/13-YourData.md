# 13 — Your Data: backing up and restoring

<!-- languages -->
**English** · [Deutsch](de/13-YourData.md) · [Español](es/13-YourData.md) · [Français](fr/13-YourData.md) · [Bahasa Indonesia](id/13-YourData.md) · [日本語](ja/13-YourData.md) · [한국어](ko/13-YourData.md) · [Português (Brasil)](pt-BR/13-YourData.md)
<!-- /languages -->

ForkBuild has no accounts and no server that keeps your work. Everything it
stores lives in this browser, on this device: your documents, identities
and their private keys, structures, publications, peers and friends, chat
history and settings. **Clearing this site's data in the browser deletes all
of it for good**, and so does uninstalling the browser or losing the device.

The **Your Data** page (**Your Data** in the top menu) is where you keep a
copy.

## On this device

The first section lists what is stored, by kind, and how much space it
uses. The counts are storage entries, not documents: a saved document and
the list of documents are two entries, for example.

If it says **The browser may remove this data when the disk is low**, click
**Ask the Browser to Keep It**. Browsers usually agree once you've
bookmarked or installed the site or use it often. This only protects
against the browser tidying up on its own: clearing site data still deletes
everything.

## Backing up

1. Choose a **backup passphrase** (at least 8 characters) and type it twice.
2. Leave **Include builds downloaded from other people** unticked unless
   you want them: they can be large and can usually be fetched again. Your
   own publications are always included.
3. Click **Back Up to a File**. The browser downloads a
   `forkbuild-backup-<date>.forkbuild-backup` file.

The file holds everything the page listed, encrypted with your backup
passphrase. It's safe to keep in cloud storage or on a USB stick, but
**there is no way to open it without that passphrase**, so keep the two
somewhere you won't lose them. The backup passphrase is separate from your
identities' passphrases: each identity inside stays protected by its own.

The backup doesn't include which identity is logged in. After a restore
you log in again.

Besides **Back Up to a File**, the same section can:

- **Share Backup…** (phones, tablets and some computers): opens your
  device's share sheet, so you can save the file to a cloud drive, send it
  by email or move it to another device. If the share sheet doesn't open on
  the first tap (encrypting took longer than the browser allows), tap
  **Share Backup** again: the backup is ready and goes straight away.
- **Back Up to "folder"**: once you've chosen a backup folder (below).

**Remember the backup key on this device** appears once you type a
passphrase. Tick it to make later backups without typing the passphrase:
the one-click buttons and automatic backups below use it. ForkBuild doesn't
keep the passphrase itself, only a key made from it that the browser lets
ForkBuild use for making backups and never shows to anyone, and that can't
open a backup. Backups made with it still open with your passphrase.
**Forget Backup Key** removes it.

## Reminders

If this device hasn't been backed up for a while, a bar under the menu on
every page says so, with **Back Up Now** and **Remind Me in a Week**:

- It first appears a week after this browser starts holding your work
  (documents, identities, structures, peers or chat), if you've never backed
  up.
- After that, it appears when the last backup is older than you chose under
  **Reminders and automatic backups → Remind me to back up**: every week,
  2 weeks, month (the default) or 3 months, or never.
- **Back Up Now** backs up to your backup folder in one click when you've set
  one up with a remembered key; otherwise it opens this page.

The same section shows when the last backup was made and where to.

## Backing up to a folder

In Chrome and Edge on a computer, **Choose Folder…** lets you pick a folder
for backups. Pick one your cloud storage syncs (Dropbox, OneDrive, iCloud
Drive, Google Drive) or a USB drive, and every backup leaves this device
without you moving files around. Each day's backup is one file,
`forkbuild-backup-<date>.forkbuild-backup`; a second backup the same day
replaces that day's file, and ForkBuild keeps the newest ten of its own
backups there, never touching anything else in the folder.

The browser asks whether ForkBuild may save in the folder the first time,
and may ask again in a later visit. **Stop Using This Folder** forgets it;
the backups already there stay.

**Back up to the folder automatically once a day while ForkBuild is open**
needs a folder and a remembered key. ForkBuild then checks a minute after it
opens, and every hour, and backs up if the last backup is a day old. It never
asks for permission on its own: if the browser wants to ask again, automatic
backups wait until you back up to the folder once yourself. A failed
automatic backup is shown on this page.

Other browsers can't save to a folder. Use **Share Backup…** there, or
download the file and move it yourself.

## Restoring

Close ForkBuild in any other tab first: a tab left open can write its older
data back.

1. Under **Restore**, choose the backup file and enter its passphrase, then
   click **Open Backup**. A wrong passphrase is refused and nothing
   changes. ForkBuild shows when the backup was made and what it holds.
2. Choose how to restore:
   - **Add what this device doesn't have** (the default): everything in the
     backup that isn't on this device is added. Where both have something,
     such as the same document or a setting, this device's version is kept.
   - **Replace everything on this device with the backup**: deletes what
     ForkBuild has stored here first, then restores the backup exactly.
     Tick the confirmation to enable it.
3. Click **Restore**. The page reloads when it's done. A restored device
   counts as backed up on the date the backup was made.

A backup made by a newer version of ForkBuild can't be opened by an older
one; update this copy first. Anything in a backup this version doesn't
know is skipped, and the result says how many.

## Smaller exports

For moving one kind of thing, or sharing it, use the export on its own page:

| What | Export | Import |
|---|---|---|
| One document | **Export** in the Editor toolbar | **Import** in the Editor toolbar |
| Every saved document | **Export All Documents** at the bottom of the Editor's **Recent** menu | **Import** in the Editor toolbar |
| One structure | **Export Blueprint** in its card's **⋮** menu | **Import Blueprint** beside **My Structures** |
| Every structure | **Export All** beside **My Structures** | **Import Blueprint** beside **My Structures** |
| One identity | **Export** on **My Identities** | **Import Identity** on **My Identities** |

Importing every document puts back the ones this device doesn't have, keeps
the ones it already has unchanged, and saves a copy beside any it has in a
different version. Importing every structure skips designs already in My
Structures. An exported identity also carries its revocation, successor and
device authorizations, so a revoked identity comes back revoked.

Chat history, friends, followed people and settings move only with a full
backup.

## Your publications

A creation you **Publish** is stored on this device only, until you
distribute it (see [Publishing & Forking](04-PublishingAndForking.md)).
Its Repository card says where this device recorded distributing it, for
example **Stored on IPFS · Announced on Nostr**: where the build or its
Signed Claim was uploaded (IPFS, Arweave, Steem or Blurt) and where it was
announced (Nostr, Arweave, Steem or Blurt). Hold the pointer over a name to see
its address or announcement id.

The line only says what this device has a record of. It doesn't check
that an upload is still available (an IPFS copy lasts only while someone
keeps it pinned), and a distribution made from another device isn't known
here. With no record, the card says **No distribution recorded on this
device**: back it up, or open it in World View with **Explore** and use
**Distribute** under **My Shared World**. Sharing it with connected peers
isn't recorded as a distribution: they keep a copy only as long as they
choose to.

## Daily visitor count

At the bottom of the page, **Daily visitor count** controls the one thing
ForkBuild sends that no feature needs. Once a day, the official site tells
GoatCounter that one more browser opened it. It also counts, the same way,
when a link to a build is copied or shared, when a shared link is opened,
and when a build opened from one is copied into the Editor. Each request is
a fixed path that names no page, build or person and sets no cookie, and
anyone can see the totals on the public dashboard. Untick **Count this browser** to stop it; the choice is
saved at once, in this browser only. A browser that sends Global Privacy
Control or Do Not Track is never counted, and the switch says so. See
[Privacy](../Privacy.md#visitor-count) for exactly what is sent.
