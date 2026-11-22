"""Gera os arquivos de teste do leitor do fatiador (js/fatiador.js).

Uso: python gerar_fixtures.py [pasta]
Sem pasta, cria uma pasta temporária. No fim imprime o caminho da pasta.
Só biblioteca padrão (Python 3.13). Nada aqui vai para o repositório: o teste (testar.mjs)
gera tudo numa pasta temporária e apaga no fim.

O XML imita, linha a linha, o que o Bambu Studio e o OrcaSlicer gravam
(src/libslic3r/Format/bbs_3mf.cpp: _add_slice_info_config_file_to_archive e
_add_model_config_file_to_archive) e os G-codes imitam as linhas de cabeçalho e rodapé
de cada fatiador (GCode.cpp e GCodeProcessor.cpp do Bambu/Orca, PostProcessor.cpp do
PrusaSlicer, gcode/GCodeExport.cpp do CuraEngine).
"""
import hashlib
import os
import random
import struct
import sys
import tempfile
import zipfile
import zlib

DATA = (2025, 6, 1, 10, 0, 0)

# ---------------------------------------------------------------- pacote 3MF

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
    ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
    ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
    ' <Default Extension="png" ContentType="image/png"/>\n'
    ' <Default Extension="gcode" ContentType="text/x.gcode"/>\n'
    '</Types>'
).encode()

RELS = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
    ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
    ' <Relationship Target="/Metadata/plate_1.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>\n'
    '</Relationships>\n'
).encode()


def modelo_3d():
    """Um cubo de 10 mm, no formato 3MF."""
    v = [(0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0), (0, 0, 10), (10, 0, 10), (10, 10, 10), (0, 10, 10)]
    t = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
         (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    linhas = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
        'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">',
        ' <metadata name="Application">BambuStudio-02.09.01.70</metadata>',
        ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
        ' <resources>',
        '  <object id="1" type="model">',
        '   <mesh>',
        '    <vertices>',
    ]
    linhas += [f'     <vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in v]
    linhas += ['    </vertices>', '    <triangles>']
    linhas += [f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in t]
    linhas += ['    </triangles>', '   </mesh>', '  </object>', ' </resources>',
               ' <build>', '  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0" printable="1"/>', ' </build>', '</model>']
    return ('\n'.join(linhas) + '\n').encode()


def xml_escape(s):
    """Igual ao xml_escape do Bambu (src/libslic3r/utils.cpp)."""
    return (s.replace('&', '&amp;').replace('"', '&quot;').replace("'", '&apos;')
             .replace('<', '&lt;').replace('>', '&gt;'))


def slice_info(placas, orca=False):
    """Metadata/slice_info.config. placas: [{indice, prediction, weight, filamentos: [(id, tipo, cor, m, g)]}]"""
    L = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>', '  <header>',
         '    <header_item key="X-BBL-Client-Type" value="slicer"/>',
         '    <header_item key="X-BBL-Client-Version" value="%s"/>' % ('02.08.01.55' if orca else '02.09.01.70')]
    if orca:
        L.append('    <header_item key="OrcaSlicer-Version" value="2.3.1"/>')
    L.append('  </header>')
    for p in placas:
        L += ['  <plate>',
              f'    <metadata key="index" value="{p["indice"]}"/>',
              '    <metadata key="extruder_type" value="0"/>',
              '    <metadata key="nozzle_volume_type" value="0"/>',
              '    <metadata key="printer_model_id" value="C12"/>',
              '    <metadata key="nozzle_diameters" value="0.4"/>',
              '    <metadata key="timelapse_type" value="0"/>',
              f'    <metadata key="prediction" value="{p["prediction"]}"/>',
              f'    <metadata key="weight" value="{p["weight"]}"/>']
        if not orca:
            L.append('    <metadata key="pause_count" value="0"/>')
        L += ['    <metadata key="first_layer_time" value="187.533325"/>',
              '    <metadata key="outside" value="false"/>',
              '    <metadata key="support_used" value="false"/>',
              '    <metadata key="label_object_enabled" value="true"/>']
        if not orca:
            L.append('    <metadata key="support_material_on_wipe_tower" value="false"/>')
        L += ['    <metadata key="enable_filament_dynamic_map" value="false"/>',
              '    <metadata key="has_filament_switcher" value="false"/>']
        if not orca:
            L.append('    <metadata key="multi_nozzle_diameter_mode" value="0"/>')
        n = max([f[0] for f in p['filamentos']] or [1])
        L.append('    <metadata key="filament_maps" value="%s"/>' % ' '.join(['1'] * n))
        L.append(f'    <object identify_id="{140 + p["indice"]}" name="{xml_escape(p.get("objeto", "Cube"))}" skipped="false" />')
        for fid, tipo, cor, m, g in p['filamentos']:
            if orca:
                L.append(f'    <filament id="{fid}" tray_info_idx="GFL99" type="{tipo}" color="{cor}" used_m="{m}" used_g="{g}" '
                         'group_id="0" nozzle_diameter="0.40" volume_type="Standard" used_for_object="true" used_for_support="false"/>')
            else:
                L.append(f'    <filament id="{fid}" tray_info_idx="GFA00" type="{tipo}" color="{cor}" used_m="{m}" used_g="{g}" '
                         'group_id="" nozzle_diameter="0.40" volume_type="Standard" used_for_object="true" used_for_support="false" '
                         'directly_used="true" total_load_time="0.00" total_unload_time="0.00"/>')
        L.append('    <warning msg="bed_temperature_too_high_than_filament" level="1" error_code ="1000C001"  />')
        L += ['    <layer_filament_lists>',
              '      <layer_filament_list filament_list="0" layer_ranges="0 99" />',
              '    </layer_filament_lists>',
              '  </plate>']
    L.append('</config>')
    return ('\n'.join(L) + '\n').encode()


