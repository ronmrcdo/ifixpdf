---
name: iFixPDF
description: Three desktop-style browser prototypes for a Windows PDF workspace.
colors:
  brand-blue: "#3465A7"
  brand-fold: "#BED2EE"
  brand-paper: "#FFFFFF"
  brand-wordmark: "#253245"
  editor-accent: "#3465a7"
  editor-accent-hover: "#28568f"
  editor-ink: "#252a32"
  editor-muted: "#5c6878"
  editor-ground: "#eef1f4"
  editor-surface: "#ffffff"
  editor-line: "#e6e9ed"
  editor-frame-line: "#e0e4e9"
  editor-preview: "#e8edf3"
  editor-hover: "#e8ecf1"
  editor-source-selected: "#edf3fb"
  editor-source-selected-line: "#b8cde8"
  editor-nav-selected: "#dfe5ec"
  editor-field-line: "#d9dfe6"
  editor-toast: "#27313f"
  editor-workflow: "#f9fbfd"
  editor-page-card: "#f4f7fb"
  editor-step-complete: "#4d7560"
  editor-page-selected: "#d9e6f8"
  editor-page-selected-line: "#81a1cc"
  editor-selection-bar: "#f4f7fc"
  editor-progress-track: "#e2e8f1"
  library-accent: "#286449"
  library-ink: "#26362f"
  library-muted: "#627269"
  library-ground: "#f7f9f7"
  library-surface: "#fff"
  library-line: "#e0e7e1"
  library-hover: "#eaf0eb"
  library-soft: "#eef3ef"
  library-cover-green: "#e9eeeb"
  library-tree: "#f4f6f4"
  library-tree-selected: "#e3ebe5"
  library-card-hover: "#f0f5f1"
  desk-accent: "#dfb075"
  desk-ink: "#e4e5e7"
  desk-muted: "#a2a6ac"
  desk-ground: "#1b1d20"
  desk-surface: "#22252a"
  desk-line: "#35383f"
  desk-hover: "#32363c"
  desk-soft: "#2b2e34"
  desk-accent-ink: "#27221c"
  desk-rail-selected: "#383126"
  desk-row-selected: "#30343b"
  desk-row-hover: "#292c32"
  desk-preview: "#30343a"
  desk-title: "#202226"
  desk-toolbar: "#282b30"
  desk-tabs: "#1c1e22"
  desk-list: "#202328"
  desk-search: "#25282e"
  desk-search-line: "#3a3e46"
  desk-open: "#454a53"
  desk-open-hover: "#454a53"
typography:
  brand-wordmark:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "64px"
    fontWeight: 600
    letterSpacing: "-1.5px"
  brand-titlebar:
    fontFamily: "IBM Plex Sans, Segoe UI, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.35px"
  editor-headline:
    fontFamily: "IBM Plex Sans, Segoe UI, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.6px"
  library-headline:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.3px"
  desk-headline:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  document-title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  label:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
rounded:
  brand-tile: "10px"
  keycap: "3px"
  badge: "4px"
  control: "5px"
  cover: "6px"
  source: "7px"
  band: "8px"
  workspace: "12px"
spacing:
  tight: "4px"
  control-gap: "8px"
  compact: "12px"
  regular: "16px"
  section: "24px"
  broad: "32px"
components:
  brand-mark:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.brand-paper}"
    rounded: "{rounded.brand-tile}"
    size: "48px"
  brand-titlebar:
    typography: "{typography.brand-titlebar}"
    size: "24px"
  brand-alternate-titlebar:
    size: "22px"
  brand-wordmark:
    textColor: "{colors.brand-wordmark}"
    typography: "{typography.brand-wordmark}"
    width: "380px"
    height: "96px"
  editor-primary:
    backgroundColor: "{colors.editor-accent}"
    textColor: "{colors.editor-surface}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  editor-primary-hover:
    backgroundColor: "{colors.editor-accent-hover}"
  library-primary:
    backgroundColor: "{colors.library-accent}"
    textColor: "{colors.library-surface}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  desk-primary:
    backgroundColor: "{colors.desk-accent}"
    textColor: "{colors.desk-accent-ink}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  library-search:
    backgroundColor: "{colors.library-surface}"
    textColor: "{colors.library-ink}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  desk-row:
    backgroundColor: "transparent"
    textColor: "{colors.desk-ink}"
    padding: "12px 13px"
  desk-row-selected:
    backgroundColor: "{colors.desk-row-selected}"
  library-cover:
    backgroundColor: "{colors.library-cover-green}"
    rounded: "{rounded.keycap}"
    padding: "11px 19px 0"
    height: "219px"
  editor-workflow:
    backgroundColor: "{colors.editor-workflow}"
    height: "56px"
    padding: "0 24px"
  editor-page-card:
    backgroundColor: "{colors.editor-page-card}"
    rounded: "{rounded.control}"
    padding: "5px"
  editor-workspace:
    backgroundColor: "{colors.editor-surface}"
    rounded: "{rounded.workspace}"
