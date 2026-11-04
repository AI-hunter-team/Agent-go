# Supplemental dependency licenses

These artifacts lack standalone notice files in npm. Original upstream text is preserved where supplied. The project GPL does not replace these terms. Builds read the checked-in local copies without network requests.

| Package | Source | Provenance and limits |
|---|---|---|
| @react-three/fiber 8.18.0 | [Source](https://raw.githubusercontent.com/pmndrs/react-three-fiber/f81bfe8cb29373d2687433c6130e0ce1daf7222c/LICENSE) | npm gitHead f81bfe8cb29373d2687433c6130e0ce1daf7222c |
| maath 0.10.8 | [Source](https://registry.npmjs.org/maath/0.10.8) | MIT declaration; inspected maath@0.10.8 also lacks standalone license text |
| stats-gl 2.4.2 | [Source](https://registry.npmjs.org/stats-gl/2.4.2) | MIT declaration; inspected gitHead c12b2e391d5a88616e0b30f3c7f0577966426239 also lacks standalone text |
| stackback 0.0.2 | [Source](https://registry.npmjs.org/stackback/0.0.2) | MIT declaration; inspected v0.0.2 also lacks standalone text |
| draco3d 1.5.9 | [Source](https://raw.githubusercontent.com/google/draco/1.5.9/LICENSE) | Upstream release tag 1.5.9 license copy |
| @mediapipe/tasks-vision 0.10.17 | [Source](https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE) | Upstream license snapshot retrieved 2026-11-05; npm gives no gitHead and no matching tag was found among inspected tags; not claimed as its release commit |

For maath, stats-gl and stackback, the pinned package metadata declares MIT but supplies no copyright-year notice. The supplements record only supplied author metadata and reproduce [standard SPDX MIT terms](https://github.com/spdx/license-list-data/blob/main/text/MIT.txt), omitting the placeholder copyright line rather than inventing a year or notice.

Esbuild and Rollup platform packages use the full notice from their installed matching host package. Other installed packages ship their own notices. The supplementary files were retrieved on 2026-11-05; hashes below identify the actual copies even when upstream does not provide a release commit.

| File | SHA256 |
|---|---|
| draco3d.txt | d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4 |
| maath.txt | 896af53e4be0e4d1e84ab49edf6b726c0a686bd4350543388ec2c2a4ad7a3991 |
| mediapipe.txt | 8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8 |
| react-three-fiber.txt | ebd6a29bec64bdfcf8795388f2eceaf1479c14d343c0846de347ab8609d66139 |
| stackback.txt | 0a1d3b4c0d1eb534361615227fb976e1d203aaa14049831cc594ae039b3942b8 |
| stats-gl.txt | baef8e555900c81efd886d72846600cf80bced41abcab75488264bf441bf0bc1 |
