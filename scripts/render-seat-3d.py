"""Render the furniture of a seat — the bezel round a portrait, and the plate.

    /Applications/Blender.app/Contents/MacOS/Blender --background \\
        --python scripts/render-seat-3d.py -- --part ring [--samples 400]

Why this is not CSS. A gradient fades one colour into another along a line,
which is not what light does to a piece of metal: a band takes a bright catch
where it faces the lamp, a dark one where it turns away, and a narrow specular
streak between the two, and the whole pattern rotates as the band curves. The
old bezel approximated that with a height field and a hand-written light
vector, and the plate approximated it with three stacked gradients — which is
why they never quite sat on the same table as each other, let alone on the
table, which is lit by a real lamp in `render-table-3d.py`.

So both are modelled and lit here instead, under one lamp, and the app loads
the pictures. Metal is mostly a mirror, so there is a lit ceiling overhead for
it to reflect: a metal ring in an empty world renders black, however hard you
light it.

The plate is rendered as a tile to be cut up by CSS `border-image` — corners
held at their own size, edges stretched — because a nameplate has to be as wide
as the name on it, and a picture of a slab cannot be.
"""

import argparse
import math
import sys

import bpy

# The lamp sits over the viewer's left shoulder, which is where the table's
# lamp is and where every shadow in the app already falls. Screen axes, since
# the camera looks straight down: -X is left, +Y is up.
KEY = (-2.1, 2.5, 3.4)
FILL = (2.6, -1.8, 1.9)

PARTS = {
    # A ring, drawn at four times the size it is used at so it stays crisp on a
    # phone. `band` is its width as a share of the radius, and the app's
    # padding has to match it or the portrait will not sit inside the metal.
    'ring': {'size': (512, 512), 'out': 'public/seat-ring.png'},
    # A tile to be sliced. Wide enough that the middle is plainly flat, so the
    # stretched part of the slice carries no detail that could smear.
    'plate': {'size': (512, 256), 'out': 'public/seat-plate.png'},
}

BAND = 0.1  # the bezel's width, as a share of the outer radius


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, base, roughness, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def ring():
    """A half-round bead of metal, and a dark lip inside it.

    The bead is what catches the light. The lip is what makes the portrait read
    as set into the seat rather than pasted on top of it: a real bezel has a
    shoulder the picture drops behind, and without it the ring is a circle
    drawn around a photograph.
    """
    outer = 1.0
    minor = BAND / 2
    bpy.ops.mesh.primitive_torus_add(
        major_radius=outer - minor,
        minor_radius=minor,
        major_segments=256,
        minor_segments=48,
        location=(0, 0, 0),
    )
    bead = bpy.context.active_object
    bead.name = 'bead'
    # Flattened hard. A full round seen from straight above is nearly all
    # flank, and a flank reflects the sky at the horizon, which is the dark
    # part — that renders as a black tyre. Flattened, most of the band faces
    # the ceiling and only its two rolled edges catch the turn.
    bead.scale = (1, 1, 0.34)
    bpy.ops.object.shade_smooth()
    bead.data.materials.append(material('steel', (0.66, 0.675, 0.71), 0.34, metallic=1.0))

    inner = outer - BAND
    bpy.ops.mesh.primitive_torus_add(
        major_radius=inner,
        minor_radius=minor * 0.5,
        major_segments=192,
        minor_segments=24,
        location=(0, 0, -minor * 0.5),
    )
    lip = bpy.context.active_object
    lip.name = 'lip'
    lip.scale = (1, 1, 0.8)
    bpy.ops.object.shade_smooth()
    lip.data.materials.append(material('lip', (0.02, 0.02, 0.025), 0.55))

    return 2.02  # how wide a view the camera needs, with room for the shadow


def plate():
    """A slab with a rounded, bevelled edge — the nameplate, before it is cut up.

    Modelled at the proportions of the widest plate it will be stretched to, so
    the corners the slice keeps are the corners it was drawn with.
    """
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
    slab = bpy.context.active_object
    slab.name = 'plate'
    slab.scale = (1.0, 0.5, 0.11)
    bpy.ops.object.transform_apply(scale=True)

    bevel = slab.modifiers.new('bevel', 'BEVEL')
    bevel.width = 0.085
    bevel.segments = 10
    bevel.limit_method = 'ANGLE'
    bpy.ops.object.shade_smooth()
    slab.data.materials.append(material('plate', (0.055, 0.058, 0.062), 0.38))
    return 2.28


def light():
    """A graded sky, and one lamp for the streak.

    The sky does most of the work. Metal is a mirror before it is a colour, so
    what shades a bezel is not how much light falls on it but what it can see:
    a bright ceiling above and a dark floor below, reflected in a curved band,
    is what puts a catch along its top edge and shade along its bottom. A world
    of one flat colour renders the same ring as a flat ring, however many lamps
    are pointed at it — which is what a CSS gradient was doing all along.
    """
    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links

    coord = nodes.new('ShaderNodeTexCoord')
    split = nodes.new('ShaderNodeSeparateXYZ')
    ramp = nodes.new('ShaderNodeValToRGB')
    # Up is bright, down is nearly black, and the turn between them is high, so
    # the horizon line reads across the bead as a defined edge rather than a
    # smear.
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.09, 0.095, 0.115, 1.0)
    ramp.color_ramp.elements[1].position = 0.45
    ramp.color_ramp.elements[1].color = (0.88, 0.9, 0.98, 1.0)

    links.new(coord.outputs['Normal'], split.inputs['Vector'])
    links.new(split.outputs['Z'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], nodes['Background'].inputs['Color'])
    nodes['Background'].inputs['Strength'].default_value = 1.0
    bpy.context.scene.world = world

    # One lamp, for the specular streak the sky alone cannot give: a small
    # bright source reflected as a small bright highlight.
    data = bpy.data.lights.new('key', 'AREA')
    data.energy = 140
    data.size = 1.6
    key = bpy.data.objects.new('key', data)
    key.location = KEY
    bpy.context.collection.objects.link(key)
    at = bpy.data.objects.new('key-at', None)
    bpy.context.collection.objects.link(at)
    track = key.constraints.new('TRACK_TO')
    track.target = at
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'


def camera(view):
    """Straight down, and orthographic: a bezel has no vanishing point."""
    data = bpy.data.cameras.new('camera')
    data.type = 'ORTHO'
    data.ortho_scale = view
    obj = bpy.data.objects.new('camera', data)
    obj.location = (0, 0, 6)
    obj.rotation_euler = (0, 0, 0)
    bpy.context.collection.objects.link(obj)
    bpy.context.scene.camera = obj


def render(part, samples, out):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.device = 'GPU'
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
    except Exception as error:  # a machine without Metal renders on its cores
        print('rendering on the CPU:', error)

    # AgX, the default, would pull every colour towards grey — the same thing
    # that rendered the table's cloth sage until it was turned off.
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'

    scene.render.resolution_x, scene.render.resolution_y = part['size']
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('wrote', out)


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--part', choices=sorted(PARTS), default='ring')
    parser.add_argument('--samples', type=int, default=400)
    parser.add_argument('--out')
    args = parser.parse_args(argv)
    part = PARTS[args.part]

    clear()
    view = ring() if args.part == 'ring' else plate()
    light()
    camera(view)
    render(part, args.samples, args.out or part['out'])
    print('band is', f'{BAND * 100:.1f}%', 'of the radius')


if __name__ == '__main__':
    main()
