"""Render the table as a 3D model, lit, rather than as a shaded height field.

`render-table.py` computes the table with maths: a height at every pixel and a
lamp. It gets the shape right, but it cannot do what a renderer does — light
bouncing off the cloth into the underside of the rail, the soft edge of a
shadow, cloth that scatters and leather that does not.

This builds the same table out of real geometry and hands it to Cycles.

    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/render-table-3d.py -- --pose desktop

The model is this file rather than a `.blend`: a script can be read and
reviewed, and a binary cannot. Nothing here runs at build time — the PNGs it
writes are committed, exactly like the ones from the flat renderer.
"""

import argparse
import math
import sys

import bpy

# The table, in metres. A real nine-handed table is about 2.1m by 1.1m.
HALF_STRAIGHT = 0.52  # half the straight run down each side
END_RADIUS = 0.55  # the radius of each rounded end
RAIL_RADIUS = 0.075  # the cushion's own thickness
SKIRT = 0.13  # how far the table's body drops below the cloth

POSES = {
    # Landscape: the wide 2:1 felt a desktop draws.
    'desktop': {
        'size': (1280, 640),
        'camera': (0.0, -2.62, 1.46),
        'lens': 52,
        'out': 'public/table-desktop-salon.png',
    },
    # Portrait: the same table stood on its end for a phone.
    'mobile': {
        'size': (864, 1152),
        'camera': (0.0, -1.95, 2.55),
        'lens': 50,
        'turn': True,
        'out': 'public/table-mobile.png',
    },
}


def clear():
    """An empty file. Blender starts with a cube, a lamp and a camera in it."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def stadium(name, z=0.0, fill=True, bevel=None, extrude=0.0):
    """A curve round the table's outline: two straight runs and two half-ends.

    Everything the table is made of comes from this one shape — the cloth is it
    filled, the cushion is it swept with a circle, the body is it extruded down
    — so nothing can drift out of line with anything else.
    """
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D' if fill else '3D'
    curve.fill_mode = 'BOTH' if fill else 'FULL'
    curve.resolution_u = 12
    if bevel is not None:
        curve.bevel_depth = bevel
        curve.bevel_resolution = 8
        curve.dimensions = '3D'
        curve.fill_mode = 'FULL'
    if extrude:
        curve.extrude = extrude

    spline = curve.splines.new('POLY')
    points = []
    steps = 64
    for i in range(steps + 1):  # the right-hand end, from bottom to top
        angle = -math.pi / 2 + math.pi * i / steps
        points.append((HALF_STRAIGHT + END_RADIUS * math.cos(angle), END_RADIUS * math.sin(angle)))
    for i in range(steps + 1):  # and the left-hand one, back again
        angle = math.pi / 2 + math.pi * i / steps
        points.append((-HALF_STRAIGHT + END_RADIUS * math.cos(angle), END_RADIUS * math.sin(angle)))

    spline.points.add(len(points) - 1)
    for point, (x, y) in zip(spline.points, points):
        point.co = (x, y, 0.0, 1.0)
    spline.use_cyclic_u = True

    obj = bpy.data.objects.new(name, curve)
    obj.location.z = z
    bpy.context.collection.objects.link(obj)
    return obj


def material(name, base, roughness, metallic=0.0, sheen=0.0, bump=None):
    """A Principled surface, which is what every real material here is."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if sheen and 'Sheen Weight' in bsdf.inputs:
        # Cloth catches light at a grazing angle: this is what makes felt read
        # as felt rather than as green plastic.
        bsdf.inputs['Sheen Weight'].default_value = sheen
        bsdf.inputs['Sheen Roughness'].default_value = 0.35

    if bump:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = bump[0]
        noise.inputs['Detail'].default_value = 8.0
        bumper = nodes.new('ShaderNodeBump')
        bumper.inputs['Strength'].default_value = bump[1]
        links.new(noise.outputs['Fac'], bumper.inputs['Height'])
        links.new(bumper.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def build():
    """The table: cloth, cushion, body, and the metal line set into the rail."""
    cloth = stadium('cloth', z=0.0)
    cloth.scale = (0.92, 0.86, 1.0)  # the felt stops short of the cushion
    cloth.data.materials.append(
        material('felt', (0.024, 0.092, 0.055), 0.95, sheen=0.45, bump=(520.0, 0.045))
    )

    rail = stadium('rail', z=0.012, fill=False, bevel=RAIL_RADIUS)
    rail.data.materials.append(material('leather', (0.014, 0.014, 0.017), 0.52, bump=(900.0, 0.1)))

    body = stadium('body', z=-SKIRT, extrude=SKIRT / 2)
    body.scale = (0.99, 0.99, 1.0)
    body.data.materials.append(material('body', (0.014, 0.014, 0.016), 0.6))

    inlay = stadium('inlay', z=0.052, fill=False, bevel=0.004)
    inlay.scale = (0.955, 0.925, 1.0)
    inlay.data.materials.append(material('brass', (0.62, 0.48, 0.22), 0.28, metallic=1.0))

    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -SKIRT - 0.02))
    floor = bpy.context.active_object
    floor.name = 'floor'
    floor.is_shadow_catcher = True
    floor.data.materials.append(material('floor', (0.02, 0.025, 0.022), 0.85))


