# Reference-faithful Placeform model release

Four deterministic architectural reconstructions are integrated with the fixed catalog, saved camera names, persistence, feature picking and Film workflows. The campus scale remains nominally 112 × 84 metres, Y up, with public arrival toward +Z. Landscape extends outside the architectural footprint.

## Model changes

- **A / Terrace Commons:** four individually staggered, zigzag sandstone terraces; recessed curtain walls; continuous planted roof beds; coping interrupted at connected exterior stair landings; paths, varied planting and furnished interiors.
- **B / Folded Horizon:** four unequal twisting roof ribbons, asymmetric peaks and low tips; closed indexed shells; fitted glazing and standing seams sampled from the actual roof mesh; timber underside and edge regions.
- **C / Civic Dune:** one connected, smoothly deformed roof with seven actual openings, including the entrance oculus. Conforming refinement and constrained edge improvement preserve the courtyard boundaries. Glazing follows the roof and gardens remain open to the sky.
- **D / Lantern Spine:** six staggered technical halls, four connected stepped glass pavilions, recessed facade backing, corner fins and parapets, screened roof equipment, service door openings and furnished timber-lined entrance interiors.

All major roofs have indexed closed shells with separate top, underside and fascia material groups. UVs use metre-based coordinates. Six deterministic surface recipes have independent base-color, roughness, normal and ambient-occlusion maps. Vegetation uses branching geometry, volumetric alpha-tested leaf cards and varied ground planting. Stable assembly IDs, measured architectural bounds, entrance landmarks and rest transforms are included in runtime and GLB metadata. `setExplode` moves each assembly with attached detail and restores it exactly.

## Validation evidence

- 72 application tests pass; typecheck, lint and production build pass.
- 155 geometry/resource checks pass: finite positions, UVs and normals; valid indices; nondegenerate triangles; welded roof closure and outward winding; uniform authored vertical thickness; roof-sampler alignment; semantic coverage; bounds; deterministic rebuilds; explode/restore; disposal.
- 119 rays sample all seven C openings, including checks against attached roof seams. Every sample remains unobstructed.
- All four GLBs were reimported with GLTFLoader and rendered independently. Each contains 25 embedded texture images, zero external image/buffer references, metre units and assembly hierarchy. Hero image mean absolute RGB differences are 0.53–0.78% of full scale under the same presentation rig; residual differences are localized primarily to transparency and shadow handling.
- Seven 2560 × 1440 final views per model: daylight hero, reverse three-quarter, east, west, aerial, entrance/materials and dusk hero. Final shadows are 4096 pixels; interactive shadows are 2048 pixels. Final stills also use contact occlusion and multisample antialiasing.
- Two complete A→B→C→D→A browser cycles preserve GPU geometry/texture counts. A real one-second recording retains 1280 × 720 throughout a viewport resize, decodes successfully and restores the camera and canvas. Renderer diagnostic counts include the sun shadow pass as well as the main pass.
- Browser regression checks pass for PNG failure restoration and queue recovery, recorder-constructor failure and track cleanup, hidden Film first/last frames, and rejection of stale queued captures after concept replacement.
- The integrated Film browser check produced four storyboard images per model, verified saved-take textures and shadows, and encoded and decoded a one-second 1920 × 1080 sequence at 24 fps. The full 24-second path is sampled by the automated clearance/framing tests; encoding smoke validation uses one second.
- The newer model-based Film workflow is preserved. Snapshot textures retain asynchronous readiness after ownership cloning; saved GLBs use the same embedded texture conversion as model exports. Live viewing, stills and films share environment, sun, sky and interior illumination. Camera analysis recognizes batched glass facades and uses opaque vegetation volumes for clearance.
- Full-resolution inspection prompted fixes to road/terrain intersections, stair landings, glazing winding, roof intersections, soffit alignment, canopy foliage, plant placement and export texture conversion.

| Model | Complete-scene triangles | Estimated main-pass draw calls |
| --- | ---: | ---: |
| A | 265,250 | 167 |
| B | 380,922 | 93 |
| C | 416,556 | 134 |
| D | 224,708 | 190 |

Counts include landscape and instanced detail. All are below the 600,000-triangle and 250-call targets. Draw calls depend on view/frustum; shadow and final postprocessing passes are additional.

## Reference fidelity and limitations

The reference-facing silhouettes and defining identity features were compared visually with architectural crops of the active catalog images: `datacenter_2.png`, `datacenter_5.png`, `datacenter_7.png`, and `datacenter_8.png`. Source files are unchanged and SHA-256 fingerprints accompany the delivery. The original specification JSON files preserve pre-authoring intake/pipeline records; release status is established by this report and the actual QA evidence, not those archived stage flags.

This is an authored single-view reconstruction, not photogrammetry or construction documentation. Rear elevations, structural support, interior layouts, service equipment, courtyard depths, terrain and exact dimensions are consistent architectural inferences. The scenic city/forest panorama is represented by a bounded landscape study. Full-image silhouette scoring against that panorama is not used as a quantitative claim of likeness. Reference comparisons are supplied for direct visual judgment.

Roof thickness is a consistent vertical shell separation, rather than a normal-offset engineered assembly. Remaining very narrow C boundary triangles are nondegenerate and have consistent shading normals. Vegetation cards intentionally have open surfaces; enclosed building roof shells are watertight. People and furniture are economical presentation-scale geometry. Textures are authored/generative, not measured scans or extracted PBR data.

GLBs use `EXT_mesh_gpu_instancing`, `KHR_materials_emissive_strength` and `KHR_lights_punctual`. Use an importer supporting these extensions. Environment reflections, sun/sky lighting, tone mapping, fog and contact occlusion belong to the app/presentation rig, so another renderer will need equivalent lighting to reproduce the supplied previews. The model files are self-contained; the source image-generation provenance is documented separately.

Known baseline tooling notices: the build reports large Three.js client chunks and future Vite native-config compatibility warnings. These do not prevent the production build. The latest published navigation, Film controls, daylight command and renderer-recovery refinements are preserved. This release does not change the app's private access configuration.
