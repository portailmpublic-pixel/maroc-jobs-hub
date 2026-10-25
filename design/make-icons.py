"""Generate all ASSOULI AUTOX icon assets from the glossy circle logo.

Usage: python design/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "Glossy Assouli AutoX Circle Logo.png"
RES = ROOT / "app" / "android" / "app" / "src" / "main" / "res"
PUBLIC = ROOT / "app" / "public"
QA = ROOT / "design" / "icon-qa"

# The badge is a near-circle inside the 1254px source. Crop a square around it.
CROP = (8, 3, 1228, 1223)          # 1220 x 1220
CX, CY = 610.5, 610.5              # badge centre inside the crop
RX, RY = 607.0, 595.0              # ring radius (slightly elliptical in source)

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
FOREGROUND = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 288,
    "xxxhdpi": 432,
}
STAT_DENSITIES = {
    "mdpi": 24,
    "hdpi": 36,
    "xhdpi": 48,
    "xxhdpi": 72,
    "xxxhdpi": 96,
}
ADAPTIVE_RATIO = 0.648             # 70dp badge on a 108dp adaptive canvas
STAT_SS = 8                        # supersampling for the status-bar mark


def stat_mark(size):
    """White monochrome badge (ring + A) for the Android status bar.

    Android only keeps the alpha channel of a notification small icon, so the
    full-colour glossy logo cannot be used there. This mark mirrors the ring
    and the A of the logo while staying legible at 24dp.
    """
    px = size * STAT_SS
    scale = px / 100.0
    mask = Image.new("L", (px, px), 0)
    d = ImageDraw.Draw(mask)

    # Ring: outer radius 47, stroke 4.6 (≈1.1px at 24dp).
    d.ellipse(
        [3 * scale, 3 * scale, 97 * scale, 97 * scale],
        outline=255,
        width=max(1, round(4.6 * scale)),
    )

    # Bold geometric A, centred inside the ring.
    s = 0.64

    def poly(points, fill):
        p = [
            (((x - 50) * s + 50) * scale, ((y - 50) * s + 50) * scale)
            for x, y in points
        ]
        d.polygon(p, fill=fill)

    outer = [(42, 8), (58, 8), (94, 92), (70, 92), (61, 68), (39, 68), (30, 92), (6, 92)]
    counter = [(50, 27), (57.5, 52), (42.5, 52)]
    poly(outer, 255)
    poly(counter, 0)

    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    white.putalpha(mask)
    out.alpha_composite(white)
    return out


def circular_mask(size, cx, cy, rx, ry, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    d.ellipse(
        [(cx - rx) * ss, (cy - ry) * ss, (cx + rx) * ss, (cy + ry) * ss],
        fill=255,
    )
    return m.resize((size, size), Image.LANCZOS)


def resize(im, size):
    return im.resize((size, size), Image.LANCZOS)


def main():
    src = Image.open(SRC).convert("RGB").crop(CROP)
    square = src.convert("RGBA")

    # Round version: transparent outside the badge ring.
    round_badge = square.copy()
    round_badge.putalpha(circular_mask(square.width, CX, CY, RX, RY))

    QA.mkdir(parents=True, exist_ok=True)

    # ---- In-app logo -------------------------------------------------------
    resize(round_badge, 512).save(PUBLIC / "app-icon.png", optimize=True)

    # ---- Launcher icons ----------------------------------------------------
    for density, px in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        resize(round_badge, px).save(folder / "ic_launcher.png", optimize=True)
        resize(round_badge, px).save(folder / "ic_launcher_round.png", optimize=True)

        canvas = FOREGROUND[density]
        badge_px = round(canvas * ADAPTIVE_RATIO)
        fg = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        badge = resize(round_badge, badge_px)
        fg.paste(badge, ((canvas - badge_px) // 2, (canvas - badge_px) // 2), badge)
        fg.save(folder / "ic_launcher_foreground.png", optimize=True)

    # ---- Splash + notification --------------------------------------------
    splash = Image.new("RGBA", (480, 480), (5, 7, 13, 255))
    badge = resize(round_badge, 440)
    splash.paste(badge, (20, 20), badge)
    splash.convert("RGB").save(RES / "drawable-nodpi" / "splash_logo.png", optimize=True)

    # Full-colour large icon shown inside the notification. 512px keeps it
    # crisp on xxxhdpi screens; 8% padding avoids clipping by rounded masks.
    notif_size = 512
    notif = Image.new("RGBA", (notif_size, notif_size), (0, 0, 0, 0))
    badge_px = round(notif_size * 0.84)
    badge = resize(round_badge, badge_px)
    off = (notif_size - badge_px) // 2
    notif.paste(badge, (off, off), badge)
    notif.save(RES / "drawable-nodpi" / "ic_notif_large.png", optimize=True)

    # Monochrome small icon for the status bar (one PNG per density).
    for density, px in STAT_DENSITIES.items():
        folder = RES / f"drawable-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        stat_mark(px).save(folder / "ic_stat_autox.png", optimize=True)

    # ---- QA sheets ---------------------------------------------------------
    sizes = [48, 72, 96, 144, 192]
    pad = 24
    width = sum(sizes) + pad * (len(sizes) + 1)
    height = max(sizes) + pad * 2
    for name, bg in (("light", (244, 247, 252, 255)), ("dark", (7, 12, 22, 255))):
        sheet = Image.new("RGBA", (width, height), bg)
        x = pad
        for px in sizes:
            icon = resize(round_badge, px)
            sheet.paste(icon, (x, (height - px) // 2), icon)
            x += px + pad
        sheet.convert("RGB").save(QA / f"launcher-{name}.png", optimize=True)

    # Adaptive icon preview: circle + squircle masks over the 72dp viewport.
    canvas = 432
    visible = 288
    fg = Image.open(RES / "mipmap-xxxhdpi" / "ic_launcher_foreground.png").convert("RGBA")
    bg = Image.new("RGBA", (canvas, canvas), (5, 7, 13, 255))
    bg.alpha_composite(fg)
    view = bg.crop(
        ((canvas - visible) // 2, (canvas - visible) // 2,
         (canvas + visible) // 2, (canvas + visible) // 2)
    )
    preview = Image.new("RGB", (visible * 3 + 80, visible + 40), (18, 24, 34))
    for i, kind in enumerate(("circle", "squircle", "rounded")):
        layer = Image.new("RGBA", (visible, visible), (0, 0, 0, 0))
        layer.paste(view, (0, 0))
        mask = Image.new("L", (visible, visible), 0)
        d = ImageDraw.Draw(mask)
        if kind == "circle":
            d.ellipse([8, 8, visible - 8, visible - 8], fill=255)
        elif kind == "squircle":
            d.rounded_rectangle([8, 8, visible - 8, visible - 8], radius=90, fill=255)
        else:
            d.rounded_rectangle([8, 8, visible - 8, visible - 8], radius=64, fill=255)
        layer.putalpha(mask)
        preview.paste(layer, (20 + i * (visible + 20), 20), layer)
    preview.save(QA / "adaptive-preview.png", optimize=True)

    # Notification preview: full-colour large icon + monochrome status mark.
    notif_preview = Image.new("RGB", (760, 300), (18, 24, 34))
    for row, (bgcol, tint) in enumerate(
        (((7, 12, 22, 255), (245, 250, 255, 255)), ((244, 247, 252, 255), (15, 35, 55, 255)))
    ):
        y = 12 + row * 144
        tile = Image.new("RGBA", (736, 132), bgcol)
        large = resize(round_badge, 112)
        tile.alpha_composite(large, (10, 10))
        x = 142
        for px in (24, 48, 96):
            mark = stat_mark(px)
            colored = Image.new("RGBA", mark.size, tint)
            colored.putalpha(mark.getchannel("A"))
            tile.alpha_composite(colored, (x, (132 - px) // 2))
            x += px + 34
        notif_preview.paste(tile.convert("RGB"), (12, y))
    notif_preview.save(QA / "notification-preview.png", optimize=True)

    print("Icons generated in", RES)
    print("QA sheets in", QA)


if __name__ == "__main__":
    main()