---

# Design System: iFixPDF

## Overview

**Creative North Star: “A document assembly desk.”** This descriptive metaphor comes from the supplied direction contract. iFixPDF keeps document content visible while the user chooses, orders, and exports PDFs. Its three implemented concepts explore distinct ways to enter that workflow; they do not constitute one interchangeable palette.

The preferred original editor remains a blue-grey framed sheet with a source pane, central PDF canvas, and output inspector. Its matching Home uses a flat recent-PDF list inside the same shell, with compact Merge PDFs and Merge selected actions. Library is a green Explorer-style browser with title, menu, command, and address bars above a navigation tree and recent-document thumbnails. Desk is a charcoal and amber workbench with title and menu bars, a toolbar, document tabs, and docked list and preview panes. Carry shared typography and interaction conventions between concepts while keeping each concept's composition and colors coherent.

**Key Characteristics:**

- Real document previews provide the imagery.
- Self-hosted IBM Plex Sans and Lucide line icons supply a consistent vocabulary.
- Flat surfaces, restrained rounding, and tonal selection establish hierarchy.
- Compact desktop controls have explicit keyboard focus and reduced-motion behavior.

This records browser prototypes and a Tauri 2 + Rust shell scaffold. The Windows shell has not been compiled or tested; native printing, filesystem integration, and installer behavior are outside this visual specification.

## Colors

The frontmatter is normative. Token prefixes identify the concept; never resolve an editor control through a Library or Desk accent by accident.

### Primary

- **Editor muted blue:** primary save actions, active tab rules, focus outlines, and drag outlines. The deeper hover token belongs only to the editor.
- **Library forest green:** import actions, selected tree icons, links, pins, and keyboard focus.
- **Desk warm amber:** import action, active rail icon, and focus. Its button text uses the dark accent-ink token.

### Neutral

- **Editor:** white workspace and paper sit inside a blue-grey frame. The preview has its own cooler ground. Selected source rows combine a pale blue fill with a visible blue-grey border; selected navigation uses a separate neutral fill.
- **Library:** an almost-white green ground, white command and content surfaces, a quiet green-grey tree, and a pale selected tree row. Every document cover uses the same green-grey backplate; browser tiles gain a subtle hover fill.
- **Desk:** charcoal title and menu chrome, darker tabs and list, a lighter docked preview, pale text, cool grey secondary labels, and tonal selected rows. The active rail uses a separate brown ground; the search and open-preview control have their own neutral fills.

**The Concept Boundary Rule.** Each concept owns its accent, text, ground, line, hover, and selection roles. There is no global blue/green/amber priority order.

## Typography

**Display and body font:** IBM Plex Sans, self-hosted through bundled Fontsource Latin files at weights 400, 500, and 600. Segoe UI is the first fallback. The editor also specifies Arial before the generic sans-serif fallback. There is no separate display or monospace family; even shortcut keycaps inherit the interface font.

### Hierarchy

- **Editor headline:** use `editor-headline`; it reduces to (18px) at the (760px) breakpoint.
- **Library headline:** use `library-headline`; it reduces to (17px) at (760px) and (16px) at (520px).
- **Desk headline:** use `desk-headline` for the docked list title; it remains (13px) across widths.
- **Body:** use `body` for ordinary controls and Home descriptions. Secondary labels and metadata generally use `label`.
- **Document titles:** Library tiles use (12px), reducing to (11px) at (520px). Desk rows use (12px), reduce to (11px) at (760px), then return to (12px) on the single-list mobile layout. Desktop chrome uses (12px), with secondary metadata and status text at (11px).

