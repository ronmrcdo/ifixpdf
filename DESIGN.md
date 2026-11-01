---
name: "iFixPDF"
description: "A light desktop PDF workspace with a quiet frame, visible documents and clear tools."
colors:
  brand: "#111827"
  brand-hover: "#1f2937"
  brand-blue: "#3465a7"
  brand-fold: "#9CA3AF"
  paper: "#ffffff"
  ink: "#24272c"
  muted: "#64696f"
  faint: "#9299a3"
  line: "#e6e7e9"
  control-line: "#d9dce0"
  strong-line: "#c4c7cb"
  frame: "#fafafb"
  hover: "#f4f5f6"
  canvas: "#f0f1f3"
  inspector: "#fbfbfc"
  action: "#3465a7"
  action-hover: "#28568f"
  nav-selected: "#e9eaed"
  cover-selected: "#e7effa"
  cover-selected-line: "#5280bd"
  page-selected: "#dfe9f6"
  page-selected-line: "#83a5ce"
  danger: "#ad3935"
  danger-soft: "#faeae9"
  success: "#517964"
  close: "#c42b1c"
  toast: "#292e36"
typography:
  headline:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.65px"
  headline-compact:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 600
  headline-phone:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 600
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  section-title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.2px"
  empty-title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  dialog-title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 500
  completion-title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "23px"
    fontWeight: 500
  document-title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  label:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  brand-titlebar:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.4px"
rounded:
  keycap: "3px"
  badge: "4px"
  control: "6px"
  search: "7px"
  cover: "8px"
  dialog: "10px"
spacing:
  tight: "4px"
  control-gap: "8px"
  compact: "12px"
  regular: "16px"
  section: "24px"
  broad: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "34px"
  search:
    backgroundColor: "{colors.frame}"
    rounded: "{rounded.search}"
    padding: "0 12px"
    height: "38px"
  navigation-selected:
    backgroundColor: "{colors.nav-selected}"
    rounded: "{rounded.control}"
    padding: "10px 2px"
    height: "62px"
  document-cover:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.cover}"
    height: "282px"
  page-selected:
    backgroundColor: "{colors.page-selected}"
    rounded: "{rounded.control}"
    padding: "5px"
  count-badge:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted}"
    rounded: "{rounded.badge}"
    padding: "2px 6px"
---

# Design System: iFixPDF

## Overview

**Creative North Star: "A clear document workspace"**

iFixPDF uses a continuous white working surface, a narrow task rail and a quiet desktop frame. Real PDF pages carry the visual weight; blue primary action buttons and restrained blue selection make the next step legible. The accepted direction replaces the former blue-grey framed-sheet composition across Home, Merge, Preview, Edit and Settings.

The folded-F logo and iFixPDF name remain fixed. This specification describes the browser interface, not verified native Windows behavior.

**Key Characteristics:**

- Real PDF previews provide the imagery.
- Self-hosted IBM Plex Sans and Lucide line icons provide the shared vocabulary.
- Continuous surfaces, fine dividers and tonal selections organize the workspace.
- Compact controls expose visible focus and respect reduced motion.

## Colors

The frontmatter is normative. Each value is a CSS variable in `src/styles/tokens.css`: colours as `--<name>` (brand blue shares `--accent`), type sizes as `--text-<role>` (dropping any `-title` suffix), and corners as `--radius-<name>`. Style rules use the variables, not literal values; a new value is added to the frontmatter and `tokens.css` together.

Primary actions use **brand navy** (`--brand`) with white labels and a lighter navy hover, matching the landing page. **Brand blue** belongs to active icons, tab rules, focus and drag cues. Selection pairs pale blue backgrounds with visible blue borders; selected navigation is neutral with a blue icon. **Danger red** marks destructive actions and invalid range feedback.

White paper and workspace sit beside an **almost-white frame** and inspector. A **soft neutral canvas** supports PDF pages and document covers. Fine neutral lines separate regions without enclosing the whole application in a rounded sheet. Ink and muted text remain distinct. Fields and secondary buttons take the slightly darker **control line**; checkboxes, scrollbars and dashed drop targets the **strong line**. **Hover** is a pale neutral on white; **faint** marks grips and checkbox hover. **Success green** marks completed steps and the ready dot; the titlebar Close button uses the Windows **close** red on hover.

**The Action and Selection Rule.** Use brand navy for primary actions and the mark; use blue for keyboard focus and selected-state cues.

## Typography

IBM Plex Sans is self-hosted at weights (400), (500) and (600), with Segoe UI and sans-serif fallbacks. Use the frontmatter roles for titles, document names, controls and metadata. The main title is compact rather than promotional; section headings sit only slightly above the body scale. Line icons generally use (17px) geometry and a (1.7px) stroke, with local smaller utility sizes.

Headlines reduce to (21px) below (760px), then use (22px) below (520px). Most metadata stays at (11px). Filenames truncate in rows and tiles. Preserve local explanatory line heights rather than assuming a global body line-height.

## Layout

The viewport-height shell uses an (86px) task rail, (44px) titlebar and (26px) statusbar. The working surface fills the remaining space. Its header has a (103px) minimum height and (24px 32px) padding. The shell has a (600px) minimum height and internal scrolling.