def light():
    """One soft lamp over the table, and a dim fill, as a card room is lit."""
    key = bpy.data.lights.new('key', 'AREA')
    key.energy = 58
    key.size = 1.9
    key.color = (1.0, 0.95, 0.86)
    key_obj = bpy.data.objects.new('key', key)
    key_obj.location = (-0.15, -0.08, 1.95)
    key_obj.rotation_euler = (math.radians(8), math.radians(-7), 0)
    bpy.context.collection.objects.link(key_obj)

    fill = bpy.data.lights.new('fill', 'AREA')
    fill.energy = 9
    fill.size = 4.0
    fill.color = (0.72, 0.86, 0.95)
    fill_obj = bpy.data.objects.new('fill', fill)
    fill_obj.location = (1.6, -1.4, 1.5)
    fill_obj.rotation_euler = (math.radians(52), 0, math.radians(38))
    bpy.context.collection.objects.link(fill_obj)

    rim = bpy.data.lights.new('rim', 'AREA')
    rim.energy = 60
    rim.size = 3.0
    rim.color = (0.7, 0.82, 1.0)
    rim_obj = bpy.data.objects.new('rim', rim)
    rim_obj.location = (0.4, 2.6, 1.5)
    rim_obj.rotation_euler = (math.radians(118), 0, math.radians(8))
    bpy.context.collection.objects.link(rim_obj)

    world = bpy.data.worlds.new('room')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.03, 0.025, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    bpy.context.scene.world = world


def camera(pose):
    """Where a player's eye is: across the table rather than above it."""
    data = bpy.data.cameras.new('camera')
    data.lens = pose['lens']
    obj = bpy.data.objects.new('camera', data)
    x, y, z = pose['camera']
    obj.location = (x, y, z)
    bpy.context.collection.objects.link(obj)

    target = bpy.data.objects.new('target', None)
    target.location = (0, 0, 0)
    bpy.context.collection.objects.link(target)
    track = obj.constraints.new('TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    bpy.context.scene.camera = obj


def render(pose, samples, out):
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
        print('rendering on', [d.name for d in prefs.devices if d.use])
    except Exception as error:  # a machine without Metal renders on its cores
        print('rendering on the CPU:', error)

    scene.render.resolution_x, scene.render.resolution_y = pose['size']
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('wrote', out)


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--pose', choices=sorted(POSES), default='desktop')
    parser.add_argument('--samples', type=int, default=160)
    parser.add_argument('--out')
    args = parser.parse_args(argv)
    pose = POSES[args.pose]

    clear()
    build()
    if pose.get('turn'):
        # The phone's table is the same one, stood on its end.
        for obj in bpy.context.collection.objects:
            if obj.type == 'CURVE':
                obj.rotation_euler.z = math.radians(90)
    light()
    camera(pose)
    render(pose, args.samples, args.out or pose['out'])


if __name__ == '__main__':
    main()
