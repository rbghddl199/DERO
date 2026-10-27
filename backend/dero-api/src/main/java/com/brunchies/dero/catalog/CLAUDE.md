# catalog — 6 masters (brand·category·vibe·hashtag·vesa_spec·desk_texture)

Admin CRUD (`/api/v1/admin/*`, 6 trees) and the master entities. All soft-delete + partial unique
(`WHERE deleted_at IS NULL`) — duplicate-check derived queries must match the index condition
**literally** (`...AndDeletedAtIsNull`). Mismatch: a request passing exists gets rejected by the DB, 500 instead of 409.

## Traps

- **catalog is the bottom layer — cannot import `product`** (ADR-0007 decision 7;
  `LayerDependencyTest.catalog는_위를_모른다` is an unfrozen hardening rule, so a violation fails the build).
  When upper-layer data is needed — e.g. the brand/category delete gate ("409 if a product references it") —
  **invert with DIP**: query interface `catalog/CatalogMasterUsage`, implementation `product/service/ProductCatalogMasterUsage`.
  Wanting to inject `ProductRepository` into a catalog service is exactly this trap.
- **No delete gate on desk_texture.** erd.md gave this table soft delete precisely so "retiring a texture must not
  orphan existing placements" — blocking delete-while-referenced reverses that decision.
  vibe·hashtag·vesa_spec need no gate either (junction hard delete CASCADE) — rationale in each service's javadoc.
- **NULL in PATCH means "leave unchanged"** (`PatchMerge.orKeep`, shared by 6 services). So there is **no path** to
  ① promote a category to root (`parentId → NULL`) ② reset a desk_texture map key to NULL (switch to solid color).
  If needed, a separate path or JsonNullable is the answer — do not split the rule per master.
- page/size clamping lives in one place, `controller/AdminPageParams`. Do not re-create it per controller.
