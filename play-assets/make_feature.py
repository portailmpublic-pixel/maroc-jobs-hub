from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1024, 500
root = os.path.dirname(os.path.abspath(__file__))
proj = os.path.dirname(root)

# --- Fond dégradé clair, chaleureux et lisible ---
base = Image.new('RGB', (W, H), '#F4F8FB')
top = Image.new('RGB', (W, H), '#FFFFFF')
mask = Image.new('L', (W, H))
md = ImageDraw.Draw(mask)
for y in range(H):
    md.line([(0, y), (W, y)], fill=int(255 * (1 - y / H)))
base = Image.composite(top, base, mask)

d = ImageDraw.Draw(base, 'RGBA')
# Halos doux (turquoise + orange)
glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([-120, -160, 420, 300], fill=(16, 185, 155, 26))
gd.ellipse([690, 250, 1180, 660], fill=(255, 122, 0, 22))
glow = glow.filter(ImageFilter.GaussianBlur(70))
base = Image.alpha_composite(base.convert('RGBA'), glow)
d = ImageDraw.Draw(base, 'RGBA')

# Cercles décoratifs fins (coins, loin du logo)
for cx, cy, r, col in [(-40, 470, 150, (10, 127, 107, 20)), (1060, 30, 170, (11, 29, 51, 16))]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=2)

# --- Logo ---
logo = Image.open(os.path.join(proj, 'app', 'public', 'logo-wide.png')).convert('RGBA')
lw = 660
lh = int(logo.height * lw / logo.width)
logo = logo.resize((lw, lh), Image.LANCZOS)
lx = (W - lw) // 2
ly = 118
base.alpha_composite(logo, (lx, ly))

# --- Accent dégradé ---
accent = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ad = ImageDraw.Draw(accent)
for x in range(300, 724):
    t = (x - 300) / 424
    r = int(255 * (1 - t) + 10 * t)
    g = int(122 * (1 - t) + 127 * t)
    b = int(0 * (1 - t) + 107 * t)
    ad.line([(x, 338), (x, 342)], fill=(r, g, b, 255))
base.alpha_composite(accent)

# --- Texte ---
def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

navy = (11, 29, 51, 255)
muted = (64, 85, 107, 255)

f_tag = font(r'C:\Windows\Fonts\segoeuib.ttf', 30)
f_sub = font(r'C:\Windows\Fonts\segoeui.ttf', 21)

tag = 'Offres d’emploi  •  Marchés publics  •  Concours  •  Exams'
tw = d.textlength(tag, font=f_tag)
d.text(((W - tw) / 2, 360), tag, font=f_tag, fill=navy)

sub = 'Votre avenir professionnel, réuni dans une seule application.'
sw = d.textlength(sub, font=f_sub)
d.text(((W - sw) / 2, 412), sub, font=f_sub, fill=muted)

# Petits points de marque
d.rounded_rectangle([(W - 120) // 2, 452, (W - 120) // 2 + 34, 458], radius=3, fill=(10, 127, 107, 255))
d.rounded_rectangle([(W - 74) // 2, 452, (W - 74) // 2 + 34, 458], radius=3, fill=(255, 122, 0, 255))
d.rounded_rectangle([(W - 28) // 2, 452, (W - 28) // 2 + 34, 458], radius=3, fill=(11, 29, 51, 255))

out = os.path.join(root, 'feature-graphic-1024x500.png')
base.convert('RGB').save(out, 'PNG', optimize=True)
print('saved', out, base.size)
