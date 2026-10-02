## Context

In the reference video the editor is a dark screen with a row per slot ("Other pieces", "Tops", "Bottoms", "Shoes"); the user swipes each row, taps Save, and the avatar re-renders wearing the new combination within a few seconds. Outfit detail has a Regenerate button. The user chose AI try-on on their own photo, with their own provider key. Depends on `add-closet` and `add-profile-onboarding`.

## Goals / Non-Goals

**Goals:**
- Building an outfit feels instant; the paid, slow render never blocks editing or saving.
- A render shows the user's real pieces recognisably (colour, pattern, cut), on a recognisable version of the user.
- The provider can be swapped without touching feature code.

**Non-Goals:**
- Photorealistic fit accuracy (how a size actually sits on the body).
- Video or multiple poses.
- Rendering on the device.

## Decisions

### Outfit record
`outfits` (name, notes, favourite flag, seasons, occasions, current collage, current render) and `outfit_items` (outfit, item, slot, order). Slots come from the closet taxonomy. Rules: a full-body piece replaces top and bottom; shoes and bag hold one piece each; outer layer, tops and accessories may hold several, which covers layering and the "+ Add" control in the video.

### Editor as slot carousels
One snapping horizontal carousel per slot, centred item is the selection, with a "none" position and a hide control. Rows are virtualised and show thumbnails. Each row can be narrowed with a filter (colour, season) and a shuffle button picks a random compatible combination. The editor works on a draft, so leaving without saving changes nothing.

### Collage first, render after
On every change the app composes a flat collage from the cutouts locally (instant, free). Saving stores the outfit with its collage immediately and queues a render. The Outfits grid shows the render when one exists and the collage otherwise, so an outfit is never without an image.

### Image provider: multi-image generative model
Default provider is Google's Gemini image generation model, which accepts several reference images and an instruction. Each request sends two images: the base avatar and a single "outfit sheet" (the cutouts laid out and labelled by slot, composed locally), plus a prompt built from the profile hints (gender, body type) and item descriptions. Sending one sheet instead of many separate images keeps requests within any provider's image limit and makes the prompt provider-independent.
Alternative: a dedicated virtual try-on model (for example FASHN via fal.ai). These preserve garment detail well but dress one garment per request, so a four-piece outfit needs four chained requests, with cost and quality loss at each step. Kept as a second implementation behind the same interface, and compared in a trial task before the default is fixed.
The model id is a setting, so a newer model can be adopted without a code change.

### Studio avatar
An optional one-time request turns the avatar photo into a base image: same person, neutral standing pose, plain light background, simple fitted base clothing. Using this as the base for every render gives a consistent grid like the reference app and avoids the original outfit bleeding through. The user sees the result and accepts it or keeps the original photo as base.

### Render lifecycle
Renders are rows with state (queued, running, done, failed), the provider used and a fingerprint of the inputs (base avatar version plus sorted item ids). A queue runs one render at a time. If an outfit with the same fingerprint already has a render, it is reused instead of paying again. Regenerate always makes a new request and keeps the previous render until the new one succeeds; the user can step back to the previous one.
Results are saved at a fixed portrait size with a thumbnail.

### Failure handling
Timeouts, rate limits, refusals (providers may decline swimwear or underwear) and network errors all end in the failed state with a specific message and a retry action; the collage stays in place. No automatic retry loops, because each attempt costs money.

### Usage tracking
Every provider request is logged with date and kind. Settings shows counts for the current month and in total. No price is shown because prices vary by provider and change.

### Item removal
Archiving an item keeps it in existing outfits, marked as archived. Deleting an item used in outfits asks for confirmation naming the number of outfits affected, then removes it from those outfits; their renders are kept but marked as outdated.

## Risks / Trade-offs

- [Generative models alter the face or body] → Studio avatar accepted by the user; prompt requires identity to be preserved; Regenerate; the trial task compares providers on this point.
- [Garment details drift (pattern, logo, length)] → Outfit sheet at high resolution with one piece per cell; item descriptions in the prompt; dedicated try-on provider available as alternative.
- [Renders take 10 to 30 seconds] → Never block; show collage and a progress state; local notification is not needed since the user is in the app.
- [Cost surprises] → One render per save, fingerprint reuse, no automatic retries, visible usage counter.
- [Body photo leaves the device] → Only on render; stated on first use with a one-time confirmation.
- [Provider changes or withdraws a model] → Model id is a setting; provider interface with two implementations.

## Open Questions

- Which provider is the default is settled by the trial task at the start of implementation. Both sit behind the same interface, so specs and tasks do not change.