def model_settings(placas, com_gcode=False):
    """Metadata/model_settings.config. placas: [(indice, nome)]"""
    L = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>',
         '  <object id="2">',
         '    <metadata key="name" value="Cube"/>',
         '    <metadata key="extruder" value="1"/>',
         '    <part id="1" subtype="normal_part">',
         '      <metadata key="name" value="Cube"/>',
         '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
         '      <metadata key="source_file" value="Cube.stl"/>',
         '      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>',
         '    </part>',
         '  </object>']
    for i, nome in placas:
        L += ['  <plate>',
              f'    <metadata key="plater_id" value="{i}"/>',
              f'    <metadata key="plater_name" value="{xml_escape(nome)}"/>',
              '    <metadata key="locked" value="false"/>',
              '    <metadata key="bed_type" value="textured_plate"/>',
              '    <metadata key="print_sequence" value="by layer"/>',
              '    <metadata key="filament_map_mode" value="Auto For Flush"/>',
              '    <metadata key="filament_maps" value="1"/>']
        if com_gcode:
            L.append(f'    <metadata key="gcode_file" value="Metadata/plate_{i}.gcode"/>')
        L += [f'    <metadata key="thumbnail_file" value="Metadata/plate_{i}.png"/>',
              f'    <metadata key="thumbnail_no_light_file" value="Metadata/plate_no_light_{i}.png"/>',
              f'    <metadata key="top_file" value="Metadata/top_{i}.png"/>',
              f'    <metadata key="pick_file" value="Metadata/pick_{i}.png"/>',
              '    <model_instance>',
              '      <metadata key="object_id" value="2"/>',
              '      <metadata key="instance_id" value="0"/>',
              f'      <metadata key="identify_id" value="{140 + i}"/>',
              '    </model_instance>',
              '  </plate>']
    L += ['  <assemble>',
          '   <assemble_item object_id="2" instance_id="0" transform="1 0 0 0 1 0 0 0 1 128 128 5" offset="0 0 0" />',
          '  </assemble>', '</config>']
    return ('\n'.join(L) + '\n').encode()


PROJECT_SETTINGS = (
    '{\n    "filament_colour": [\n        "#00AE42"\n    ],\n    "filament_type": [\n        "PLA"\n    ],\n'
    '    "printer_model": "Bambu Lab P1S",\n    "version": "02.09.01.70"\n}\n'
).encode()


def pacote(slice_xml, nomes, extras=(), com_gcode=False):
    """Entradas de um .3mf do Bambu/Orca (ordem parecida com a do Bambu)."""
    entradas = [('[Content_Types].xml', CONTENT_TYPES), ('_rels/.rels', RELS), ('3D/3dmodel.model', modelo_3d()),
                ('Metadata/project_settings.config', PROJECT_SETTINGS)]
    entradas += list(extras)
    if nomes is not None:
        entradas.append(('Metadata/model_settings.config', model_settings(nomes, com_gcode)))
    if slice_xml is not None:
        entradas.append(('Metadata/slice_info.config', slice_xml))
    return entradas


# ---------------------------------------------------------------- G-codes

def corpo_gcode(n_bytes, semente):
    """Movimentos G1 qualquer, só para encher o arquivo."""
    rnd = random.Random(semente)
    partes, total, x, y, e, z, n = [], 0, 100.0, 100.0, 0.0, 0.2, 0
    while total < n_bytes:
        x = (x + rnd.uniform(-20, 20)) % 250
        y = (y + rnd.uniform(-20, 20)) % 250
        e += rnd.uniform(0.01, 0.5)
        s = f'G1 X{x:.3f} Y{y:.3f} E{e:.5f}\n'
        n += 1
        if n % 500 == 0:
            z += 0.2
            s += f';LAYER_CHANGE\n;Z:{z:.2f}\nG1 Z{z:.2f} F600\n'
        partes.append(s)
        total += len(s)
    return ''.join(partes)


