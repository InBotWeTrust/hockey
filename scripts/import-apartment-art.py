"""Import approved layered artwork; resize/crop only, no semantic image edits.

Usage: python3 scripts/import-apartment-art.py /path/to/artifacts
Requires Pillow. The source prototypes remain outside the application.
"""
from pathlib import Path
from PIL import Image
import json
import sys

art = Path(sys.argv[1])
repo = Path(__file__).resolve().parents[1]
out = repo / 'packages/web/public/apartment'
out.mkdir(parents=True, exist_ok=True)
base = art / 'apartment-layout5-art-v1-2026-11-10'
shop = art / 'apartment-shop-v1-2026-11-11'
design = art / 'apartment-designs-v2-2026-11-11'
decor = art / 'apartment-decor-v1-2026-11-11'
read = lambda p: json.loads(p.read_text())
layout, meta = read(base/'layout.json'), read(base/'image-metadata.json')
brief, scenes, accessories = read(design/'design-brief.json'), read(design/'scenes.json'), read(decor/'manifest.json')
new = {a['id']: a for a in brief['assets']}
old = {a['id']: a for a in read(shop/'manifest.json')['assets']}
extra = {a['id']: a for a in accessories['assets']}
natural = art / 'apartment-natural-base-v1-2026-11-11'
natural_assets = {a['id']:a for a in read(natural/'manifest.json')['assets']} if (natural/'manifest.json').exists() else {}
natural_design = art / 'apartment-natural-designs-v1-2026-11-11'
natural_design_assets = {a['id']:a for a in read(natural_design/'manifest.json')['assets']} if (natural_design/'manifest.json').exists() else {}
cache = {}
provenance = []

def asset(category, tier=0):
    key = f'{category}-{tier}'
    if key in natural_design_assets:
        a = natural_design_assets[key]
        return natural_design / a['file'], a
    folder, a = (base, meta[category]) if not tier else (design, new[key]) if key in new else (decor, extra[key]) if key in extra else (shop, old[key])
    source = folder / a.get('file', key+'.png')
    return source, a

def imported(source):
    if source in cache: return cache[source]
    im = Image.open(source).convert('RGBA')
    box = im.getchannel('A').getbbox() or (0, 0, im.width, im.height)
    cropped = im.crop(box)
    cropped.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    filename = f'{source.parent.name.split("-v")[0]}-{source.stem}.webp'
    if not (out/filename).exists() or source.stat().st_mtime > (out/filename).stat().st_mtime:
        cropped.save(out/filename, 'WEBP', quality=88, method=6)
    value = ('/apartment/'+filename, box)
    cache[source] = value
    provenance.append({'source':str(source.relative_to(art)), 'output':filename, 'operation':'alpha crop, uniform resize, WebP quality 88'})
    return value

def image(category, tier, placement, identity=None):
    source, a = asset(category, tier)
    b = a.get('bbox', [0, 0, a['width'], a['height']])
    if 'anchor' in placement:
        anchor = placement['anchor']; scale = anchor['scale']
        x = anchor['target'][0]-anchor['source'][0]*scale
        y = anchor['target'][1]-anchor['source'][1]*scale
    else:
        scale = placement['w']/(b[2]-b[0]) if 'w' in placement else placement['h']/(b[3]-b[1])
        x = placement['x']-b[0]*scale
        y = (placement['y'] if 'y' in placement else placement['bottom']-(b[3]-b[1])*scale)-b[1]*scale
    layer = native_image(source, x, y, scale, identity or category)
    if category == 'desk': layer['supportY'] = y + b[1]*scale + 2
    return layer

def native_image(source, x, y, scale, identity):
    src, crop = imported(source)
    return {'kind':'image','id':identity,'src':src,'x':x+crop[0]*scale,'y':y+crop[1]*scale,'width':(crop[2]-crop[0])*scale,'height':(crop[3]-crop[1])*scale}

def architecture(tier):
    result = []
    for l in layout['layers']:
        if 'material' in l:
            src, _ = imported(asset(l['material'], tier)[0])
            result.append({'kind':'surface','id':l['id'],'src':src,'points':' '.join(','.join(str(v) for v in p) for p in l['polygon']),'shade':l['shade'],'pattern':l['material']=='walls'})
        elif l.get('type') == 'trim':
            result.append({'kind':'trim','id':'trim','points':' '.join(','.join(str(v) for v in p) for p in l['points'])})
    return result

