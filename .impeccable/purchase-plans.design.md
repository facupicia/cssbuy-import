# Próximos pedidos — surface brief

## Overview

Existing-system feature in **Operate** mode, under **Calculadora → Próximos pedidos** (`/calculadora/pedidos`). The owner prepares future CSSBuy purchases, saves and resumes plans, and compares estimated landed costs before buying. `PRODUCT.md` defines scope; root `DESIGN.md` remains the visual-system authority. This brief records this surface without replacing system tokens or identity.

Implementation is local. Publication, production behavior and metadata extraction from the real CSSBuy product page remain unverified. Manual entry is always available. This workflow does not buy, pay or change stock.

## Colors

Reuse the existing warm neutral page, elevated surfaces, subtle fills and borders. Foreground-colored primary actions follow the incumbent system. Danger identifies errors and exceeded budgets; warning identifies incomplete estimates. Theme variables remain authoritative.

## Typography

Use shared system typography and controls: `text-3xl` semibold page title, `text-xl` section titles, small supporting copy and tabular figures for monetary amounts. Labels explicitly name currency and whether a cost or weight is per unit or per row.

## Layout

The centered `max-w-7xl` shell uses 16px horizontal padding, increasing to 24px at `sm`, with 32px section gaps and bottom clearance for mobile navigation. Calculator section links wrap and identify the active destination.

The initial view is a saved-plan list with name, status, units, update date and estimated or partial total, plus archive visibility and a create action. Opening a plan replaces the list with a full-page editor. The editor flows through order details, product variants, costs, estimate and notes. Product and cost fields use one column, two at `sm`, and four at `lg` where applicable. Actions wrap on narrow screens.

## Elevation & Depth

Bordered elevated surfaces and subtle inset summaries provide hierarchy. The save toolbar stays below Navbar with `sticky top-14 lg:top-16 z-30`; it preserves visible save and calculator actions while scrolling the long editor.

## Shapes

Preserve shared rounded controls and bordered section surfaces. This surface uses `rounded-xl` section containers with 16px padding, increasing to 24px at `sm`; custom select and notes controls use `rounded-lg`.

## Components

- **Plan lifecycle:** Borrador, Listo para revisar and Archivado; authenticated persistence with loading, empty, error and saved feedback. Export requires a saved, complete, unchanged plan and opens a new calculator quotation.
- **Variant row:** one product/talle/color combination, quantity, unit price CNY, total China freight for that row, estimated unit weight in grams and optional unit sale price ARS. Repeating a link supports variants. CSSBuy metadata reading is optional; the owner confirms variant, volume price, availability and weight.
- **Cost configuration:** editable ARS/USD and CNY/USD, total international freight, estimated commission, explicit estimated taxes, other costs and optional ARS budget. Currency lookup feedback identifies partial updates and asks the owner to confirm the rate actually paid.
- **Estimate:** missing costs produce “Estimación parcial” and “Subtotal conocido,” with omissions stated. Landed unit cost waits for complete costs and weights. Optional sale values expose merchandise margin only with complete inputs, explicitly before advertising, payment fees and other selling costs. Freight, taxes and commission are allocated by weight.
- **Recovery:** errors use a focusable alert, programmatic focus and scroll into view; form controls and alerts have sticky-header scroll clearance. Busy operations disable the editor and announce status. Dirty changes are guarded on editor return, links, unload and browser Back; this page enables the shared guard's optional history protection. Discarding preserves the last saved plan.

## Do's and Don'ts

- Do keep manual entry usable when CSSBuy or its connector cannot supply data.
- Do retain explicit partial totals, units, cost assumptions and margin limits.
- Don't present plans as purchased goods, actual stock or net profit.
- Don't infer real-page extraction success from simulated connector tests.

Review references: [desktop, 1365px](review/purchase-plans-1365.png) and [mobile, 390px](review/purchase-plans-390.png). Final reviewer disposition supplied for this bounded feature: **ship**, following fixes to calculator navigation, sticky save placement and error recovery. Browser Back protection is enabled in source. Publication remains pending.