def gcode_bambu(tempo_modelo, tempo_total, comprimentos, pesos, densidades, usados, tipos, cores, tamanho=200_000):
    """G-code do Bambu Studio para impressora Bambu (GCode.cpp e GCodeProcessor.cpp)."""
    L = ['; HEADER_BLOCK_START',
         '; BambuStudio 02.09.01.70',
         f'; model printing time: {tempo_modelo}; total estimated time: {tempo_total}',
         '; total layer number: 75',
         '; total filament length [mm] : ' + ','.join(f'{v:.2f}' for v in comprimentos),
         '; total filament volume [cm^3] : ' + ','.join(f'{v * 2.405:.2f}' for v in comprimentos),
         '; total filament weight [g] : ' + ','.join(f'{v:.2f}' for v in pesos),
         '; filament_density: ' + ','.join(densidades),
         '; filament_diameter: ' + ','.join(['1.75'] * len(densidades)),
         '; max_z_height: 15.00',
         '; filament: ' + ','.join(str(u) for u in usados),
         '; support_material_on_wipe_tower: 0',
         '; Legal and Compliance Notice',
         '; (aviso legal do Bambu Studio, resumido no teste)',
         '; HEADER_BLOCK_END',
         '',
         '; CONFIG_BLOCK_START',
         '; accel_to_decel_enable = 0',
         '; curr_bed_type = Textured PEI Plate',
         '; filament_colour = ' + ';'.join(cores),
         '; filament_density = ' + ','.join(densidades),
         '; filament_diameter = ' + ','.join(['1.75'] * len(densidades)),
         '; filament_settings_id = ' + ';'.join(f'"Bambu {t} Basic @BBL P1S"' for t in tipos),
         '; filament_type = ' + ';'.join(tipos),
         '; layer_height = 0.2',
         '; machine_start_gcode = ;===== machine: P1S ========================\\nG392 S0\\nM9833.2\\nG28\\n',
         '; printer_model = Bambu Lab P1S',
         '; CONFIG_BLOCK_END',
         '',
         '; EXECUTABLE_BLOCK_START',
         'M73 P0 R93',
         'M201 X20000 Y20000 Z500 E5000',
         'G90',
         'M83']
    texto = '\n'.join(L) + '\n' + corpo_gcode(tamanho, 11) + 'M73 P100 R0\n; EXECUTABLE_BLOCK_END\n\n'
    return texto.encode()


def gcode_orca_bbl(tamanho):
    """OrcaSlicer para impressora Bambu: tempo no cabeçalho, pesos no rodapé."""
    cab = ['; HEADER_BLOCK_START',
           '; generated by OrcaSlicer 2.3.1 on 2025-06-01 at 10:00:00',
           '; model printing time: 50m 0s; total estimated time: 55m 30s',
           '; estimated first layer printing time (normal mode) = 1m 30s',
           '; total layer number: 120',
           '; model label id: 75',
           '; filament_density: 1.24,1.27',
           '; filament_diameter: 1.75,1.75',
           '; max_z_height: 24.00',
           '; filament: 1,2',
           '; HEADER_BLOCK_END',
           '',
           '; CONFIG_BLOCK_START',
           '; filament_colour = #FFAA00;#123456',
           '; filament_density = 1.24,1.27',
           '; filament_type = PLA;PETG',
           '; first_layer_bed_temperature = 55',
           '; first_layer_temperature = 220',
           '; CONFIG_BLOCK_END',
           '',
           '; EXECUTABLE_BLOCK_START',
           'M73 P0 R55']
    rod = ['M73 P100 R0',
           '; EXECUTABLE_BLOCK_END',
           '',
           '; filament used [mm] = 2468.10, 1000.00',
           '; filament used [cm3] = 5.94, 2.41',
           '; filament used [g] = 7.36, 3.06',
           '; filament cost = 0.18, 0.08',
           '', '']
    return ('\n'.join(cab) + '\n' + corpo_gcode(tamanho, 22) + '\n'.join(rod)).encode()


def gcode_orca_klipper(tamanho):
    """OrcaSlicer para impressora de outra marca: tudo no rodapé (CONFIG_BLOCK e totais)."""
    cab = ['; HEADER_BLOCK_START',
           '; generated by OrcaSlicer 2.3.1 on 2025-06-01 at 10:00:00',
           '; total layer number: 150',
           '; filament_density: 1.24,1.27',
           '; filament_diameter: 1.75,1.75',
           '; max_z_height: 30.00',
           '; filament: 1',
           '; HEADER_BLOCK_END',
           '',
           '; THUMBNAIL_BLOCK_START',
           ';',
           '; thumbnail begin 32x32 64',
           '; iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAA',
           '; thumbnail end',
           ';',
           '; THUMBNAIL_BLOCK_END',
           '',
           '; EXECUTABLE_BLOCK_START',
           'EXCLUDE_OBJECT_DEFINE NAME=Cube_id_0_copy_0 CENTER=117.5,117.5',
           'M73 P0 R45']
    rod = ['M73 P100 R0',
           '; EXECUTABLE_BLOCK_END',
           '',
           '; CONFIG_BLOCK_START',
           '; bed_shape = 0x0,235x0,235x235,0x235',
           '; filament_colour = #ffaa00;#123456',
           '; filament_density = 1.24,1.27',
           '; filament_diameter = 1.75,1.75',
           '; filament_settings_id = "Generic PLA @System";"Generic PETG @System"',
           '; filament_type = PLA;PETG',
           '; first_layer_bed_temperature = 60',
           '; first_layer_temperature = 210',
           '; first_layer_height = 0.200',
           '; CONFIG_BLOCK_END',
           '',
           '; filament used [mm] = 1234.56, 0.00',
           '; filament used [cm3] = 2.97, 0.00',
           '; filament used [g] = 3.68, 0.00',
           '; filament cost = 0.09, 0.00',
           '; total filament used [g] = 3.68',
           '; total filament cost = 0.09',
           '; total layers count = 150',
           '; estimated printing time (normal mode) = 45m 10s',
           '; estimated first layer printing time (normal mode) = 1m 5s',
           '', '']
    return ('\n'.join(cab) + '\n' + corpo_gcode(tamanho, 33) + '\n'.join(rod)).encode()


