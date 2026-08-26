/**
 * Safe wrapper around html2canvas that sanitizes modern CSS color functions (like oklch)
 * which cause html2canvas to crash with: "Attempting to parse an unsupported color function 'oklch'"
 */

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
      // 1. Sanitize all <style> tags in the cloned document
      try {
        const styleTags = clonedDoc.querySelectorAll("style");
        styleTags.forEach((styleTag) => {
          if (styleTag.textContent && styleTag.textContent.includes("oklch")) {
            styleTag.textContent = styleTag.textContent.replace(
              /oklch\([^)]+\)/gi,
              "rgb(2, 132, 199)"
            );
          }
        });
      } catch (err) {
        console.warn("Style tag sanitization warning:", err);
      }

      // 2. Convert any inline or computed style containing oklch
      try {
        const allCloned = [clonedElement, ...Array.from(clonedElement.querySelectorAll("*"))] as HTMLElement[];
        allCloned.forEach((el) => {
          if (el.style) {
            for (let i = 0; i < el.style.length; i++) {
              const prop = el.style[i];
              const val = el.style.getPropertyValue(prop);
              if (val && val.includes("oklch")) {
                el.style.setProperty(prop, "rgb(2, 132, 199)", "important");
              }
            }
          }
        });
      } catch (err) {
        console.warn("Element style sanitization warning:", err);
      }
    },
  });
}
