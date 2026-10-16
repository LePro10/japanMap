"""People (task 6): the player and the people of the map, as data on one rig.

Each figure is an outfit dict read by body_kit/extras: body type, skin,
top (kind, colour, sleeve, hem, puff), bottom (kind, colour, hem, socks,
belt), shoes, hair, hat and extras. LOD0 near, LOD1 ~45 %, LOD2 ~15 %.
All share the rig in figure_kit (Unity Humanoid names) and the clips in
anim_kit (exported once as SM_Hito_Anims.fbx).

Who is who on the map (ActorSet kinds of the prototype): worker -> Worker,
fisher -> Fisher, visitor -> any pedestrian, seated -> Obaachan/Ojiichan
(on benches); the crowd draws from the pedestrians."""
import math
import random
from mathutils import Vector, Matrix
from kit import core as K
from characters import figure_kit as FK
from characters import body_kit as B
from characters import extras_kit as E

KLASS = 'characters'
NAME = 'People'
ATLAS = 'Figures'

W = B.W

PEOPLE = {
    # ── the player (two choices) ──
    'Driver': dict(body='M', skin='SKIN_A', lod_n=1.25,
                   top=dict(kind='bomber', reg='JACKET_NAVY', sleeve='long', hem=0.985, puff=0.06, stripe='JACKET_ORANGE',
                            inner='TEE_WHITE', emblem=True),
                   bottom=dict(kind='joggers', reg='JOGGER_GREY', hem=0.14),
                   shoes=dict(kind='sneaker', reg='SNEAKER_WHITE', sole='SOLE_CREAM', accent='SNEAKER_ORANGE'),
                   hair=dict(style='messy', reg='HAIR_BLACK'),
                   extras=[('fingerless', 'RIB_BLACK')]),
    'DriverF': dict(body='F', skin='SKIN_A', lod_n=1.25,
                    top=dict(kind='bomber', reg='JACKET_CREAM', sleeve='long', hem=0.985, puff=0.06, stripe='JACKET_ORANGE',
                             inner='TEE_BLACK', emblem=True),
                    bottom=dict(kind='pants', reg='PANTS_BLACK', hem=0.13),
                    shoes=dict(kind='sneaker', reg='SNEAKER_WHITE', sole='SOLE_CREAM', accent='SNEAKER_ORANGE'),
                    hair=dict(style='ponytail', reg='HAIR_BROWN', tie='JACKET_ORANGE'),
                    extras=[]),
    # ── the crowd ──
    'Salaryman': dict(body='M', skin='SKIN_B',
                      top=dict(kind='suit', reg='SUIT_NAVY', sleeve='long', hem=0.9, puff=0.05, shirt='SHIRT_WHITE'),
                      bottom=dict(kind='pants', reg='SUIT_NAVY', hem=0.11, belt='LEATHER_BLACK'),
                      shoes=dict(kind='leather', reg='LEATHER_BLACK', sole='SOLE_DARK'),
                      hair=dict(style='side', reg='HAIR_BLACK'),
                      extras=[('tie', 'TIE_RED'), ('glasses',)], carry='Briefcase'),
    'SalarymanB': dict(body='M', skin='SKIN_A',
                       top=dict(kind='suit', reg='SUIT_CHARCOAL', sleeve='long', hem=0.9, puff=0.05, shirt='SHIRT_BLUE'),
                       bottom=dict(kind='pants', reg='SUIT_CHARCOAL', hem=0.11, belt='LEATHER_BLACK'),
                       shoes=dict(kind='leather', reg='LEATHER_BROWN', sole='SOLE_DARK'),
                       hair=dict(style='short', reg='HAIR_BROWN'),
                       extras=[('tie', 'TIE_BLUE'), ('mask',), ('lanyard', 'TIE_BLUE')]),
    'OfficeLady': dict(body='F', skin='SKIN_A',
                       top=dict(kind='trench', reg='TRENCH', sleeve='long', hem=0.62, puff=0.06, belt='TRENCH_DARK'),
                       bottom=dict(kind='skirt', reg='TRENCH', legs='TIGHTS_BLACK'),
                       shoes=dict(kind='pumps', reg='LEATHER_BLACK', sole='SOLE_DARK'),
                       hair=dict(style='bob', reg='HAIR_BROWN'),
                       extras=[('shoulder_bag', 'LEATHER_BROWN')]),
    'Student': dict(body='M', skin='SKIN_A',
                    top=dict(kind='gakuran', reg='GAKURAN', sleeve='long', hem=0.93, puff=0.04),
                    bottom=dict(kind='pants', reg='GAKURAN', hem=0.11),
                    shoes=dict(kind='leather', reg='LEATHER_BLACK', sole='SOLE_DARK'),
                    hair=dict(style='crop', reg='HAIR_BLACK'),
                    extras=[('backpack', 'BAG_BLACK_NYLON')]),
    'Schoolgirl': dict(body='F', skin='SKIN_A',
                       top=dict(kind='sailor', reg='SAILOR_WHITE', sleeve='long', hem=1.02, puff=0.03,
                                collar='SAILOR_NAVY', scarf='SCARF_RED', sleeve_reg='SAILOR_WHITE'),
                       bottom=dict(kind='skirt', reg='SKIRT_NAVY', hem=0.56, pleats=True, legs='SKIN_A',
                                   socks=('SOCK_NAVY', 0.42)),
                       shoes=dict(kind='leather', reg='LEATHER_BROWN', sole='SOLE_DARK'),
                       hair=dict(style='long', reg='HAIR_BLACK'),
                       extras=[('school_bag', 'BAG_NAVY')]),
    'Obaachan': dict(body='OLD_F', skin='SKIN_B',
                     top=dict(kind='cardigan', reg='CARDIGAN_PLUM', sleeve='long', hem=0.9, puff=0.07, inner='BLOUSE_FLORAL'),
                     bottom=dict(kind='pants', reg='PANTS_BEIGE', hem=0.12, wide=0.075),
                     shoes=dict(kind='sneaker', reg='CARDIGAN_GREY', sole='SOLE_CREAM'),
                     hair=dict(style='bun', reg='HAIR_GREY'),
                     hat=dict(kind='bucket', reg='SUNHAT_BEIGE'),
                     extras=[], carry='EcoBag'),
    'Ojiichan': dict(body='OLD_M', skin='SKIN_C',
                     top=dict(kind='vest', reg='CARDIGAN_GREY', sleeve='long', sleeve_reg='SHIRT_WHITE', hem=0.92, puff=0.04,
                              inner='SHIRT_WHITE'),
                     bottom=dict(kind='pants', reg='PANTS_BEIGE', hem=0.11, belt='LEATHER_BROWN'),
                     shoes=dict(kind='leather', reg='LEATHER_BROWN', sole='SOLE_DARK'),
                     hair=dict(style='crop', reg='HAIR_WHITE'),
                     hat=dict(kind='flat', reg='CAP_TWEED'),
                     extras=[('glasses',)]),
    'Casual': dict(body='M', skin='SKIN_B',
                   top=dict(kind='hoodie', reg='HOODIE_OLIVE', sleeve='long', hem=0.92, puff=0.08),
                   bottom=dict(kind='pants', reg='DENIM', hem=0.12),
                   shoes=dict(kind='sneaker', reg='TEE_BLACK', sole='SOLE_CREAM', lace='TEE_WHITE'),
                   hair=dict(style='short', reg='HAIR_DYED'),
                   extras=[('backpack', 'BAG_BLACK_NYLON'), ('mask',)]),
    'CasualF': dict(body='F', skin='SKIN_A',
                    top=dict(kind='knit', reg='KNIT_CREAM', sleeve='long', hem=0.97, puff=0.07),
                    bottom=dict(kind='skirt', reg='TRENCH_DARK', hem=0.3, legs='SKIN_A', flare=0.55, socks=('SOCK_WHITE', 0.14)),
                    shoes=dict(kind='sneaker', reg='SNEAKER_WHITE', sole='SOLE_CREAM'),
                    hair=dict(style='long', reg='HAIR_DYED'),
                    extras=[('tote', 'ECO_BAG')]),
    'Yukata': dict(body='F', skin='SKIN_A',
                   top=dict(kind='yukata', reg='YUKATA_INDIGO', sleeve='wide', hem=0.1, puff=0.04, obi='OBI_RED', print=True),
                   bottom=dict(kind='robe', reg='YUKATA_INDIGO', legs='SKIN_A'),
                   shoes=dict(kind='geta', reg='GETA_WOOD'),
                   hair=dict(style='bun', reg='HAIR_BLACK', pin='KANZASHI'),
                   extras=[], carry='Kinchaku'),
    # ── people at work (ActorSet kinds) ──
    'Worker': dict(body='M', skin='SKIN_C',
                   top=dict(kind='work', reg='WORK_NAVY', sleeve='long', hem=0.95, puff=0.06),
                   bottom=dict(kind='tobi', reg='TOBI_BEIGE', hem=0.13),
                   shoes=dict(kind='tabi', reg='TABI_BLACK', sole='SOLE_DARK'),
                   hair=dict(style='crop', reg='HAIR_BLACK'),
                   hat=dict(kind='helmet', reg='HELMET_WHITE', sticker='TENUGUI_BLUE'),
                   gloves='GLOVE_COTTON',
                   extras=[('hivis', 'VEST_ORANGE'), ('neck_towel', 'TOWEL_WHITE'), ('tool_belt', 'LEATHER_BROWN')]),
    'Fisher': dict(body='OLD_M', skin='SKIN_C',
                   top=dict(kind='work', reg='WORK_NAVY', sleeve='long', hem=0.95, puff=0.06),
                   bottom=dict(kind='pants', reg='TOBI_NAVY', hem=0.3),
                   shoes=dict(kind='boots', reg='RUBBER_WHITE', sole='SOLE_DARK', trim='RUBBER_WHITE'),
                   hair=dict(style='crop', reg='HAIR_GREY'),
                   hat=dict(kind='hachimaki', reg='TOWEL_WHITE'),
                   gloves='GLOVE_ORANGE',
                   extras=[('bib_apron', 'APRON_ORANGE')]),
    'Shopkeeper': dict(body='M', skin='SKIN_B',
                       top=dict(kind='happi', reg='HAPPI_INDIGO', sleeve='mid', hem=0.84, puff=0.06, inner='TEE_WHITE'),
                       bottom=dict(kind='pants', reg='PANTS_BLACK', hem=0.11),
                       shoes=dict(kind='sandal', reg='SANDAL_BLACK', sole='SOLE_DARK'),
                       hair=dict(style='crop', reg='HAIR_BLACK'),
                       hat=dict(kind='hachimaki', reg='TENUGUI_BLUE'),
                       extras=[('maekake', 'MAEKAKE_NAVY')]),
    # ── children on the way to school (yellow hat, randoseru) and the traffic guard ──
    'KidBoy': dict(body='KID', skin='SKIN_A',
                   top=dict(kind='work', reg='SHIRT_WHITE', sleeve='short', hem=0.95, puff=0.04),
                   bottom=dict(kind='shorts', reg='SKIRT_NAVY', hem=0.6, socks=('SOCK_WHITE', 0.3)),
                   shoes=dict(kind='sneaker', reg='SNEAKER_WHITE', sole='SOLE_CREAM', accent='TENUGUI_BLUE'),
                   hair=dict(style='crop', reg='HAIR_BLACK'),
                   hat=dict(kind='bucket', reg='HELMET_YELLOW', brim=0.055),
                   extras=[('randoseru', 'LEATHER_BLACK')]),
    'KidGirl': dict(body='KID', skin='SKIN_A',
                    top=dict(kind='knit', reg='CARDIGAN_GREY', sleeve='long', hem=0.97, puff=0.05),
                    bottom=dict(kind='skirt', reg='SKIRT_NAVY', hem=0.6, legs='SKIN_A', flare=0.4, pleats=True,
                                socks=('SOCK_WHITE', 0.42)),
                    shoes=dict(kind='sneaker', reg='SNEAKER_WHITE', sole='SOLE_CREAM'),
                    hair=dict(style='bob', reg='HAIR_BLACK'),
                    hat=dict(kind='bucket', reg='HELMET_YELLOW', brim=0.055),
                    extras=[('randoseru', 'BACKPACK_RED')]),
    'TrafficGuard': dict(body='M', skin='SKIN_B',
                         top=dict(kind='work', reg='WORK_NAVY', sleeve='long', hem=0.95, puff=0.06),
                         bottom=dict(kind='pants', reg='WORK_NAVY', hem=0.11),
                         shoes=dict(kind='leather', reg='LEATHER_BLACK', sole='SOLE_DARK'),
                         hair=dict(style='crop', reg='HAIR_BLACK'),
                         hat=dict(kind='cap', reg='SUIT_NAVY', bill='LEATHER_BLACK', badge=True),
                         gloves='SHIRT_WHITE',
                         extras=[('xbelt', 'REFLECT')], carry='Baton'),
}


