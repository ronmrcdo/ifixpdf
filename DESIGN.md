---
name: iFixPDF
description: A desktop-style browser prototype for a Windows PDF workspace.
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

**Creative North Star: “A document assembly desk.”** This descriptive metaphor comes from the supplied direction contract. iFixPDF keeps document content visible while the user chooses, orders, and exports PDFs. The preferred original editor remains a blue-grey framed sheet with a source pane, central PDF canvas, and output inspector. Its matching Home uses a flat recent-PDF list inside the same shell, with compact Merge PDFs and Merge selected actions.

**Key Characteristics:**

- Real document previews provide the imagery.
- Self-hosted IBM Plex Sans and Lucide line icons supply a consistent vocabulary.
- Flat surfaces, restrained rounding, and tonal selection establish hierarchy.
- Compact desktop controls have explicit keyboard focus and reduced-motion behavior.

This records browser prototypes and a Tauri 2 + Rust shell scaffold. The Windows shell has not been compiled or tested; native printing, filesystem integration, and installer behavior are outside this visual specification.

## Colors

The frontmatter is normative.

### Primary

- **Editor muted blue:** primary save actions, active tab rules, focus outlines, and drag outlines. The deeper hover token belongs only to the editor.

### Neutral

- **Editor:** white workspace and paper sit inside a blue-grey frame. The preview has its own cooler ground. Selected source rows combine a pale blue fill with a visible blue-grey border; selected navigation uses a separate neutral fill.

## Typography

**Display and body font:** IBM Plex Sans, self-hosted through bundled Fontsource Latin files at weights 400, 500, and 600. Segoe UI is the first fallback. The editor also specifies Arial before the generic sans-serif fallback. There is no separate display or monospace family; even shortcut keycaps inherit the interface font.

### Hierarchy

- **Editor headline:** use `editor-headline`; it reduces to (18px) at the (760px) breakpoint.
- **Body:** use `body` for ordinary controls and Home descriptions. Secondary labels and metadata generally use `label`.
- **Document titles:** Desktop chrome uses (12px), with secondary metadata and status text at (11px).

Do not assume an inherited line-height token: body line-height is not globally declared. Explanatory text sets local values such as (1.5), (1.6), or (1.7). Final editor overrides use (12px) filenames at weight (500) on desktop, (11px) metadata, (12px) field labels and controls where specified, and real first-page source thumbnails instead of the earlier PDF silhouette. Source/output panel headings are (14px); filenames reduce to (11px) at (1000px).

## Layout

**Editor:** a viewport-height shell has a (190px) navigation column, (48px) titlebar, and (28px) statusbar. The white framed workspace retains its rounded border, with an (86px) header and (43px) toolbar. Editing columns are (266px / minmax(260px, 1fr) / 260px). At (1500px), source/output panes grow to (284px / 280px). At (1200px), navigation narrows to (168px) and editing columns become (238px / minmax(220px, 1fr) / 235px). At (1000px), navigation is a (65px) icon rail, with (215px / minmax(220px, 1fr) / 228px) editing columns. At (760px), the source pane is (190px) and the output inspector toggles as a dedicated panel. Two further breakpoints, (1150px) and (960px), are kept from the earlier build for the shell, editor and Merge layouts, so the full set is (1500), (1200), (1150), (1000), (960), (760) and (520px). At (520px), a (48px) navigation rail surrounds a single editing column with a (170px) source area above the preview; source items remain a vertical list. The default preview fits the whole page to available space rather than enforcing the earlier paper-width cap. Its footer provides a bounded page-number input and previous/next controls; the current source name disappears below (1000px).

**Merge stages:** the same frame now contains an ordered four-step task strip: Add PDFs → Arrange & review → Save PDF → Done. It is (56px) high with (24px) side padding; height becomes (50px) at (760px) and (59px) at (520px), where markers stack above labels. The Add stage uses a flexible two-column layout with a dashed drop area and short instructions; below (760px), it stacks and hides the instruction column. Save keeps the document and inspector in context. Completion fills the available workspace with a centered file summary and compact follow-up actions. These are task stages, not new navigation or a new visual world. User-facing labels say Merge; the `combine` route and CSS keys remain implementation details.

**Preview and Edit PDF:** Preview is a dedicated read-only surface filling the workspace width, with no source pane or output inspector. Its preview toolbar is (44px) high; document-stage padding is (18px 35px 20px), reducing at (760px) and (520px). Read-only page browsing uses auto-fill columns between (145px) and (185px) with (23px) gaps; phones use two equal columns with (14px) gaps. Edit PDF retains the page editor but hides the source pane: flexible preview plus a (260px) output inspector, growing to (280px) above (1500px), reducing to (235px) below (1200px), and switching to a separate output panel below (760px). Keep these two screen roles distinct inside the shared frame.

**Original Home:** the same white workspace contains two small toolbar actions (Merge PDFs and Merge selected), a recent-document heading, and flat divided rows. The view uses (25px) padding, reducing to (20px) at (760px) and (18px 13px) at (520px). Rows are at least (88px) high, with first-page thumbnails, filename, page/size metadata, last-opened date, a selection checkbox, a quiet Open action, and a More actions button. Selected rows use a pale blue fill; Merge selected enables when documents are checked and shows the selection count. Date, Open action, and thumbnails are hidden on phones; the filename, checkbox, and More actions remain accessible.

**Shared desktop shell:** Home fills (100dvh), has a minimum height of (620px), and hide shell overflow while document panes scroll independently. A (34px) titlebar, (28px) menu bar, and (29px) bottom statusbar frame the workspace. Titlebar controls use compact rectangular hit areas. These are browser-rendered desktop controls; window actions call Tauri only when its runtime exists.

