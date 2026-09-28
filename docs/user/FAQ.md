# Frequently Asked Questions

Short answers to the questions people most often run into, each linking to
the guide that explains it in full.

## Publishing and sharing

### I published my creation, but my friend can't find it in their Repository

Publishing only stores the creation on your own device and lists it in
*your* Repository. Nothing is sent anywhere until you choose to:

- **Share with Peers**, under your creation in the Repository, offers it to
  the people you're connected to. A Friend's or Known Peer's device adds it
  by itself; anyone else sees it under **Shared with you** and clicks
  **Retrieve**. You need to be connected at the same time for it to arrive.
- **Distribute** (experimental) uploads it to Arweave, IPFS or Steem and
  announces it, so people can find it without being connected to you.

See [Publishing & Forking](04-PublishingAndForking.md#sharing-with-connected-peers).

### Why can't anyone fork my creation?

A new document has no license, and an unlicensed creation can't be forked.
Open **Document Properties** (the **✎** beside the document title in the
Editor), choose a license that allows forking (any CC license except
CC BY-ND), and publish again. The setting is part of what gets published,
so creations you already published keep the license they had. See
[Choosing a license](04-PublishingAndForking.md#choosing-a-license).

### Publish failed. What do the messages mean?

- **a title is required before publishing** — give the creation a title in
  **Document Properties**.
- **cannot publish an empty world** — place at least one brick first.
- **cannot sign, identity is locked** — your identity locked itself; click
  **Unlock** next to your name in the top bar and publish again.

### Does publishing need me to be logged in?

Publishing works while logged out, but the result has no author and no
signature, so you can't share it with peers or distribute it later. Log in
before you publish.

### Can I unpublish something?

Yes: open the World in World View, then in **My Publication** choose
**More ▾ → Unpublish…**. That removes it from your Repository. It can't
recall copies other people already received or anything you distributed to
Arweave, IPFS, Nostr or Steem.

### Someone placed my build in their World. Did they move mine?

No. A placement only says where *their* World shows your build; yours
stays where you put it, and the build keeps your name and history. If you
don't want this, choose **Only I may place it** under **Who can place it in
the World** before you publish. See
[Why can I place other people's builds?](03-WorldView.md#why-can-i-place-other-peoples-builds).

### Why are two builds sitting in the same spot?

A placement doesn't claim land, and there's no central server to say who
got a spot first, so two placements can name the same point. You're warned
before you move one of yours onto an occupied spot. See
[Why can two builds sit in the same spot?](03-WorldView.md#why-can-two-builds-sit-in-the-same-spot).

## Identity and your data

### I forgot my passphrase. Can it be reset?

No. The passphrase is the only way to decrypt that identity's key, and
there's no server holding a copy. If you exported the identity, you still
need the passphrase you chose for the export. Otherwise create a new
identity. See [Identity & Login](05-IdentityAndLogin.md).

### Why does my identity keep locking itself?

A protected identity locks **15 minutes after you unlock it**, even if you
are busy using the app, and every time you reload the page. Building and
saving keep working while it's locked; publishing, being discoverable and
joining a lobby need you to unlock it again.

### How do I move my work to another computer or browser?

Nothing syncs by itself. Move each kind of thing by file:

- **Documents**: **Export** in the Editor toolbar, then **Import** on the
  other device.
- **Your own structures**: **Export Blueprint** from a card's **⋮** menu,
  then **Import Blueprint** beside **My Structures**.
- **Identities**: **Export** on **My Identities**, then **Import Identity**.

Chat history, friends and settings stay on the device they're on.

### Will clearing my browser data delete my work?

Yes. Documents, identities, friends and chat history all live in this
browser's storage for this site, and clearing it deletes them for good.
Export anything you want to keep first. See [Privacy](../Privacy.md).

### Can I rename or delete an identity?

No. Identities are meant to last. To stop using one, declare a successor or
revoke it on **My Identities**.

### Why won't an older copy of ForkBuild open my exported document?

Documents are now saved in a newer, more compact format. ForkBuild 1.0.0
and older can't read it, so update the other copy first. Files exported by
older versions still open here.

## World View and your avatar

### WASD doesn't move my avatar

Walking is off until you turn it on:

1. Log in and save an avatar on **My Avatar**.
2. In World View's **Avatar** section, tick **Control My Avatar (WASD,
   Shift, Space)**.
3. Click the 3D view, so the keys aren't going into a text field.

On a touch screen, tap **Walk** above the joystick instead. See
[Walking your avatar](06-AvatarsAndPresence.md#walking-your-avatar).

### Who can see my avatar?

By default, anyone you're connected to: both **Presence Visibility** and
**Profile Visibility** start on **Public**. Change them on **My Avatar**;
**Hidden** makes you invisible. See
[Who can see you](06-AvatarsAndPresence.md#who-can-see-you-two-independent-settings).

### The browser tab closed while I was driving a vehicle

**Ctrl** is the brake and **W** accelerates, and on Windows and Linux most
browsers close the tab on **Ctrl+W**. Let go of **W** before you brake.

### Can I change anything in World View?

Only annotations: landmarks, region names and animal decorations. Building
happens in the Editor; use **Edit a Copy** to take what you're looking at
there. See [World View](03-WorldView.md#edit-a-copy--taking-something-into-the-editor).

## Peers, friends and chat

### I'm running ForkBuild myself and can't find anyone

The default rendezvous server only answers the hosted site, so a copy
served from your own address (including `localhost`) can't use it. Connect
with an invitation (**Peers → Connect with someone new → Invite**), or add a
rendezvous server of your own under **Network Settings → Rendezvous
Servers**. See [Peer Connections & Friends](07-PeerConnectionsAndFriends.md).

### My friend doesn't reconnect automatically

Automatic reconnection only covers people you've **Remembered** (Known
Peers), and only finds them while they're **Be Discoverable**. A Friend you
haven't Remembered shows a **Reconnect** button instead. Choose **Remember**
in their **⋯** menu, and have both of you click **Be Discoverable**.

### My message still says "Queued"

Messages wait on your device, not on a server, so they're delivered only
while ForkBuild is open on both sides and you're connected. A message not
delivered within 7 days is dropped and marked **Undelivered — expired**.
See [Chat & Conversations](08-ChatAndConversations.md#sending-while-someones-offline).

### Why can't I chat with someone I'm connected to?

Chat and voice calls are for friends only. Click **Add Friend** on their
row in **Peers**; once they accept, a **Chat** button appears.

### I changed a Network Setting but nothing is different

Network settings (servers, relays, gateways) are read when the app starts.
Reload the page after saving.

## Devices and browsers

### Does ForkBuild work on a phone or tablet?

Yes. Both views have touch controls, and on a narrow screen the menu and
side panels fold away. See [Touch screens](ControlsReference.md#touch-screens).

### Do I need a crypto wallet?

No. Building, saving, publishing, forking, peers and chat need none. A
wallet or signing extension is only needed for the experimental
distribution and anchoring features in
[Publications & External Evidence](09-PublicationsAndEvidence.md).