def figure(name, o, lod, col, rig, mat):
    body = FK.BODIES[o['body']]
    c = FK.FC(lod, body)
    B.torso(c, o)
    B.legs(c, o)
    B.arms(c, o)
    B.neck(c, o)
    B.head(c, o)
    B.hair(c, o)
    B.hat(c, o)
    E.top_details(c, o)
    for ex in o.get('extras', []):
        E.EXTRAS[ex[0]](c, o, *ex[1:])
    if o.get('mask') or any(e[0] == 'mask' for e in o.get('extras', [])):
        pass
    return FK.skinned_object(f'SM_Hito_{name}_LOD{lod}', c, col, rig, mat)


def preview(results, views):
    """One line-up of everything built (front, back, clay) instead of one picture per figure."""
    from characters import shots as S
    names = [col.name[len('Hito_'):] for col, _ in results]
    paths = []
    for i in range(0, len(names), 8):
        part = names[i:i + 8]
        paths.append(S.lineup(part, f'Hito_People_{i // 8 + 1}', size=(min(1400, 175 * len(part) + 100), 420), gap=0.7,
                              views=[('front', (0.0, -1.7, 0.18), False), ('back', (0.0, 1.7, 0.18), False),
                                     ('clay', (0.5, -1.6, 0.25), 'clay')]))
    return ', '.join(paths)


def build(only=None):
    from kit import core as K
    mat = K.atlas_material(ATLAS, emission_strength=1.0)
    out = []
    for name, o in PEOPLE.items():
        if only and name not in only:
            continue
        col = K.collection(f'Hito_{name}')
        rig = FK.make_rig(f'Rig_{name}', col, FK.BODIES[o['body']])
        lods = [figure(name, o, l, col, rig, mat) for l in range(3)]
        for ob in lods[1:]:
            ob.hide_set(True); ob.hide_render = True
        out.append((col, lods))
    return out
