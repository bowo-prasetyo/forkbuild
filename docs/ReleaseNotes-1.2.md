# ForkBuild 1.2 release notes

*Released 2026-10-01 as version 1.2.0.* For 1.1, see
[ReleaseNotes-1.1.md](ReleaseNotes-1.1.md); for what came after, see
[ReleaseNotes-1.3.md](ReleaseNotes-1.3.md).

1.2 speaks five more languages, gives World View sound and living
residents, lets you follow people and back up everything this browser
keeps, and loads much faster. There are no security fixes in this release,
and the protocol is unchanged.

## New

- **Languages:** ForkBuild can be shown in Bahasa Indonesia, Japanese,
  German, Spanish (neutral Latin American) and Brazilian Portuguese, as
  well as English. Choose one on the new **Language** page, or let it
  follow your browser's language. Numbers, dates and plurals follow the
  language, and the user guide is translated into each of them.
- **Following:** follow someone to keep up with their work, without either
  of you asking the other for anything. **Follow** appears on publication
  cards, an author's page, the Peers page and, as **Follow Their Work**, in
  World View's avatar panel. The new **Following** page lists the people
  you follow and their latest publications, and you are notified when one
  of them publishes. Following is private: nothing is signed or sent.
- **Your Data:** a new page backs up everything ForkBuild keeps in this
  browser to one encrypted file and restores it. It can back up to a folder
  (by click or automatically once a day) or share a backup to another app,
  and reminds you when you haven't backed up for a while. The Editor can
  export all documents at once, and an exported identity carries its
  revocations and device grants.
- **World Residents:** a World's author can add residents (press `R`, or
  **Add Resident Here** in the Avatar panel). They stroll around their home,
  walking round buildings, trees and water, turn to face you and wave.
  Press `T` beside one to hear about what's around: a vehicle, an animal, a
  landmark, a placed structure, someone nearby, or a build some way off,
  with a **Focus** button to look at what it mentioned.
- **Sound:** World View plays ambient sound that follows the land (wind,
  birdsong, crickets, water), your avatar's footsteps, jumps and landings,
  vehicle engines, getting on and off and braking, animals, residents and
  trees. Other players' footsteps and vehicles are heard from where they
  are, in 3D or stereo. The Editor and World View's own edits have short
  sounds too. `M` or the **Sound** button turns it off; a slider sets the
  volume.
- **Wildlife:** deer and rabbits wander, hop and step, graze, look around,
  and turn their heads to watch you when you come near. Every animal has
  ears and a tail, and released animals and animal decorations idle too.
  Everyone sees the same animal doing the same thing at the same moment.
- **Other players' vehicles:** someone riding a bicycle, motorcycle, car or
  drone is seen riding it.
- **Faster loading:** each page loads the first time it is opened instead
  of with the app, and the copy GitHub Pages publishes is bundled. Home now
  takes 80 requests and 0.4 MB instead of 617 requests and 1.6 MB, and
  shows in less than half the time on a slow link.
- **Publications page:** no longer Experimental as a whole; it marks its
  own Experimental parts (anchoring, the wallets, Steem, remote pinning and
  the expert tools). Publications that fail their check are listed in one
  folded group, can be removed from this device, and show their real names;
  your own from before 1.1 are listed first with the steps to publish them
  again, and your own old Worlds open in the Editor from their card.
  Distribution leads with the provider you chose, and the page-wide tools
  moved below the publications. Repository cards say where this device
  recorded distributing a publication.
- **Shared World:** a World's signed record is now called a Shared World
  everywhere the app shows it, so "publication" keeps its general meaning
  (Shared Worlds, Blueprint Attributions and Place Naming Claims). Only
  the wording changed; nothing stored or sent did.

## Fixes

- A module request the host drops while the app starts no longer leaves a
  blank page: the page reloads once, and says so if it still can't load. A
  page that fails to download says so instead of doing nothing.
- Opening a chat while signed out no longer fails, and the chat appears
  once you sign in.
- The Editor's Keyboard Shortcuts overlay lists `M` (sound on/off).
- The Following page keeps a readable width on wide screens, and the
  About page's user guide link opens the guide in your language.

## Upgrading from 1.1.0

- Nothing to do for your data: 1.2 opens everything 1.1 saved.
- Residents are new World content. Version 1.1.0 opens a World that has
  residents but doesn't show them, and leaves them out if it saves that
  World. A 1.1.0 peer editing the same World
  live doesn't receive a resident being added or removed. Players still on
  1.1.0 see people on vehicles without the vehicle.
- If you host ForkBuild on GitHub Pages from this repository, set
  **Settings → Pages → Source** to **GitHub Actions** so it publishes the
  bundled copy (see [Deployment.md](Deployment.md), "GitHub Pages"). Hosting
  the repository as it is still works; it just loads more slowly.

## Known limitations

The limitations listed for 1.1 still apply: everything is kept in the
browser's own storage (back it up on **Your Data**), the security policy
still allows `'unsafe-eval'`, one rendezvous server runs by default, and
re-publishing an older publication is a manual step. Also:

- **Backups** go to a file, a folder or another app; not yet to peers,
  IPFS or Arweave.
- **Following** is private to this device: there is no public follow list
  and no follower count.
- **Residents** can't yet be given a look, a name or a wander radius, don't
  walk indoors or on rooftops, and aren't drawn in the Editor.
- **Steem** has still not been run against a live node, and stays
  Experimental.