Home is the approved list layout: Merge PDFs and Merge selected above divided recent rows, each with a selection checkbox, a (54 × 65px) cover of the actual first page on the canvas grey, name and metadata, date, Open and More. Home padding is (26px 32px). The approved gallery, search, sorting and detail inspector are not implemented; adding them is product work, not restyling.

Merge uses source / preview / save columns of (238px / flexible / 268px); Edit omits the source column and uses flexible preview plus the same save inspector. Preview is read-only and fills the workspace without an output inspector. Merge retains Add PDFs → Arrange & review → Save PDF → Done, with a compact task strip rather than a new shell. The page organizer supports selection, drag/keyboard ordering and persistent thumbnail nodes. Settings uses plain divided sections in one column.

Above (1600px), the editor uses (255px / flexible / 290px). At (1200px), editor columns narrow to (205px / flexible / 238px). At (960px), the rail narrows to (72px) and editing columns become (185px / flexible / 215px); Edit uses a (225px) save inspector. At (760px), the rail is (64px), the editor hides its save inspector behind the panel switch, and Settings stacks. At (520px), a (40px) titlebar and (58px) bottom navigation replace the side rail/statusbar; Home rows drop the cover, date and Open, Merge sources scroll horizontally above the preview, and the page organizer uses two columns with wrapping compact guidance and reserves (70px) for its two-row selection toolbar. Its Split control has a (34px) minimum height. The phone shell minimum height is (560px).

**The Continuous Surface Rule.** Keep the preferred workspace continuous and white; use dividers and local tonal grounds to separate task regions.

## Elevation & Depth

Surface tone, fine borders and document edges create hierarchy. Paper and document covers have no shadow. Menus and notifications use (`0 6px 22px #1d253222`); document dialogs use (`0 12px 40px #17223133`) with a dimmed backdrop. Do not promote these transient effects to resting surfaces.

**The Transient Depth Rule.** Keep resting panes and document covers flat; reserve shadows for menus, dialogs and notifications.

## Shapes

Controls are gently rounded; document covers are slightly softer and dialogs slightly larger, as recorded in the frontmatter. PDF paper remains rectangular. Task tabs use square edges and a slim blue active rule. Selection outlines hug the existing cover or page card. Dashed outlines belong to file-drop targets. The workspace itself has no enclosing rounded frame.

## Components

### Brand identity

Use `public/brand/ifixpdf-mark.svg` directly. The shared (48 × 48) master mark has a white folded F, navy tile and grey fold, shared with the landing page. The titlebar displays it at (24px), reducing to (22px) on phones. The standalone SVG lockup embeds IBM Plex Sans (600); PNG and ICO exports support browser and Tauri identity. Keep those assets aligned without treating them as evidence of a verified installer.

**The Fixed Identity Rule.** Preserve the supplied folded F, navy tile, grey fold and iFixPDF spelling; scale artwork proportionally and keep it static.

### Buttons and fields

Primary buttons use brand navy; secondary buttons are white with a quiet border; utilities remain transparent. Standard buttons have a (34px) minimum height, with local (36–38px) actions. Hover changes tone, press scales to (.98), and disabled controls use (.38) opacity. Field focus uses a blue (2px) outline with a (3px) offset. Search is an almost-white icon/input wrapper; its focus-within outline has a (2px) offset. Output fields are compact and show inline invalid-state feedback. Segmented controls use a neutral track with a white active item.

### Navigation

Stack icon and short label in the task rail. Selected navigation uses a neutral fill, darker text and blue icon. The compact bottom navigation preserves the same task identities. Titlebar window controls remain rectangular; their actions depend on the Tauri runtime. Preserve accessible names when responsive controls display icons alone.

### Recent documents

A neutral cover contains the actual first PDF page. Checkboxes and More controls remain visible. A selected row takes the pale blue cover-selected fill. The empty state uses concise text and a restrained line icon.

### Page organizer and save workflow

Selected pages use the dedicated pale fill and blue outline. The white selection toolbar stays within the neutral canvas. Preserve keyed thumbnail identity during reordering. Preview remains read-only; Edit owns mutations and its save settings. Save/Done must distinguish a real download from an explicitly labeled demonstration. Notifications enter with a small (5px) translation over (160ms); ordinary control feedback uses (120ms) transitions and `cubic-bezier(.23,1,.32,1)`. Reduced-motion mode removes animations and transitions.

## Do's and Don'ts

### Do:

- Do keep real document content visible and filenames readable.
- Do preserve keyboard focus, explicit selection states and the distinction between read-only Preview and editable pages.
- Do let document panes scroll independently and expose the save inspector through its compact-window control.

### Don't:

- Don't restore the old blue-grey outer sheet, broad navigation column or rounded workspace frame.
- Don't turn every primary action blue or apply the alternative concepts’ palettes to the preferred interface.
- Don't add shadows to resting panes or use decorative imagery in place of real PDF previews.
- Don't describe compression, updates, browser downloads or desktop-like chrome as verified native capabilities.

### Version display

The current package version appears at the right end of the bottom status bar in muted 11px tabular text, separated from the draft status. It does not appear in the sidebar. At 520px and below, it moves to a 22px status footer beneath the five-item navigation. Settings reads the same version metadata.
