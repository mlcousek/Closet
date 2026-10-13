# Repeatable provider validation

This protocol has not been run against live providers. Automated response fixtures are in src/ai/**tests**/modelCheck.test.ts and the tagging and outfit provider tests. Metadata checks establish access and advertised capabilities; actual generation establishes compatibility and quality.

## Freeze the inputs

Choose one consenting user's full-body avatar and six owned garments: a neutral T-shirt, a hoodie, a patterned shirt, trousers, a jacket and shoes. Keep the same source photos, reviewed category/subcategory tags, warmth values, item names and avatar for every model. Record photo filenames and SHA-256 hashes privately with the results; do not put photos or keys in this repository.

Use the same English language, profile hints and prompts for all models. Disable automatic rendering while preparing the outfits. Use these fixed cases:

| Case               | Input                                                                            | Assess                                                          |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tagging: base      | T-shirt photo                                                                    | Correct tops/tshirt tags, dominant colour, no invented brand    |
| Tagging: mid-layer | Hoodie photo                                                                     | Correct tops/hoodie tags and reasonable warmth                  |
| Tagging: pattern   | Patterned shirt photo                                                            | Pattern retained in the name; valid taxonomy values             |
| Try-on: simple     | Avatar + T-shirt + trousers + shoes                                              | Same person, all garments, full body                            |
| Try-on: layers     | Same avatar + T-shirt position 0 + hoodie position 1 + jacket + trousers + shoes | All layers retained, correct order, jacket separate             |
| Try-on: details    | Same avatar + patterned shirt + trousers + shoes                                 | Pattern, colour and cut preserved                               |
| Stylist            | Same six-item catalogue, mild day, casual occasion                               | Only real item IDs, wearable combination, valid layer positions |

## Compare models

1. Save the provider key in Settings and use Check model. Record the exact model ID, date, result and provider account/tier without recording the key. Exclude an explicitly unavailable or unsupported model. An unconfirmed capability requires testing the actual feature.
2. For each eligible model, run every applicable case three times with unchanged inputs. Paid requests need the API-key owner's authorization. Choose Regenerate explicitly for later image runs, since the app normally reuses an existing picture.
3. Record completion time, success/failure reason and the resulting tags, stylist pieces or image. Keep earlier image results privately before later regeneration replaces them; the app only retains the latest two pictures for a set of pieces.
4. Score each applicable criterion as pass/fail. Report counts across all three runs and retain representative failures. A layer hidden in the generated picture fails visual fidelity even when the saved outfit correctly tracks it.
5. Check provider usage/billing separately. The app counts answered requests; timeouts or lost connections may still have been billed without appearing in its counts.

Do not choose a default from metadata alone. Record actual results before recommending a model change.