Do not assume an inherited line-height token: body line-height is not globally declared. Explanatory text sets local values such as (1.5), (1.6), or (1.7). Final editor overrides use (12px) filenames at weight (500) on desktop, (11px) metadata, (12px) field labels and controls where specified, and real first-page source thumbnails instead of the earlier PDF silhouette. Source/output panel headings are (14px); filenames reduce to (11px) at (1000px).

## Layout

**Editor:** a viewport-height shell has a (190px) navigation column, (48px) titlebar, and (28px) statusbar. The white framed workspace retains its rounded border, with an (86px) header and (43px) toolbar. Editing columns are (266px / minmax(260px, 1fr) / 260px). At (1500px), source/output panes grow to (284px / 280px). At (1200px), navigation narrows to (168px) and editing columns become (238px / minmax(220px, 1fr) / 235px). At (1000px), navigation is a (65px) icon rail, with (215px / minmax(220px, 1fr) / 228px) editing columns. At (760px), the source pane is (190px) and the output inspector toggles as a dedicated panel. At (520px), a (48px) navigation rail surrounds a single editing column with a (170px) source area above the preview; source items remain a vertical list. The default preview fits the whole page to available space rather than enforcing the earlier paper-width cap. Its footer provides a bounded page-number input and previous/next controls; the current source name disappears below (1000px).

**Merge stages:** the same frame now contains an ordered four-step task strip: Add PDFs → Arrange & review → Save PDF → Done. It is (56px) high with (24px) side padding; height becomes (50px) at (760px) and (59px) at (520px), where markers stack above labels. The Add stage uses a flexible two-column layout with a dashed drop area and short instructions; below (760px), it stacks and hides the instruction column. Save keeps the document and inspector in context. Completion fills the available workspace with a centered file summary and compact follow-up actions. These are task stages, not new navigation or a new visual world. User-facing labels say Merge; legacy `combine` route, state, and CSS keys remain implementation details.

**Preview and Edit PDF:** Preview is a dedicated read-only surface filling the workspace width, with no source pane or output inspector. Its preview toolbar is (44px) high; document-stage padding is (18px 35px 20px), reducing at (760px) and (520px). Read-only page browsing uses auto-fill columns between (145px) and (185px) with (23px) gaps; phones use two equal columns with (14px) gaps. Edit PDF retains the page editor but hides the source pane: flexible preview plus a (260px) output inspector, growing to (280px) above (1500px), reducing to (235px) below (1200px), and switching to a separate output panel below (760px). Keep these two screen roles distinct inside the shared frame.

**Original Home:** the same white workspace contains two small toolbar actions (Merge PDFs and Merge selected), a recent-document heading, and flat divided rows. The view uses (25px) padding, reducing to (20px) at (760px) and (18px 13px) at (520px). Rows are at least (88px) high, with first-page thumbnails, filename, page/size metadata, last-opened date, a selection checkbox, a quiet Open action, and a More actions button. Selected rows use a pale blue fill; Merge selected enables when documents are checked and shows the selection count. Date, Open action, and thumbnails are hidden on phones; the filename, checkbox, and More actions remain accessible.

**Shared desktop shell:** both Home concepts fill (100dvh), have a minimum height of (620px), and hide shell overflow while document panes scroll independently. A (34px) titlebar, (28px) menu bar, and (29px) bottom statusbar frame the workspace. Titlebar controls use compact rectangular hit areas. These are browser-rendered desktop controls; window actions call Tauri only when its runtime exists.

**Library:** a (48px) command bar and (50px) address/search row precede a flexible body with a (190px) tree and scrolling content. Content has (22px 25px) padding. Thumbnail columns auto-fill between (180px) and (200px), with (24px 19px) gaps; covers are (219px) high. Above (1600px), tile columns range from (190px) to (215px). At (1000px) the tree becomes (160px), at (760px) (135px), and at (520px) an icon-only (43px) rail. At the narrow breakpoint the command bar is (42px), address bar (43px), thumbnails use two columns, and covers are (157px) high. Details mode remains a compact file browser row.

