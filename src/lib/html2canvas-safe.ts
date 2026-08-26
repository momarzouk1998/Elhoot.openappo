/**
 * Safe wrapper around html2canvas.
 * Converts modern color functions (oklch, color(), oklab) in stylesheets and computed styles
 * to safe standard rgb() values so html2canvas renders perfectly without errors.
 */

function convertUnsupportedColorsToRgb(str: string, ctx: CanvasRenderingContext2D | null): string {
  if (!str || typeof str !== "string") return str;
  if (!str.includes("oklch") && !str.includes("color(") && !str.includes("oklab")) return str;
  if (!ctx) return str.replace(/(oklch|oklab|color)\([^)]+\)/gi, "rgb(2, 132, 199)");

  return str.replace(/(oklch|oklab|color)\([^)]+\)/gi, (match) => {
    try {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = match;
      return ctx.fillStyle;
    } catch {
      return "rgb(2, 132, 199)";
    }
  });
}

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
      const tempCanvas = clonedDoc.createElement("canvas");
      const ctx = tempCanvas.getContext("2d");

      // 1. Sanitize all <style> tags
      try {
        const styleTags = clonedDoc.querySelectorAll("style");
        styleTags.forEach((styleTag) => {
          if (
            styleTag.textContent &&
            (styleTag.textContent.includes("oklch") ||
              styleTag.textContent.includes("color(") ||
              styleTag.textContent.includes("oklab"))
          ) {
            styleTag.textContent = convertUnsupportedColorsToRgb(styleTag.textContent, ctx);
          }
        });
      } catch (err) {
        console.warn("Style tag sanitization warning:", err);
      }

      // 2. Walk original and cloned elements to convert computed colors
      try {
        const origAll = [element, ...Array.from(element.querySelectorAll("*"))] as HTMLElement[];
        const clonedAll = [clonedElement, ...Array.from(clonedElement.querySelectorAll("*"))] as HTMLElement[];

        const COLOR_PROPS = [
          "color",
          "backgroundColor",
          "borderColor",
          "borderTopColor",
          "borderBottomColor",
          "borderLeftColor",
          "borderRightColor",
          "outlineColor",
          "boxShadow",
          "textShadow",
        ];

        for (let i = 0; i < origAll.length; i++) {
          const orig = origAll[i];
          const clone = clonedAll[i];
          if (!orig || !clone) continue;

          if (clone.style) {
            for (let s = 0; s < clone.style.length; s++) {
              const prop = clone.style[s];
              const val = clone.style.getPropertyValue(prop);
              if (val && (val.includes("oklch") || val.includes("color(") || val.includes("oklab"))) {
                clone.style.setProperty(prop, convertUnsupportedColorsToRgb(val, ctx));
              }
            }
          }

          try {
            const computed = window.getComputedStyle(orig);
            for (const prop of COLOR_PROPS) {
              const val = (computed as any)[prop];
              if (
                val &&
                typeof val === "string" &&
                (val.includes("oklch") || val.includes("color(") || val.includes("oklab"))
              ) {
                const rgbVal = convertUnsupportedColorsToRgb(val, ctx);
                const cssProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
                clone.style.setProperty(cssProp, rgbVal, "important");
              }
            }
          } catch {}
        }
      } catch (err) {
        console.warn("Element style sanitization warning:", err);
      }
    },
  });
}