def gcode_prusa(tamanho):
    """PrusaSlicer: estatísticas e configuração no fim (PostProcessor.cpp e GCode.cpp)."""
    cab = ['; generated by PrusaSlicer 2.9.0+win64 on 2025-03-06 at 09:27:17 UTC', '', '', ';',
           '; thumbnail begin 16x16 64',
           '; iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAA',
           '; thumbnail end', ';', '',
           'M73 P0 R1563', 'M201 X4000 Y4000 Z200 E2500', 'G28 W', 'G90', 'M83']
    rod = ['M73 P100 R0', 'M84 ; disable motors', '',
           '; objects_info = {"objects":[{"name":"Cube.stl id:0 copy 0","polygon":[[112.5,112.5],[122.5,112.5],[122.5,122.5],[112.5,122.5]]}]}',
           '; filament used [mm] = 676.57, 1200.00',
           '; filament used [cm3] = 1.63, 2.89',
           '; filament used [g] = 2.02, 3.67',
           '; filament cost = 0.05, 0.09',
           '; total filament used [g] = 5.69',
           '; total filament cost = 0.14',
           '; total filament used for wipe tower [g] = 0.00',
           '; total toolchanges = 3',
           '; estimated printing time (normal mode) = 1d 2h 3m 4s',
           '; estimated printing time (silent mode) = 1d 2h 10m 0s',
           '; estimated first layer printing time (normal mode) = 2m 5s',
           '; estimated first layer printing time (silent mode) = 2m 9s',
           '',
           '; prusaslicer_config = begin',
           '; bed_temperature = 60,85',
           '; extruder_colour = #FF8000;#DB5182',
           '; filament_colour = #ff8000;',
           '; filament_density = 1.24,1.27',
           '; filament_diameter = 1.75,1.75',
           '; filament_settings_id = "Prusament PLA";"Prusament PETG"',
           '; filament_type = PLA;PETG',
           '; layer_height = 0.2',
           '; printer_model = MK3S',
           '; prusaslicer_config = end',
           '']
    return ('\n'.join(cab) + '\n' + corpo_gcode(tamanho, 44) + '\n'.join(rod)).encode()


def gcode_cura_marlin():
    """Cura (CuraEngine GCodeExport::getFileHeader, sabor Marlin)."""
    L = [';FLAVOR:Marlin', ';TIME:3723', ';Filament used: 1.23456m', ';Layer height: 0.2',
         ';MINX:112.5', ';MINY:112.5', ';MINZ:0.2', ';MAXX:122.5', ';MAXY:122.5', ';MAXZ:10',
         ';TARGET_MACHINE.NAME:Creality Ender-3 V2', ';Generated with Cura_SteamEngine 5.8.1',
         'M140 S60', 'M105', 'M190 S60', 'M104 S200', 'M109 S200', 'M82 ;absolute extrusion mode',
         'G28 ;Home', 'G92 E0', ';LAYER_COUNT:50', ';LAYER:0']
    corpo = corpo_gcode(60_000, 55)
    rod = [';TIME_ELAPSED:3723.000000', 'G91 ;Relative positioning', 'M84 X Y E ;Disable all steppers but Z',
           'M82 ;absolute extrusion mode', 'M104 S0', ';End of Gcode',
           ';SETTING_3 {"global_quality": "[general]\\\\nversion = 4\\\\nname = Fine #2\\\\ndefinition = creality_ender3',
           ';SETTING_3 \\\\n\\\\n[metadata]\\\\ntype = quality_changes\\\\nquality_type = standard\\\\n"}', '']
    return ('\n'.join(L) + '\n' + corpo + '\n'.join(rod)).encode()


