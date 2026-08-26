/**
 * Safe wrapper around html2canvas that sanitizes modern CSS color functions (like oklch)
 * which cause html2canvas to crash with: "Attempting to parse an unsupported color function 'oklch'"
 *
 * Strategy: in onclone, we walk every element and convert its COMPUTED styles
 * (background-color, color, border-color, outline-color, fill, stroke) to inline
 * rgb() values — so html2canvas never sees oklch at all.
 */

const COLOR_PROPS = [
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "fill",
  "stroke",
  "box-shadow",
  "text-shadow",
] as const;

function resolveOklchInStylesheet(doc: Document) {
  try {
    const styleTags = doc.querySelectorAll("style");
    styleTags.forEach((tag) => {
      if (tag.textContent?.includes("oklch")) {
        // Replace every oklch(...) with a safe fallback
        tag.textContent = tag.textContent.replace(
          /oklch\([^)]+\)/gi,
          "rgb(100,116,139)"
        );
      }
    });
  } catch (_) {
    // ignore — best effort
  }
}

function inlineComputedColors(clonedDoc: Document, clonedEl: HTMLElement) {
  try {
    const originalDoc = document;
    const all = [clonedEl, ...Array.from(clonedEl.querySelectorAll("*"))] as HTMLElement[];

    all.forEach((el) => {
      // Match to original element by index within parent so we can read its computed style
      // If we can't, just read the cloned element's computed style (which may have oklch resolved already in modern browsers)
      const computed = originalDoc.defaultView?.getComputedStyle(el) ?? window.getComputedStyle(el);
      if (!computed) return;

      COLOR_PROPS.forEach((prop) => {
        try {
          const val = computed.getPropertyValue(prop);
          if (!val || val === "none" || val === "transparent" || val === "initial" || val === "inherit") return;
          // If the value still somehow contains oklch (some browsers return it), replace it
          if (val.includes("oklch")) {
            el.style.setProperty(prop, "rgb(100,116,139)", "important");
          } else {
            // Force the resolved rgb/rgba value inline so html2canvas uses it directly
            el.style.setProperty(prop, val, "important");
          }
        } catch (_) {
          // skip
        }
      });
    });
  } catch (err) {
    console.warn("Computed style inlining warning:", err);
  }
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
    scale: options.scale || 2.5,
    logging: false,
    backgroundColor: options.backgroundColor || "#ffffff",
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc, clonedElement) => {
      // Step 1: Kill any oklch in <style> tags inside the clone
      resolveOklchInStylesheet(clonedDoc);

      // Step 2: Read computed colors from the LIVE DOM and write them inline on the clone
      // We do this by walking both trees in parallel using the same selector
      try {
        const liveElements = [element, ...Array.from(element.querySelectorAll("*"))] as HTMLElement[];
        const cloneElements = [clonedElement, ...Array.from(clonedElement.querySelectorAll("*"))] as HTMLElement[];

        const len = Math.min(liveElements.length, cloneElements.length);
        for (let i = 0; i < len; i++) {
          const liveEl = liveElements[i];
          const cloneEl = cloneElements[i];
          const computed = window.getComputedStyle(liveEl);

          COLOR_PROPS.forEach((prop) => {
            try {
              const val = computed.getPropertyValue(prop);
              if (!val || val === "none" || val === "transparent" || val === "initial" || val === "inherit") return;
              if (val.includes("oklch")) {
                cloneEl.style.setProperty(prop, "rgb(100,116,139)", "important");
              } else {
                cloneEl.style.setProperty(prop, val, "important");
              }
            } catch (_) {
              // skip
            }
          });
        }
      } catch (err) {
        console.warn("Parallel DOM walk warning:", err);
        // Fallback: just sanitize the clone in isolation
        inlineComputedColors(clonedDoc, clonedElement);
      }
    },
  });
}