**Desk:** a (40px) toolbar and (34px) document-tab strip lead into a (42px / 325px / flexible) docked body. Above (1600px), the list grows to (350px). At (1000px) the rail/list become (38px / 285px), and at (760px) (36px / 245px). At (520px), the preview disappears and the list fills the space beside the (36px) rail; selecting a document opens the editor. The list title is (43px) high, its column header is (29px), and its rows are at least (66px). Preview chrome has a (35px) heading; paper is capped at (460px), growing to (510px) above (1600px). The document tabs reduce to (32px) on narrow screens.

Spacing is deliberate but not a rigid global scale: preserve component-specific measurements rather than rounding every dimension to the frontmatter's recurring spacing steps.

## Elevation & Depth

Surfaces are flat. Borders, changes in tone, document edges, and selected fills create depth. Paper and cover tiles have no shadow. Transient notifications, open menu popovers, and modal dialogs use shadows: editor toast (`0 6px 24px #17223126`), Home notice (`0 5px 20px #0002`), desktop menu (`0 6px 18px #0002`), recent-file menu (`0 6px 18px #17223126`), and document dialog (`0 12px 40px #17223133`). These exact values are carried in the sidecar, not promoted to general card elevation.

**The Flat Surface Rule.** Resting panes, navigation, cards, paper, and fields stay flat; transient notifications, open menu popovers, and modal dialogs receive shadows.

## Shapes

Desktop commands and Library tiles use (4px) corners; cover backplates, tree-menu summaries, Desk rail controls, and Desk search use (3px) corners. Desktop menu popovers use the control radius. Source selections use the source radius. The original workspace uses the larger workspace radius and reduces to the band radius at (520px). Badges and keycaps are slightly tighter. Workbench document tabs and Desk list rows keep square edges. The active workbench tab has a (2px) accent top rule. Document canvases remain rectangular. The source-add target uses a dashed border rather than a decorative container.

## Components

### Brand identity

The iFixPDF mark is a white folded F on a solid brand-blue tile. Its master SVG uses a (48 × 48) viewBox and the brand-tile radius; the pale brand-fold triangle distinguishes the folded top corner. Use `public/brand/ifixpdf-mark.svg` directly, without recoloring, shadows, gradients, or animation. This shared identity stays blue across all three concepts while their interface accents remain separate.

The original titlebar pairs the mark at (24px) with live iFixPDF text using `brand-titlebar` and an (8px) gap. Alternate Library and Desk titlebars use the mark at (22px). Preserve these compact proportions at narrow widths. The standalone `public/brand/ifixpdf-logo.svg` lockup uses the `brand-wordmark` typography and embeds the IBM Plex Sans (600) WOFF2 font so the exported asset retains its letterforms without an external font request; its mark is (80px) inside the (380 × 96) artwork.

The favicon uses the same mark. Raster exports in `public/brand/` cover (32px), (128px), (256px), and (512px); the Tauri bundle references `src-tauri/icons/icon.png` and `src-tauri/icons/icon.ico`. Keep the installer icon and browser identity aligned with the master mark. These assets do not establish native Windows installer verification.

**The Fixed Identity Rule.** Preserve the folded F geometry, solid blue tile, pale fold, and iFixPDF spelling across concepts; scale the supplied artwork proportionally and keep it static.

### Buttons

The editor's standard button is at least (32px) high, with a (7px 10px) inset and (8px) icon gap. Its primary button uses the editor accent and a weight request of (550). Library's main action is at least (38px) high; Desk changes its fill, text, inset, and weight to (500). Home primary hover applies `brightness(.91)`; it is not a distinct green or amber token. Editor secondary buttons retain a white fill and quiet border.

Buttons scale to (.98) while pressed. Editor hover transitions run for (120ms), with transform using `cubic-bezier(.23,1,.32,1)`; Home background and text transitions run for (120ms). Reduced-motion mode disables animation and transitions. Preserve feedback without adding spring motion.

### Inputs / Fields