def base_sprite(l):
    name = l['id']
    if name not in natural_assets:
        return native_image(asset(l['asset'])[0],l['x'],l['y'],l['scale'],name)
    old = meta[l['asset']]['bbox']; a = natural_assets[name]; new = a['bbox']
    scale = (old[3]-old[1])*l['scale']/(new[3]-new[1]) if name == 'player' else (old[2]-old[0])*l['scale']/(new[2]-new[0])
    x = l['x']+(old[0]+old[2])/2*l['scale']-(new[0]+new[2])/2*scale
    y = l['y']+old[3]*l['scale']-new[3]*scale
    return native_image(natural/a['file'],x,y,scale,name)

def base_decor(category, placement):
    if category not in natural_assets: return image(category,1,placement,'decor-'+category+'-0')
    a = natural_assets[category]; b = a['bbox']; scale = placement['w']/(b[2]-b[0])
    return native_image(natural/a['file'],placement['x']-b[0]*scale,placement['bottom']-b[3]*scale,scale,'decor-'+category+'-0')

def ellipse(identity,x,y,rx,ry,opacity,blur,category=None):
    layer = {'kind':'shadow','id':identity,'cx':x,'cy':y,'rx':rx,'ry':ry,'opacity':opacity,'blur':blur}
    if category: layer['decor']=category
    return layer

def foot_contacts(layer, cutoff):
    # Detect separate feet in the lower alpha mask, then map them to scene space.
    filename = layer['src'].split('/')[-1]; im=Image.open(out/filename).convert('RGBA')
    scale=min(1,384/im.width); mask=im.getchannel('A').resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.NEAREST)
    w,h=mask.size; pix=mask.load(); seen=set(); contacts=[]
    for y in range(round(h*cutoff),h):
        for x in range(w):
            if (x,y) in seen or pix[x,y]<96: continue
            todo=[(x,y)];seen.add((x,y));points=[]
            while todo:
                cx,cy=todo.pop();points.append((cx,cy))
                for nx,ny in [(cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)]:
                    if 0<=nx<w and round(h*cutoff)<=ny<h and (nx,ny) not in seen and pix[nx,ny]>=96:
                        seen.add((nx,ny));todo.append((nx,ny))
            if len(points)<5: continue
            bottom=max(v[1] for v in points); edge=[v[0] for v in points if v[1]>=bottom-1]
            px=sum(edge)/len(edge)/w; py=(bottom+1)/h
            contacts.append((layer['x']+px*layer['width'],layer['y']+py*layer['height']))
    return contacts

result = []
base_layers = architecture(0)
base_images = {l['id']:base_sprite(l) for l in layout['layers'] if 'asset' in l}
# Keep the desk beside the cabinet; shift its whole working area before deriving shadows.
desk_source = natural / natural_assets['desk']['file']
base_desk = base_images['desk']
_, desk_crop = imported(desk_source)
base_images['desk']['supportY'] = base_desk['y'] + (natural_assets['desk']['bbox'][1]-desk_crop[1])*base_desk['width']/(desk_crop[2]-desk_crop[0]) + 2
base_desk_shift = 25
for name in ['desk','chair']:
    base_images[name]['x'] += base_desk_shift
# A calibrated top-plane point on the new cabinet supports the unchanged television.
if 'tv-stand' in natural_assets:
    stand=base_images['tv-stand'];a=natural_assets['tv-stand'];src,crop=imported(natural/a['file'])
    sc=stand['width']/(crop[2]-crop[0]);support_y=stand['y']+(105-crop[1])*sc
    tv=base_images['tv'];old_tv=next(l for l in layout['layers'] if l['id']=='tv');oldmeta=meta[old_tv['asset']];old_bottom=old_tv['y']+oldmeta['bbox'][3]*old_tv['scale']
    tv['y']+=support_y+.35-old_bottom
