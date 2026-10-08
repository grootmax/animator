import type { FontAsset } from "@animator/core";

export type FontLoadedCallback = (fontAsset: FontAsset) => void;

export class FontAssetLoader {
  private loadedFonts = new Set<string>();
  private loadingPromises = new Map<string, Promise<boolean>>();
  private listeners: FontLoadedCallback[] = [];

  public onFontLoaded(callback: FontLoadedCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public isFontLoaded(fontAssetId: string): boolean {
    return this.loadedFonts.has(fontAssetId);
  }

  public async loadFont(font: FontAsset): Promise<boolean> {
    if (this.loadedFonts.has(font.id)) {
      return true;
    }

    const existingPromise = this.loadingPromises.get(font.id);
    if (existingPromise) {
      return existingPromise;
    }

    const loadPromise = (async () => {
      try {
        if (
          typeof FontFace !== "undefined" &&
          typeof document !== "undefined" &&
          document.fonts
        ) {
          const srcUrl =
            font.src.startsWith("url(") || font.src.startsWith("data:")
              ? font.src.startsWith("url(")
                ? font.src
                : `url('${font.src}')`
              : `url('${font.src}')`;

          const descriptors: FontFaceDescriptors = {};
          if (font.weight) descriptors.weight = font.weight;
          if (font.style) descriptors.style = font.style;

          const fontFace = new FontFace(font.family, srcUrl, descriptors);

          await fontFace.load();
          document.fonts.add(fontFace);
          this.loadedFonts.add(font.id);
        } else {
          // Simulate asynchronous font loading in test / non-DOM environments
          await new Promise((resolve) => setTimeout(resolve, 10));
          this.loadedFonts.add(font.id);
        }

        this.loadingPromises.delete(font.id);

        for (const listener of this.listeners) {
          listener(font);
        }

        return true;
      } catch (err) {
        this.loadingPromises.delete(font.id);
        console.warn(
          `Failed to load font asset ${font.id} (${font.family}):`,
          err,
        );
        return false;
      }
    })();

    this.loadingPromises.set(font.id, loadPromise);
    return loadPromise;
  }
}
