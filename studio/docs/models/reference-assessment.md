# Placeform architectural reference specifications

The four original 1672 × 941 reference images were visually inspected. This is **conditional architectural reconstruction**: the campus is extracted from a wider scenic concept rendering. Geometry dimensions, unseen elevations, roof construction, interiors and microscopic material response are inferred. The output is not photogrammetry or measured construction documentation.

## Files

- `a-assessment.json` and `a-sculpt-spec.json`: Terrace Commons, source `datacenter_2.png`.
- `b-assessment.json` and `b-sculpt-spec.json`: Folded Horizon, source `datacenter_5.png`.
- `c-assessment.json` and `c-sculpt-spec.json`: Civic Dune, source `datacenter_7.png`.
- `d-assessment.json` and `d-sculpt-spec.json`: Lantern Spine, source `datacenter_8.png`.
- `validation-report.json`: schema and strict-quality outcomes plus SHA-256 source fingerprints.
- `{a,b,c,d}-admission.json`: deterministic source image admission outcomes.
- `{a,b,c,d}-intake-correctness.json`: exposed classification assumptions; independent automated objectness confirmation remains deferred.
- `{a,b,c,d}-next-step.txt`: current pipeline state and exact next command.

All schema and strict-quality checks **PASS**. All four reference admission checks **PASS**. Each specification contains 26 semantic components, 20 observed details mapped to actual local features, six independent material recipes, four repetition systems, five critical identity targets and seven requested review views. Local BM25 evidence and source provenance are carried from `new_pre_spec_assessment.py` into each sculpt specification.

These JSON files preserve the initial authoring specification and automated intake evidence. Their pipeline checkpoint fields are not release status. Implementation QA, rendered comparisons and limitations are recorded separately in `release-validation.md`. Specification validation alone does not establish visual likeness.

## Architectural identity

| Model | Required identity |
| --- | --- |
| A | Four uneven, staggered terrace bands with zigzag oblique sandstone returns; planted roof gardens; deep shadowed glazing reveals; coping; diagonal connected stairs. |
| B | Nonidentical skewed roof ribbons with unequal peaks, diagonal valleys and low descending tips; broad timber entrance soffit; curved fitted glazing; seams draped onto the actual roof. |
| C | One connected undulating roof shell, with irregular offset planted courtyard holes and a small actual entrance oculus; broad arch openings; narrow bridges; low perimeter tips. |
| D | Unequal staggered finned halls at stepped elevations; dense fins over recessed backing with completed corners; lower connected glass pavilions; visible warm entrance furnishings; screened roof plant. |

Nominal campus extent is **112 × 84 metres**, architecture maximum **16 metres**. Coordinate notes use Y up and public foreground at positive Z; camera placement is an initial visual hypothesis, not a solved camera. Component dimensions are proportional authoring guidance and should yield to measured runtime bounds. The intended budget is at most 600,000 visible triangles and 250 main-pass draw calls per concept.

## Reference comparison crop guidance

Each assessment records an architectural region in normalized image coordinates `(x, y, width, height)`:

| Model | Architectural region |
| --- | --- |
| A | `(0.07, 0.265, 0.88, 0.53)` |
| B | `(0.07, 0.225, 0.88, 0.54)` |
| C | `(0.065, 0.215, 0.925, 0.55)` |
| D | `(0.055, 0.195, 0.89, 0.56)` |

These bounds isolate the campus for human visual comparison; they are not a pixel-perfect architectural segmentation. Sky, distant landmarks and forest should not dominate a silhouette metric. Rear and side views have no source-angle counterpart and must be assessed for self-consistent construction rather than image similarity.

## Material evidence and inference

The reference shows pale sandstone, satin silver metal, golden timber, clear reflective glass, dry native planting and pale paving. The accepted plan explicitly calls for procedural textures. The specifications therefore require independent authored color, roughness, height/normal and contact-occlusion responses with stable metre-scaled UVs. Exact lithology, alloy, timber species and reflectance cannot be recovered from a single perspective-lit rendering. No reference-derived PBR map or extraction confidence is claimed. This limitation is recorded explicitly in each material and look-development contract.

## Regeneration and validation

The system Python is too old for these skill scripts. Use:

```text
/Users/arazfar/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

The authoring sources are `author_specs.py` followed by `refine_semantics.py`; the second script specializes connected-roof regions and glass-spine child assemblies, assigns each detail to its correct architectural owner, writes the validation report and queries the pipeline next step. Run them in that order if regeneration is needed.

Specification authoring scripts were run in `/tmp/placeform-reference-specs`; the resulting specifications are preserved here. Original reference images remain unchanged.