else: support_y=398
# Diffuse shadows below all furniture, plus small dense contact cores at each foot.
contact_report=[]
floor_shadows=[]
base_layers.append(ellipse('wall-floor-ambient',490,445,410,4,.09,4))
for name,cutoff in [('sofa',.90),('coffee-table',.52),('desk',.53),('chair',.67),('tv-stand',.96),('player',.93)]:
    layer=base_images[name];contacts=foot_contacts(layer,cutoff);contact_report.append({'id':name,'contacts':contacts})
    if name!='player':
        cx=layer['x']+layer['width']/2;cy=max((p[1] for p in contacts),default=layer['y']+layer['height'])
        floor_shadows.append(ellipse('cast-'+name,cx-11,cy+2,layer['width']*.46,7 if name=='sofa' else 4,.13,4))
    for i,(x,y) in enumerate(contacts):
        floor_shadows.append(ellipse(f'cast-foot-{name}-{i}',x-6,y+1,11 if name=='player' else 8,2.3,.13,2))
        floor_shadows.append(ellipse(f'contact-{name}-{i}',x,y,7 if name=='player' else 5,1.1,.28,.65))

cup_index=0
for l in layout['layers']:
    if 'asset' not in l: continue
    layer=base_images[l['id']]
    if l['id'].startswith('cup-'):
        layer['trophyIndex']=cup_index;cup_index+=1
    if l['id'] in ['picture','vitrine','window','radiator','rug']:
        shadow={**layer,'kind':'image-shadow','id':'mounted-shadow-'+l['id'],'dx':-3 if l['id']!='rug' else 0,'dy':2,'blur':2 if l['id']!='rug' else .9,'opacity':.17 if l['id']!='rug' else .12}
        base_layers.append(shadow)
    if l['id']=='sofa': base_layers.append(dict(image('floorlamp',1,accessories['placements']['1']['floorlamp'][0],'decor-floorlamp-0'),decor='floorlamp'))
    if l['id']=='player': base_layers.append(ellipse('seat-contact-player',248,418,31,3.2,.17,2))
    if l['id']=='tv': base_layers.append(ellipse('contact-tv',481,support_y+.7,22,1.2,.23,.7))
    base_layers.append(layer)
    if l['id']=='rug': base_layers.extend(floor_shadows)
    extra_categories={'picture':['poster'],'sofa':['pillows','throw'],'tv':['audio'],'desk':['plant']}.get(l['id'],[])
    for category in extra_categories:
        placement=accessories['placements']['1'][category][0]
        if category=='plant': placement={'x':550+base_desk_shift,'bottom':368,'w':26}
        if category=='audio': placement={'x':535,'bottom':394,'w':12}
        accessory=base_decor(category,placement);accessory['decor']=category
        base_layers.append(ellipse('contact-decor-'+category,accessory['x']+accessory['width']/2,accessory['y']+accessory['height']-.4,accessory['width']*.42,1.1,.22,.7,category))
        base_layers.append(accessory)
(out/'base-contact-points.json').write_text(json.dumps(contact_report,indent=2)+'\n')
result.append({'id':'base','title':'Базовая','description':'Простая квартира: линолеум, обычная мебель и небольшой телевизор.','layers':base_layers})

def mounted_shadow(layer, identity=None, opacity=.13, blur=2, dx=-2, dy=2):
    return {**layer,'kind':'image-shadow','id':identity or 'mounted-shadow-'+layer['id'],'dx':dx,'dy':dy,'blur':blur,'opacity':opacity}

def grounded(layer, cutoff=.9):
    contacts=foot_contacts(layer,cutoff)
    bottom=max((p[1] for p in contacts),default=layer['y']+layer['height'])
    name=layer['id'];category=layer.get('decor')
    shadows=[ellipse('cast-'+name,layer['x']+layer['width']/2-7,bottom+1,layer['width']*.44,4,.12,3,category)]
    # Plinth furniture rests along a broad edge rather than one arbitrary central dot.
    if len(contacts)==1 and name in ['sofa','tv-stand','coffee-table']:
        shadows.append(ellipse('contact-'+name,layer['x']+layer['width']/2,bottom-.4,layer['width']*.37,1.3,.22,1,category))
    else:
        for i,(x,y) in enumerate(contacts):
            shadows.extend([ellipse(f'cast-foot-{name}-{i}',x-4,y+.5,7,1.8,.13,1.7,category),ellipse(f'contact-{name}-{i}',x,y,4,1,.26,.6,category)])
    return shadows