Editor fields are white, outlined, and gently rounded; output inputs and selects use (10px) padding and (12px) text. Custom page ranges persist across rendering and show inline invalid-state borders and help. A compact quality note replaces the single-option quality selector; the export summary reports the actual selected page count. Library search wraps an icon and borderless input in a bordered surface. Desk gives that wrapper a darker fill and line, a minimum height of (43px), and (11px 12px) padding. Select menus remain compact and visually subordinate.

Keyboard focus uses an accent outline (2px), offset by (3px) in the editor and (4px) on Home controls and links. Preserve a visible focus treatment when composing or wrapping controls.

### Navigation and desktop chrome

Editor navigation retains its full-width tonal selected row and collapses to icons at the documented breakpoint. Print Jobs and the This Session / Project Pack navigation block have been removed. Library uses a navigation tree with selected green-grey rows, an address breadcrumb, and command buttons for open, merge, pinned documents, and view mode. Desk uses an icon rail plus document tabs with an amber active top rule. Both Home concepts include File, View, and Help menus; dropdowns expose commands and shortcuts, with hover fill and a bordered popover. The fixed bottom statusbar shows document count, local workspace, concept switching, and prototype status as space permits. It is utility chrome, not a website footer.

### Cards / Containers

Library file-browser tiles have a subtle hover fill and compact metadata below a uniformly colored cover. The “Open PDF” overlay reveals over (150ms) on cover hover or keyboard focus, with (7px) padding in this composition. Selected pins retain accent text on soft fill. Do not surround the file browser with another card.

Desk rows use square edges, a (66px) minimum height, a bottom divider, filename, metadata, and timestamp. A persistent selected fill remains distinct from unselected hover. The independent preview pane holds a first-page canvas and compact open/remove commands. List and preview scrolling remain inside the fixed shell.

### Guided merge and draggable pages

The ordered step strip distinguishes the current step with an editor-blue circular marker and completed steps with a quiet green check. Unavailable steps remain readable but disabled. The Add screen uses the existing frame, restrained dashed border, and file picker/drop target; previous-draft recovery remains a small contextual action. The Save stage highlights the inspector with a near-white fill and concise instruction. Done shows the actual output name, page count, and size, then Open, Download again, a new merge, or return to the document. Its message confirms a download request rather than filesystem completion; draft recovery now persists locally in IndexedDB and restores the workspace on a normal return. The statusbar reports local draft saving. Keep recovery language scoped to this browser origin/device, without implying a native file save or cross-device sync. Add and Save expose explicit workflow-preview actions; demo Done carries a “Demo preview” badge and states that no download occurred.

Pages uses an auto-fill grid with a minimum column width of (135px) and (16px) gaps. Each flat page card contains a cached image of its rendered PDF page, current sequence number, source filename, a selection checkbox, and earlier/later controls. Retain keyed cards, thumbnail images, scroll position, and focus when moving pages; reorder within the current grid instead of recreating the editor. The card has a (5px) inset and radius, a grab cursor, and half opacity during dragging. A (3px) editor-blue insertion mark sits just before or after the prospective destination; keep it separate from the selected-card fill and (1px) outline. Selection belongs to the outer card; the preview button’s pressed state has a transparent fill and border. Do not restore the superseded selected-button blue fill. Keyboard focus uses a (2px) blue outline with (1px) offset on the thumbnail. Preserve Alt+Left/Right and explicit earlier/later buttons as drag alternatives, disabling moves beyond the first/last page. Source-page spans and export summaries must describe the current page sequence after individual moves, including non-contiguous source positions.

### Editing selection and history

Undo/redo are compact icon controls beside the Document/Pages tabs: (30px) wide, at least (28px) high, with (15px) icons and disabled opacity (.3). Preserve Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y. Checkboxes support multiple selected page cards; the selection toolbar includes select-all/partial state and batch delete, duplicate, and extract actions. It spans the grid, sticks at top (-1px), uses a (41px) minimum height, (7px 9px) padding, and control-radius corners. At (760px) it becomes non-sticky; at (520px), the selection label takes a full row and actions share the next row. Page checkboxes sit inside small pale backplates at the top-left of each card. Delete receives a restrained red hover state, while selection remains blue.

Printing remains a manual action that opens the PDF viewer. There is no Print Jobs surface or simulated queue in the current UI.

