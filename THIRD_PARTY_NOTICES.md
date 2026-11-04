# Third-party notices / 第三方声明

Project copyright: 2026 AI-hunter-team contributors. Project-owned code is GPL-3.0-only; this does not replace third-party licenses or grant rights to original community character designs.

## Runtime libraries

| Package | Declared license |
|---|---|
| React, React DOM | MIT |
| Three.js | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| @radix-ui/react-dialog, @radix-ui/react-tooltip | MIT |
| Express | MIT |
| dotenv | BSD-2-Clause |

Exact versions and transitive packages are recorded in `package-lock.json`. `npm run build:web` writes installed-package license/notice texts into `dist/THIRD_PARTY_NOTICES.txt` and copies the project LICENSE and supplemental licenses. This includes installed development dependencies that may contribute bundled code; it is not a declaration that every listed tool is shipped in the runtime. Packages that lack standalone texts use the documented [local supplements and upstream provenance](licenses/README.md). Where upstream supplies only an MIT declaration, standard MIT terms supplement it without inventing copyright years. Docker includes the notices, root license and supplemental files.

## Icons and fixtures

- Settings and arrow-forward SVG paths: Google Material Design Icons, Apache-2.0. Preserve [source attribution](public/assets/icons/README.md) and the [full license](public/assets/icons/LICENSE).
- `public/models/sample-sculpture.gltf`: project-authored geometric test fixture, marked CC0-1.0 in its asset metadata; retain that declaration.
- Station, railings, train and surface assets: project procedural sources and provenance manifests accompany the assets. References used for visual research are not copied photographs or operator logos. Project-owned work follows the root license.

## Community character models

The maintainer describes `dafeiyu.glb`, `naiwa.glb`, `naiwa-security.glb` and `doubao.glb` as self-modeled adaptations of community characters, with model files under GPL-3.0. Their character designs are not described as wholly original. See the [model notes](public/models/README.md) for derivation and the [publication checklist](docs/OPEN_SOURCE.md) for missing original-character sources and attribution. This notice does not invent upstream permission or relicense any upstream work.

贡献者引入新的素材、字体或库时，需补充真实来源、作者、许可及必要声明，不以项目根许可证覆盖第三方原许可。
