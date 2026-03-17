# 🌱 Growing Opportunities Page

This module powers the **Growing Opportunities** page, which curates real-world diversification ideas, funding programs, and resilience strategies for Riverland growers. It is deliberately content-focused: rather than heavy calculations, it presents structured, sourced information with a clean modal UX.

---

## 🏗 Architecture Overview

- `GrowingOpportunitiesComponent` (`src/app/modules/growing-opportunities/growing-opportunities.component.ts`)
- Template: `growing-opportunities.component.html`
- Styles: `growing-opportunities.component.css`
- Framework: Angular Standalone Component using `CommonModule` and `LucideAngularModule`.
- State: Simple in-component state (no services, no backend calls).

The page is designed as:

- A **grid of opportunity cards**.
- A **detail modal** that opens when a card is clicked.
- A strong emphasis on **sources and disclaimers** (funding, programs, research).

---

## 📚 Data Model

### `Opportunity` Interface

Each item shown on the page is an `Opportunity`:

- `id`: Unique identifier string for the opportunity.
- `title`: Card and modal title (e.g. "Olives: A Lower-Water Option for Riverland").
- `description`: Short teaser text shown on the card.
- `fullDescription`: Expanded paragraph used in the modal.
- `keyPoints: string[]`: Bullet points that summarise the opportunity.
- `tags: string[]`: Labels such as `olives`, `funding`, `precision-irrigation`.
- `source`: Human-readable source name (PIRSA, Wine Australia, etc.).
- `sourceUrl`: External URL opened from the modal.

### `opportunities` Array

The component declares a hard-coded `Opportunity[]` that acts as a curated knowledge base:

- **Olives: A Lower-Water Option for Riverland**
  - Drought-tolerant alternative to wine grapes.
  - 30–40% lower water use than grapes.
  - Salinity tolerance and mechanised harvest potential.
- **Government Funding to Support Diversification**
  - Grants up to $50,000 for crop transition.
  - Support for business planning and market research.
  - Vine removal rebates via CCW.
- **Alternative Varieties & Premium Markets**
  - Mediterranean varieties (Nero d’Avola, Fiano, Vermentino).
  - Better adapted to warming climate and heat stress.
  - Higher value markets than bulk Shiraz.
- **Almonds & Precision Irrigation for Drought Resilience**
  - Precision irrigation research led by SARDI and SA Drought Hub.
  - 15–20% water savings without yield loss in trials.
- **Multi-Crop Strategies Amid Oversupply**
  - Combining crops (e.g. citrus + grapes + oil crops).
  - Diversified income streams and improved income stability.

This list is intentionally **static** in the MVP. All text and URLs live directly in the component file, making it easy to update content without touching services or APIs.

---

## 🧠 Component State & Behaviour

### Core Fields

- `selectedOpportunity: Opportunity | null`
  - `null` when no modal is open.
  - Set to a specific `Opportunity` when a card is clicked.

### Methods

- `openOpportunity(opportunity: Opportunity)`:
  - Sets `selectedOpportunity` to the chosen item.
  - Adds `scroll-lock` class to `document.body` to prevent background scrolling.
- `closeOpportunity()`:
  - Sets `selectedOpportunity` back to `null`.
  - Removes `scroll-lock` from `document.body`.

### Icon Handling

The component imports a small set of Lucide icons and exposes them as fields:

- `SproutIcon`, `ChevronRightIcon`, `XIcon`, `ExternalLinkIcon`

These are bound from the template to drive card icons, chevrons, close buttons, and external link icons.

---

## 🖥 Template Layout & UX

### 1. Page Header

- Displays:
  - Sprout icon.
  - Title: **"Growing Opportunities"**.
  - Subtitle: **"Explore diversification options and support programs for Riverland growers"**.
- Purely presentational; there is no logic attached to the header.

### 2. Opportunities Grid

- `opportunities-grid` renders five cards manually, each wired to the corresponding `opportunities[index]`.
- Each card includes:
  - `card-title`: Opportunity title.
  - `card-description`: Truncated summary text (using CSS line clamping).
  - `card-tags`: Tag chips (keywords like `olives`, `grants`, `risk-management`).
  - Right-side chevron icon that animates slightly on hover.
