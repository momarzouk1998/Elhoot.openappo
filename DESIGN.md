---
name: Industrial Volt
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf1'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fa'
  on-surface: '#111c2c'
  on-surface-variant: '#434751'
  inverse-surface: '#263142'
  inverse-on-surface: '#ebf1ff'
  outline: '#737782'
  outline-variant: '#c3c6d2'
  surface-tint: '#345da3'
  primary: '#002b61'
  on-primary: '#ffffff'
  primary-container: '#0f4185'
  on-primary-container: '#8ab0fb'
  inverse-primary: '#acc7ff'
  secondary: '#8c4f00'
  on-secondary: '#ffffff'
  secondary-container: '#fd9923'
  on-secondary-container: '#663800'
  tertiary: '#262e36'
  on-tertiary: '#ffffff'
  tertiary-container: '#3c444d'
  on-tertiary-container: '#a9b1bb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#acc7ff'
  on-primary-fixed: '#001a40'
  on-primary-fixed-variant: '#164589'
  secondary-fixed: '#ffdcbf'
  secondary-fixed-dim: '#ffb874'
  on-secondary-fixed: '#2d1600'
  on-secondary-fixed-variant: '#6b3b00'
  tertiary-fixed: '#dbe3ee'
  tertiary-fixed-dim: '#bfc7d2'
  on-tertiary-fixed: '#141c24'
  on-tertiary-fixed-variant: '#3f4850'
  background: '#f9f9ff'
  on-background: '#111c2c'
  surface-variant: '#d8e3fa'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

This design system is engineered for efficiency, reliability, and precision, catering to a professional workforce managing high-stakes electrical inventory. The brand personality is **authoritative and industrial**, yet maintains a **modern, systematic** edge that ensures complex technical data remains legible and actionable.

The aesthetic leans into **Corporate Modernism with a Technical twist**. It utilizes a structured grid, high-contrast action colors, and a clean interface that mimics the precision of high-end electrical testing equipment. The emotional response should be one of confidence and stability—communicating that the tools managed under this system are of the highest professional grade.

- **Minimalism:** Applied through generous whitespace in data-heavy views to reduce cognitive load.
- **Industrial Precision:** Subtle use of technical lines, monospaced numerical data, and solid borders to evoke a sense of hardware and durability.
- **Visual Weight:** Solid, heavy fills for primary actions to contrast against a light, airy canvas.

## Colors

The palette is derived directly from the core identity to reinforce brand recognition and industrial trust.

- **Primary (Electric Navy):** `#0F4185`. Used for primary navigation, headers, and core action buttons. It represents stability and professional authority.
- **Secondary (Caution Orange):** `#F7941D`. Reserved for high-priority calls to action, status alerts, and highlighting critical technical specs. It draws immediate attention against the blue.
- **Tertiary (Circuit Blue):** `#E6EEF9`. A soft, low-saturation blue used for background surfaces, row striping, and subtle containers to maintain the brand theme without overwhelming the user.
- **Neutrals:** A range of cool grays (from `#F7FAFC` to `#1A202C`) are used for text and structural borders, ensuring the interface feels grounded and mechanical.

## Typography

The typography strategy employs a three-tier system to manage complex hierarchy:

1.  **Hanken Grotesk (Headlines):** A sharp, contemporary grotesque that provides a clean, professional "tech" look for titles and brand moments.
2.  **IBM Plex Sans (Body):** An engineered typeface designed for clarity. Its humanist-mechanical hybrid nature makes it perfect for long technical descriptions and management interfaces.
3.  **JetBrains Mono (Data/Labels):** Used specifically for technical specifications (Voltage, Amperage, SKU numbers, and Part IDs). This monospaced font ensures that digits align vertically in tables, making it easier to compare technical values at a glance.

## Layout & Spacing

The layout follows a **structured 12-column fluid grid** for desktop and a **single-column fluid layout** for mobile devices.

- **Logic:** All spacing is based on an 8px baseline grid to ensure mathematical harmony across the UI.
- **Grid:** On desktop, use a 24px gutter to provide breathing room between complex data cards.
- **Density:** High-density layouts are preferred for inventory lists (using `sm` spacing), while marketing or dashboard overviews use `lg` and `xl` spacing to create a premium feel.
- **Breakpoints:**
    - Mobile: < 600px (16px margins)
    - Tablet: 600px - 1024px (24px margins)
    - Desktop: > 1024px (Fixed 1200px max-width container or full-fluid depending on the specific dashboard view).

## Elevation & Depth

To maintain an industrial and reliable feel, the system avoids excessive shadows in favor of **Tonal Layers** and **Structural Outlines**.

- **Surfaces:** Use subtle background shifts (Primary Blue at 5% opacity) to define container areas rather than heavy drop shadows.
- **Borders:** Use 1px solid borders in a cool gray (`#E2E8F0`) to define cards and input fields. This mimics the paneled look of electrical control boxes.
- **Interaction Depth:** For active states or "lifted" items, use a crisp, low-blur shadow (Y: 4px, Blur: 8px, Opacity: 10%, Color: Primary Blue) to signify interactivity without losing the flat, professional aesthetic.
- **Dark Mode (Optional):** Surfaces should be tiered using increasingly lighter shades of navy/gray to show elevation rather than light-source shadows.

## Shapes

The shape language is **Soft (0.25rem)**, moving away from "bubbly" consumer aesthetics toward a more rigid, industrial form factor.

- **Base Radius:** 4px (Soft) for buttons, inputs, and small widgets. This provides a hint of modernity while maintaining a serious, structured appearance.
- **Large Components:** Cards and modals use `rounded-lg` (8px) to soften the large blocks of content.
- **Action Indicators:** Small utility chips or status indicators (e.g., "In Stock") use a higher radius (12px) to distinguish them from structural elements.

## Components

- **Buttons:** 
    - *Primary:* Solid Electric Navy with white text. High-contrast, rectangular but slightly softened corners.
    - *CTA:* Caution Orange background with dark navy text for maximum visibility on "Add to Cart" or "Emergency Support."
- **Input Fields:** Thick 1px borders, using JetBrains Mono for the input text to ensure technical accuracy. Focus states should use a 2px Electric Navy border.
- **Status Chips:** Small, rectangular tags with light background fills (e.g., Light Green for "Active", Caution Orange for "Low Stock").
- **Cards:** White background, 1px cool-gray border, no shadow. Content is separated by subtle horizontal rules.
- **Inventory Lists:** Use Zebra-striping with Tertiary Blue (`#E6EEF9`) at 30% opacity to assist with horizontal scanning of technical specs.
- **Tool Specification Icons:** Use line-art icons with a consistent 2px stroke weight to match the industrial typography.