# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El dueño de PLUG usa esta app para gestionar su negocio de indumentaria.

## Product Purpose

Reunir costos de importación, inventario y análisis de publicidad para decidir qué vender y cuánto gastar en adquirir ventas.

## Capabilities and Constraints

Próximos pedidos, solicitado el 10/11/2026: preparar compras futuras desde enlaces CSSBuy con variantes/talles, cantidades y costos estimados. `/calculadora/pedidos` guarda borradores, listos para revisar y archivados en PostgreSQL, admite presupuesto y precio de venta previsto, señala costos faltantes y abre pedidos completos guardados en la calculadora. La lectura opcional del conector 1.1 se limita a metadatos de producto inequívocos; la carga manual está disponible. No compra, paga ni modifica stock. El margen simulado excluye publicidad y gastos de venta; los impuestos son estimaciones explícitas ingresadas. Implementación local; publicación y extracción de la ficha real sin verificar. Ver `docs/proximos-pedidos.md`.

Next.js, React y PostgreSQL para inventario. Las cotizaciones también tienen soporte Supabase y almacenamiento local. Se conserva la interfaz existente.

El usuario confirmó que quiere un panel de Meta dentro de la app y análisis con sus costos desde el chat. El inventario actual registra cantidades vendidas acumuladas, no pedidos fechados con atribución. No se deben presentar como ventas atribuidas a campañas ni como ganancia neta.

La conexión de esta primera versión consulta reportes; no modifica campañas ni presupuesto. La autenticación de Meta y las credenciales de producción siguen pendientes de configuración por el propietario.