### Read-only Preview and Edit PDF

Preview exposes Open PDF, Print PDF, and Edit PDF in its header, with Document/Pages browsing, zoom, fit, and page navigation. Its footer labels the document “Read-only.” Thumbnail buttons open pages and use quiet hover fills; they have no drag handles, checkboxes, batch actions, rotation, history controls, or output form. Print PDF is hidden at the compact breakpoint. The empty state invites opening a PDF and explains that page changes belong in Edit PDF.

Edit PDF is a separate sidebar destination. It reuses page selection, reorder, duplicate/delete/extract, rotation, and undo/redo, while omitting the source-file pane and Merge workflow strip. The inspector and primary export action say “Save edited PDF,” with an edited-document summary. Preserve current document state when switching between Preview and Edit; reading must not mutate page content or sequence.

### Recent-file actions and document dialogs

Right-clicking a Home row or activating its More actions button opens the same menu: View PDF, Edit PDF, Merge PDFs, and Add password. Merge uses the clicked document together with checked rows, deduplicated; a single document opens Merge ready for another PDF. The fixed menu stays inside the viewport, has a (205px) minimum width, (5px) padding and radius, and compact (12px) commands. Arrow keys, Home, and End move menu focus; Escape restores focus to the trigger, and outside click, Tab, or resize dismisses it.

Password and Split PDF share a native modal dialog: width `min(440px, calc(100vw - 32px))`, a viewport-bounded scrolling body, (24px) padding, (8px) corners, and a muted backdrop. Heading text is (18px) at weight (600), helper text (11px), and inline errors (12px). Cancel, close, and completion restore focus to the originating control. Processing disables the primary action and replaces its label; completion confirms a download request and keeps the original document unchanged.

Add password requires matching password and confirmation fields with at least eight characters (the password field allows up to 64). A Show passwords checkbox toggles visibility. Save protected copy downloads an AES-256 encrypted PDF with a protected filename suffix; the password is never persisted. Failure stays in the dialog with an inline error. Protected output is a downloaded copy, not a replacement for the recent file or workspace draft.

Split PDF appears in Edit PDF above page selection tools. Page ranges use comma-separated parts (for example, `1-3, 4-6`); Every page creates one part per current page. A live text preview reports the number of PDFs and included pages. Malformed, out-of-bounds, reversed, or overlapping ranges show inline errors. Split & download ZIP exports numbered PDF parts in one ZIP from the current page order, preserving current rotation and leaving the workspace unchanged.

### Document workspace

The editor connects ordered source rows to the combined page preview. Source cards use real first-page thumbnails (35px × 48px), a filename, page-count metadata and page spans, with compact reorder/remove tools below. Thumbnail dimensions reduce at narrower breakpoints and disappear on phones. Preserve bordered blue selection, separate file selection and reorder actions, fit-whole-page preview, and a bounded page-number input in the footer. A current-source label anchors the preview on wider screens. Selected page thumbnails use a distinct fill and border. Custom ranges accept comma-separated pages and ranges, retain input state, and drive the export summary; the quality note states that source page content is preserved. Lucide icons normally render at (17px) with stroke width (1.65) in the editor and (18px) with stroke width (1.6) on Home; smaller metadata icons use local sizing. Empty states use the same line-icon vocabulary and concise guidance.

## Do's and Don'ts

### Do:

- **Do** select a concept before selecting colors or composition.
- **Do** preserve the preferred original framed-sheet world, its matching flat-list Home, real source thumbnails, final metadata sizes, and mobile source-list behavior.
- **Do** use bundled IBM Plex Sans, Lucide SVGs, real document previews, and visible keyboard focus.
- **Do** preserve reduced-motion preferences and separate hover from selected states.
- **Do** keep the browser prototype and unverified native shell status explicit in product claims.

### Don't:

- **Don't** turn the three accents into one shared palette or imply the Home screens have the editor's three-pane composition.
- **Don't** introduce promotional hero bands, website navigation, decorative stock imagery, gradients, nested cards, or resting surface shadows.
- **Don't** treat the earlier Segoe UI direction note as the final font choice.
- **Don't** imply native Windows print completion when opening a PDF viewer.
