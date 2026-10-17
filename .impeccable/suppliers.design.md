# Supplier directory extension

## Overview

This is a focused record of the implemented `/calculadora/proveedores` extension. It inherits [the incumbent design system](../DESIGN.md), including its theme variables, system typography, warm neutral surfaces, compact controls, and dark primary actions. It adds no global visual identity or token scale. Functional behavior and persistence are documented in [docs/proveedores.md](../docs/proveedores.md).

The directory supports recurring repurchases: supplier identity, complete private notes, and the two distinct destinations needed to find a seller or revisit a product. CSSBuy provides an explicit entry point through **Guardar vendedor**; it does not populate the directory automatically.

## Colors

Use the existing foreground/background pair for primary actions and the current local navigation destination. Emerald identifies favorite stars, success notices, and the CSSBuy seller action. Filters use the existing subtle surface; fields use the elevated surface and understated borders.

Supplier search and editor placeholders use the existing muted foreground at full opacity. Preserve this local treatment and its minimum text contrast of 4.5:1; do not introduce a new global placeholder color.

## Typography

Keep the incumbent page heading and section title hierarchy. Supplier names use section-title emphasis; type/category, contact, notes, and destination links use compact body text. Notes preserve line breaks and remain fully visible. Long names, contact details, and notes wrap within the available width.

## Layout

The directory uses the shared centered shell, with a maximum width of 80rem and bottom clearance for mobile navigation. Local Calculadora / Mis proveedores navigation precedes the heading and add action. The heading and actions wrap naturally.

Search, type, and category filters share one subtle panel, with the favorites checkbox below. The filter grid starts as one column, becomes two columns at 640px, and gives search twice the width of either selector at 1024px. Results are simple divided rows. At 1024px, edit/delete actions sit beside the row; below that they follow its content. Favorite controls and destination links retain comfortable touch targets.

Creation and editing replace the list with a full-page form capped at 56rem. Identity fields form two columns from 640px; separate link fields and multiline notes follow in normal reading order. Save and cancel remain at the end of the form in normal document flow. This extension does not inherit the inventory editor's persistent bottom save bar.

## Elevation & Depth

Use the incumbent borders and tonal layering. The filter panel, divided result rows, and bordered final action group organize the work without adding a new card or shadow vocabulary.

## Components

**Local navigation.** Two wrapping links identify Calculadora and Mis proveedores. The current link uses the dark foreground surface and page-background text, carries `aria-current="page"`, and remains distinct from the global navigation. Both links expose keyboard focus.

**Directory rows.** Favorite stars precede the name and type/category. Contact and full notes appear next, followed by independently labeled **Abrir tienda** and **Ver producto de referencia** links when present. Editing is visible; deletion uses a secondary icon action with a supplier-specific accessible label and confirmation. Favorites sort first, then names; pagination shows 12 results per page. Search, type, category, and favorites combine, and changing them returns to the first page. Counts, filtered-empty state, and an explicit filter reset explain the current result set.

**Supplier editor.** Three fieldsets separate identity/contact/favorite, repurchase links, and private notes. Only the name is required. The store/catalog link represents the seller; the reference link represents a product and may come from CSSBuy. Keep their labels and helper copy separate. Notes accept multiple lines and show a character counter. Focus moves to the name on opening. Saving disables editing and exposes progress; validation or server failures keep the entered form and notes visible with an alert. Cancel and navigation protect unsaved changes.

**Access and feedback.** Reuse the shared administration access notice. Loading, empty, filtered-empty, success, and failure feedback remain explicit. If access expires during editing, the alert offers renewal in another tab so the supplier form can be retried with its data intact. Supplier records use private persistent storage; the interface does not imply device-only storage.

**CSSBuy entry point.** Guardar vendedor opens an editable draft with seller name and product reference only. A matching saved name or normalized reference opens the existing record. The user still reviews and saves explicitly; the product URL must not be presented as the supplier's store URL.

## Do's and Don'ts

- Do preserve complete visible notes and separate seller/product destinations across mobile and desktop layouts.
- Do reuse the existing theme variables, UI primitives, shared access, and keyboard focus patterns.
- Do keep the supplier form's final actions in normal flow and retain entered notes after failures.
- Don't replace the established dark primary action with an emerald primary action.
- Don't turn result rows into a new visual world or promote these local layout decisions into global rules.
- Don't automatically import or save sellers while synchronizing CSSBuy.

Implementation sources: `src/app/calculadora/proveedores/page.tsx`, `src/components/calculadora/CalculatorNavigation.tsx`, and the source-order seller link in `src/app/page.tsx`. Reviewed captures: `review/suppliers-list-1365.png`, `review/suppliers-list-390.png`, `review/suppliers-editor-1365.png`, and `review/suppliers-editor-390.png`.
