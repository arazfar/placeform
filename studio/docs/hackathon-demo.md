# Hardcoded hackathon demo

The application starts on Concepts and uses the fixed catalog in `lib/demo-catalog.ts`. The original reference images are bundled without modification. Each concept selects its own deterministic Three.js assembly in `lib/demo-models.ts`; no model or image generation service is used.

| ID | Reference | Recognition features | Geometry strategy |
|---|---|---|---|
| A | datacenter_2.png | Sandstone retaining walls, stepped planted roofs, recessed glazing, connecting stairs | Four ascending terraces with roof gardens and public fronts |
| B | datacenter_5.png | Folded silver ribbons, timber soffits, glazed halls, narrow planted courts | Closed lofted roof shells with angular profiles and sloping standing seams |
| C | datacenter_7.png | Undulating silver roofs, oval court openings, warm soffit edges | Three continuous annular roof shells, variable roof height and inner/outer curtain walls |
| D | datacenter_8.png | Finned technical halls, rooftop equipment, a lower luminous glass spine | Six halls, repeated aluminum fins, mechanical units and a glazed connecting volume |

## Reference quality and limits

These references support approximate exterior reconstruction of the campus as the selected subject within a wider landscape. Roof silhouettes, material families, entrances and major landscape relationships are visible. Hidden facades, exact dimensions, structure, interiors and topography are inferred. The models are simplified architectural study models, not photogrammetric copies. They do not reproduce the distant bay, bridges or city skyline. Repeated details and vegetation are procedural, not exact copies of the photographs.

The common 112 × 84 m campus envelope is illustrative, not measured from the photographs. Camera presets leave room for the surrounding landscape. Every rendered mesh has a name and a feature tag for selection; repeated foliage, mullions and fins use instancing. The existing disposal routine releases geometries and materials on replacement.

## Behavior and compatibility

- `fixedDemoSpec` resolves incoming state to the fixed geometry and catalog while retaining camera/daylight state.
- Browser persistence uses `placeform-hackathon-v1` separately from older projects. Existing stored projects are not erased or migrated.
- Image replacement, generation, new-project and geometry-mixing controls are removed from the main demo. Voice/typed geometry edits are rejected; view, daylight and history controls remain.
- The older parameterized geometry and drawings modules remain for compatibility with their existing tests. The demo viewer uses the new factory, and the demo excludes old drawings from navigation and review exports.
- Video defaults to the active original image. `/api/video` supports a first frame alone or a first/last pair. Reference changes remount the Film panel, clearing stale preparation and preview state.
- A WebGL capability check leaves image-based Film usable without a renderer. Video still requires the configured provider connection and its existing readiness checks.

## Validation

Unit coverage checks catalog restoration, fixed-state validation, all four geometry assemblies, finite bounds, named semantic parts, disposal, a ray-tested real courtyard opening, and one/two-frame request validation. Browser review covers perspective, aerial and west views for every model, GLB export, paired model-frame preparation, image-reference upload, concept switching and mocked provider failure. Paid video jobs are not used for validation.

Visual corrections included recessed fronts and retaining bases for A, roof-aligned seams for B, and wider perspective/aerial framing. Visual similarity is approximate; no exact reconstruction or numerical image-fidelity gate is claimed.
