import { describe, expect, it } from "vitest";
import { SvgParser } from "./svgParser";

describe("SvgParser", () => {
  const parser = new SvgParser();

  describe("child element recursion and matrix propagation", () => {
    it("should parse nested groups without crashing and pass parent transformations", () => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
          <g id="parentGroup" transform="translate(10, 20)">
            <g id="childGroup" transform="translate(5, 5)">
              <rect id="childRect" x="0" y="0" width="20" height="20" />
            </g>
          </g>
        </svg>
      `;

      const nodes = parser.parse(svg);
      expect(nodes.length).toBe(3);

      const parentGroup = nodes.find((n) => n.id === "parentGroup");
      const childGroup = nodes.find((n) => n.id === "childGroup");
      const childRect = nodes.find((n) => n.id === "childRect");

      expect(parentGroup).toBeDefined();
      expect(childGroup).toBeDefined();
      expect(childRect).toBeDefined();

      expect(childGroup?.parentId).toBe("parentGroup");
      expect(childRect?.parentId).toBe("childGroup");

      // Parent matrix translates (10, 20)
      expect(parentGroup?.x).toBe(10);
      expect(parentGroup?.y).toBe(20);

      // Child group has translate(5, 5) relative to parent
      expect(childGroup?.x).toBe(5);
      expect(childGroup?.y).toBe(5);
    });

    it("should handle defs without creating nodes for defs container while preserving parent matrix for children", () => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
          <g id="mainGroup" transform="translate(10, 10)">
            <defs>
              <rect id="defRect" x="0" y="0" width="10" height="10" />
            </defs>
          </g>
        </svg>
      `;

      const nodes = parser.parse(svg);
      const defRect = nodes.find((n) => n.id === "defRect");

      expect(defRect).toBeDefined();
      expect(defRect?.parentId).toBe("mainGroup");
    });
  });

  describe("image tag support", () => {
    it("should parse image tag with standard href attribute", () => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
          <image id="img1" href="https://example.com/asset.png" x="10" y="20" width="100" height="50" />
        </svg>
      `;

      const nodes = parser.parse(svg);
      expect(nodes.length).toBe(1);

      const imgNode = nodes[0];
      expect(imgNode.type).toBe("image");
      expect(imgNode.id).toBe("img1");
      expect(imgNode.src).toBe("https://example.com/asset.png");
      expect(imgNode.width).toBe(100);
      expect(imgNode.height).toBe(50);
      // Center position calculation: x = 10 + 100/2 = 60, y = 20 + 50/2 = 45
      expect(imgNode.x).toBe(60);
      expect(imgNode.y).toBe(45);
    });

    it("should fallback to xlink:href when href is absent", () => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
          <image id="imgLegacy" xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" x="0" y="0" width="30" height="40" />
        </svg>
      `;

      const nodes = parser.parse(svg);
      expect(nodes.length).toBe(1);

      const imgNode = nodes[0];
      expect(imgNode.type).toBe("image");
      expect(imgNode.src).toBe(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      );
      expect(imgNode.width).toBe(30);
      expect(imgNode.height).toBe(40);
    });

    it("should default missing or invalid width/height on image elements to 0", () => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <image id="imgNoDims" href="test.jpg" x="5" y="5" width="invalid" />
        </svg>
      `;

      const nodes = parser.parse(svg);
      expect(nodes.length).toBe(1);

      const imgNode = nodes[0];
      expect(imgNode.type).toBe("image");
      expect(imgNode.src).toBe("test.jpg");
      expect(imgNode.width).toBe(0);
      expect(imgNode.height).toBe(0);
    });
  });
});
