# Third-Party Notices

This project is distributed under the MIT License. See [`LICENSE`](./LICENSE)
in the repository root for the IT Learning Hub LMS project license
(Copyright (c) 2026 SNooZeJay).

The user interface foundation was derived from an existing open-source project.
Its license and copyright notice are preserved below as required by the MIT
License.

---

## TailAdmin Vue — Free Vue.js Tailwind CSS Admin Dashboard Template

* **Upstream:** https://github.com/TailAdmin/vue-tailwind-admin-dashboard
* **Version imported:** v2.4.0
* **License:** MIT
* **Used for:** Admin shell (`AdminLayout`, `AppSidebar`, `AppHeader`,
  `Backdrop`, `useSidebar`), full-screen layout, UI primitives, form elements,
  chart wrappers, table wrappers, profile widgets, and the Tailwind CSS v4
  `@theme` design tokens in `src/assets/main.css`.

### MIT License — Copyright (c) TailAdmin

```
MIT License

Copyright (c) TailAdmin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Modifications made

The upstream project has been adapted for the IT Learning Hub LMS. Changes
include, and are not limited to:

* Replacing e-commerce demo views and data with Learning Management System
  concepts.
* Removal of unrelated demo assets, components, and dependencies.
* Integration of Supabase (PostgreSQL, Auth, Storage, Row Level Security).
* Introduction of role-based routing, layouts, and authorization.

---

## Awesome DESIGN.md

* **Upstream:** https://github.com/VoltAgent/awesome-design-md
* **File adopted:** [`DESIGN.md`](./DESIGN.md) — `design-md/ibm/DESIGN.md`
* **License:** MIT (Copyright (c) VoltAgent)
* **Verified:** blob `dbef1c5b20357a8953e6832e5d383a866a66f11a`, byte-for-byte identical
  to upstream.
* **Used for:** visual direction only. `DESIGN.md` describes the IBM Carbon design
  language — IBM Blue `#0f62fe` as the single accent, neutral gray ink and
  surfaces, flat-square corners (0–4px), thin-bordered shadowless cards, and IBM
  Plex Sans at light weights.

The design language described therein is the IBM Carbon Design System. The
`DESIGN.md` analysis file itself is MIT licensed by VoltAgent as reproduced in the
upstream repository.

### How it is applied

`DESIGN.md` is the **visual intent** layer. It does not replace the TailAdmin
`@theme` tokens in `src/assets/main.css`, which remain the single implementation
of the design tokens. Carbon colours are mapped onto the existing `@theme` token
names rather than hardcoded in components, per the "don't hardcode hex colours"
rule in [`AGENTS.md`](./AGENTS.md).

---

## Runtime dependencies

All other dependencies listed in [`package.json`](./package.json) are used under
their own respective open-source licenses.

## Fonts

The project loads **IBM Plex Sans** (SIL Open Font License 1.1) as its typeface,
per [`DESIGN.md`](./DESIGN.md). IBM Plex is free to use, self-host, and redistribute.