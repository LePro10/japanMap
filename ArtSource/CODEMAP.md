# CODEMAP – ArtSource
Automatisch erzeugt 2026-10-22 (98 Dateien). Nicht von Hand pflegen – neu erzeugen mit dem Skill `codemap`. Zuerst hier nachsehen, dann nur die passenden Dateien lesen.

## ./
- **build.py** — def run

## buildings/
- **gassho.py** — def wins; def field; def edge_frame; def turn; def tp; def build_variant; def build_small; def build_piece; def build; def preview; def shots
- **gassho_kit.py** — def map_axes; def map_under; def log; class Thatch; def thatch_roof; def tone_patches; def gable; def gwin; def flat; def profile_ground; class Sweep; def shoji_g; def mado; def amado; def frame_posts
- **kiso.py** — def lane; def edge_frame; def build_variant; def kido; def build_piece; def build; def place; def preview; def shots
- **kiso_kit.py** — def flat; def profile_ground; def profile_upper; class Sweep; def slope_box; def stone; def stone_row; def downpipe; def gable; def purlin_ends; def board_roof; def tile_roof; def sode_udatsu; def board_hisashi; def dejoshi
- **koedo.py** — def lane; def edge_frame; def build_variant; def build; def place; def preview; def shots
- **koedo_kit.py** — class C; def flat; def orient; def prism_u; def tile_row; def profile; def op; class Shell; def gable_roof; def hisashi; def hole; def grid_on; def glass_door; def shop_open; def shop_closed
- **koedo_landmarks.py** — def build_tower; def build_brewery; def build
- **koso.py** — def outline; def wall_quad; def strip_map; def cap; def ring; def gbox; def offset; def frame_of; def shaft; def led_edges; def balcony_band; def parapet; def fins; def colonnade; def podium
- **kura.py** — def build_variant; def build; def preview
- **machi.py** — def build_dealer; def build_workshop; def build_house; def build_izakaya; def build
- **machi_kit.py** — def gbox; def wall; def floor; def glass; def shutter_box; def entry_door; def box_balcony; def ecocute; def vent_hood; def meter_box; def carport; def driveway; def block_wall; def gate_post; def slate_roof
- **mill.py** — def wheel; def pit; def flume; def build_mill; def build_pond; def build
- **minato.py** — def quiet; def turn; def tp; def tile_top; def build_variant; def build_hall; def build_piece; def build; def shots
- **minato_kit.py** — def flat; def edge_frame; def corr; def cut; def wall; def corner_trims; def reveal; def trim; def alu_window; def alu_door; def wood_door; def shutter; def open_bay; def boards; def vent
- **shotengai.py** — def quad; def wall; def arc; def build_market; def build
- **shots_5b.py** — def ground; def car; def new; def clear; def place; def front_y; def row; def sakura; def koedo; def yokocho; def mill; def shots
- **shots_5c.py** — def fog; def tokyo; def kanal; def gassho; def minato; def lods; def shots
- **tera.py** — class FZ; def counter; def kohai; def build_hall; def build_sanmon; def build_pagoda; def GK_map; def build_piece; def build; def shots
- **tera_kit.py** — def frame; def uvset; class Roof; def crest_w; def roof_surface; def eave; def rafters; def corner_beams; def ridges; def gable_wall; def stone_platform; def column; def beam; def bracket; def bracket_row
- **tokyo.py** — def op; def build_building; def build_sign; def build; def preview
- **tokyo_center.py** — def build_variant; def build; def place; def preview
- **tokyo_kit.py** — def R; def m; def nb; class F; def orient; def lbox; def tube; def mirror_uv; def profile; class Shell; def hole; def grid_on; def window; def ac_wall; def ac_floor
- **tokyo_signs_kit.py** — def R; def m; def nb; def tube; def yoko; def yoko_out; def tower; def stand; def screen; def billboard; def neon; def lantern_string