def gcode_cura_griffin():
    """Cura para Ultimaker (sabor Griffin): ;PRINT.TIME e volume em mm³ por extrusora."""
    L = [';START_OF_HEADER', ';HEADER_VERSION:0.1', ';FLAVOR:Griffin', ';GENERATOR.NAME:Cura_SteamEngine',
         ';GENERATOR.VERSION:5.8.1', ';GENERATOR.BUILD_DATE:2024-09-24', ';TARGET_MACHINE.NAME:Ultimaker S5',
         ';EXTRUDER_TRAIN.0.INITIAL_TEMPERATURE:215', ';EXTRUDER_TRAIN.0.MATERIAL.VOLUME_USED:4000',
         ';EXTRUDER_TRAIN.0.MATERIAL.GUID:506c9f0d-e3aa-4bd4-b2d2-23e2425b1aa9',
         ';EXTRUDER_TRAIN.0.NOZZLE.DIAMETER:0.4', ';EXTRUDER_TRAIN.0.NOZZLE.NAME:AA 0.4',
         ';BUILD_PLATE.INITIAL_TEMPERATURE:60', ';PRINT.TIME:5000', ';PRINT.GROUPS:1',
         ';PRINT.SIZE.MIN.X:112.5', ';PRINT.SIZE.MIN.Y:112.5', ';PRINT.SIZE.MIN.Z:0.27',
         ';PRINT.SIZE.MAX.X:122.5', ';PRINT.SIZE.MAX.Y:122.5', ';PRINT.SIZE.MAX.Z:10',
         ';SLICE_UUID:6c1a2b4e-0d1f-4c5a-9e3b-7a8d9c0e1f2a', ';END_OF_HEADER',
         ';Generated with Cura_SteamEngine 5.8.1', 'T0', 'M82 ;absolute extrusion mode', 'G92 E0']
    return ('\n'.join(L) + '\n' + corpo_gcode(20_000, 66) + ';End of Gcode\n').encode()


TAM_CAUDA = 1024 * 1024   # igual a FAT_CAUDA em js/fatiador.js: quanto do fim do G-code o leitor lê


def gcode_fronteira(isca):
    """O corte do fim do G-code cai bem numa linha (arquivo de 2,3 MB, lido em duas pontas).
    isca=False: a linha do tempo começa exatamente no corte e precisa ser lida inteira.
    isca=True: o corte cai logo depois de um ';' no meio de uma linha (o byte a mais que o leitor pega
               é esse ';'); o pedaço parece uma linha de tempo (99h) e precisa ser descartado."""
    texto = '; generated by PrusaSlicer 2.9.0+win64 on 2025-03-06 at 09:27:17 UTC\nG28\n' + corpo_gcode(1_300_000, 88)
    if isca:
        texto += 'M117 X;'
        cauda = (' estimated printing time (normal mode) = 99h 0m 0s\n'
                 '; filament used [mm] = 1000.00\n; filament used [g] = 2.98\n'
                 '; estimated printing time (normal mode) = 3h 0m 0s\n')
    else:
        cauda = ('; estimated printing time (normal mode) = 3h 0m 0s\n'
                 '; filament used [mm] = 1000.00\n; filament used [g] = 2.98\n')
    cauda += ';' + 'x' * (TAM_CAUDA - len(cauda) - 2) + '\n'
    assert len(cauda) == TAM_CAUDA
    return (texto + cauda).encode()


# ---------------------------------------------------------------- escrita de ZIP

class NaoBuscavel:
    """Arquivo sem seek/tell: o zipfile passa a gravar com descritor de dados (bit 3)."""

    def __init__(self, f):
        self.f = f

    def write(self, b):
        return self.f.write(b)

    def flush(self):
        self.f.flush()


def escrever_zip(caminho, entradas, guardadas=(), zip64=(), nao_buscavel=False):
    with open(caminho, 'wb') as destino:
        alvo = NaoBuscavel(destino) if nao_buscavel else destino
        with zipfile.ZipFile(alvo, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            for nome, dados in entradas:
                info = zipfile.ZipInfo(nome, date_time=DATA)
                info.compress_type = zipfile.ZIP_STORED if nome in guardadas else zipfile.ZIP_DEFLATED
                with zf.open(info, 'w', force_zip64=nome in zip64) as f:
                    f.write(dados)


def zip_manual(caminho, entradas, zip64_total=False, estilo_miniz=False):
    """ZIP montado byte a byte.
    zip64_total: EOCD com 0xFFFF/0xFFFFFFFF, registro e localizador ZIP64 e campo extra 0x0001
                 no diretório central (tamanhos e posição só lá).
    estilo_miniz: como o miniz do Bambu grava em modo 64 bits: cabeçalho local com extra ZIP64 zerado,
                  descritor de dados de 64 bits, registro e localizador ZIP64 e EOCD com números normais."""
    buf, cd = bytearray(), bytearray()
    for nome, dados in entradas:
        nb = nome.encode()
        c = zlib.compressobj(6, zlib.DEFLATED, -15)
        comp = c.compress(dados) + c.flush()
        crc = zlib.crc32(dados) & 0xFFFFFFFF
        pos = len(buf)
        flags = 0x0008 if estilo_miniz else 0
        if estilo_miniz:
            extra_l = struct.pack('<HHQQ', 1, 16, 0, 0)
            buf += struct.pack('<IHHHHHIIIHH', 0x04034B50, 45, flags, 8, 0, 0x5821, 0, 0xFFFFFFFF, 0xFFFFFFFF, len(nb), len(extra_l))
            buf += nb + extra_l + comp
            buf += struct.pack('<IIQQ', 0x08074B50, crc, len(comp), len(dados))
        else:
            buf += struct.pack('<IHHHHHIIIHH', 0x04034B50, 20, flags, 8, 0, 0x5821, crc, len(comp), len(dados), len(nb), 0)
            buf += nb + comp
        if zip64_total:
            extra_c = struct.pack('<HHQQQ', 1, 24, len(dados), len(comp), pos)
            tam_c, tam_o, ofs = 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF
        else:
            extra_c, tam_c, tam_o, ofs = b'', len(comp), len(dados), pos
        cd += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014B50, 45, 45, flags, 8, 0, 0x5821, crc, tam_c, tam_o,
                          len(nb), len(extra_c), 0, 0, 0, 0, ofs)
        cd += nb + extra_c
    ini_cd, n = len(buf), len(entradas)
    buf += cd
    if zip64_total or estilo_miniz:
        pos64 = len(buf)
        buf += struct.pack('<IQHHIIQQQQ', 0x06064B50, 44, 45, 45, 0, 0, n, n, len(cd), ini_cd)
        buf += struct.pack('<IIQI', 0x07064B50, 0, pos64, 1)
    if zip64_total:
        buf += struct.pack('<IHHHHIIH', 0x06054B50, 0, 0, 0xFFFF, 0xFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0)
    else:
        buf += struct.pack('<IHHHHIIH', 0x06054B50, 0, 0, n, n, len(cd), ini_cd, 0)
    with open(caminho, 'wb') as f:
        f.write(buf)


