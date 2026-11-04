# Releasing iFixPDF

A release is two commands, with a review in between:

```
pnpm release           # pick version and OSes, then it commits, tags and pushes
pnpm release:publish   # after the build: checks the draft, then publishes it
```

Run both in your own terminal on `main`; they ask questions, so they need a real terminal (Claude Code's `!` prefix has none).

## One-time setup

GitHub Environment `release` with the signing secrets and the tag ruleset; see "Signing secrets" in [IMPLEMENTATION.md](IMPLEMENTATION.md). A tag run stops at the `secrets` job until they exist.

## 1. Release notes (optional)

Without notes of your own, the release writes them from the `feat`/`fix` commits since the last tag (**New** and **Fixed** items), so write those commit subjects for users.

To write them yourself, add `## Unreleased` at the top of `CHANGELOG.md` (no need to commit it). Write for users rather than developers:

- A one-sentence summary, then an optional `### Featured: <title>` with a short paragraph and a three-step **How to use it** list naming buttons as they appear in the app.
- Then 3–6 items, each labeled **New**, **Improved** or **Fixed**, with a bold short title and one or two sentences. No nested bullets.
- Say "you"; no file names, code, hashes, library names or jargon; skip behind-the-scenes work.

## 2. `pnpm release`

On `main` with a clean tree (a `CHANGELOG.md` edit is fine). It shows the current version, the last release's notes, the `feat`/`fix` commits since the last tag and the next release's notes, then asks:

1. **Which version?** patch, minor or major.
2. **Which OS?** Windows, macOS, Linux (space toggles). It starts with the last release's choice.
3. **Release?** a final yes.

It then writes the notes into `CHANGELOG.md` as `## vX.Y.Z — Month YYYY`, saves the OS choice as `releasePlatforms` in `package.json`, bumps `package.json`, `Cargo.toml` and `Cargo.lock`, commits `chore(release): vX.Y.Z`, creates the tag `vX.Y.Z` with the notes as its description, and pushes `main` and the tag together (`git push --atomic`). If the push fails, the commit and tag stay local; fix the cause and run the command it prints.

`pnpm release X.Y.Z` skips the questions and keeps the saved OS choice.

## 3. The build on GitHub

The push starts the Release workflow (Actions tab). It builds only the chosen OSes.

1. Approve the `release` environment twice: first the `secrets` job, then the build (one review covers every OS).
2. Wait for the `verify` job. Its run summary says **Ready to publish** once `latest.json` lists every chosen OS, or names what is missing; then re-run the failed build job and `verify`.

The tag must be on `main`, or the run stops.

## 4. Try it (optional)

Open the draft under Releases, download the installer for your computer, install it and open it. Settings → About shows the new version. The "unknown publisher" warning is expected for these GitHub installers; the release notes explain it.

## 5. `pnpm release:publish`

Checks that the draft exists and its `latest.json` covers the OSes chosen for that tag, asks you to confirm, publishes it as the latest release, then reads the public update feed to confirm it offers the new version. Pass a tag to publish an older draft: `pnpm release:publish v0.1.2`.

If the release includes Windows, it then asks whether to also submit it to the Microsoft Store (default No). Yes starts the `Store` workflow (see "Microsoft Store" below); if that fails to start, the release stays published and the command prints the `gh workflow run` line to retry.

Without the command: Releases → the draft → Edit → keep **Set as the latest release** → **Publish release**.

## 6. Test the update (next release)

Keep the published version installed. After the next release is published, press **Check for updates** in it and confirm it updates. Record the result in [VERIFICATION.md](VERIFICATION.md).

## Microsoft Store (pending verification)

The Store gets the Windows MSIX (`iFixPDF_<X.Y.Z>.0_x64.msix`), which the Release run keeps as a workflow artifact named `msix` for 90 days. It is never attached to the GitHub release. The app assumes WebView2 is present, as on current Windows 10 and 11.

One-time setup:

1. In Partner Center → Account settings → User management → Microsoft Entra applications, link an Entra ID app with the Manager role.
2. Add `MSSTORE_TENANT_ID`, `MSSTORE_SELLER_ID`, `MSSTORE_CLIENT_ID` and `MSSTORE_CLIENT_SECRET` as secrets of the `release` environment.
3. First submission by hand: download the `msix` artifact from the tag's Release run. In Partner Center → iFixPDF → Start submission, upload it and fill in the listing, privacy policy URL (`https://ifixpdf.ronmrcdo.dev/privacy`), age rating and price. Declare that the app collects no data, matching that page and the EULA's privacy text. Set Publish options to "as soon as it passes certification". Partner Center asks for a justification for the restricted capability `runFullTrust`: "desktop app packaged as MSIX; needs full trust to run".
4. Before the first Store release, run the Release workflow from Actions (dry run) and confirm the `msix` artifact exists and its steps are green.

After that, answer Yes in step 5. The `Store` workflow (`store.yml`) finds that tag's Release run, checks the package version, then runs `msstore publish`, which commits the submission to certification. Approve the `release` environment when GitHub asks. It goes live once Microsoft certifies it; track it in Partner Center. To resubmit from Actions, pick the tag under "Use workflow from" and enter the same tag; only tags created after this change contain `store.yml`.

## Releasing for some OSes only

Untick an OS in step 2. The release then has no installer and no update entry for it, and the release notes leave it out.

Users already on an OS you left out are affected: **Check for updates** shows an error for them, because the latest release has nothing for their OS, and the Releases page's latest release has no download for them. Both recover when a later release includes their OS again. Leave an OS out only before anyone uses it, or for a short while.
