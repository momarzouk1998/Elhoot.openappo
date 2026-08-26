/**
 * Safe wrapper around html2canvas.
 * Inlines computed styles on the target element and its descendants,
 * then removes all global stylesheets and style tags containing oklch
 * from the clone so html2canvas NEVER parses any Tailwind v4 oklch rules.
 */

const ESSENTIAL_PROPS = [
  "box-sizing",
  "display",
  "flex-direction",
  "justify-content",
  "align-items",
  "flex-wrap",
  "gap",
  "grid-template-columns",
  "grid-gap",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "background-color",
  "background-image",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "direction",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "border-right-width",
  "border-right-style",
  "border-right-color",
  "border-bottom-width",
  "border-bottom-style",
  "border-bottom-color",
  "border-left-width",
  "border-left-style",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "overflow",
  "white-space",
  "vertical-align",
  "table-layout",
  "border-collapse",
] as const;

export async function captureElementToCanvas(
  element: HTMLElement,
  options: {
    scale?: number;
    backgroundColor?: string;
  } = {}
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;

  return await html2canvas(element, {
    useCORS: true,
    allowTaint: true,
    scale: options.scale ?? 2.5,
    logging: false,
    backgroundColor: options.backgroundColor ?? "#ffffff",
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc, clonedElement) => {
      // 1. Walk original and cloned elements, copying all computed styles inline as standard values
      try {
        const liveElements = [element, ...Array.from(element.querySelectorAll("*"))] as HTMLElement[];
        const cloneElements = [clonedElement, ...Array.from(clonedElement.querySelectorAll("*"))] as HTMLElement[];
        const len = Math.min(liveElements.length, cloneElements.length);

        for (let i = 0; i < len; i++) {
          const live = liveElements[i];
          const clone = cloneElements[i];
          const computed = window.getComputedStyle(live);

          for (const prop of ESSENTIAL_PROPS) {
            let val = computed.getPropertyValue(prop);
            if (!val || val === "initial" || val === "inherit") continue;
            // Clean any oklch or color() in computed style values
            if (val.includes("oklch") || val.includes("color(") || val.includes("oklab")) {
              val = val.replace(/(oklch|oklab|color)\([^)]+\)/gi, "rgb(15, 65, 133)");
            }
            clone.style.setProperty(prop, val, "important");
          }
        }
      } catch (err) {
        console.warn("Computed style inlining warning:", err);
      }

      // 2. Remove all external stylesheets and style tags so html2canvas NEVER parses Tailwind oklch rules
      try {
        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove());
        clonedDoc.querySelectorAll("style").forEach((style) => {
          if (style.textContent && (style.textContent.includes("oklch") || style.textContent.includes("oklab"))) {
            style.remove();
          }
        });
      } catch (err) {
        console.warn("Stylesheet stripping warning:", err);
      }
    },
  });
}
