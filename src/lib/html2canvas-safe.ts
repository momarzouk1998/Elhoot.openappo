/**
 * Safe wrapper around html2canvas.
 * Converts oklch/color()/oklab functions to standard rgb() format,
 * completely shielding html2canvas from unsupported CSS color syntax
 * while preserving 100% of stylesheet layout, typography, and geometry.
 *
 * Supports renderWidth option to enforce full desktop/document width on mobile captures.
 */

function convertCssColorToRgb(str: string, ctx: CanvasRenderingContext2D | null): string {
  if (!str || typeof str !== "string") return str;
  if (!str.includes("oklch") && !str.includes("color(") && !str.includes("oklab")) return str;
  if (!ctx) return str.replace(/(oklch|oklab|color)\([^)]+\)/gi, "rgb(15, 65, 133)");

  return str.replace(/(oklch|oklab|color)\([^)]+\)/gi, (match) => {
    try {
      ctx.fillStyle = "#ffffff";
      ctx.fillStyle = match;
      return ctx.fillStyle; // Browser canvas natively resolves to standard rgb(r, g, b)
    } catch {
      return "rgb(15, 65, 133)";
    }
  });
}

export async function captureElementToCanvas(
  element: HTMLElement,
  options: {
    scale?: number;
    backgroundColor?: string;
    renderWidth?: number;
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
    windowWidth: options.renderWidth ? Math.max(options.renderWidth + 100, 1024) : undefined,
    onclone: (clonedDoc, clonedElement) => {
      const helperCanvas = clonedDoc.createElement("canvas");
      const ctx = helperCanvas.getContext("2d");

      // 1. Enforce high-res document layout width if requested (prevents mobile squishing)
      if (options.renderWidth) {
        clonedElement.style.setProperty("width", `${options.renderWidth}px`, "important");
        clonedElement.style.setProperty("min-width", `${options.renderWidth}px`, "important");
        clonedElement.style.setProperty("max-width", `${options.renderWidth}px`, "important");
        clonedElement.style.setProperty("box-sizing", "border-box", "important");
      }

      // 2. Intercept getComputedStyle in the cloned document window with a Proxy
      const docView = clonedDoc.defaultView || window;
      if (docView && docView.getComputedStyle) {
        const originalGetComputedStyle = docView.getComputedStyle.bind(docView);
        docView.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
          const cs = originalGetComputedStyle(elt, pseudoElt);
          return new Proxy(cs, {
            get(target, prop: string | symbol) {
              const origVal = (target as any)[prop];
              if (typeof origVal === "function") {
                if (prop === "getPropertyValue") {
                  return (cssProp: string) => {
                    const val = target.getPropertyValue(cssProp);
                    if (val && typeof val === "string" && (val.includes("oklch") || val.includes("color(") || val.includes("oklab"))) {
                      return convertCssColorToRgb(val, ctx);
                    }
                    return val;
                  };
                }
                return origVal.bind(target);
              }
              if (typeof origVal === "string" && (origVal.includes("oklch") || origVal.includes("color(") || origVal.includes("oklab"))) {
                return convertCssColorToRgb(origVal, ctx);
              }
              return origVal;
            },
          });
        };
      }

      // 3. Sanitize any style tags inside the cloned document
      try {
        const styleTags = clonedDoc.querySelectorAll("style");
        styleTags.forEach((styleTag) => {
          if (styleTag.textContent && (styleTag.textContent.includes("oklch") || styleTag.textContent.includes("oklab") || styleTag.textContent.includes("color("))) {
            styleTag.textContent = convertCssColorToRgb(styleTag.textContent, ctx);
          }
        });
      } catch (err) {
        console.warn("Style tag sanitization warning:", err);
      }

      // 4. Walk all elements in the cloned document and fix any inline styles with oklch
      try {
        const allCloned = [clonedElement, ...Array.from(clonedElement.querySelectorAll("*"))] as HTMLElement[];
        allCloned.forEach((el) => {
          if (el.style) {
            for (let i = 0; i < el.style.length; i++) {
              const prop = el.style[i];
              const val = el.style.getPropertyValue(prop);
              if (val && (val.includes("oklch") || val.includes("color(") || val.includes("oklab"))) {
                el.style.setProperty(prop, convertCssColorToRgb(val, ctx), "important");
              }
            }
          }
        });
      } catch (err) {
        console.warn("Inline style sanitization warning:", err);
      }
    },
  });
}
