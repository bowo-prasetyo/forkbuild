# 13 — Your Data: backing up and restoring

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
3. Click **Restore**. The page reloads when it's done.

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
distribute it to IPFS or Arweave (see
[Publishing & Forking](04-PublishingAndForking.md)). Its Repository card
says **Only on this device** until then. Back it up, or open it in World
View with **Explore** and use **Distribute** under **My Publication**.
Sharing it with connected peers doesn't count: they keep a copy only as
long as they choose to.
