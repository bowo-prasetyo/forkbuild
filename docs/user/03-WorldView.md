# 03 — World View

World View is the shared 3D space where **every published creation exists side
by side**. Fly around, discover what others have built, inspect their bricks,
and even edit right where you stand.

## Opening World View

From the **Repository**, click **Explore** on any creation — or navigate to a
world's URL directly. You'll appear next to that creation in the shared world.

## Flying around

- **Drag** — orbit the camera
- **Scroll** — zoom in and out
- **Home** — reset the view

As you move, nearby worlds **stream in and out** automatically. The overlay in
the corner shows you:

- **Worlds in View** — what's currently loaded around you
- **Nearby Worlds** — click one to fly straight to it

## Inspecting a brick

Click any brick to open the **Inspection** panel, which tells you:

- What kind of brick it is
- Its position and rotation
- Which world and building it belongs to
- Who authored the world

Use **Focus Brick** to zoom right in, or **Focus World** to jump to that
creation's home position.

## Building in World View

World View isn't just for looking — you can build here too.

1. Click the **Place** tool in the overlay.
2. Pick a brick type from the dropdown.
3. Hover over the ground or a brick face — a ghost preview appears.
4. Click to place it.

Switch back to **Select** to move, rotate, or delete bricks, using the same
keys as the Editor (arrows, `R`, `Delete`).

## Selecting in World View

Selection works exactly like the Editor:

- **Click** to select, **Ctrl/Cmd+Click** to toggle, **Shift+Click** to add.
- **Shift+Drag** to box-select.
- **Ctrl/Cmd+A** to select everything in the active world.

## Copy, paste, and groups

Copy (`Ctrl+C`), paste (`Ctrl+V`), and the **Groups** panel all work in World
View just as they do in the Editor — see [The Editor](02-TheEditor.md).

## Save and publish here, too

The overlay has **Save**, **Publish**, **Duplicate**, and **Fork** buttons, so
you can capture and share a world without leaving it. The **● Unsaved changes**
indicator works the same way.

## The Operation Timeline

This is one of ForkBuild's most powerful features. Every change you make is
recorded as an **operation**, and the timeline lets you travel through them.

Click **Timeline** in the overlay to open it. You'll see a list like:

`
<pre>
Place Brick
Place Brick
Move 3 Bricks
Rotate 3 Bricks
Paste 3 Bricks
</pre>
`

### Preview any moment

Click an operation to **preview** what the world looked like *right after* that
step. Keep clicking to scrub backward and forward through your build history.

> **Previews never change anything.** You're just looking. Click **Cancel
> Preview** to return to where you are.

### Restore an earlier state

While previewing, click **Restore Here** to make that historical state your
**current** one. ForkBuild will ask you to confirm, because this replaces your
present edits.

This is invaluable when an experiment goes wrong — just travel back to the last
good moment and restore it.

## What's next?

Ready to share what you've made, or remix someone else's work? Continue to
**[Publishing & Forking](04-PublishingAndForking.md)**.
