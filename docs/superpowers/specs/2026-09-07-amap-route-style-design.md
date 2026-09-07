# Amap-style Route Line Design

Date: 2026-09-07  
Status: approved (user: 开始)

## Goal

Make preview and in-navigation routes look closer to Amap navigation: blue main stroke, white casing, directional arrows; while navigating, only the remaining path is drawn.

## Approach

**A — Dual line layers + arrow symbol layer + remaining-path clip**

- Per route style id: GeoJSON source + three layers (`casing`, `line`, `arrow`)
- Active: stronger blue / thicker; idle alternatives: lighter / thinner / no arrows
- Navigation continues to feed `updateNavRoute(remainingPath)` so passed segments disappear

## Visual tokens

| Role | Color | Width (approx @ z≥14) |
|------|-------|------------------------|
| Active casing | `#FFFFFF` | ~12 |
| Active fill | `#3370FF` | ~8 |
| Idle casing | `#FFFFFF` ~70% | ~9 |
| Idle fill | `#9BB8FF` | ~5 |
| Arrow | white chevron on blue (symbol along line) | spacing ~56–72 |

Widths use Mapbox `interpolate` by zoom so they stay readable at city / street scale.

## Out of scope

- Traffic congestion coloring
- Gray “passed” trail behind the user
- Lane guidance / turn bubbles on the polyline

## Files

- Primary: `src/components/NavMap.vue` (`setRouteLine`, `bringRouteLineToFront`, `removeRouteLine`, image bootstrap)