Spacing is deliberate but not a rigid global scale: preserve component-specific measurements rather than rounding every dimension to the frontmatter's recurring spacing steps.

## Elevation & Depth

Surfaces are flat. Borders, changes in tone, document edges, and selected fills create depth. Paper has no shadow. Transient notifications, open menu popovers, and modal dialogs use shadows: editor toast (`0 6px 24px #17223126`), Home notice (`0 5px 20px #0002`), desktop menu (`0 6px 18px #0002`), recent-file menu (`0 6px 18px #17223126`), and document dialog (`0 12px 40px #17223133`). These exact values are carried in the sidecar, not promoted to general card elevation.

**The Flat Surface Rule.** Resting panes, navigation, cards, paper, and fields stay flat; transient notifications, open menu popovers, and modal dialogs receive shadows.

## Shapes

Desktop commands use (4px) corners. Desktop menu popovers use the control radius. Source selections use the source radius. The original workspace uses the larger workspace radius and reduces to the band radius at (520px). Badges and keycaps are slightly tighter. The active tab has a (2px) accent top rule. Document canvases remain rectangular. The source-add target uses a dashed border rather than a decorative container.

## Components

### Brand identity

The iFixPDF mark is a white folded F on a solid brand-blue tile. Its master SVG uses a (48 × 48) viewBox and the brand-tile radius; the pale brand-fold triangle distinguishes the folded top corner. Use `public/brand/ifixpdf-mark.svg` directly, without recoloring, shadows, gradients, or animation. This shared identity stays blue across all three concepts while their interface accents remain separate.

The original titlebar pairs the mark at (24px) with live iFixPDF text using `brand-titlebar` and an (8px) gap. Preserve these compact proportions at narrow widths. The standalone `public/brand/ifixpdf-logo.svg` lockup uses the `brand-wordmark` typography and embeds the IBM Plex Sans (600) WOFF2 font so the exported asset retains its letterforms without an external font request; its mark is (80px) inside the (380 × 96) artwork.

The favicon uses the same mark. Raster exports in `public/brand/` cover (32px), (128px), (256px), and (512px); the Tauri bundle references `src-tauri/icons/icon.png` and `src-tauri/icons/icon.ico`. Keep the installer icon and browser identity aligned with the master mark. These assets do not establish native Windows installer verification.

**The Fixed Identity Rule.** Preserve the folded F geometry, solid blue tile, pale fold, and iFixPDF spelling; scale the supplied artwork proportionally and keep it static.

### Buttons

The editor's standard button is at least (32px) high, with a (7px 10px) inset and (8px) icon gap. Its primary button uses the editor accent and a weight request of (550). Home primary hover applies `brightness(.91)`; it is not a distinct green or amber token. Editor secondary buttons retain a white fill and quiet border.

Buttons scale to (.98) while pressed. Editor hover transitions run for (120ms), with transform using `cubic-bezier(.23,1,.32,1)`; Home background and text transitions run for (120ms). Reduced-motion mode disables animation and transitions. Preserve feedback without adding spring motion.

### Inputs / Fields

Editor fields are white, outlined, and gently rounded; output inputs and selects use (10px) padding and (12px) text. Custom page ranges persist across rendering and show inline invalid-state borders and help. A compact quality note replaces the single-option quality selector; the export summary reports the actual selected page count. Select menus remain compact and visually subordinate.

Keyboard focus uses an accent outline (2px), offset by (3px) in the editor and (4px) on Home controls and links. Preserve a visible focus treatment when composing or wrapping controls.

### Navigation and desktop chrome

Editor navigation retains its full-width tonal selected row and collapses to icons at the documented breakpoint. Print Jobs and the This Session / Project Pack navigation block have been removed. Home includes File, View, and Help menus; dropdowns expose commands and shortcuts, with hover fill and a bordered popover. The fixed bottom statusbar shows document count, local workspace and prototype status as space permits. It is utility chrome, not a website footer.

### Cards / Containers

The editor source cards, page cards and Home rows are the only card surfaces; do not nest them in another card.

### Guided merge and draggable pages

The ordered step strip distinguishes the current step with an editor-blue circular marker and completed steps with a quiet green check. Unavailable steps remain readable but disabled. The Add screen uses the existing frame, restrained dashed border, and file picker/drop target. The Save stage highlights the inspector with a near-white fill and concise instruction. Done shows the actual output name, page count, and size, then Open, a new merge, or return to the document. Its message confirms the save request rather than filesystem completion. The Merge workspace is never persisted; only the Preview/Edit document draft is restored on a normal return, scoped to this browser origin/device without implying a native file save or cross-device sync.

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

- **Do** preserve the preferred original framed-sheet world, its matching flat-list Home, real source thumbnails, final metadata sizes, and mobile source-list behavior.
- **Do** use bundled IBM Plex Sans, Lucide SVGs, real document previews, and visible keyboard focus.
- **Do** preserve reduced-motion preferences and separate hover from selected states.
- **Do** keep the browser prototype and unverified native shell status explicit in product claims.

### Don't:

- **Don't** imply the Home screen has the editor's three-pane composition.
- **Don't** introduce promotional hero bands, website navigation, decorative stock imagery, gradients, nested cards, or resting surface shadows.
- **Don't** treat the earlier Segoe UI direction note as the final font choice.
- **Don't** imply native Windows print completion when opening a PDF viewer.