for cfg in scenes['designs']:
    tier = cfg['tier']; parts = []
    placements={c:dict(p) for c,p in cfg['placements'].items()}
    if tier==1:
        for c in ['desk','chair']: placements[c]['x']+=18
    if tier==2:
        placements['tv-stand'].update(x=388,w=74)
    objects={c:image(c,tier,p) for c,p in placements.items()}
    # The supported screen and tabletop accessories follow the actual new top plane.
    stand=objects['tv-stand']
    stand_top=stand['y']+stand['height']*.11
    if tier==1:
        tv=objects['tv'];tv['y']=stand_top-tv['height']+.5
    parts.append((33,ellipse('wall-floor-ambient',490,445,410,4,.09,4)))
    for c,p in placements.items():
        layer=objects[c];z=p['z']
        floor=c in ['sofa','chair','tv-stand','coffee-table','armchair','desk'] and not (c=='desk' and tier==3)
        if floor:
            cutoff={'desk':.58,'chair':.83,'coffee-table':.7}.get(c,.94)
            parts.extend((36,l) for l in grounded(layer,cutoff))
        if c in ['picture','vitrine','window','radiator','curtains','aircon','pendant','rug'] or (c=='tv' and tier>1) or (c=='desk' and tier==3):
            parts.append((z-.01,mounted_shadow(layer,opacity=.09 if c in ['rug','curtains','pendant'] else .13,blur=.8 if c=='rug' else 2)))
        if c=='tv' and tier==1:
            parts.append((z-.01,ellipse('contact-tv',layer['x']+layer['width']/2,stand_top,layer['width']*.36,1,.21,.7)))
        parts.append((z,layer))
        if c == 'vitrine':
            i = 0
            for row in cfg['cupRows']:
                for x in row['x']:
                    cup = image('trophy',0,{'x':p['x']+layer['width']*x-5,'bottom':p['y']+layer['height']*row['y']+cfg.get('cupOffset',0),'w':10},f'cup-{i}')
                    cup['trophyIndex'] = i; parts.append((z+.1,cup)); i+=1
    for c,decor_placements in accessories['placements'][str(tier)].items():
        for index,original in enumerate(decor_placements):
            p=dict(original)
            if tier==1 and c=='plant':
                p['x']+=18;p['bottom']=objects['desk']['y']+objects['desk']['height']*.1
            if tier==1 and c=='audio':p['bottom']=stand_top
            layer=image(c,tier,p,f'decor-{c}-{index}');layer['decor']=c;z=p['z']
            if c=='floorlamp' or (c=='plant' and tier>1):
                parts.extend((36,l) for l in grounded(layer,.95))
                # Stable support marker for optional floor decor as well as table decor.
                parts.append((z-.01,ellipse('contact-'+layer['id'],layer['x']+layer['width']/2,layer['y']+layer['height'],layer['width']*.28,1,.22,.8,c)))
            elif c=='poster' or (c=='audio' and tier>1):
                parts.append((z-.01,mounted_shadow(layer,'contact-'+layer['id'],opacity=.14)))
            else:
                parts.append((z-.01,ellipse('contact-'+layer['id'],layer['x']+layer['width']/2,layer['y']+layer['height']-.4,layer['width']*.40,1,.22,.7,c)))
            parts.append((z,layer))
    original_player=next(l for l in layout['layers'] if l['id']=='player')
    player=base_sprite(original_player);player['y']+=cfg['playerDy']
    parts.extend((36,l) for l in grounded(player,.93))
    parts.append((69,ellipse('seat-contact-player',248,418+cfg['playerDy'],31,3.2,.17,2)))
    parts.append((70,player))
    result.append({'id':['base','scandinavian','modern','premium'][tier],'title':cfg['name'],'description':cfg['description'],'layers':architecture(tier)+[l for _,l in sorted(parts,key=lambda p:p[0])]})

(repo/'packages/web/src/profile/home/apartmentDesigns.ts').write_text("// Generated from approved apartment prototypes by scripts/import-apartment-art.py.\nimport type { ApartmentDesign } from './apartmentTypes.js';\nexport const apartmentDesigns: ApartmentDesign[] = "+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n')
(out/'provenance.json').write_text(json.dumps({'tool':'built-in image_gen','assets':provenance,'promptAttribution':'image skill by Serge Shima, github.com/smixs/visual-skills, CC BY 4.0'},ensure_ascii=False,indent=2)+'\n')
print(f'Imported {len(cache)} separate WebP assets, {len(result)} designs; {sum(p.stat().st_size for p in out.glob("*.webp"))/1024**2:.1f} MiB')