- Clicking a card calls `openOpportunity(opportunities[i])`, which opens the modal.

### 3. Modal Overlay

The modal is shown only when `selectedOpportunity` is set:

- `*ngIf="selectedOpportunity"` on the overlay container.
- Clicking the **overlay** (outside modal content) will close the modal.
  - Uses `(click)="closeOpportunity()"` on the overlay.
  - Stops propagation on the inner container so clicks on the content do not close it.
- Close button at top-right:
  - Circular icon button using `XIcon`.
  - Calls `closeOpportunity()` on click.

Inside the modal:

- Title: `selectedOpportunity.title`.
- Paragraph: `selectedOpportunity.fullDescription`.
- **Key Points**:
  - `*ngFor` over `selectedOpportunity.keyPoints`.
  - Styled list with custom bullet marker using CSS `::before`.
- **Tags**:
  - `*ngFor` over `selectedOpportunity.tags`.
  - Same tag styling as the cards for consistency.
- **Source Section**:
  - Shows `selectedOpportunity.source`.
  - `sourceUrl` bound to an `<a>` tag with `target="_blank"`.
  - External link icon from Lucide to reinforce that it opens an external site.
- **Disclaimer Block**:
  - Text emphasising that content is educational.
  - Encourages growers to validate with official sources and advisors.

---

## 🎨 Styling & Responsiveness

Key CSS elements in `growing-opportunities.component.css`:

- `.opportunities-grid`:
  - 2-column layout on desktop.
  - Switches to 1-column at `max-width: 1024px`.
- `.opportunity-card`:
  - Card with subtle shadow and border.
  - Hover state increases box shadow and changes border color to primary green.
  - Chevon icon shifts slightly with a transform on hover.
- `.tag`:
  - Rounded pill for tags in both cards and modal.
  - Uses global color variables for consistency.
- `.modal-overlay` / `.modal-container`:
  - Fixed-position overlay with backdrop blur and centred modal.
  - `slideUp` animation on modal entry.
  - `max-height: 90vh` with `overflow-y: auto` to handle long content.
- `.modal-disclaimer`:
  - Beige background with green left border.
  - Used to visually separate the disclaimer from the main content.

Mobile-specific adjustments:

- Reduced padding in modal at small breakpoints.
- Title font-size scaled down.
- Header layout stacks vertically.

---

## 🔧 Extending the Growing Opportunities Page

### Add a New Opportunity

1. Open `growing-opportunities.component.ts`.
2. Add a new object to the `opportunities` array:
   - Provide `id`, `title`, `description`, `fullDescription`.
   - Fill `keyPoints` and `tags` with concise, user-facing bullets.
   - Set `source` and `sourceUrl` to credible references.
3. Update the template if you want an explicit card for the new index:
   - Copy one of the existing `<div class="opportunity-card">` blocks.
   - Adjust the title, text, tags, and `(click)="openOpportunity(opportunities[n])"`.

> For a more dynamic design in future, the grid could be generated via `*ngFor` over the `opportunities` array instead of manually referencing indices.

### Adjust Modal Behaviour

- To disable background scroll lock:
  - Remove `document.body.classList.add('scroll-lock')` and its corresponding removal call.
  - Or adapt to a more Angular-friendly approach by tying the scroll-lock to a body class managed by a higher-level layout component.

### Theming

- All colors and spacing rely on shared CSS variables (e.g. `--primary-green`, `--gray-600`, `--radius-lg`).
- To retheme:
  - Update the global variables in `src/styles.css`.
  - The Growing Opportunities page will automatically adopt new theme values.

---

## 📂 File Reference

- `growing-opportunities.component.ts`: Data model, opportunities list, modal state, and icon wiring.
- `growing-opportunities.component.html`: Header, cards grid, and modal markup.
- `growing-opportunities.component.css`: Card layout, modal styling, typography, and responsive rules.