def conferir_zip(caminho, entradas=None):
    """O próprio zipfile do Python precisa abrir o ZIP e bater o CRC de tudo."""
    with zipfile.ZipFile(caminho) as zf:
        ruim = zf.testzip()
        assert ruim is None, f'{caminho}: CRC ruim em {ruim}'
        if entradas:
            for nome, dados in entradas:
                assert zf.read(nome) == dados, f'{caminho}: conteúdo diferente em {nome}'


# ---------------------------------------------------------------- arquivos de teste

def gerar(pasta):
    os.makedirs(pasta, exist_ok=True)
    p = lambda nome: os.path.join(pasta, nome)

    # 1. uma placa, um filamento
    uma = pacote(slice_info([{'indice': 1, 'prediction': '5318', 'weight': '16.01',
                              'filamentos': [(1, 'PLA', '#00AE42', '5.37', '16.01')]}]), [(1, 'Chaveiro')])
    escrever_zip(p('uma_placa.3mf'), uma)
    conferir_zip(p('uma_placa.3mf'), uma)

    # 2. duas placas (OrcaSlicer), nome com caractere escapado
    duas_info = slice_info([
        {'indice': 1, 'prediction': '3723', 'weight': '10.50', 'filamentos': [(1, 'PLA', '#FFFFFF', '3.52', '10.50')]},
        {'indice': 2, 'prediction': '7200', 'weight': '20.25', 'filamentos': [(2, 'PETG', '#000000', '6.65', '20.25')]},
    ], orca=True)
    duas = pacote(duas_info, [(1, ''), (2, 'Base & Tampa')])
    escrever_zip(p('duas_placas.3mf'), duas)
    conferir_zip(p('duas_placas.3mf'), duas)

    # 3. três filamentos coloridos
    tres_info = slice_info([{'indice': 1, 'prediction': '9999', 'weight': '10.00', 'filamentos': [
        (1, 'PLA', '#FF0000', '1.71', '5.10'), (2, 'PLA', '#00FF00', '1.07', '3.20'), (4, 'PETG', '#0000FF', '0.56', '1.70')]}])
    tres = pacote(tres_info, [(1, 'Logo colorido')])
    escrever_zip(p('tres_cores.3mf'), tres)
    conferir_zip(p('tres_cores.3mf'), tres)

    # 4. projeto salvo sem fatiar (o "Salvar projeto" do Bambu não grava <plate> no slice_info)
    sem = pacote(slice_info([]), [(1, '')])
    escrever_zip(p('sem_fatiar.3mf'), sem)
    conferir_zip(p('sem_fatiar.3mf'), sem)

    # 5. placa fatiada exportada (.gcode.3mf): slice_info sem números, G-code dentro
    gc5 = gcode_bambu('1h 26m 32s', '1h 33m 0s', [4321.98], [12.89], ['1.24'], [1], ['PLA'], ['#FFFFFF'], tamanho=1_500_000)
    md5 = hashlib.md5(gc5).hexdigest().upper().encode()
    fat5 = pacote(slice_info([{'indice': 1, 'prediction': '', 'weight': '', 'filamentos': []}]), [(1, 'Suporte')],
                  extras=[('Metadata/plate_1.gcode', gc5), ('Metadata/plate_1.gcode.md5', md5)], com_gcode=True)
    escrever_zip(p('placa_fatiada.gcode.3mf'), fat5)
    conferir_zip(p('placa_fatiada.gcode.3mf'), fat5)

    # 6. .gcode.3mf do Orca: slice_info só com o cabeçalho; pesos no rodapé de um G-code de 3 MB
    gc6 = gcode_orca_bbl(3_000_000)
    fat6 = pacote(slice_info([], orca=True), [(1, '')], extras=[('Metadata/plate_1.gcode', gc6)], com_gcode=True)
    escrever_zip(p('orca_placa.gcode.3mf'), fat6)
    conferir_zip(p('orca_placa.gcode.3mf'), fat6)

    # 7. ZIP64 forçado numa entrada (cabeçalho local com extra 0x0001; diretório central normal)
    escrever_zip(p('zip64_forcado.3mf'), uma, zip64={'Metadata/slice_info.config', '3D/3dmodel.model'})
    conferir_zip(p('zip64_forcado.3mf'), uma)

    # 8. ZIP64 completo, montado à mão (EOCD estourado, registro ZIP64 e extra no diretório central)
    z8 = [('[Content_Types].xml', CONTENT_TYPES), ('Metadata/slice_info.config', tres_info)]
    zip_manual(p('zip64_total.3mf'), z8, zip64_total=True)
    conferir_zip(p('zip64_total.3mf'), z8)

    # 9. como o miniz do Bambu grava: extra ZIP64 local zerado, descritor de dados e registro ZIP64
    z9 = pacote(duas_info, [(1, ''), (2, 'Base & Tampa')])
    zip_manual(p('zip64_miniz.3mf'), z9, estilo_miniz=True)
    conferir_zip(p('zip64_miniz.3mf'), z9)

    # 10. slice_info guardado sem compactação (stored); o resto compactado
    guard = pacote(slice_info([{'indice': 1, 'prediction': '600', 'weight': '2.50',
                                'filamentos': [(1, 'PLA-CF', '#333333', '0.84', '2.50')]}]), [(1, 'Peça guardada')])
    escrever_zip(p('entrada_stored.3mf'), guard, guardadas={'Metadata/slice_info.config'})
    conferir_zip(p('entrada_stored.3mf'), guard)

    # 11. gravado sem seek: todas as entradas com descritor de dados e tamanho zero no cabeçalho local
    desc = pacote(slice_info([{'indice': 1, 'prediction': '1800', 'weight': '7.77',
                               'filamentos': [(1, 'PETG', '#FF8800', '2.54', '7.77')]}]), [(1, 'Gancho')])
    escrever_zip(p('descritor.3mf'), desc, nao_buscavel=True)
    conferir_zip(p('descritor.3mf'), desc)

    # 12. ZIP colado depois de outro (o diretório não está onde o EOCD diz)
    with open(p('concatenado.3mf'), 'wb') as f:
        outro = os.path.join(pasta, '_tmp_outro.zip')
        escrever_zip(outro, [('leia.txt', b'outro arquivo\n' * 20)])
        with open(outro, 'rb') as o:
            f.write(o.read())
        os.remove(outro)
        with open(p('uma_placa.3mf'), 'rb') as u:
            f.write(u.read())
    conferir_zip(p('concatenado.3mf'), uma)

    # 13. placa 2 no slice_info sem tempo nem peso
    falta = pacote(slice_info([
        {'indice': 1, 'prediction': '3600', 'weight': '5.00', 'filamentos': [(1, 'ABS', '#FFFFFF', '1.80', '5.00')]},
        {'indice': 2, 'prediction': '', 'weight': '', 'filamentos': []}]), [(1, ''), (2, '')])
    escrever_zip(p('placa_sem_dados.3mf'), falta)
    conferir_zip(p('placa_sem_dados.3mf'), falta)

    # 14. G-code de mais de 64 MB dentro do .3mf, sem números no slice_info
    with open(p('gigante.gcode.3mf'), 'wb') as destino:
        with zipfile.ZipFile(destino, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            for nome, dados in pacote(slice_info([{'indice': 1, 'prediction': '', 'weight': '', 'filamentos': []}]), [(1, '')]):
                zf.writestr(zipfile.ZipInfo(nome, date_time=DATA), dados, compress_type=zipfile.ZIP_DEFLATED)
            bloco = corpo_gcode(16 * 1024, 77).encode()     # menor que a janela do deflate: comprime muito
            info = zipfile.ZipInfo('Metadata/plate_1.gcode', date_time=DATA)
            info.compress_type = zipfile.ZIP_DEFLATED
            with zf.open(info, 'w') as f:
                f.write(gcode_bambu('1h 0m 0s', '1h 5m 0s', [1000.0], [3.0], ['1.24'], [1], ['PLA'], ['#FFFFFF'], tamanho=1000))
                for _ in range(65 * 1024 * 1024 // len(bloco) + 1):
                    f.write(bloco)
    with zipfile.ZipFile(p('gigante.gcode.3mf')) as zf:
        assert zf.getinfo('Metadata/plate_1.gcode').file_size > 64 * 1024 * 1024

    # 15. dados compactados estragados (bloco deflate de tipo inválido; CRC não bate)
    with open(p('uma_placa.3mf'), 'rb') as f:
        bruto = bytearray(f.read())
    with zipfile.ZipFile(p('uma_placa.3mf')) as zf:
        info = zf.getinfo('Metadata/slice_info.config')
    n_nome, n_extra = struct.unpack('<HH', bruto[info.header_offset + 26:info.header_offset + 30])
    bruto[info.header_offset + 30 + n_nome + n_extra] = 0xFF
    with open(p('deflate_ruim.3mf'), 'wb') as f:
        f.write(bruto)

    # 16. CRC errado no diretório central: os dados descompactam, mas não batem com o CRC
    with open(p('uma_placa.3mf'), 'rb') as f:
        dados_uma = f.read()
    bruto = bytearray(dados_uma)
    q = struct.unpack('<I', bruto[bruto.rfind(b'PK\x05\x06') + 16:][:4])[0]
    while bruto[q:q + 4] == b'PK\x01\x02':
        n_nome, n_extra, n_com = struct.unpack('<HHH', bruto[q + 28:q + 34])
        if bruto[q + 46:q + 46 + n_nome] == b'Metadata/slice_info.config':
            bruto[q + 16:q + 20] = struct.pack('<I', struct.unpack('<I', bruto[q + 16:q + 20])[0] ^ 0x5A5A5A5A)
            break
        q += 46 + n_nome + n_extra + n_com
    assert bytes(bruto) != dados_uma
    with open(p('crc_errado.3mf'), 'wb') as f:
        f.write(bruto)

    # 17. .3mf cortado no fim (sem o fim do diretório central)
    with open(p('uma_placa.3mf'), 'rb') as f:
        dados = f.read()
    with open(p('danificado.3mf'), 'wb') as f:
        f.write(dados[:-40])

    # 18. projeto do PrusaSlicer e ZIP qualquer
    prusa3mf = [('[Content_Types].xml', CONTENT_TYPES), ('3D/3dmodel.model', modelo_3d()),
                ('Metadata/Slic3r_PE.config', b'; generated by PrusaSlicer 2.9.0\n; layer_height = 0.2\n'),
                ('Metadata/Slic3r_PE_model.config', b'<?xml version="1.0" encoding="utf-8"?>\n<config>\n</config>\n')]
    escrever_zip(p('projeto_prusa.3mf'), prusa3mf)
    escrever_zip(p('compactado.zip'), [('leia.txt', b'nada de fatiador aqui\n')])

    # 19. G-codes soltos
    with open(p('bambu.gcode'), 'wb') as f:
        f.write(gcode_bambu('2h 3m 4s', '2h 10m 0s', [3420.50, 1874.20], [10.20, 5.81], ['1.24', '1.24', '1.27'], [1, 3],
                            ['PLA', 'PLA', 'PETG'], ['#FFFFFF', '#000000', '#FF0000']))
    with open(p('orca.gcode'), 'wb') as f:
        f.write(gcode_orca_klipper(3_000_000))
    with open(p('prusa.gcode'), 'wb') as f:
        f.write(gcode_prusa(2_500_000))
    with open(p('cura.gcode'), 'wb') as f:
        f.write(gcode_cura_marlin())
    with open(p('cura_ultimaker.gcode'), 'wb') as f:
        f.write(gcode_cura_griffin())
    for isca, nome in ((False, 'fronteira'), (True, 'fronteira_isca')):
        gc = gcode_fronteira(isca)
        with open(p(nome + '.gcode'), 'wb') as f:
            f.write(gc)
        dentro = pacote(slice_info([{'indice': 1, 'prediction': '', 'weight': '', 'filamentos': []}]), [(1, '')],
                        extras=[('Metadata/plate_1.gcode', gc)], com_gcode=True)
        escrever_zip(p(nome + '.gcode.3mf'), dentro)
        conferir_zip(p(nome + '.gcode.3mf'), dentro)
    with open(p('so_tempo.gcode'), 'wb') as f:
        f.write(b'; generated by PrusaSlicer 2.9.0+win64 on 2025-03-06 at 09:27:17 UTC\r\nG28\r\nG1 X10 Y10\r\n'
                b'; estimated printing time (normal mode) = 10m 0s\r\n')
    with open(p('sem_dados.gcode'), 'wb') as f:
        f.write(b'G28\nG1 X10 Y10 F3000\nG1 X20 Y20 E1.5\nM104 S0\n')

    # 20. coisas que não são arquivo de fatiador
    with open(p('texto.txt'), 'wb') as f:
        f.write('Lista de compras\nleite\npão\ncafé\n'.encode())
    with open(p('aleatorio.bin'), 'wb') as f:
        f.write(random.Random(42).randbytes(5000))
    with open(p('vazio.gcode'), 'wb') as f:
        pass
    with open(p('modelo.stl'), 'wb') as f:
        f.write(b'solid cubo\n facet normal 0 0 -1\n  outer loop\n   vertex 0 0 0\n   vertex 10 0 0\n   vertex 10 10 0\n'
                b'  endloop\n endfacet\nendsolid cubo\n')
    with open(p('triangulos.dat'), 'wb') as f:
        tri = struct.pack('<12fH', 0, 0, -1, 0, 0, 0, 10, 0, 0, 10, 10, 0, 0)
        f.write(b'peca exportada'.ljust(80, b' ') + struct.pack('<I', 2) + tri * 2)
    with open(p('binario.bgcode'), 'wb') as f:
        f.write(b'GCDE' + struct.pack('<IH', 1, 1) + bytes(64))
    return pasta


if __name__ == '__main__':
    destino = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='nexos-fatiador-')
    print(gerar(destino))
