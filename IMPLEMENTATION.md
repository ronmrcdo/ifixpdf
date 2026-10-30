# iFixPDF implementation plan

Updated 29 October 2026. This is the production roadmap; unchecked items are planned, not shipped. Start from the preferred `/index.html` desktop interface. The existing Tauri 2 + Rust crate is a shell scaffold; Windows builds and installers remain unverified.

## Scope and preserved behavior

Ship Home, Merge PDFs, read-only Preview PDF, Edit PDF, and Settings. Keep the iFixPDF folded-F identity and existing desktop layout. Home opens documents in Preview; Edit owns page mutations and Save edited PDF. Merge owns multi-source assembly and its Add → Arrange → Save → Done workflow. Print Jobs and This Session / Project Pack were removed by the user. Manual printing through a PDF viewer may remain. A virtual printer is outside the current release scope.

Working browser features: unlocked PDF import, real PDF.js previews, file/page reorder, rotation, multi-selection, duplicate/delete/extract, session undo/redo, IndexedDB drafts/recents, Home context menus, password-protected copy export, and range/every-page split to ZIP.

## Milestone 1 — Native Windows baseline

- [ ] Build and launch the existing app on Windows with Rust, C++ Build Tools and WebView2 prerequisites.
- [ ] Freeze app identity before public distribution. Current identifier is `com.ifixpdf.desktop`, Rust crate is `ifixpdf`, displayed product is iFixPDF. Do not change it after the first distributed build.
- [ ] Add native open/save dialogs and scoped filesystem commands. Pass document IDs across IPC; resolve allowed paths in Rust. Perform PDF work off the UI thread and save atomically.
- [ ] Replace prototype byte storage with a versioned local document repository and native draft storage. Preserve recents/drafts during upgrades; handle moved files with Locate / Remove from recents.
- [ ] Verify DPI scaling, keyboard navigation, high contrast, screen readers, worker CSP and window controls.

Completion: a Windows NSIS installation opens, previews, edits and saves actual PDFs with originals preserved, and restores its workspace after restart.

## Milestone 2 — Export compression

The user proposed compression within Save edited PDF and Save merged PDF. Compression has not been implemented. Keep the existing original-quality export working while developing this feature.

- [ ] Provide Original quality (default), Balanced, and Smallest file in the save inspector. Offer the same export options in Edit and Merge, with no output inspector in read-only Preview.
- [ ] Evaluate an optimization engine against scanned and text PDFs before selecting it. Check licensing, Windows distribution size, image recompression, searchable text, vectors, forms, annotations, accessibility, and cancellation.
- [ ] Treat document-structure optimization and image downsampling separately. The current pdf-lib export does not provide a full image-optimization pipeline.
- [ ] Calculate the generated output size before download/save; show actual size and reduction against the equivalent uncompressed export, never a fabricated estimate. Report when compression offers no reduction.
- [ ] Explain the quality tradeoff and offer a preview. Keep the original source files and any usable smaller original-quality result available.

Completion: valid outputs demonstrate measurable reduction on suitable scanned fixtures, retain expected document features, and handle already-optimized PDFs without misleading size claims. Test each preset, errors and cancellation.

## Milestone 3 — Installed-PC updates (required before public release)

Use Tauri 2 updater with the existing NSIS distribution target. Proposed hosting is GitHub Releases with a static HTTPS manifest; the owner/repository and public endpoint are still undecided. Tauri supports static manifests or an update server, requires update signatures, and can generate updater artifacts with `bundle.createUpdaterArtifacts`. Store the public verification key in app configuration and the private signing material in protected release secrets. Follow the current [official updater guide](https://v2.tauri.app/plugin/updater/) when wiring dependencies, Rust initialization and capabilities.

**Status (29 October 2026, Linux, no Windows):** updater plugin `2.14.0` (npm + Rust, pinned) is registered in `src-tauri/src/main.rs` with only `updater:allow-check/download/install`. `tauri.conf.json` ships `plugins.updater` with an empty `pubkey`/`endpoints`, so unconfigured builds report "not configured" instead of failing, and its `version` now reads `../package.json`. Settings → Updates (`src/updates.js`) implements every state below plus draft flush and export deferral; updates are manual only (owner's decision): there is no launch check, so the app contacts the network only when the user presses Check for updates, which keeps the EULA privacy statement true, and passes `pnpm check:updates` against a mocked Tauri bridge. Nothing has been compiled, signed or installed on Windows; every item below stays unchecked until it has.

Release builds supply the real values as a merge patch, never in source:

    TAURI_SIGNING_PRIVATE_KEY=… TAURI_SIGNING_PRIVATE_KEY_PASSWORD=… \
    pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":true},"plugins":{"updater":{"pubkey":"<public key>","endpoints":["<https manifest URL>"]}}}'

`createUpdaterArtifacts` is kept out of the base config because it makes every local `tauri build` require the signing key.

- [ ] Add updater bindings/plugin initialization and only the required main-window permissions. Configure a real HTTPS endpoint and public key; keep development builds explicit about unavailable release configuration.
- [ ] Add Settings → Updates: installed version, Check for updates, release notes, Download update, progress, and Restart and install. Include checking, current, available, downloading, ready, offline/error and retry states. Background checks should be quiet when no action is needed.
- [ ] Persist the workspace before installation. Defer restart while exports or other document operations are active, and recover cleanly if saving the draft fails. Do not restart merely because a check found an update.
- [ ] Establish version consistency across Tauri, Cargo and npm metadata. Configure a Windows CI build that produces the installer, signature and manifest; upload artifacts before publishing the manifest/release that points to them.
- [ ] Keep signing material out of source, frontend assets, logs and distributed archives. Document backup/recovery ownership. Update signatures and Windows publisher code signing serve separate purposes; assess Windows signing for distribution using the [official guide](https://v2.tauri.app/distribute/sign/windows/).
- [ ] Provide a manual installer download path. An installation without updater support needs a manual upgrade to a version that contains it.

Completion requires a real Windows upgrade from version N to N+1 through the app: correct signature accepted, tampered/wrong-signature update rejected, offline check recoverable, no-update state correct, download failure retryable, restart deferred during export, and recents/drafts/settings retained. Verify the chosen per-user or per-machine installation mode and its elevation behavior. Mocked UI progress alone does not satisfy this milestone.

### Release inputs still needed

Repository/release hosting, update endpoint, release owner, supported Windows versions/architectures, installation scope, signing-secret ownership, and Windows publisher-signing choice. Prepare code and local fixtures before asking for decisions that block production release; never substitute invented production values or secrets.

## Milestone 4 — Release readiness

- [ ] Exercise a representative PDF corpus: fonts, rotations, mixed sizes, forms, annotations, outlines, encryption and large scans. Review the prototype encryption library before production adoption.
- [ ] Test install → launch → upgrade → uninstall on Windows. Confirm application data lifecycle, file associations if added, installer icon and executable icon.
- [ ] Test real save errors, unavailable destinations, low disk space, large inputs, corrupted PDFs and canceled operations.
- [ ] Add focused Rust/unit/integration checks and document real Windows evidence. Retain browser checks for the existing editing behaviors.
- [ ] Publish installation, update and recovery instructions with accurate support boundaries.

Completion: installation and signed update checks pass on supported Windows targets, PDFs remain valid, and the release documentation distinguishes measured results from pending work.
