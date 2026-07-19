# The Papyrus Principle

> **When the page is gone, its neighbors become witnesses.**

Alexandria Here is not a business directory and not a conventional search engine. A submitted URL is its first shard, not the limit of its reasoning. It reconstructs a vanished place by following mechanically witnessed relationships among surviving fragments.

The governing distinction is between a display status and a witness role.

## Display status

- **Preserved** — exact historical material from a verified archive evidence block.
- **Reconstructed from sources** — only placement, ordering, grouping, identity, or another relationship is inferred from cited evidence.
- **Missing** — evidence witnesses an object or gap, but no usable direct evidence block survives.

These three states do not change.

## Witness role

- **Direct witness** — an archived capture of the recovered object. Its exact blocks may render as returned historical content.
- **Alternate witness** — another capture of the same object. It may corroborate or contradict the selected edition, but it is never silently blended into it.
- **Contextual witness** — another page, index, directory, interview, forum post, RSS item, or document that refers to the object. It may support an evidenced relationship, not replacement body prose.
- **Contradiction** — an annotation between witnesses. It is not a fourth truth status and is never resolved by majority vote.

## Rendering formula

```text
returned body = exact blocks from a selected direct witness
reconstructed structure = cited relationships from direct or contextual witnesses
context panel = exact contextual quotations, separately labeled and hashed
unwitnessed material = missing
```

The engine may eventually persist relationships such as `contains`, `part_of`, `references`, `same_entity_as`, `located_within`, `offers`, and `contradicts`. Every relationship must carry its subject, object, exact source-block IDs, temporal window, deterministic rule, and rendering permission. A model may select among supplied relationship candidates; it may not invent entities, evidence, or missing text.

## Why the Harrah's example matters

The FedEx Office and haircut examples are not a request to turn Alexandria into a local directory. They expose the failure of flat retrieval. The relevant answer may be contained inside a larger place or described by a neighboring witness:

```text
Harrah's --contains--> FedEx Office
LINQ --contains--> Spa --offers--> haircut
```

The same reasoning applies to lost-web restoration:

```text
archived navigation --references--> a missing section
parent index --contains--> a surviving page
alternate capture --contradicts--> a title or placement
external interview --references--> a person and a vanished publication
```

The relationship may be reconstructed when the cited evidence supports it. The missing page's words may not.

## Content neutrality

Alexandria assesses provenance, not whether preserved expression is good, bad, useful, offensive, popular, or safe. Network controls protect systems. Evidence controls protect historical attribution. Neither is a subject-matter gate.

Preservation is not endorsement, and absence of preservation is not condemnation.

## Current release boundary

The current engine already implements the narrow form of the Papyrus Principle within a bounded, same-site public-archive neighborhood:

- direct and alternate capture records;
- page-to-block `contains` edges;
- witnessed internal `references` edges;
- known absences from surviving links;
- visible title conflicts;
- block-level hashes, Ghost Map, Witnesses, and Recovery Receipt.

It does not yet claim general cross-domain entity resolution or federated retrieval from Reddit, Quora, Wikipedia, Scribd, live directories, arbitrary message boards, or dark-network services. Adding those sources requires explicit adapters, source-rights boundaries, entity-resolution validation, receipt evolution, and adversarial tests. A mistaken entity merge is historical invention and must fail closed.