## cars/blender/
- **build.py** — def mats_for; def ml; def set_origin; def mirror_outline; def outline_of; def place_pair; def build_parts; def build_wing; def build_interior; def wheel_mats; def tag; def build_wheels; def assemble; def spec_meta; def tri_count
- **carkit.py** — def lin; def hexc; def srgb_arr; def pchip; def material; def image_from_array; def set_collection; def wipe_collection; def link; def empty; def mesh_obj; def apply_mods; def join; def frame; def bm_cyl
- **cars.py** — def seams; def liv_mame; def liv_hachi; def liv_kaze; def liv_rotor; def liv_raiden; def liv_suprema; def liv_kumo; def liv_yama; def liv_hauler
- **export.py** — def export
- **formula.py** — def superellipse; def loft; def f1_texture; def arm_mesh; def gl; def assemble
- **livery.py** — class Livery; def plate_texture; def honeycomb_texture; def carbon_texture
- **render.py** — def studio; def only; def look; def shots
- **sheet.py** — def sheet
- **tuneshots.py** — def objs; def show_opt; def reset; def wheel_shots; def engine_shots
- **tuning.py** — def paint_variant; def engine_mats; def build_engine; def engine_bay; def engine_obj

## characters/
- **anim_kit.py** — def add; def legs_cycle; def arms_cycle; def idle; def walk; def walk_umbrella; def run; def slide; def jump; def fall; def sit; def work; def fish; def phone; def sweep
- **animals.py** — def ctx; def blob; def leg; def cone; def pyramid; def coat; def paint_fn; def flat_reg; def cat_head; def tail; def cat; def chicken; def crow; def pigeon; def goat
- **body_kit.py** — def W; def interp; def torso_w; def torso; def hem_step; def legs; def shoe; def arms; def wide_sleeve; def hand; def neck; def head; def mask; def hair; def lip
- **extras_kit.py** — def fy; def by; def on_front; def strip_front; def vfront; def lapel; def button; def emblem_back; def top_details; def obi; def flowers; def tie; def glasses; def mask; def hand_grip
- **figure_kit.py** — def joints; def make_rig; class FC; def skinned_object; def rigid_object; def lerp_w
- **hand_props.py** — def ctx; def umbrella_open; def umbrella_closed; def briefcase; def phone; def broom; def rod; def bag; def cane; def hammer; def baton; def build; def preview
- **people.py** — def figure; def preview; def build
- **shots.py** — def arrange; def reset; def lineup; def close; def clip_strip; def grip_world; def hold; def scene; def street

## kit/
- **atlas.py** — def value_noise; def fbm; def smoothstep; def vgrad; def srgb; def grime; def flat; def emissive; def rain_streaks; def stone; def plaster; def namako; def wood; def vending_display; def control_panel
- **atlas_details.py** — def layout
- **atlas_figures.py** — def emblem; def yukata_print; def layout
- **atlas_flora.py** — def bark_sugi; def bark_plates; def bark_smooth; def bark_bamboo; def card_sugi; def card_matsu; def card_leaves; def card_momiji; def card_sakura; def card_shidare; def card_take; def card_ajisai; def card_kaki; def card_yanagi; def dense
- **atlas_koso.py** — def module_m; def tower_floor; def lobby_glass; def rail; def louvre; def layout
- **atlas_machi.py** — def siding; def galva; def slate; def brick; def floor_tile; def epoxy; def layout
- **atlas_scatter.py** — def formwork; def kenchi; def tetra_concrete; def film; def granite_polished; def grass_mat; def layout
- **atlas_traffic.py** — def layout
- **core.py** — def scene; def collection; def atlas_images; def atlas_material; def cutout_material; def glass_material; def new_bm; def box; def grid_front; def grid_plane; def slats; def merge; def sweep_loop; def tube_path; def catenary
- **graphics_details.mjs** — const DETAILS
- **graphics_gassho.mjs** — const GASSHO
- **graphics_kiso.mjs** — const KISO
- **graphics_koedo.mjs** — const KOEDO
- **graphics_koso.mjs** — const KOSO
- **graphics_machi.mjs** — const MACHI
- **graphics_minato.mjs** — const MINATO
- **graphics_scatter.mjs** — const SCATTER
- **graphics_signs.mjs** — const SIGNS
- **graphics_tera.mjs** — const TERA
- **graphics_tokyo.mjs** — const TOKYO
- **organic.py** — def lump; def shrub
- **preview.py** — def stage; def render; def details; def shot

