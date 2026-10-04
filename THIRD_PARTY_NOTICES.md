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

## Runtime dependencies

All other dependencies listed in [`package.json`](./package.json) are used under
their own respective open-source licenses.