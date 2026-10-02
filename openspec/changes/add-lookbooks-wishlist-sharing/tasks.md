## 1. Lookbooks

- [ ] 1.1 Add lookbooks and lookbook-outfits tables with migrations and a repository (create, rename, delete, add, remove, reorder, cover); verify repository unit tests including that deleting a lookbook keeps its outfits
- [ ] 1.2 Add the lookbooks row with an "Add lookbook" control at the top of the Outfits section; verify a component test for empty and filled states
- [ ] 1.3 Build the lookbook screen with grid, drag to reorder, set cover, rename and delete; verify component tests
- [ ] 1.4 Add "add to lookbook" on outfit detail and as a multi-select action in the outfits grid; verify component tests for one and several outfits
- [ ] 1.5 Include lookbooks in backup export and import; verify a round-trip unit test

## 2. Wishlist

- [ ] 2.1 Add the wishlist ownership state and make the ownership filter a required repository parameter defaulting to owned; verify unit tests that every existing closet query excludes wishlist items
- [ ] 2.2 Add the Closet and Wishlist tabs sharing the grid component; verify component tests for both tabs and the empty wishlist
- [ ] 2.3 Make photo and link import save to the wishlist when started from the Wishlist tab; verify a component test
- [ ] 2.4 Add the wishlist count and price total with the missing-price note; verify unit tests
- [ ] 2.5 Add "I bought it" with price confirmation and purchase date; verify a repository unit test and a component test
- [ ] 2.6 Add the wishlist toggle and badges to the outfit editor, and the badge on outfits containing wishlist items; verify component tests

## 3. Sharing

- [ ] 3.1 Build the share composer producing portrait, story and square images from render or collage, with optional item strip; verify snapshot tests for each format
- [ ] 3.2 Build the share options sheet and connect it to the system share sheet; verify on device by sharing to Messages
- [ ] 3.3 Add save to the photo library with the permission explanation and denied state; verify on device
- [ ] 3.4 Build the lookbook contact sheet composer with paging for large lookbooks; verify snapshot tests for five and thirty outfits

## 4. Wrap-up

- [ ] 4.1 Add all new strings in English and Czech; verify the missing-key check passes
- [ ] 4.2 Walk through every scenario in the `lookbooks`, `wishlist` and `outfit-sharing` specs on device and record the result in the pull request