## props/
- **bench.py** — def build_variant; def build; def preview
- **bicycle.py** — def build_variant; def build; def preview
- **bus_stop.py** — def build_variant; def build; def preview
- **cemetery.py** — def sotoba; def family; def gorinto; def old; def row; def build; def preview
- **delineator.py** — def reflector; def build; def preview
- **detail_kit.py** — def ctx; def n_; def box; def gfx_box; def cyl; def lathe; def tube; def blob; def disc_face; def build_set; def row_preview
- **discovery_props.py** — def plaque; def binoculars; def start_board; def bleacher; def map_panel; def lookout; def thermos; def bell; def tide_board; def lifering; def driftwood; def rice_trays; def lantern_plaque; def net_ropes; def build
- **fence.py** — def build_variant; def build; def preview
- **garage_props.py** — def caster; def workbench; def tire_rack; def paint_board; def engine_stand; def garage_sign; def tool_cabinet; def floor_jack; def car_lift; def build; def preview
- **greenhouse.py** — def profile; def film; def end_wall; def arch_tube; def house; def build; def preview
- **guardrail.py** — def build_variant; def build; def preview
- **jizo.py** — def figure; def flowers; def cup; def single; def roku; def build; def preview
- **kei_truck.py** — def fr; def gbox; def quad; def wheel; def cab; def bed; def ropes; def crate; def load; def build_variant; def build
- **planter.py** — def R; def build_variant; def build; def preview
- **power_line.py** — def build_span; def build; def preview
- **race_props.py** — def truss; def gantry; def inflatable_arch; def pylon; def tyre; def tyre_stack; def banner_fence; def trophy; def podium; def flag_checker; def build; def preview
- **retaining_wall.py** — def quad; def weep; def concrete; def kenchi; def norimen; def build; def preview
- **road_sign.py** — def plate; def build_variant; def build; def preview
- **rocks.py** — def build_variant; def build; def preview
- **scatter_kit.py** — def ctx; def basis; def post; def disc; def plate; def bolt; def band; def pad; def anchor_bolts; def build_lods; def lineup; def placed; def boxc
- **scatter_shots.py** — def place; def ground; def clear; def harbour; def mountain_road; def field; def village_edge; def kiso_gate; def shots; def closeups
- **signage.py** — def nobori; def event_board; def build; def preview
- **stone_lantern.py** — def build; def preview
- **street_details.py** — def footing; def mirror; def curve_mirror; def frog; def bar; def cone; def koji_board; def post_box; def phone_booth; def super_cub; def umbrella_stand; def smoking_stand; def garbage_station; def manhole; def hydrant_sign
- **street_light.py** — def build_variant; def build; def preview
- **tetrapod.py** — def tetrapod; def bmesh_ico; def build_variant; def build; def preview
- **torii.py** — def build_variant; def build; def preview
- **traffic_cars.py** — def paint_mat; class TC; def ring_pts; def loft_y; def cabin; def wheel; def arch; def gbox; def spec; def plate; def car; def taxi_extras; def truck; def bus; def build_one
- **traffic_light.py** — def build_variant; def build; def preview
- **utility_pole.py** — def r_at; def build_variant; def build; def preview
- **vending_machine.py** — def build_variant; def build_bins; def build; def preview

## vegetation/
- **tree_kit.py** — def R; class Plan; def curve; def taper; class T; def tube; def cards; def oct_core; def curtain; def lump; def build_lod; def finish; def build
- **trees.py** — def sugi; def matsu_niwa; def matsu_aka; def fill_crown; def momiji; def sakura; def shidare; def take; def bush_plan; def kaki; def yanagi; def build; def lineup; def clear; def shots

## web/
- **loader_assets.py** — def woff2; def paths
