"""Genera le icone PNG (192x192 e 512x512) per il manifest PWA di MyLAN."""
from pathlib import Path
from PIL import Image, ImageDraw

def render_mylan_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Background con angoli arrotondati
    corner = int(size * 0.22)
    draw.rounded_rectangle([0, 0, size, size], radius=corner, fill=(11, 15, 25, 255))
    # Coordinate della topologia P2P triangolare
    p_top = (int(size * 0.50), int(size * 0.28))
    p_left = (int(size * 0.28), int(size * 0.68))
    p_right = (int(size * 0.72), int(size * 0.68))
    p_center = (int(size * 0.50), int(size * 0.52))

    stroke = max(2, int(size * 0.065))
    # Linee di connessione
    draw.line([p_left, p_top], fill=(6, 182, 212, 255), width=stroke)
    draw.line([p_top, p_right], fill=(59, 130, 246, 255), width=stroke)
    draw.line([p_left, p_right], fill=(30, 58, 138, 160), width=max(1, stroke // 2))
    draw.line([p_top, p_center], fill=(6, 182, 212, 200), width=max(1, stroke // 2))

    # Nodi
    r_node = max(4, int(size * 0.075))
    draw.ellipse([p_top[0] - r_node, p_top[1] - r_node, p_top[0] + r_node, p_top[1] + r_node], fill=(56, 189, 248, 255))
    draw.ellipse([p_left[0] - r_node, p_left[1] - r_node, p_left[0] + r_node, p_left[1] + r_node], fill=(6, 182, 212, 255))
    draw.ellipse([p_right[0] - r_node, p_right[1] - r_node, p_right[0] + r_node, p_right[1] + r_node], fill=(59, 130, 246, 255))

    r_core = max(2, int(size * 0.045))
    draw.ellipse([p_center[0] - r_core, p_center[1] - r_core, p_center[0] + r_core, p_center[1] + r_core], fill=(255, 255, 255, 255))
    return img

def main():
    icons_dir = Path(__file__).resolve().parent.parent / "src" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    for s in (192, 512):
        out_path = icons_dir / f"icon-{s}.png"
        render_mylan_icon(s).save(out_path, format="PNG")
        print(f"Generata: {out_path} ({s}x{s})")

if __name__ == "__main__":
    main()
